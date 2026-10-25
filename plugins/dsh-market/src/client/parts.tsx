/**
 * Shared building blocks for the two market pages.
 *
 * Both pages render inside the same shell: a title row, a segmented tab
 * strip, a toolbar (search + category rail) and a card list. Keeping the
 * shell in one place makes the skill page and the plugin page behave
 * identically.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  IconCordisPluginOutlineRegular,
  IconRefreshOutlineRegular,
  IconSkillOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  Pill,
  SegmentedTabs,
  Switch,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InstalledPlugin, InstalledSkill, MarketCategory } from '../shared/types.js'

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface CategoryRailProps {
  readonly categories: readonly MarketCategory[]
  readonly selected: string | undefined
  readonly onSelect: (value: string | undefined) => void
  readonly t: Translate
}

export function CategoryRail(props: CategoryRailProps): JSX.Element {
  const { categories, selected, onSelect, t } = props
  return (
    <div className="dsm-categories">
      <Pill active={selected === undefined} onClick={() => onSelect(undefined)}>
        {t('common.all')}
      </Pill>
      {categories.map(category => (
        <Pill
          key={category.id}
          active={selected === category.name}
          // The market backend filters by category *name*, not by its numeric
          // id — sending the id yields an empty list.
          onClick={() => onSelect(category.name)}
        >
          {category.name}
        </Pill>
      ))}
    </div>
  )
}

export interface KeywordFilterProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly t: Translate
  readonly placeholder?: string
  readonly className?: string
}

export function KeywordFilter(props: KeywordFilterProps): JSX.Element {
  const { value, onChange, t, placeholder, className } = props
  return (
    <Input
      value={value}
      placeholder={placeholder ?? t('common.search')}
      onChange={(event: { target: { value: string } }) => onChange(event.target.value)}
      className={className ?? 'dsm-search'}
    />
  )
}

export interface EntryCardProps {
  readonly title: string
  readonly description: string
  readonly author: string
  readonly version: string
  readonly tags: readonly string[]
  readonly installed: boolean
  readonly busy: boolean
  readonly icon: JSX.Element
  readonly onInstall: () => void
  readonly t: Translate
}

export function EntryCard(props: EntryCardProps): JSX.Element {
  const { title, description, author, version, tags, installed, busy, icon, onInstall, t } = props
  return (
    <li className="dsm-card" data-dsm-entry={title}>
      <span className="dsm-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="dsm-cardMain">
        <p className="dsm-cardTitle">{title}</p>
        {description.length > 0 ? <p className="dsm-cardDesc">{description}</p> : null}
        <div className="dsm-cardMeta">
          {author.length > 0 ? <span>{author}</span> : null}
          {version.length > 0 ? <span>· v{version}</span> : null}
          {tags.slice(0, 3).map(tag => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      </div>
      <div className="dsm-cardEnd">
        {installed ? (
          <Tag tone="outline">{t('common.installed')}</Tag>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={onInstall}
          >
            {busy ? t('common.installing') : t('common.install')}
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * One installed plugin, rendered as a card with an enable switch, a refresh
 * button and an uninstall button.
 */
export interface InstalledPluginCardProps {
  readonly plugin: InstalledPlugin
  readonly busy: boolean
  readonly onToggle: (next: boolean) => void
  readonly onRefresh: () => void
  readonly onUninstall: () => void
  readonly t: Translate
}

export function InstalledPluginCard(props: InstalledPluginCardProps): JSX.Element {
  const { plugin, busy, onToggle, onRefresh, onUninstall, t } = props
  return (
    <li className="dsm-installedCard" data-dsm-installed={plugin.packageName}>
      <div className="dsm-installedHead">
        <span className="dsm-installedIcon" aria-hidden="true">
          <IconCordisPluginOutlineRegular size={18} />
        </span>
        <div className="dsm-installedTitle">
          <p className="dsm-installedName">{plugin.packageName}</p>
          <div className="dsm-installedMeta">
            {plugin.version.length > 0 ? <span className="dsm-installedVersion">{plugin.version}</span> : null}
            {plugin.enabled ? (
              <Tag tone="success">{t('plugins.enabled')}</Tag>
            ) : (
              <Tag tone="outline">{t('plugins.disabled')}</Tag>
            )}
          </div>
        </div>
        <div className="dsm-installedActions">
          <Switch
            checked={plugin.enabled}
            disabled={busy}
            onChange={onToggle}
            label={t('plugins.toggleLabel')}
            title={t('plugins.toggleTitle')}
          />
          <button
            type="button"
            className="dsm-iconButton"
            disabled={busy}
            onClick={onRefresh}
            title={t('plugins.refresh')}
            aria-label={t('plugins.refresh')}
          >
            <IconRefreshOutlineRegular size={16} />
          </button>
          <button
            type="button"
            className="dsm-iconButton dsm-iconButtonDanger"
            disabled={busy}
            onClick={onUninstall}
            title={t('plugins.uninstall')}
            aria-label={t('plugins.uninstall')}
          >
            <IconTrashOutlineRegular size={16} />
          </button>
        </div>
      </div>
    </li>
  )
}

/**
 * One installed skill, rendered as a card with an enable switch and a delete
 * button. A switched-off skill is parked outside the skill root, so it stays
 * visible here but the host stops loading it.
 */
export interface InstalledSkillCardProps {
  readonly skill: InstalledSkill
  readonly busy: boolean
  readonly onToggle: (next: boolean) => void
  readonly onUninstall: () => void
  readonly t: Translate
}

export function InstalledSkillCard(props: InstalledSkillCardProps): JSX.Element {
  const { skill, busy, onToggle, onUninstall, t } = props
  return (
    <li className="dsm-installedCard" data-dsm-installed={skill.name}>
      <div className="dsm-installedHead">
        <span className="dsm-installedIcon" aria-hidden="true">
          <IconSkillOutlineRegular size={18} />
        </span>
        <div className="dsm-installedTitle">
          <p className="dsm-installedName">{skill.name}</p>
          <div className="dsm-installedMeta">
            {skill.version !== undefined && skill.version.length > 0 ? (
              <span className="dsm-installedVersion">v{skill.version}</span>
            ) : null}
            {skill.enabled ? (
              <Tag tone="success">{t('skills.enabled')}</Tag>
            ) : (
              <Tag tone="outline">{t('skills.disabled')}</Tag>
            )}
          </div>
          {skill.description.length > 0 ? (
            <p className="dsm-installedDesc">{skill.description}</p>
          ) : null}
        </div>
        <div className="dsm-installedActions">
          <Switch
            checked={skill.enabled}
            disabled={busy}
            onChange={onToggle}
            label={t('skills.toggleLabel')}
            title={t('skills.toggleTitle')}
          />
          <button
            type="button"
            className="dsm-iconButton dsm-iconButtonDanger"
            disabled={busy}
            onClick={onUninstall}
            title={t('skills.uninstall')}
            aria-label={t('skills.uninstall')}
          >
            <IconTrashOutlineRegular size={16} />
          </button>
        </div>
      </div>
    </li>
  )
}

/** One tab in a market page. */
export interface MarketTab {
  readonly value: string
  readonly label: string
  readonly count?: number
}

/**
 * Render the tab strip. Each tab needs a unique DOM id and a panel id so the
 * segmented control stays accessible.
 */
export function MarketTabs(props: {
  readonly tabs: readonly MarketTab[]
  readonly value: string
  readonly onChange: (value: string) => void
  readonly label: string
  readonly panelId: string
  readonly className?: string
}): JSX.Element {
  const { tabs, value, onChange, label, panelId, className } = props
  const items = useMemo(() => {
    const mapped = tabs.map(tab => ({
      value: tab.value,
      id: `dsm-tab-${tab.value}`,
      panelId,
      label: tab.count === undefined ? tab.label : `${tab.label} (${tab.count})`,
    }))
    // The host's tab strip requires a non-empty tuple; the page always has
    // at least one tab, so the cast is safe.
    return mapped as unknown as readonly [
      { value: string; id: string; panelId: string; label: string },
      ...{ value: string; id: string; panelId: string; label: string }[],
    ]
  }, [tabs, panelId])
  return (
    <SegmentedTabs
      items={items}
      value={value}
      onChange={onChange}
      label={label}
      className={className ?? 'dsm-tabs'}
    />
  )
}

/** The page shell shared by both market pages. */
export function MarketPage(props: {
  readonly title: string
  readonly icon: JSX.Element
  readonly children: React.ReactNode
}): JSX.Element {
  const { title, icon, children } = props
  return (
    <div className="dsm-page">
      <header className="dsm-pageHead">
        <span className="dsm-pageIcon" aria-hidden="true">
          {icon}
        </span>
        <h1 className="dsm-pageTitle">{title}</h1>
      </header>
      {children}
    </div>
  )
}

export interface PageState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | undefined
  readonly reload: () => void
}

export interface UseMarketPageOptions {
  readonly load: () => Promise<void>
}

/** Drive the shared page lifecycle: load on mount, expose a reload action. */
export function useMarketPage(options: UseMarketPageOptions): PageState {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => {
    setTick(value => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(undefined)
    options
      .load()
      .then(() => {
        if (!cancelled) setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
    // The tick drives a manual reload; the load callback identity is stable per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, options.load])

  return useMemo(() => ({ status, error, reload }), [status, error, reload])
}
