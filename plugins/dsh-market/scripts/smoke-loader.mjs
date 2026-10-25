/* Host ModuleLoader simulation for the built client bundle. Not shipped. */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const React = require('react')

const failures = []
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Build the primitives stub as CJS so the bundle can require it.
const stubOut = join(root, '.smoke')
rmSync(stubOut, { recursive: true, force: true })
mkdirSync(stubOut, { recursive: true })
await build({
  entryPoints: [join(root, 'scripts/primitives-stub.tsx')],
  outfile: join(stubOut, 'primitives.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  jsx: 'automatic',
  external: ['react'],
  logLevel: 'error',
})
const primitives = require(join(stubOut, 'primitives.cjs'))

console.log('[loader] 加载构建产物 lib/client.js')
const bundleSource = readFileSync(join(root, 'lib/client.js'), 'utf8')

const styleNodes = []
const registered = []
const injectedSlots = []
const dictionaries = new Map()
const effects = []

globalThis.document = {
  head: {
    appendChild(node) {
      styleNodes.push(node)
    },
  },
  querySelector(selector) {
    return selector === 'style[data-dsh-market]' ? styleNodes[0] ?? null : null
  },
  createElement(tag) {
    return { tagName: tag, dataset: {}, textContent: '' }
  },
}
globalThis.window = {
  location: { origin: 'http://localhost' },
  __ModuleLoader__: {
    load(spec) {
      const requireFn = id => {
        if (id === 'react') return React
        if (id === 'react/jsx-runtime') return require('react/jsx-runtime')
        if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
        throw new Error(`unexpected require: ${id}`)
      }
      const exported = spec.factory(requireFn)
      loaded.push(exported)
      return exported
    },
  },
}

const loaded = []
new Function(bundleSource)()

check('bundle 已通过 ModuleLoader 加载', loaded.length === 1)
const mod = loaded[0]
check('导出 apply', typeof mod.apply === 'function')
check('导出 inject', Array.isArray(mod.inject))
// cordis inject 必须是「服务名」：remote 由 api-gateway 的 client 半区提供。
// 包名（@deepseek-ai/dsh-api-remotes）只属于 package.json 的 dsh.client.inject，
// 没有插件以包名为名提供服务；断言它不存在，防止这个 bug 回归。
check('inject 含 remote（服务名，而非包名）', mod.inject.includes('remote'))
check('inject 不含包名', !mod.inject.includes('@deepseek-ai/dsh-api-remotes'))
check('inject 含 slots/locale/layout', ['slots', 'locale', 'layout'].every(k => mod.inject.includes(k)))

console.log('[loader] 调用 apply')
const ctx = {
  effect(fn, label) {
    effects.push({ fn, label })
    return fn()
  },
  locale: {
    register(namespace, dict) {
      dictionaries.set(namespace, dict)
    },
    bind(namespace) {
      return (key, params) => {
        const dict = dictionaries.get(namespace)
        const table = dict?.zh ?? {}
        return table[key] ?? key
      }
    },
  },
  slots: {
    inject(slot, fn) {
      injectedSlots.push({ slot, fn })
      // The Host runs the slot callback once the slot is ready.
      fn()
    },
    register(options, component) {
      registered.push({ options, component })
      return { options, component }
    },
  },
}

let applyError = null
try {
  mod.apply(ctx)
} catch (error) {
  applyError = error
}
check('apply 未抛错', applyError === null, applyError ? String(applyError) : '')

console.log('[loader] 检查注册结果')
check('注入了样式节点', styleNodes.length === 1)
check('main 槽位注入两次', injectedSlots.filter(s => s.slot === 'main').length === 2)
check('侧栏槽位注入两次', injectedSlots.filter(s => s.slot === 'sidebar.panellist').length === 2)
check('注册 4 个条目', registered.length === 4)

const mainPages = registered.filter(r => r.options.name === 'main')
const sidePages = registered.filter(r => r.options.name === 'sidebar.panellist')
check('main 注册了技能与插件两个页面', mainPages.length === 2)
check('侧栏注册了技能与插件两个入口', sidePages.length === 2)
check(
  '页面 key 分别为 SKILLS/PLUGINS panel id',
  mainPages.map(p => p.options.key).sort().join(',') ===
    [mod.SKILLS_PANEL_ID, mod.PLUGINS_PANEL_ID].sort().join(','),
)
check('侧栏 id 唯一', new Set(sidePages.map(p => p.options.id)).size === 2)

console.log('[loader] 检查目录选择器注入')
const pluginPage = mainPages.find(p => p.options.key === mod.PLUGINS_PANEL_ID)
const injected = pluginPage.options.inject()
check('页面注入提供 t', typeof injected.t === 'function')
check('页面注入提供 pickDirectory', typeof injected.pickDirectory === 'function')

let pickError = null
try {
  const picked = await injected.pickDirectory()
  check('宿主无 remote 时 pickDirectory 抛本地化错误', picked === null)
} catch (error) {
  pickError = error
}
check(
  '目录选择器错误为本地化文案',
  pickError !== null && String(pickError.message).includes('当前宿主未提供目录选择器'),
  pickError ? String(pickError.message) : 'no error',
)

console.log('[loader] 检查 remote 命名空间可达')
// The Host publishes the namespace on the same context; the picker resolves it
// on demand, so attaching it later is enough.
ctx.remote = { directoryPicker: { pick: async () => '/tmp/picked-dir' } }
const picked2 = await injected.pickDirectory()
check('宿主提供 remote 时返回目录路径', picked2 === '/tmp/picked-dir', String(picked2))

rmSync(stubOut, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`\n[loader] 失败 ${failures.length} 项：`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\n[loader] 全部通过')
