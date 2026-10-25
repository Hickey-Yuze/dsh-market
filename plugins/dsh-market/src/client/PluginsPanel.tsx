/**
 * The plugin market page.
 *
 * Lists the plugins the market backend publishes and installs one into the
 * active profile. The Host runs pnpm for the install, so a plugin that fails
 * to install leaves the profile untouched.
 *
 * The page has three top-level tabs:
 *
 * - the market list,
 * - the installed list, where every plugin can be enabled, disabled or
 *   uninstalled,
 * - manual install, which offers a local directory, an npm specifier or an
 *   npm tarball.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  IconCordisPluginOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconPluginPinwheelOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { marketApi } from './api.js'
import {
  CategoryRail,
  EntryCard,
  InstalledPluginCard,
  KeywordFilter,
  MarketPage,
  MarketTabs,
} from './parts.jsx'
import type {
  InstalledPlugin,
  MarketCategory,
  MarketPlugin,
} from '../shared/types.js'

export interface PluginsPanelProps {
  readonly t: (key: string, params?: Record<string, string | number>) => string
  /** Opens the host's native directory chooser. */
  readonly pickDirectory?: () => Promise<string | null>
}

const MARKET = 'market'
const INSTALLED = 'installed'
const MANUAL = 'manual'

const SOURCE_DIRECTORY = 'directory'
const SOURCE_NPM = 'npm'
const SOURCE_TARBALL = 'tarball'

export function PluginsPanel(props: PluginsPanelProps): JSX.Element {
  const { t, pickDirectory } = props
  const [tab, setTab] = useState<string>(MARKET)
  const [categories, setCategories] = useState<readonly MarketCategory[]>([])
  const [plugins, setPlugins] = useState<readonly MarketPlugin[]>([])
  const [installed, setInstalled] = useState<readonly InstalledPlugin[]>([])
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  // Manual install state, one field per source shape.
  const [sourceTab, setSourceTab] = useState<string>(SOURCE_DIRECTORY)
  const [directory, setDirectory] = useState<string>('')
  const [packageName, setPackageName] = useState<string>('')
  const [packageVersion, setPackageVersion] = useState<string>('')
  const [tarball, setTarball] = useState<{ name: string; data: string } | undefined>(undefined)
  const [manualBusy, setManualBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(undefined)
    try {
      const [nextCategories, nextPlugins, nextInstalled] = await Promise.all([
        marketApi.listPluginCategories(),
        marketApi.listPlugins({
          page: 1,
          pageSize: 200,
          category,
          keyword: keyword.length > 0 ? keyword : undefined,
        }),
        marketApi.listInstalledPlugins(),
      ])
      setCategories(nextCategories)
      setPlugins(nextPlugins.items)
      setInstalled(nextInstalled)
      setStatus('ready')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }, [category, keyword])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Market entries are matched against the installed plugins by npm package
   * name. A scoped package keeps its scope in `name`, while the profile
   * manifest records it as `packageName`, so both spellings are indexed.
   */
  const installedNames = useMemo(() => {
    const names = new Set<string>()
    for (const plugin of installed) {
      names.add(plugin.packageName)
      const scoped = plugin.packageName.startsWith('@')
        ? plugin.packageName.split('/').slice(1).join('/')
        : plugin.packageName
      names.add(scoped)
    }
    return names
  }, [installed])

  const install = useCallback(
    async (plugin: MarketPlugin) => {
      setBusy(plugin.name)
      setNotice(undefined)
      try {
        const result = await marketApi.installPlugin(plugin)
        if (!result.ok) {
          setNotice(result.message || t('plugins.installFailed'))
          return
        }
        setNotice(t('plugins.needRestart'))
        await load()
      } catch (cause: unknown) {
        setNotice(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(undefined)
      }
    },
    [load, t],
  )

  const togglePlugin = useCallback(
    async (plugin: InstalledPlugin, next: boolean) => {
      setBusy(plugin.packageName)
      setNotice(undefined)
      try {
        const result = await marketApi.setPluginEnabled(plugin.packageName, next)
        if (!result.ok) {
          setNotice(result.error || t('plugins.toggleFailed'))
          return
        }
        setNotice(t('plugins.needRestart'))
        await load()
      } catch (cause: unknown) {
        setNotice(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(undefined)
      }
    },
    [load, t],
  )

  const uninstall = useCallback(
    async (plugin: InstalledPlugin) => {
      setBusy(plugin.packageName)
      setNotice(undefined)
      try {
        const result = await marketApi.uninstallPlugin(plugin.packageName)
        if (!result.ok) {
          setNotice(result.error || t('plugins.uninstallFailed'))
          return
        }
        setNotice(t('plugins.uninstalled'))
        await load()
      } catch (cause: unknown) {
        setNotice(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(undefined)
      }
    },
    [load, t],
  )

  const chooseDirectory = useCallback(async () => {
    if (pickDirectory === undefined) {
      setNotice(t('plugins.directoryUnavailable'))
      return
    }
    try {
      const picked = await pickDirectory()
      if (picked === null || picked.length === 0) return
      setDirectory(picked)
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }, [pickDirectory, t])

  const chooseTarball = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onTarballPicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file === undefined) return
      file
        .arrayBuffer()
        .then(buffer => {
          const bytes = new Uint8Array(buffer)
          let binary = ''
          for (const byte of bytes) binary += String.fromCharCode(byte)
          setTarball({ name: file.name, data: btoa(binary) })
        })
        .catch((cause: unknown) => {
          setNotice(cause instanceof Error ? cause.message : String(cause))
        })
    },
    [],
  )

  const installManual = useCallback(async () => {
    setManualBusy(true)
    setNotice(undefined)
    try {
      let result
      if (sourceTab === SOURCE_DIRECTORY) {
        if (directory.trim().length === 0) {
          setNotice(t('plugins.manualInvalid'))
          return
        }
        result = await marketApi.installPluginFromSource(directory.trim())
      } else if (sourceTab === SOURCE_NPM) {
        const name = packageName.trim()
        if (name.length === 0) {
          setNotice(t('plugins.manualInvalid'))
          return
        }
        const version = packageVersion.trim()
        result = await marketApi.installPluginFromSource(
          version.length > 0 ? `${name}@${version}` : name,
        )
      } else {
        if (tarball === undefined) {
          setNotice(t('plugins.manualInvalid'))
          return
        }
        result = await marketApi.installPluginFromTarball(tarball.name, tarball.data)
      }
      if (!result.ok) {
        setNotice(result.message || t('plugins.installFailed'))
        return
      }
      setNotice(t('plugins.needRestart'))
      setDirectory('')
      setPackageName('')
      setPackageVersion('')
      setTarball(undefined)
      await load()
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setManualBusy(false)
    }
  }, [directory, load, packageName, packageVersion, sourceTab, t, tarball])

  const tabs = useMemo(
    () => [
      { value: MARKET, label: t('plugins.tab.market') },
      { value: INSTALLED, label: t('plugins.tab.installed'), count: installed.length },
      { value: MANUAL, label: t('plugins.tab.manual') },
    ],
    [t, installed.length],
  )

  const sourceTabs = useMemo(
    () => [
      { value: SOURCE_DIRECTORY, label: t('plugins.source.directory') },
      { value: SOURCE_NPM, label: t('plugins.source.npm') },
      { value: SOURCE_TARBALL, label: t('plugins.source.tarball') },
    ],
    [t],
  )

  return (
    <MarketPage title={t('plugins.title')} icon={<IconPluginPinwheelOutlineRegular size={18} />}>
      <div className="dsm-panel" data-dsm-panel="plugins">
        <MarketTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          label={t('plugins.title')}
          panelId="dsm-plugins-panel"
        />

        {tab === MARKET ? (
          <div className="dsm-toolbar">
            <KeywordFilter
              value={keyword}
              onChange={setKeyword}
              t={t}
              placeholder={t('common.search')}
            />
          </div>
        ) : null}

        {tab === MARKET ? (
          <CategoryRail
            categories={categories}
            selected={category}
            onSelect={setCategory}
            t={t}
          />
        ) : null}

        {tab === MANUAL ? (
          <div className="dsm-manual">
            <MarketTabs
              tabs={sourceTabs}
              value={sourceTab}
              onChange={setSourceTab}
              label={t('plugins.manualTitle')}
              panelId="dsm-plugins-source-panel"
              className="dsm-sourceTabs"
            />

            {sourceTab === SOURCE_DIRECTORY ? (
              <div className="dsm-sourceCard">
                <span className="dsm-sourceIcon" aria-hidden="true">
                  <IconFolderOpenOutlineRegular size={20} />
                </span>
                <div className="dsm-sourceMain">
                  <p className="dsm-sourceTitle">{t('plugins.source.directoryTitle')}</p>
                  <p className="dsm-sourceValue">
                    {directory.length > 0 ? directory : t('plugins.source.notSelected')}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void chooseDirectory()}>
                  {t('plugins.source.choose')}
                </Button>
              </div>
            ) : null}

            {sourceTab === SOURCE_NPM ? (
              <div className="dsm-sourceCard">
                <span className="dsm-sourceIcon" aria-hidden="true">
                  <IconCordisPluginOutlineRegular size={20} />
                </span>
                <div className="dsm-sourceMain">
                  <p className="dsm-sourceTitle">{t('plugins.source.npmTitle')}</p>
                  <div className="dsm-sourceFields">
                    <KeywordFilter
                      value={packageName}
                      onChange={setPackageName}
                      t={t}
                      placeholder={t('plugins.source.npmName')}
                      className="dsm-sourceInput"
                    />
                    <KeywordFilter
                      value={packageVersion}
                      onChange={setPackageVersion}
                      t={t}
                      placeholder={t('plugins.source.npmVersion')}
                      className="dsm-sourceInput"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {sourceTab === SOURCE_TARBALL ? (
              <div className="dsm-sourceCard">
                <span className="dsm-sourceIcon" aria-hidden="true">
                  <IconFolderOpenOutlineRegular size={20} />
                </span>
                <div className="dsm-sourceMain">
                  <p className="dsm-sourceTitle">{t('plugins.source.tarballTitle')}</p>
                  <p className="dsm-sourceValue">
                    {tarball !== undefined ? tarball.name : t('plugins.source.notSelected')}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={chooseTarball}>
                  {t('plugins.source.choose')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tgz,application/gzip"
                  className="dsm-fileInput"
                  onChange={onTarballPicked}
                />
              </div>
            ) : null}

            <div className="dsm-manualFooter">
              <Button
                variant="primary"
                disabled={manualBusy}
                onClick={() => void installManual()}
              >
                {manualBusy ? t('common.installing') : t('plugins.manualInstall')}
              </Button>
            </div>
          </div>
        ) : null}

        {notice !== undefined ? (
          <p className="dsm-notice">
            <IconWarningTriangleOutlineRegular size={14} aria-hidden="true" />
            {notice}
          </p>
        ) : null}

        {status === 'error' ? (
          <div className="dsm-toolbar">
            <p className="dsm-error">{error ?? t('common.failed')}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : null}

        {status === 'loading' ? <p className="dsm-empty">{t('common.loading')}</p> : null}

        {status === 'ready' && tab === MARKET && plugins.length === 0 ? (
          <p className="dsm-empty">{t('common.empty')}</p>
        ) : null}

        {status === 'ready' && tab === INSTALLED && installed.length === 0 ? (
          <p className="dsm-empty">{t('common.empty')}</p>
        ) : null}

        {status === 'ready' && tab === MARKET && plugins.length > 0 ? (
          <ul className="dsm-list" data-dsm-list="plugins">
            {plugins.map(plugin => (
              <EntryCard
                key={plugin.id}
                title={
                  plugin.nameCn.length > 0
                    ? `${plugin.nameCn}（${plugin.name}）`
                    : plugin.name
                }
                description={plugin.description}
                author={plugin.author}
                version={plugin.version}
                tags={plugin.tags}
                installed={installedNames.has(plugin.name)}
                busy={busy === plugin.name}
                icon={<IconPluginPinwheelOutlineRegular size={18} />}
                onInstall={() => void install(plugin)}
                t={t}
              />
            ))}
          </ul>
        ) : null}

        {status === 'ready' && tab === INSTALLED && installed.length > 0 ? (
          <ul className="dsm-installedGrid" data-dsm-list="installed-plugins">
            {installed.map(plugin => (
              <InstalledPluginCard
                key={plugin.packageName}
                plugin={plugin}
                busy={busy === plugin.packageName}
                onToggle={next => void togglePlugin(plugin, next)}
                onRefresh={() => void load()}
                onUninstall={() => void uninstall(plugin)}
                t={t}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </MarketPage>
  )
}
