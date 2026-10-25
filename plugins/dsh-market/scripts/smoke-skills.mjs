/**
 * Interaction checks for the skill market page.
 *
 * The page is mounted into a real DOM (jsdom) against a stubbed Host API, so
 * the enable/disable switch and the delete button of an installed skill are
 * driven the way a user would drive them.
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

const workRoot = join(root, '.smoke-skills')
rmSync(workRoot, { recursive: true, force: true })
mkdirSync(workRoot, { recursive: true })

// --- DOM -------------------------------------------------------------------
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// --- Host API stub ---------------------------------------------------------
const calls = []
const state = {
  skills: [
    {
      id: 's1',
      name: 'example-skill',
      nameCn: '示例技能',
      description: '一个示例技能',
      author: 'someone',
      version: '1.2.0',
      downloadUrl: 'https://example.test/skill.zip',
      tags: [],
    },
  ],
  installed: [
    {
      name: 'dsh-plugin-studio',
      description: 'DSH 插件开发助手',
      path: '/tmp/skills/dsh-plugin-studio',
      enabled: true,
      version: '0.1.0',
    },
    {
      name: 'dws',
      description: '钉钉全家桶',
      path: '/tmp/skills/dws',
      enabled: false,
    },
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

  if (path === '/api/dsh-market/skill/categories') return ok({ items: [] })
  if (path === '/api/dsh-market/skill/list') {
    return ok({ items: state.skills, page: 1, pageSize: 200, total: state.skills.length })
  }
  if (path === '/api/dsh-market/installed/skills') return ok({ items: state.installed })
  if (path === '/api/dsh-market/skill/enabled') {
    return ok({ ok: true, name: body.name, enabled: body.enabled })
  }
  if (path === '/api/dsh-market/skill/uninstall') {
    return ok({ ok: true, name: body.name })
  }
  return { ok: false, status: 404, text: async () => '' }
}

// --- bundle the panel ------------------------------------------------------
const bundlePath = join(workRoot, 'skills-panel.mjs')
await build({
  entryPoints: [join(root, 'src/client/SkillsPanel.tsx')],
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
const { SkillsPanel } = await import(bundlePath)

const translations = {
  'skills.panel': '技能专区',
  'skills.title': '技能专区',
  'skills.intro': '浏览技能市场',
  'skills.tab.featured': '精选',
  'skills.tab.installed': '已安装',
  'skills.install': '安装',
  'skills.installed': '已安装',
  'skills.enabled': '已启用',
  'skills.disabled': '已禁用',
  'skills.toggleLabel': '启用技能',
  'skills.toggleTitle': '启用或禁用该技能（重启后生效）',
  'skills.uninstall': '删除',
  'skills.toggleFailed': '操作失败',
  'skills.uninstallFailed': '删除失败',
  'skills.uninstalled': '已删除',
  'skills.needRestart': '操作完成，重启 Harness 后生效',
  'skills.skipped': '已跳过',
  'skills.installFailed': '安装失败',
  'common.empty': '暂无内容',
  'common.installing': '安装中…',
  'common.installed': '已安装',
  'common.install': '安装',
  'common.refresh': '刷新',
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

const settle = async () => {
  for (let round = 0; round < 20; round += 1) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }
}

const render = async (props = {}) => {
  await act(async () => {
    rootHandle.render(React.createElement(SkillsPanel, { t, ...props }))
  })
  await flush()
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
const lastCall = path => [...calls].reverse().find(call => call.path === path)
const card = name => container.querySelector(`[data-dsm-installed="${name}"]`)

// --- checks ----------------------------------------------------------------
await render()
await settle()

console.log('[skills] 面板加载')
check('显示技能专区标题', text().includes('技能专区'))
check('市场列表已渲染', container.querySelector('[data-dsm-list="skills"]') !== null)

// The installed skills live behind their own tab.
const installedTab = tabButton('已安装')
check('找到已安装页签', installedTab !== undefined)
if (installedTab !== undefined) {
  await click(installedTab)
  await settle()
}
check('列出已安装技能', card('dsh-plugin-studio') !== null)
check('列出第二个已安装技能', card('dws') !== null)

console.log('[skills] 已启用标记')
check('启用中的技能标记为已启用', (card('dsh-plugin-studio')?.textContent ?? '').includes('已启用'))
check('停用的技能标记为已禁用', (card('dws')?.textContent ?? '').includes('已禁用'))

console.log('[skills] 开关与删除按钮')
const switcher = card('dsh-plugin-studio')?.querySelector('[role="switch"]')
check('已安装技能有开关', switcher !== null)
check('开关当前为开启', switcher?.getAttribute('aria-checked') === 'true')
const deleteButton = card('dsh-plugin-studio')?.querySelector('[aria-label="删除"]')
check('已安装技能有删除按钮', deleteButton !== null)

console.log('[skills] 切换启用状态')
if (switcher !== null) {
  await click(switcher)
  await settle()
  const call = lastCall('/api/dsh-market/skill/enabled')
  check('调用技能启停接口', call !== undefined)
  check('接口带技能名', call?.body?.name === 'dsh-plugin-studio', JSON.stringify(call?.body))
  check('接口带目标状态', call?.body?.enabled === false, JSON.stringify(call?.body))
  check('提示需要重启', text().includes('重启'))
}

console.log('[skills] 删除技能')
if (deleteButton !== null) {
  await click(deleteButton)
  await settle()
  const call = lastCall('/api/dsh-market/skill/uninstall')
  check('调用技能删除接口', call !== undefined)
  check('删除接口带技能名', call?.body?.name === 'dsh-plugin-studio', JSON.stringify(call?.body))
  check('提示已删除', text().includes('已删除'))
}

console.log('[skills] 市场条目安装')
const marketTab = tabButton('精选')
if (marketTab !== undefined) {
  await click(marketTab)
  await settle()
}
const installButton = [...container.querySelectorAll('button')].find(
  b => (b.textContent ?? '').trim() === '安装',
)
check('市场条目有安装按钮', installButton !== undefined)
if (installButton !== undefined) {
  await click(installButton)
  const call = lastCall('/api/dsh-market/skill/install')
  check('调用技能安装接口', call !== undefined)
  check('安装接口带技能 id', call?.body?.id === 's1', JSON.stringify(call?.body))
}

rmSync(workRoot, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`\n[skills] 失败 ${failures.length} 项：`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\n[skills] 全部通过')
