/**
 * The skill market page.
 *
 * Lists the skills the market backend publishes, and installs one into the
 * DSH user skill directory. The Host performs the download, the audit and the
 * extraction; this page only renders state and forwards the click.
 *
 * The page is a regular main-slot panel: the sidebar icon selects it and the
 * content fills the page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  IconSkillOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { marketApi } from './api.js'
import {
  CategoryRail,
  EntryCard,
  InstalledSkillCard,
  KeywordFilter,
  MarketPage,
  MarketTabs,
} from './parts.jsx'
import type {
  InstalledSkill,
  MarketCategory,
  MarketSkill,
  SkippedEntry,
} from '../shared/types.js'

export interface SkillsPanelProps {
  readonly t: (key: string, params?: Record<string, string | number>) => string
}

const FEATURED = 'featured'
const INSTALLED = 'installed'

export function SkillsPanel(props: SkillsPanelProps): JSX.Element {
  const { t } = props
  const [tab, setTab] = useState<string>(FEATURED)
  const [categories, setCategories] = useState<readonly MarketCategory[]>([])
  const [skills, setSkills] = useState<readonly MarketSkill[]>([])
  const [installed, setInstalled] = useState<readonly InstalledSkill[]>([])
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [skipped, setSkipped] = useState<readonly SkippedEntry[]>([])

  const load = useCallback(async () => {
    setStatus('loading')
    setError(undefined)
    try {
      const [nextCategories, nextSkills, nextInstalled] = await Promise.all([
        marketApi.listSkillCategories(),
        marketApi.listSkills({
          page: 1,
          pageSize: 200,
          category,
          keyword: keyword.length > 0 ? keyword : undefined,
        }),
        marketApi.listInstalledSkills(),
      ])
      setCategories(nextCategories)
      setSkills(nextSkills.items)
      setSkipped(nextSkills.skipped ?? [])
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

  const installedNames = useMemo(
    () => new Set(installed.map(skill => skill.name)),
    [installed],
  )

  const install = useCallback(
    async (skill: MarketSkill) => {
      setBusy(skill.name)
      setNotice(undefined)
      try {
        const result = await marketApi.installSkill(skill)
        if (!result.ok) {
          setNotice(result.message || t('skills.installFailed'))
          return
        }
        setNotice(t('common.installed'))
        await load()
      } catch (cause: unknown) {
        setNotice(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(undefined)
      }
    },
    [load, t],
  )

  const tabs = useMemo(
    () => [
      { value: FEATURED, label: t('skills.tab.featured') },
      { value: INSTALLED, label: t('skills.tab.installed'), count: installed.length },
    ],
    [t, installed.length],
  )

  /**
   * Switch one installed skill on or off.
   *
   * The host only re-reads the skill root on start, so the page says so
   * instead of pretending the change is already live.
   */
  const toggle = useCallback(
    async (skill: InstalledSkill, next: boolean) => {
      setBusy(skill.name)
      setNotice(undefined)
      try {
        const result = await marketApi.setSkillEnabled(skill.name, next)
        if (!result.ok) {
          setNotice(result.error ?? t('skills.toggleFailed'))
          return
        }
        setNotice(t('skills.needRestart'))
        await load()
      } catch (cause: unknown) {
        setNotice(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(undefined)
      }
    },
    [load, t],
  )

  /** Delete one installed skill. */
  const uninstall = useCallback(
    async (skill: InstalledSkill) => {
      setBusy(skill.name)
      setNotice(undefined)
      try {
        const result = await marketApi.uninstallSkill(skill.name)
        if (!result.ok) {
          setNotice(result.error ?? t('skills.uninstallFailed'))
          return
        }
        setNotice(t('skills.uninstalled'))
        await load()
      } catch (cause: unknown) {
        setNotice(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(undefined)
      }
    },
    [load, t],
  )

  const visible = tab === INSTALLED ? installed : skills

  return (
    <MarketPage title={t('skills.title')} icon={<IconSkillOutlineRegular size={18} />}>
      <div className="dsm-panel" data-dsm-panel="skills">
        <MarketTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          label={t('skills.title')}
          panelId="dsm-skills-panel"
        />

        {tab === FEATURED ? (
          <div className="dsm-toolbar">
            <KeywordFilter value={keyword} onChange={setKeyword} t={t} />
          </div>
        ) : null}

        {tab === FEATURED ? (
          <CategoryRail
            categories={categories}
            selected={category}
            onSelect={setCategory}
            t={t}
          />
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

        {status === 'ready' && visible.length === 0 ? (
          <p className="dsm-empty">{t('common.empty')}</p>
        ) : null}

        {status === 'ready' && tab === FEATURED && skipped.length > 0 ? (
          <p className="dsm-notice" data-dsm-notice="skipped">
            <IconWarningTriangleOutlineRegular size={14} aria-hidden="true" />
            {t('skills.skipped', {
              count: skipped.length,
              names: skipped.map(entry => entry.name).join('、'),
            })}
          </p>
        ) : null}

        {status === 'ready' && visible.length > 0 ? (
          <ul className="dsm-list" data-dsm-list="skills">
            {tab === INSTALLED
              ? installed.map(skill => (
                  <InstalledSkillCard
                    key={skill.name}
                    skill={skill}
                    busy={busy === skill.name}
                    onToggle={next => void toggle(skill, next)}
                    onUninstall={() => void uninstall(skill)}
                    t={t}
                  />
                ))
              : skills.map(skill => (
                  <EntryCard
                    key={skill.id}
                    title={
                      skill.nameCn.length > 0
                        ? `${skill.nameCn}（${skill.name}）`
                        : skill.name
                    }
                    description={skill.description}
                    author={skill.author}
                    version={skill.version}
                    tags={skill.tags}
                    installed={installedNames.has(skill.name)}
                    busy={busy === skill.name}
                    icon={<IconSkillOutlineRegular size={18} />}
                    onInstall={() => void install(skill)}
                    t={t}
                  />
                ))}
          </ul>
        ) : null}
      </div>
    </MarketPage>
  )
}
