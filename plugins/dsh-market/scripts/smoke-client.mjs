/* SSR smoke test for the plugin market client half. Not part of the shipped package. */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(root, '.smoke')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'scripts/smoke-entry.tsx')],
  outfile: join(outDir, 'bundle.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/server'],
  alias: {
    '@deepseek-ai/dsh-client-ui-primitives': join(root, 'scripts/primitives-stub.tsx'),
  },
  logLevel: 'error',
})

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const bundle = require(join(outDir, 'bundle.cjs'))

const failures = []
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('[smoke] 渲染插件市场面板')
const panelHtml = renderToStaticMarkup(
  React.createElement(bundle.PluginsPanel, {
    t: (key) => key,
    pickDirectory: async () => null,
  }),
)
check('面板渲染无异常', panelHtml.length > 0)
check('面板带 data-dsm-panel="plugins"', panelHtml.includes('data-dsm-panel="plugins"'))

console.log('[smoke] 渲染已安装插件卡片')
const installed = {
  packageName: 'dsh-market',
  version: '0.1.0',
  enabled: true,
}
const cardHtml = renderToStaticMarkup(
  React.createElement(bundle.InstalledPluginCard, {
    plugin: installed,
    busy: false,
    onToggle: () => {},
    onRefresh: () => {},
    onUninstall: () => {},
    t: (key) => key,
  }),
)
check('卡片带 data-dsm-installed', cardHtml.includes('data-dsm-installed="dsh-market"'))
check('卡片显示包名', cardHtml.includes('dsh-market'))
check('卡片含启用开关', cardHtml.includes('role="switch"'))

console.log('[smoke] 渲染 tab 条')
const tabsHtml = renderToStaticMarkup(
  React.createElement(bundle.MarketTabs, {
    tabs: [
      { value: 'market', label: '插件市场' },
      { value: 'installed', label: '已安装', count: 3 },
      { value: 'manual', label: '手动安装' },
    ],
    value: 'installed',
    onChange: () => {},
    label: '插件市场',
    panelId: 'dsm-plugins-panel',
  }),
)
for (const label of ['插件市场', '已安装', '手动安装']) {
  check(`tab 含「${label}」`, tabsHtml.includes(label))
}
check('tab 计数渲染', tabsHtml.includes('3'))

console.log('[smoke] 渲染手动安装子 tab')
const sourceTabsHtml = renderToStaticMarkup(
  React.createElement(bundle.MarketTabs, {
    tabs: [
      { value: 'directory', label: '本地目录' },
      { value: 'npm', label: 'npm' },
      { value: 'tarball', label: 'tgz' },
    ],
    value: 'directory',
    onChange: () => {},
    label: '安装来源',
    panelId: 'dsm-plugins-source-panel',
    className: 'dsm-sourceTabs',
  }),
)
for (const label of ['本地目录', 'npm', 'tgz']) {
  check(`子 tab 含「${label}」`, sourceTabsHtml.includes(label))
}

console.log('[smoke] 导出面检查')
for (const name of ['PluginsPanel', 'SkillsPanel', 'InstalledPluginCard', 'MarketTabs', 'MarketPage']) {
  check(`导出 ${name}`, typeof bundle[name] === 'function')
}

rmSync(outDir, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`\n[smoke] 失败 ${failures.length} 项：`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\n[smoke] 全部通过')
