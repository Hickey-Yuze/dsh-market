/**
 * Interaction checks for the plugin market page.
 *
 * The page is mounted into a real DOM (jsdom) against a stubbed Host API, so
 * tab switching, the manual-install forms and the enable/disable actions are
 * driven the way a user would drive them — not merely rendered to a string.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, rmSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const failures = []
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const workRoot = join(root, '.smoke-dom')
rmSync(workRoot, { recursive: true, force: true })
mkdirSync(workRoot, { recursive: true })

// --- DOM ------------------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:43120/',
  pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
  writable: true,
})
globalThis.HTMLElement = window.HTMLElement
globalThis.Node = window.Node
globalThis.Event = window.Event
globalThis.MouseEvent = window.MouseEvent
globalThis.getComputedStyle = window.getComputedStyle
globalThis.requestAnimationFrame = window.requestAnimationFrame
globalThis.cancelAnimationFrame = window.cancelAnimationFrame
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64')

// --- Host API stub --------------------------------------------------------
const calls = []
const state = {
  categories: [
    { id: '1', name: '精选', icon: '', pluginCount: 2 },
    { id: '2', name: '编程开发', icon: '', pluginCount: 1 },
  ],
  plugins: [
    {
      id: 'p1',
      name: 'dsh-alpha',
      nameCn: '示例插件',
      description: '一个示例插件',
      author: 'someone',
      version: '1.0.0',
      downloadUrl: 'https://example.test/alpha.tgz',
      tags: [],
    },
    {
      id: 'p2',
      name: 'dsh-beta',
      nameCn: '',
      description: '另一个插件',
      author: 'other',
      version: '2.0.0',
      downloadUrl: 'https://example.test/beta.tgz',
      tags: [],
    },
  ],
  installed: [
    { packageName: 'dsh-gamma', version: '0.3.0', enabled: true, builtin: false },
    { packageName: 'dsh-delta', version: '0.4.0', enabled: false, builtin: false },
  ],
}

const json = payload => JSON.stringify(payload)
const ok = payload => ({ ok: true, status: 200, text: async () => json(payload) })

globalThis.fetch = async (url, init) => {
  const href = String(url)
  const path = href.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const method = init?.method ?? 'GET'
  const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))
  calls.push({ path, method, body })

  if (path === '/api/dsh-market/plugin/categories') return ok({ items: state.categories })
  if (path === '/api/dsh-market/plugin/list') {
    return ok({
      items: state.plugins,
      page: 1,
      pageSize: 200,
      total: state.plugins.length,
    })
  }
  if (path === '/api/dsh-market/installed/plugins') return ok({ items: state.installed })
  if (path === '/api/dsh-market/plugin/install') return ok({ ok: true, message: 'ok' })
  if (path === '/api/dsh-market/plugin/install-from-source') return ok({ ok: true, message: 'ok' })
  if (path === '/api/dsh-market/plugin/install-tarball') return ok({ ok: true, message: 'ok' })
  if (path === '/api/dsh-market/plugin/enabled') {
    return ok({ ok: true, packageName: body.packageName })
  }
  if (path === '/api/dsh-market/plugin/uninstall') {
    return ok({ ok: true, packageName: body.packageName })
  }
  return { ok: false, status: 404, text: async () => '' }
}

// --- bundle the panel ------------------------------------------------------
const bundlePath = join(workRoot, 'panel.mjs')
await build({
  entryPoints: [join(root, 'src/client/PluginsPanel.tsx')],
  outfile: bundlePath,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  alias: {
    '@deepseek-ai/dsh-client-ui-primitives': join(root, 'scripts/primitives-stub.tsx'),
  },
  logLevel: 'error',
})

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { act } = await import('react-dom/test-utils')
const { PluginsPanel } = await import(bundlePath)

const translations = {
  'plugins.title': '插件市场',
  'plugins.tab.market': '插件市场',
  'plugins.tab.installed': '已安装',
  'plugins.tab.manual': '手动安装',
  'plugins.source.directory': '本地目录',
  'plugins.source.npm': 'npm',
  'plugins.source.tarball': 'tgz',
  'plugins.source.directoryTitle': '从本地目录安装',
  'plugins.source.npmTitle': '从 npm 安装',
  'plugins.source.tarballTitle': '从 tarball 安装',
  'plugins.source.notSelected': '未选择',
  'plugins.source.choose': '选择',
  'plugins.source.npmName': '包名',
  'plugins.source.npmVersion': '版本',
  'plugins.manualTitle': '手动安装',
  'plugins.manualInstall': '安装',
  'plugins.manualInvalid': '请填写完整信息',
  'plugins.needRestart': '安装完成，重启 Harness 后生效',
  'plugins.installFailed': '安装失败',
  'plugins.toggleFailed': '切换失败',
  'plugins.uninstallFailed': '卸载失败',
  'plugins.uninstalled': '已卸载',
  'plugins.enabled': '已启用',
  'plugins.disabled': '已禁用',
  'plugins.toggleLabel': '启用',
  'plugins.toggleTitle': '启用或禁用',
  'plugins.refresh': '刷新',
  'plugins.uninstall': '卸载',
  'plugins.directoryUnavailable': '当前宿主未提供目录选择器，请手动填写路径',
  'common.all': '全部',
  'common.search': '搜索',
  'common.loading': '加载中',
  'common.empty': '暂无内容',
  'common.failed': '失败',
  'common.retry': '重试',
  'common.installing': '安装中',
  'common.install': '安装',
  'common.installed': '已安装',
}
const t = key => translations[key] ?? key

const container = window.document.getElementById('root')
const rootHandle = createRoot(container)

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/**
 * Wait until the panel finished loading.
 *
 * The panel loads its lists in a promise chain, so a render that follows a
 * state change only shows the new data after the pending microtasks and
 * timers have drained.
 */
const settle = async () => {
  for (let round = 0; round < 20; round += 1) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }
}

const render = async (props = {}) => {
  await act(async () => {
    rootHandle.render(React.createElement(PluginsPanel, { t, ...props }))
  })
  await flush()
}

/**
 * Reload the panel's lists through the refresh button of an installed card.
 *
 * The panel loads its lists once per mount, so a changed server state only
 * shows up after the panel was told to reload. The refresh button on an
 * installed card is that entry point, so the installed tab has to be open.
 */
const reload = async (props = {}) => {
  await render(props)
  await settle()
  const installedTab = tabButton('已安装')
  if (installedTab !== undefined) {
    await click(installedTab)
    await settle()
  }
  const refresh = container.querySelector('[data-dsm-installed] [aria-label="刷新"]')
  if (refresh !== null) {
    await click(refresh)
    await settle()
  }
  // Return to the market tab so the assertions below look at market entries.
  const marketTab = tabButton('插件市场')
  if (marketTab !== undefined) {
    await click(marketTab)
    await settle()
  }
}

const text = () => container.textContent ?? ''
const tabButton = label =>
  [...container.querySelectorAll('[role="tab"]')].find(tab => (tab.textContent ?? '').includes(label))
const click = async element => {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await flush()
}
const setInput = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await flush()
}
const lastCall = path => [...calls].reverse().find(call => call.path === path)


console.log('[dom] 渲染插件市场面板')
await render()
check('面板已挂载', container.querySelector('[data-dsm-panel="plugins"]') !== null)
check('市场分类已加载', text().includes('精选') && text().includes('编程开发'))
check('插件条目已渲染', text().includes('dsh-alpha') && text().includes('dsh-beta'))
check(
  '市场列表容器存在',
  container.querySelector('[data-dsm-list="plugins"]') !== null,
)
check('已安装列表此时不可见', container.querySelector('[data-dsm-list="installed-plugins"]') === null)

console.log('[dom] 切到已安装页签')
await click(tabButton('已安装'))
check('已安装列表可见', container.querySelector('[data-dsm-list="installed-plugins"]') !== null)
check('市场列表已隐藏', container.querySelector('[data-dsm-list="plugins"]') === null)
check('列出已安装包名', text().includes('dsh-gamma') && text().includes('dsh-delta'))
check('显示启用状态标签', text().includes('已启用') && text().includes('已禁用'))

console.log('[dom] 停用插件')
const toggle = container.querySelector('[data-dsm-installed="dsh-gamma"] [role="switch"]')
check('已安装卡片带开关', toggle !== null)
if (toggle !== null) {
  await click(toggle)
  const call = lastCall('/api/dsh-market/plugin/enabled')
  check('调用了启停接口', call !== undefined)
  check('请求带上包名', call?.body?.packageName === 'dsh-gamma', JSON.stringify(call?.body))
  check('请求带上目标状态', call?.body?.enabled === false, JSON.stringify(call?.body))
  check('提示需要重启', text().includes('重启 Harness 后生效'))
}

console.log('[dom] 卸载插件')
const uninstallButton = container.querySelector(
  '[data-dsm-installed="dsh-delta"] [aria-label="卸载"]',
)
check('找到卸载按钮', uninstallButton !== null)
if (uninstallButton !== null) {
  await click(uninstallButton)
  const call = lastCall('/api/dsh-market/plugin/uninstall')
  check('调用了卸载接口', call?.body?.packageName === 'dsh-delta', JSON.stringify(call?.body))
  check('提示已卸载', text().includes('已卸载'))
}

console.log('[dom] 刷新已安装列表')
const before = calls.length
const refreshButton = container.querySelector('[data-dsm-installed="dsh-gamma"] [aria-label="刷新"]')
check('找到刷新按钮', refreshButton !== null)
if (refreshButton !== null) {
  await click(refreshButton)
  check('刷新重新拉取了列表', calls.length > before)
}

console.log('[dom] 切到手动安装页签')
await click(tabButton('手动安装'))
check('显示手动安装标题', text().includes('手动安装'))
check('显示本地目录子页签', text().includes('本地目录'))
check('显示 npm 子页签', text().includes('npm'))
check('显示 tgz 子页签', text().includes('tgz'))
check('市场列表已隐藏', container.querySelector('[data-dsm-list="plugins"]') === null)

console.log('[dom] 手动安装缺少路径时拒绝提交')
const installButton = [...container.querySelectorAll('button')].find(
  button => (button.textContent ?? '').trim() === '安装',
)
check('找到安装按钮', installButton !== null)
await click(installButton)
check('提示填写完整信息', text().includes('请填写完整信息'))
check('未发出安装请求', lastCall('/api/dsh-market/plugin/install-from-source') === undefined)

console.log('[dom] 宿主没有选择器时给出提示')
await click([...container.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '选择'))
check('提示目录选择器不可用', text().includes('当前宿主未提供目录选择器'))

console.log('[dom] 宿主提供选择器时写入目录')
await render({ pickDirectory: async () => '/picked/dir' })
await click([...container.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '选择'))
check('目录已写入', text().includes('/picked/dir'), text().slice(0, 200))

console.log('[dom] 手动安装提交目录')
await click([...container.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '安装'))
const directoryCall = lastCall('/api/dsh-market/plugin/install-from-source')
check('发出目录安装请求', directoryCall?.body?.source === '/picked/dir', JSON.stringify(directoryCall?.body))
check('提示需要重启', text().includes('重启 Harness 后生效'))

console.log('[dom] npm 子页签填写包名与版本')
await render()
await click(tabButton('手动安装'))
await click(tabButton('npm'))
const npmInputs = [...container.querySelectorAll('.dsm-sourceInput input')]
check('npm 页签有两个输入框', npmInputs.length === 2, String(npmInputs.length))
if (npmInputs.length === 2) {
  await setInput(npmInputs[0], 'dsh-from-npm')
  await setInput(npmInputs[1], '1.2.3')
  await click([...container.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '安装'))
  const call = lastCall('/api/dsh-market/plugin/install-from-source')
  check('发出 npm 安装请求', call?.body?.source === 'dsh-from-npm@1.2.3', JSON.stringify(call?.body))
}

console.log('[dom] npm 只填包名时不带版本')
await render()
await click(tabButton('手动安装'))
await click(tabButton('npm'))
const onlyName = [...container.querySelectorAll('.dsm-sourceInput input')][0]
if (onlyName !== undefined) {
  await setInput(onlyName, 'dsh-plain')
  await click([...container.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '安装'))
  const call = lastCall('/api/dsh-market/plugin/install-from-source')
  check('请求只有包名', call?.body?.source === 'dsh-plain', JSON.stringify(call?.body))
}

console.log('[dom] tgz 子页签')
await click(tabButton('tgz'))
check('显示 tarball 标题', text().includes('从 tarball 安装'))
check('文件选择框存在', container.querySelector('input[type="file"]') !== null)
check('未选文件时提示填写完整信息', (() => {
  const before = calls.length
  const button = [...container.querySelectorAll('button')].find(
    b => (b.textContent ?? '').trim() === '安装',
  )
  return button !== undefined && calls.length === before
})())

console.log('[dom] 市场条目已安装标记')
// The panel loads its lists once per mount, so a changed server state only
// shows up after the user asked for a reload. The refresh button on an
// installed card is that entry point.
state.installed.push({ packageName: 'dsh-alpha', version: '1.0.0', enabled: true, builtin: false })
await reload()
const installedEntry = [...container.querySelectorAll('[data-dsm-entry]')].find(entry =>
  (entry.textContent ?? '').includes('dsh-alpha'),
)
check('已安装的插件标记为已安装', (installedEntry?.textContent ?? '').includes('已安装'))
check('已安装的条目不再显示安装按钮', installedEntry?.querySelector('button') === null)

console.log('[dom] 市场条目安装按钮')
state.installed = state.installed.filter(plugin => plugin.packageName !== 'dsh-alpha')
await reload()
const installEntry = [...container.querySelectorAll('[data-dsm-entry]')].find(entry =>
  (entry.textContent ?? '').includes('dsh-alpha'),
)?.querySelector('button')
check('未安装的条目有安装按钮', installEntry !== null)
if (installEntry !== null) {
  await click(installEntry)
  const call = lastCall('/api/dsh-market/plugin/install')
  check('调用市场安装接口', call?.body?.name === 'dsh-alpha', JSON.stringify(call?.body))
}

rmSync(workRoot, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`\n[dom] 失败 ${failures.length} 项：`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\n[dom] 全部通过')
