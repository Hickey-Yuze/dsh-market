/**
 * Client half API access.
 *
 * Every call goes to the Host routes mounted by the Node half. The renderer
 * never talks to the market backend directly, so the Host stays the only
 * place that performs downloads and installs.
 */

import type {
  InstalledPlugin,
  InstalledSkill,
  InstallResult,
  MarketCategory,
  MarketPlugin,
  MarketSkill,
  SkippedEntry,
} from '../shared/types.js'

const BASE = '/api/dsh-market'

export interface ListParams {
  readonly page?: number
  readonly pageSize?: number
  readonly category?: string
  readonly keyword?: string
}

export interface PagedResponse<T> {
  readonly items: readonly T[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
  /** Market entries the client refused to surface, with the reason. */
  readonly skipped?: readonly SkippedEntry[]
}

/** Result of an enable / disable / uninstall call. */
export interface PluginMutation {
  readonly ok: boolean
  readonly packageName: string
  readonly error?: string
  readonly code?: string
}

/** Result of an enable / disable / delete call on a skill. */
export interface SkillMutation {
  readonly ok: boolean
  readonly name: string
  readonly enabled?: boolean
  readonly error?: string
  readonly code?: string
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (text.length === 0) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('响应不是合法 JSON')
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  if (params !== undefined) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`请求失败（${response.status}）`)
  return readJson<T>(response)
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return readJson<T>(response)
}

export const marketApi = {
  listSkillCategories: (): Promise<readonly MarketCategory[]> =>
    get<{ items: readonly MarketCategory[] }>('/skill/categories').then(payload => payload.items ?? []),

  listSkills: (params: ListParams = {}): Promise<PagedResponse<MarketSkill>> =>
    get<PagedResponse<MarketSkill>>('/skill/list', { ...params }),

  listPluginCategories: (): Promise<readonly MarketCategory[]> =>
    get<{ items: readonly MarketCategory[] }>('/plugin/categories').then(payload => payload.items ?? []),

  listPlugins: (params: ListParams = {}): Promise<PagedResponse<MarketPlugin>> =>
    get<PagedResponse<MarketPlugin>>('/plugin/list', { ...params }),

  listInstalledSkills: (): Promise<readonly InstalledSkill[]> =>
    get<{ items: readonly InstalledSkill[] }>('/installed/skills').then(payload => payload.items ?? []),

  listInstalledPlugins: (): Promise<readonly InstalledPlugin[]> =>
    get<{ items: readonly InstalledPlugin[] }>('/installed/plugins').then(payload => payload.items ?? []),

  installSkill: (skill: MarketSkill): Promise<InstallResult> =>
    post<InstallResult>('/skill/install', {
      id: skill.id,
      name: skill.name,
      nameCn: skill.nameCn,
      description: skill.description,
      version: skill.version,
      author: skill.author,
      url: skill.url,
    }),

  installPlugin: (plugin: MarketPlugin): Promise<InstallResult> =>
    post<InstallResult>('/plugin/install', {
      id: plugin.id,
      name: plugin.name,
      nameCn: plugin.nameCn,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      downloadUrl: plugin.downloadUrl,
    }),

  installPluginFromSource: (source: string): Promise<InstallResult> =>
    post<InstallResult>('/plugin/install-from-source', { source }),

  /** Install an npm tarball the browser picked. */
  installPluginFromTarball: (fileName: string, data: string): Promise<InstallResult> =>
    post<InstallResult>('/plugin/install-tarball', { fileName, data }),

  /** Enable or disable one installed plugin. */
  setPluginEnabled: (packageName: string, enabled: boolean): Promise<PluginMutation> =>
    post<PluginMutation>('/plugin/enabled', { packageName, enabled }),

  /** Uninstall one installed plugin. */
  uninstallPlugin: (packageName: string): Promise<PluginMutation> =>
    post<PluginMutation>('/plugin/uninstall', { packageName }),

  /** Enable or disable one installed skill. */
  setSkillEnabled: (name: string, enabled: boolean): Promise<SkillMutation> =>
    post<SkillMutation>('/skill/enabled', { name, enabled }),

  /** Delete one installed skill. */
  uninstallSkill: (name: string): Promise<SkillMutation> =>
    post<SkillMutation>('/skill/uninstall', { name }),
}
