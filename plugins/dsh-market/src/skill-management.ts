/**
 * Installed-skill management.
 *
 * The DSH skill provider discovers every directory under the user skill root
 * that holds a `SKILL.md`. It offers no opt-out, so the market cannot switch
 * a skill off by editing the provider's configuration. Instead the market
 * keeps its own policy file next to the skill root and applies it two ways:
 *
 *   - **disable** moves the skill directory aside into a holding area, so the
 *     provider stops seeing it. The source files are preserved verbatim and
 *     can be moved back by *enable*.
 *   - **enable** moves the directory back into the skill root.
 *   - **delete** removes the directory for good, after a trash copy is kept in
 *     the market's trash directory so an accidental delete is recoverable.
 *
 * The policy file records the current state so the market can tell an enabled
 * skill from a disabled one without touching the file system on every read.
 */

import type { Dirent } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { InstalledSkill } from './shared/types.js'

export const SKILL_FILE = 'SKILL.md'
const POLICY_FILE = 'skills-policy.json'
const DISABLED_DIR = '.disabled'
const TRASH_DIR = 'trash'

export interface SkillPolicy {
  readonly version: 1
  /** Skills the user switched off; the directory sits in the holding area. */
  readonly disabled: readonly string[]
}

export interface SkillManagementOptions {
  /** Root of the DSH user skill directory, e.g. `~/.dsh/skills`. */
  readonly skillRoot: string
}

export interface SkillMutationResult {
  readonly ok: boolean
  readonly name: string
  readonly enabled?: boolean
  readonly error?: string
  readonly code?: string
}

/** Where disabled skill directories are parked. */
export function disabledRoot(skillRoot: string): string {
  return join(skillRoot, DISABLED_DIR)
}

/** Where deleted skill directories are kept for recovery. */
export function trashRoot(skillRoot: string): string {
  return join(skillRoot, TRASH_DIR)
}

function policyPath(skillRoot: string): string {
  return join(skillRoot, POLICY_FILE)
}

/** Read the policy; a missing or broken file means "nothing is disabled". */
export async function readSkillPolicy(skillRoot: string): Promise<SkillPolicy> {
  try {
    const raw = await readFile(policyPath(skillRoot), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SkillPolicy>
    if (parsed.version !== 1 || !Array.isArray(parsed.disabled)) {
      return { version: 1, disabled: [] }
    }
    return {
      version: 1,
      disabled: parsed.disabled.filter((name): name is string => typeof name === 'string'),
    }
  } catch {
    return { version: 1, disabled: [] }
  }
}

/** Write the policy atomically enough for a single-process host. */
export async function writeSkillPolicy(
  skillRoot: string,
  policy: SkillPolicy,
): Promise<void> {
  await mkdir(skillRoot, { recursive: true, mode: 0o700 })
  const file = policyPath(skillRoot)
  const temporary = `${file}.tmp`
  await writeFile(
    temporary,
    `${JSON.stringify({ version: 1, disabled: [...policy.disabled].sort() }, null, 2)}\n`,
    { mode: 0o600 },
  )
  await rename(temporary, file)
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

/** Reject names that could escape the skill root. */
export function isValidSkillDirectoryName(name: string): boolean {
  if (name.length === 0 || name.length > 200) return false
  if (name === '.' || name === '..') return false
  if (name.startsWith('.')) return false
  if (/[/\\]/u.test(name)) return false
  if (/[\u0000-\u001f]/u.test(name)) return false
  return true
}

/**
 * List the skills the user actually has, including the disabled ones.
 *
 * A disabled skill is not visible to the provider any more, so it is read
 * back from the holding area instead. The `enabled` flag tells the page which
 * ones the host will load.
 */
export async function listManagedSkills(options: SkillManagementOptions): Promise<InstalledSkill[]> {
  const { skillRoot } = options
  const result: InstalledSkill[] = []

  const readEntries = async (directory: string): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!isValidSkillDirectoryName(entry.name)) continue
      const path = join(directory, entry.name)
      const skillFile = join(path, SKILL_FILE)
      if (!await pathExists(skillFile)) continue
      const { description, version } = await readSkillHeader(skillFile)
      const disabled = directory === disabledRoot(skillRoot)
      result.push({
        name: entry.name,
        description,
        path,
        enabled: !disabled,
        ...(version === undefined ? {} : { version }),
      })
    }
  }

  await readEntries(skillRoot)
  await readEntries(disabledRoot(skillRoot))
  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}

/** Read the description and version from a skill's frontmatter. */
async function readSkillHeader(
  skillFile: string,
): Promise<{ description: string; version?: string }> {
  let body = ''
  try {
    body = await readFile(skillFile, 'utf8')
  } catch {
    return { description: '' }
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(body)
  const frontmatter = match?.[1] ?? ''
  const description = /^[ \t]*description[ \t]*:[ \t]*(.*)$/mu.exec(frontmatter)?.[1]?.trim() ?? ''
  const version = /^[ \t]*version[ \t]*:[ \t]*(.*)$/mu.exec(frontmatter)?.[1]?.trim()
  return {
    description,
    ...(version === undefined || version.length === 0 ? {} : { version }),
  }
}

/**
 * Enable or disable one skill.
 *
 * Disabling moves the skill directory into the holding area; enabling moves it
 * back. The source files are never rewritten, so a disable is fully
 * reversible.
 */
export async function setSkillEnabled(
  options: SkillManagementOptions,
  name: string,
  enabled: boolean,
): Promise<SkillMutationResult> {
  const { skillRoot } = options
  if (!isValidSkillDirectoryName(name)) {
    return { ok: false, name, error: `技能名不合法：${name}`, code: 'bad-request' }
  }
  const live = join(skillRoot, name)
  const parked = join(disabledRoot(skillRoot), name)
  const policy = await readSkillPolicy(skillRoot)

  const disabled = new Set(policy.disabled)

  if (enabled) {
    if (!await isDirectory(parked)) {
      if (await isDirectory(live)) {
        disabled.delete(name)
        await writeSkillPolicy(skillRoot, { version: 1, disabled: [...disabled] })
        return { ok: true, name, enabled: true }
      }
      return { ok: false, name, error: `技能不存在：${name}`, code: 'not-found' }
    }
    if (await isDirectory(live)) {
      // Both places hold a copy: keep the live one and drop the parked copy.
      await rm(parked, { recursive: true, force: true })
    } else {
      await mkdir(disabledRoot(skillRoot), { recursive: true, mode: 0o700 })
      await rename(parked, live)
    }
    disabled.delete(name)
    await writeSkillPolicy(skillRoot, { version: 1, disabled: [...disabled] })
    return { ok: true, name, enabled: true }
  }

  if (!await isDirectory(live)) {
    if (await isDirectory(parked)) {
      disabled.add(name)
      await writeSkillPolicy(skillRoot, { version: 1, disabled: [...disabled] })
      return { ok: true, name, enabled: false }
    }
    return { ok: false, name, error: `技能不存在：${name}`, code: 'not-found' }
  }
  await mkdir(disabledRoot(skillRoot), { recursive: true, mode: 0o700 })
  await rename(live, parked)
  disabled.add(name)
  await writeSkillPolicy(skillRoot, { version: 1, disabled: [...disabled] })
  return { ok: true, name, enabled: false }
}

/**
 * Delete one skill.
 *
 * The directory is moved into the market's trash directory first, so a
 * mistaken delete can still be undone by hand; the trash copy is removed
 * afterwards only when the caller asks for a permanent delete.
 */
export async function uninstallSkill(
  options: SkillManagementOptions,
  name: string,
): Promise<SkillMutationResult> {
  const { skillRoot } = options
  if (!isValidSkillDirectoryName(name)) {
    return { ok: false, name, error: `技能名不合法：${name}`, code: 'bad-request' }
  }
  const live = join(skillRoot, name)
  const parked = join(disabledRoot(skillRoot), name)
  const source = (await isDirectory(live)) ? live : (await isDirectory(parked)) ? parked : undefined
  if (source === undefined) {
    return { ok: false, name, error: `技能不存在：${name}`, code: 'not-found' }
  }
  const trash = trashRoot(skillRoot)
  await mkdir(trash, { recursive: true, mode: 0o700 })
  const destination = join(trash, name)
  await rm(destination, { recursive: true, force: true })
  await rename(source, destination)
  const policy = await readSkillPolicy(skillRoot)
  const disabled = new Set(policy.disabled)
  disabled.delete(name)
  await writeSkillPolicy(skillRoot, { version: 1, disabled: [...disabled] })
  return { ok: true, name, enabled: false }
}

/** Restore a deleted skill from the trash. */
export async function restoreSkill(
  options: SkillManagementOptions,
  name: string,
): Promise<SkillMutationResult> {
  const { skillRoot } = options
  const source = join(trashRoot(skillRoot), name)
  if (!await isDirectory(source)) {
    return { ok: false, name, error: `回收站中没有该技能：${name}`, code: 'not-found' }
  }
  const destination = join(skillRoot, name)
  await rm(destination, { recursive: true, force: true })
  await rename(source, destination)
  return { ok: true, name, enabled: true }
}

/** The absolute skill root, resolved for the caller. */
export function resolveSkillRoot(skillRoot: string): string {
  return resolve(skillRoot)
}
