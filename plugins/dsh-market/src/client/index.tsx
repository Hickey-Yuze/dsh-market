/**
 * Client half entry point.
 *
 * Registers two sidebar entries — a skill market and a plugin market — and
 * the matching pages in the Host's keyed `main` slot. The pages talk to the
 * Node half through the Host routes, so no market traffic leaves the Host.
 *
 * The plugin needs the layout and locale services. When the Host lacks them
 * the registration is skipped instead of breaking the sidebar.
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  IconPluginPinwheelOutlineRegular,
  IconSkillOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { PluginsPanel } from './PluginsPanel.js'
import { SkillsPanel } from './SkillsPanel.js'
import { NS, en, zh } from './locales.js'
import { styles } from './styles.js'

/** The sidebar entry and panel id for the skill market. */
export const SKILLS_PANEL_ID = 'dsh-market-skills'
/** The sidebar entry and panel id for the plugin market. */
export const PLUGINS_PANEL_ID = 'dsh-market-plugins'

// cordis inject 这里写的是「服务名」，不是包名：`remote` 由
// @deepseek-ai/dsh-api-gateway 的 client 半区提供（dsh-base 的 typert-gateway 行）。
// `@deepseek-ai/dsh-api-remotes` 是包名——包名只会作为 package.json
// `dsh.client.inject` 的模块图边，没有任何插件以它为名提供服务；
// 写进 cordis inject 会让本插件永远 pending，整个 web boot 失败。
export const inject = [
  'remote',
  'slots',
  'locale',
  'layout',
]

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: {
      inject(slot: string, run: () => unknown): void
      register(options: Record<string, unknown>, component: unknown): unknown
    }
    locale: {
      register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): void
      bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
    }
    layout: {
      selectPanel(id: string): void
      panelInfo: { subscribe(run: () => void): () => void }
    }
    remote?: {
      directoryPicker?: {
        pick(signal?: AbortSignal): Promise<unknown>
      }
    }
  }
}

function SkillsPanelIcon(props: { size?: number }): JSX.Element {
  return <IconSkillOutlineRegular size={props.size ?? 18} />
}

function PluginsPanelIcon(props: { size?: number }): JSX.Element {
  return <IconPluginPinwheelOutlineRegular size={props.size ?? 18} />
}

export function apply(ctx: Context): void {
  if (typeof document !== 'undefined' && !document.querySelector('style[data-dsh-market]')) {
    const element = document.createElement('style')
    element.dataset.dshMarket = ''
    element.textContent = styles
    document.head.appendChild(element)
  }

  ctx.effect(() => {
    ctx.locale.register(NS, { zh, en })
    return () => {}
  }, 'dsh-market: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: SKILLS_PANEL_ID,
        locale: NS,
        inject: () => ({ t }),
      },
      SkillsPanel,
    ),
  )

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PLUGINS_PANEL_ID,
        locale: NS,
        inject: () => ({ t, pickDirectory: createDirectoryPicker(ctx, t) }),
      },
      PluginsPanel,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: SKILLS_PANEL_ID,
        order: 10,
        label: () => t('skills.panel'),
        locale: NS,
      },
      SkillsPanelIcon,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PLUGINS_PANEL_ID,
        order: 11,
        label: () => t('plugins.panel'),
        locale: NS,
      },
      PluginsPanelIcon,
    ),
  )
}

/**
 * Open the Host's native directory chooser.
 *
 * The chooser lives behind the `remote.directoryPicker` namespace that the
 * workspace controller publishes through the Host's remote service. The
 * namespace is resolved on demand rather than at registration time, because
 * the remote service mounts its namespaces independently of this module. When
 * the Host does not expose the chooser the page reports that it is
 * unavailable, instead of failing the whole page.
 */
function createDirectoryPicker(ctx: Context, t: (key: string) => string): () => Promise<string | null> {
  return async () => {
    const namespace = ctx.remote?.directoryPicker
    if (namespace === undefined || typeof namespace.pick !== 'function') {
      throw new Error(t('plugins.directoryUnavailable'))
    }
    const result = await namespace.pick()
    if (result === null || result === undefined) return null
    if (typeof result === 'string') return result
    if (typeof result === 'object') {
      const record = result as Record<string, unknown>
      if (record.ok === true) {
        const value = record.value
        return typeof value === 'string' ? value : null
      }
      if (record.ok === false) {
        const error = record.error as { message?: string } | undefined
        throw new Error(error?.message ?? '目录选择失败')
      }
    }
    return null
  }
}
