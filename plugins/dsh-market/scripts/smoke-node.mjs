/**
 * Node-side behaviour checks for the installed-plugin management.
 *
 * The subject writes into a profile manifest, so every case runs against a
 * throwaway profile directory created under the workspace — never against the
 * real one.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
import { build } from 'esbuild'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const workRoot = join(root, '.smoke-node')
rmSync(workRoot, { recursive: true, force: true })
mkdirSync(workRoot, { recursive: true })

// Node's type stripping does not rewrite the `./x.js` specifiers TypeScript
// sources use, so the subject is bundled first.
const subjectPath = join(workRoot, 'plugin-management.mjs')
await build({
  entryPoints: [join(root, 'src/plugin-management.ts')],
  outfile: subjectPath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error',
})

const { listManagedPlugins, setPluginEnabled, uninstallPlugin } = await import(pathToFileURL(subjectPath).href)

const installPath = join(workRoot, 'plugin-install.mjs')
await build({
  entryPoints: [join(root, 'src/plugin-install.ts')],
  outfile: installPath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error',
})
const { isLocalPathSpecifier } = await import(pathToFileURL(installPath).href)

const failures = []
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Build a throwaway profile directory with the given manifest. */
function makeProfile(manifest) {
  const dir = mkdtempSync(join(workRoot, 'profile-'))
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return dir
}

/** A pnpm runner that records its arguments and succeeds. */
function fakePnpm() {
  const calls = []
  return {
    calls,
    runPlugin(args, cwd) {
      calls.push({ args, cwd })
      const stdout = new EventEmitter()
      const stderr = new EventEmitter()
      const done = Promise.resolve({ exitCode: 0, signal: null })
      return { stdout, stderr, done }
    },
  }
}

const readManifest = dir => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
const bundlesOf = dir => readManifest(dir).dsh.profile.bundles

console.log('[node] 列出已安装插件并判定启用状态')
{
  const dir = makeProfile({
    name: 'test-profile',
    dependencies: {
      'dsh-alpha': '^1.2.3',
      'dsh-beta': '2.0.0',
      'dsh-retrace': '0.1.0',
      '@deepseek-ai/dsh-base': '1.0.0',
      '@deepseek-ai/dsh-web-app': '1.0.0',
    },
    devDependencies: { 'dsh-dev': '0.0.1' },
    dsh: { profile: { bundles: ['dsh-alpha', 'dsh-dev', '@deepseek-ai/dsh-base'] } },
  })
  const items = await listManagedPlugins({ profileDir: dir })
  const byName = new Map(items.map(item => [item.packageName, item]))
  check('列出 4 个插件', items.length === 4, String(items.length))
  check('已启用的插件 enabled=true', byName.get('dsh-alpha')?.enabled === true)
  check('在 bundles 里的 devDependency 也算启用', byName.get('dsh-dev')?.enabled === true)
  check('不在 bundles 的插件 enabled=false', byName.get('dsh-retrace')?.enabled === false)
  check('去掉版本号前缀', byName.get('dsh-alpha')?.version === '1.2.3', byName.get('dsh-alpha')?.version)
  check('宿主自有包不出现在列表', byName.has('@deepseek-ai/dsh-base') === false)
}

console.log('[node] builtin 判定使用去掉 scope 的包名')
{
  const dir = makeProfile({
    dependencies: { '@deepseek-ai/dsh-base': '1.0.0', 'dsh-user': '1.0.0' },
    dsh: { profile: { bundles: [] } },
  })
  const items = await listManagedPlugins({ profileDir: dir })
  const base = items.find(item => item.packageName === '@deepseek-ai/dsh-base')
  const user = items.find(item => item.packageName === 'dsh-user')
  check('宿主包仍被过滤出列表', base === undefined)
  check('普通包 builtin=false', user?.builtin === false)
}

console.log('[node] 停用后从 bundles 移除，依赖保留')
{
  const dir = makeProfile({
    dependencies: { 'dsh-alpha': '1.0.0' },
    dsh: { profile: { bundles: ['dsh-alpha'] } },
  })
  const pnpm = fakePnpm()
  const outcome = await setPluginEnabled(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-alpha',
    false,
  )
  check('停用成功', outcome.ok === true, outcome.error)
  check('bundles 里已移除', bundlesOf(dir).includes('dsh-alpha') === false)
  check('dependencies 里仍然保留', readManifest(dir).dependencies['dsh-alpha'] === '1.0.0')
  check('停用不调用 pnpm', pnpm.calls.length === 0)
}

console.log('[node] 启用后写回 bundles')
{
  const dir = makeProfile({
    dependencies: { 'dsh-alpha': '1.0.0' },
    dsh: { profile: { bundles: [] } },
  })
  const pnpm = fakePnpm()
  const outcome = await setPluginEnabled(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-alpha',
    true,
  )
  check('启用成功', outcome.ok === true, outcome.error)
  check('bundles 里已加入', bundlesOf(dir).includes('dsh-alpha') === true)
}

console.log('[node] 拒绝未安装的插件')
{
  const dir = makeProfile({ dependencies: {}, dsh: { profile: { bundles: [] } } })
  const pnpm = fakePnpm()
  const outcome = await setPluginEnabled(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-missing',
    true,
  )
  check('未安装的插件被拒绝', outcome.ok === false && outcome.code === 'invalid-target', outcome.code)
}

console.log('[node] 拒绝宿主自有包')
{
  const dir = makeProfile({ dependencies: {}, dsh: { profile: { bundles: [] } } })
  const pnpm = fakePnpm()
  const disabled = await setPluginEnabled(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-base',
    false,
  )
  const uninstalled = await uninstallPlugin(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-web-app',
  )
  check('停用宿主包被拒绝', disabled.code === 'immutable-target', disabled.code)
  check('卸载宿主包被拒绝', uninstalled.code === 'immutable-target', uninstalled.code)
}

console.log('[node] 卸载执行 pnpm remove 并清理 bundles')
{
  const dir = makeProfile({
    dependencies: { 'dsh-alpha': '1.0.0' },
    dsh: { profile: { bundles: ['dsh-alpha'] } },
  })
  const pnpm = fakePnpm()
  const outcome = await uninstallPlugin(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-alpha',
  )
  check('卸载成功', outcome.ok === true, outcome.error)
  check('调用了 pnpm remove', pnpm.calls[0]?.args[0] === 'remove' && pnpm.calls[0]?.args[1] === 'dsh-alpha')
  check('在 profile 目录内执行', pnpm.calls[0]?.cwd === dir)
  check('bundles 里已清理', bundlesOf(dir).includes('dsh-alpha') === false)
}

console.log('[node] pnpm 失败时报告原因')
{
  const dir = makeProfile({
    dependencies: { 'dsh-alpha': '1.0.0' },
    dsh: { profile: { bundles: ['dsh-alpha'] } },
  })
  const pnpm = {
    runPlugin() {
      const stdout = new EventEmitter()
      const stderr = new EventEmitter()
      const done = Promise.resolve({ exitCode: 1, signal: null })
      process.nextTick(() => stderr.emit('data', Buffer.from('ERR_PNPM_NO_MATCHING_VERSION\n')))
      return { stdout, stderr, done }
    },
  }
  const outcome = await uninstallPlugin(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-alpha',
  )
  check('卸载失败被报告', outcome.ok === false && outcome.code === 'uninstall-failed', outcome.code)
  check('bundles 保持不变', bundlesOf(dir).includes('dsh-alpha') === true)
}

console.log('[node] 清单损坏时安全失败')
{
  const dir = mkdtempSync(join(workRoot, 'broken-'))
  writeFileSync(join(dir, 'package.json'), '{ not json')
  const items = await listManagedPlugins({ profileDir: dir })
  check('损坏清单返回空列表', Array.isArray(items) && items.length === 0)
  const pnpm = fakePnpm()
  const outcome = await setPluginEnabled(
    { profileDir: dir, profileName: 'test', pnpm },
    'dsh-alpha',
    true,
  )
  check('损坏清单报 manifest-unavailable', outcome.ok === false && outcome.code === 'manifest-unavailable', outcome.code)
}

console.log('[node] 本地路径与 npm 包名区分')
{
  check('POSIX 绝对路径算本地路径', isLocalPathSpecifier('/opt/plugins/foo') === true)
  check('相对路径算本地路径', isLocalPathSpecifier('./local-plugin') === true)
  check('家目录算本地路径', isLocalPathSpecifier('~/plugins/foo') === true)
  check('Windows 盘符路径算本地路径', isLocalPathSpecifier('C:\\plugins\\foo') === true)
  check('Windows 斜杠盘符路径算本地路径', isLocalPathSpecifier('D:/plugins/foo') === true)
  check('普通 npm 包名不算本地路径', isLocalPathSpecifier('dsh-market') === false)
  check('scoped npm 包名不算本地路径', isLocalPathSpecifier('@scope/plugin') === false)
  check('带版本号的 npm 包名不算本地路径', isLocalPathSpecifier('dsh-market@1.0.0') === false)
}

rmSync(workRoot, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`\n[node] 失败 ${failures.length} 项：`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\n[node] 全部通过')
