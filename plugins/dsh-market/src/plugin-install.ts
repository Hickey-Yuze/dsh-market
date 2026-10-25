/**
 * Plugin installation.
 *
 * A marketplace plugin is a zip holding an npm package. Installing it means
 * repacking the extracted package as a standard npm tarball and handing the
 * local file to pnpm, so the plugin lands in the active DSH profile exactly
 * like a registry dependency.
 *
 * The pnpm call goes through the host's `desktopPnpm` service when it is
 * available (that is the path that knows the active profile and the bundled
 * pnpm binary). Without it there is nothing safe to do, because a bare
 * `pnpm add` in the wrong directory would corrupt an unrelated project.
 */

import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ArchiveError,
  createNpmArchive,
  downloadArchive,
  extractZip,
  readPackageManifest,
  resolvePackageRoot,
} from './archive.js'
import type { InstallResult, InstalledPlugin, MarketPlugin } from './shared/types.js'

/** Minimal contract of the host pnpm service we depend on. */
export interface PnpmRunner {
  runPlugin(
    argv: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): {
    stdout: NodeJS.ReadableStream
    stderr: NodeJS.ReadableStream
    done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>
    cancel(): void
  }
}

export interface PluginInstallOptions {
  readonly entry: MarketPlugin
  /** Directory the plugin is installed into (the active DSH profile). */
  readonly profileDir: string
  readonly pnpm: PnpmRunner
  readonly registry?: string
  readonly timeoutMs?: number
}

export interface PluginInstallOutcome {
  readonly result: InstallResult
  readonly warnings: readonly string[]
}

/**
 * Install a plugin from a user-supplied source.
 *
 * Two shapes are accepted: an npm package specifier (`name`, `name@version`)
 * and a local directory holding a package. The npm path is handed to pnpm
 * directly; the local path is packed into a tarball first so pnpm sees the
 * same `file:` dependency the marketplace path produces.
 */
export async function installPluginFromSource(options: {
  readonly source: string
  readonly profileDir: string
  readonly pnpm: PnpmRunner
  readonly registry?: string
  readonly timeoutMs?: number
}): Promise<PluginInstallOutcome> {
  const { source, profileDir, pnpm } = options
  const trimmed = source.trim()
  if (trimmed.length === 0) {
    return {
      result: { ok: false, target: '', kind: 'plugin', code: 'invalid-source', message: '插件来源不能为空' },
      warnings: [],
    }
  }

  const warnings: string[] = []
  const isLocalPath = isLocalPathSpecifier(trimmed)
  const packed = isLocalPath
    ? await packLocalPackage(trimmed, profileDir, warnings)
    : undefined
  if (isLocalPath && packed === undefined) {
    return {
      result: {
        ok: false,
        target: trimmed,
        kind: 'plugin',
        code: 'invalid-source',
        message: '无法读取该本地目录中的 package.json',
      },
      warnings,
    }
  }
  const specifier = packed === undefined ? trimmed : packed.specifier
  const packageName = packed === undefined ? trimmed : packed.packageName
  const args = ['add', specifier, '--reporter=ndjson']
  if (options.registry !== undefined) args.push('--registry', options.registry)
  const handle = pnpm.runPlugin(args, profileDir)
  const timeoutMs = options.timeoutMs ?? 5 * 60_000
  const timer = setTimeout(() => handle.cancel(), timeoutMs)
  let stdout = ''
  let stderr = ''
  handle.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
  handle.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  let outcome: { exitCode: number | null; signal: NodeJS.Signals | null }
  try {
    outcome = await handle.done
  } finally {
    clearTimeout(timer)
  }
  if (outcome.exitCode !== 0) {
    const detail = describePnpmFailure(stdout, stderr) || `pnpm 退出码 ${outcome.exitCode ?? 'null'}`
    return {
      result: { ok: false, target: packageName, kind: 'plugin', code: 'install-failed', message: detail },
      warnings,
    }
  }
  const registered = await registerProfileBundle(profileDir, packageName)
  if (!registered) {
    warnings.push('插件已安装，但未能写入 profile 的 dsh.profile.bundles，可能需要手动在插件管理中启用')
  }
  return {
    result: { ok: true, target: packageName, kind: 'plugin', warnings: [...warnings] },
    warnings,
  }
}

interface PackedSpecifier {
  readonly specifier: string
  readonly packageName: string
}

/**
 * Tell a local path apart from an npm package specifier.
 *
 * A Windows path reaches the market as `C:\dir\pkg` or `C:/dir/pkg`, so the
 * drive letter has to count as a path, otherwise the directory would be
 * handed to the registry as a package name.
 */
export function isLocalPathSpecifier(source: string): boolean {
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) return true
  return /^[A-Za-z]:[\\/]/u.test(source)
}

/** Pack a local package directory into a tarball inside the profile. */
async function packLocalPackage(
  source: string,
  profileDir: string,
  warnings: string[],
): Promise<PackedSpecifier | undefined> {
  const directory = source.startsWith('~')
    ? join(homedir(), source.slice(1))
    : resolve(source)
  let manifest: Awaited<ReturnType<typeof readPackageManifest>>
  try {
    manifest = await readPackageManifest(directory)
  } catch {
    return undefined
  }
  if (!manifest.hasDshManifest) {
    warnings.push('该插件没有声明 dsh 配置，安装后可能不会出现在插件管理中')
  }
  const packageDir = join(profileDir, '.dsh-market', 'packages')
  await mkdir(packageDir, { recursive: true })
  const staging = await mkdtemp(join(tmpdir(), 'dsh-market-local-'))
  try {
    const archive = join(staging, 'packed.tgz')
    await createNpmArchive(directory, archive)
    const archivePath = join(packageDir, `${manifest.name}-${manifest.version}.tgz`)
    await copyFile(archive, archivePath)
    return { specifier: `file:${archivePath}`, packageName: manifest.name }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/** Maximum size of an uploaded npm tarball. */
export const MAX_UPLOAD_BYTES = 256 * 1024 * 1024

/**
 * Install a plugin from an npm tarball the browser uploaded.
 *
 * The renderer can only hand over bytes, never a path, so the archive is
 * written into the profile's own package cache and installed from there.
 */
export async function installPluginFromTarball(options: {
  readonly archive: Uint8Array
  readonly fileName: string
  readonly profileDir: string
  readonly pnpm: PnpmRunner
  readonly registry?: string
  readonly timeoutMs?: number
}): Promise<PluginInstallOutcome> {
  const { archive, fileName, profileDir, pnpm } = options
  const warnings: string[] = []
  if (archive.byteLength === 0) {
    return { result: { ok: false, target: '', kind: 'plugin', code: 'empty-archive', message: 'tgz 包为空' }, warnings }
  }
  if (archive.byteLength > MAX_UPLOAD_BYTES) {
    return {
      result: { ok: false, target: '', kind: 'plugin', code: 'archive-too-large', message: `tgz 包超过 ${MAX_UPLOAD_BYTES} 字节上限` },
      warnings,
    }
  }
  const base = fileName.replace(/[^A-Za-z0-9._-]/gu, '-').replace(/\.tgz$/iu, '')
  const packageDir = join(profileDir, '.dsh-market', 'packages')
  await mkdir(packageDir, { recursive: true })
  const archivePath = join(packageDir, `${base === '' ? 'uploaded' : base}.tgz`)
  await writeFile(archivePath, archive)
  const packageName = await readTarballPackageName(archivePath)
  if (packageName === undefined) {
    await rm(archivePath, { force: true })
    return { result: { ok: false, target: '', kind: 'plugin', code: 'bad-archive', message: '无法读取 tgz 内的 package.json' }, warnings }
  }
  const specifier = `file:${archivePath}`
  const args = ['add', specifier, '--reporter=ndjson']
  if (options.registry !== undefined) args.push(`--registry=${options.registry}`)
  const run = pnpm.runPlugin(args, profileDir)
  const stderr: string[] = []
  const stdout: string[] = []
  run.stderr.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString('utf8'))
  })
  run.stdout.on('data', (chunk: Buffer) => {
    stdout.push(chunk.toString('utf8'))
  })
  const done = await run.done
  if (done.exitCode !== 0) {
    return {
      result: {
        ok: false,
        target: packageName,
        kind: 'plugin',
        code: 'install-failed',
        message: describePnpmFailure(stdout.join(''), stderr.join('')),
      },
      warnings,
    }
  }
  const registered = await registerProfileBundle(profileDir, packageName)
  if (!registered) {
    warnings.push('插件已安装，但未能写入 profile 的 dsh.profile.bundles，可能需要手动在插件管理中启用')
  }
  return {
    result: { ok: true, target: packageName, kind: 'plugin', warnings: [...warnings] },
    warnings,
  }
}

/** Read `name` from the `package/package.json` entry of an npm tarball. */
async function readTarballPackageName(archivePath: string): Promise<string | undefined> {
  const tar = require('tar') as typeof import('tar')
  try {
    let name: string | undefined
    await tar.t({
      file: archivePath,
      onReadEntry(entry) {
        if (name !== undefined) return
        if (entry.path !== 'package/package.json') return
        const chunks: Buffer[] = []
        entry.on('data', (chunk: Buffer) => chunks.push(chunk))
        entry.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const value = (parsed as Record<string, unknown>).name
              if (typeof value === 'string' && value.length > 0) name = value
            }
          } catch {
            // A malformed manifest is reported as "no name" by the caller.
          }
        })
      },
    })
    return name
  } catch {
    return undefined
  }
}

/** Read the manifest of a DSH profile and report the installed plugins. */
export async function listInstalledPlugins(profileDir: string): Promise<InstalledPlugin[]> {
  const manifestPath = join(profileDir, 'package.json')
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
  } catch {
    return []
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const record = raw as Record<string, unknown>
  const dependencies = {
    ...(isRecord(record.dependencies) ? record.dependencies : {}),
    ...(isRecord(record.devDependencies) ? record.devDependencies : {}),
  }
  const result: InstalledPlugin[] = []
  for (const [packageName, version] of Object.entries(dependencies)) {
    if (typeof version !== 'string') continue
    if (packageName.startsWith('@deepseek-ai/')) continue
    result.push({
      packageName,
      // A `file:` specifier points at the repacked tarball, not a version
      // number, so the version is read back from the installed manifest.
      version: version.startsWith('file:') ? '' : version.replace(/^[\^~]/u, ''),
      enabled: true,
      builtin: false,
    })
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Install one marketplace plugin into the active profile. */
export async function installPlugin(options: PluginInstallOptions): Promise<PluginInstallOutcome> {
  const { entry, profileDir, pnpm } = options
  const warnings: string[] = []
  const download = await downloadArchive(entry.downloadUrl)
  const staging = await mkdtemp(join(tmpdir(), 'dsh-market-plugin-'))
  try {
    await extractZip(download.path, staging)
    const packageRoot = await resolvePackageRoot(staging)
    const manifest = await readPackageManifest(packageRoot)
    if (manifest.name !== entry.name) {
      throw new ArchiveError('package-name-mismatch', `压缩包内包名（${manifest.name}）与市场名称（${entry.name}）不一致`)
    }
    if (manifest.version !== entry.version) {
      throw new ArchiveError('package-version-mismatch', `压缩包内版本（${manifest.version}）与市场版本（${entry.version}）不一致`)
    }
    if (!manifest.hasDshManifest) {
      warnings.push('该插件没有声明 dsh 配置，安装后可能不会出现在插件管理中')
    }
    const archive = join(staging, 'packed.tgz')
    await createNpmArchive(packageRoot, archive)

    // The repacked tarball has to live inside the profile, not in the system
    // temp directory. pnpm records a `file:` specifier verbatim in the
    // profile manifest, so a temp path would leave a dangling reference the
    // moment the temp directory is cleaned up.
    const packageDir = join(profileDir, '.dsh-market', 'packages')
    await mkdir(packageDir, { recursive: true })
    const archivePath = join(packageDir, `${entry.name}-${entry.version}.tgz`)
    await copyFile(archive, archivePath)

    const args = ['add', `file:${archivePath}`, '--reporter=ndjson']
    if (options.registry !== undefined) {
      args.push('--registry', options.registry)
    }
    const handle = pnpm.runPlugin(args, profileDir)
    const timeoutMs = options.timeoutMs ?? 5 * 60_000
    const timer = setTimeout(() => handle.cancel(), timeoutMs)
    let stdout = ''
    let stderr = ''
    handle.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    handle.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    let outcome: { exitCode: number | null; signal: NodeJS.Signals | null }
    try {
      outcome = await handle.done
    } finally {
      clearTimeout(timer)
    }
    if (outcome.exitCode !== 0) {
      const detail = describePnpmFailure(stdout, stderr) || `pnpm 退出码 ${outcome.exitCode ?? 'null'}`
      return {
        result: {
          ok: false,
          target: entry.name,
          kind: 'plugin',
          code: 'install-failed',
          message: detail,
        },
        warnings,
      }
    }
    // pnpm only writes the dependency. The profile's `dsh.profile.bundles`
    // list is what the loader actually reads, so the new package has to be
    // registered there too or the plugin stays invisible until a manual edit.
    const registered = await registerProfileBundle(profileDir, entry.name)
    if (!registered) {
      warnings.push('插件已安装，但未能写入 profile 的 dsh.profile.bundles，可能需要手动在插件管理中启用')
    }
    return {
      result: { ok: true, target: entry.name, kind: 'plugin', warnings: [...warnings] },
      warnings,
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
    await download.cleanup()
  }
}

/**
 * Add a package to the profile's `dsh.profile.bundles` list.
 *
 * The DSH loader reads that list, not the dependency map, so a plugin that
 * pnpm installed but that is not listed there never loads. The manifest is
 * rewritten atomically to avoid a half-written file if the host dies.
 */
export async function registerProfileBundle(profileDir: string, packageName: string): Promise<boolean> {
  const manifestPath = join(profileDir, 'package.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch {
    return false
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(raw) as unknown
  } catch {
    return false
  }
  if (!isRecord(manifest)) return false

  const dsh = isRecord(manifest.dsh) ? { ...manifest.dsh } : {}
  const profile = isRecord(dsh.profile) ? { ...dsh.profile } : {}
  const bundles = Array.isArray(profile.bundles)
    ? profile.bundles.filter((item): item is string => typeof item === 'string')
    : []
  if (!bundles.includes(packageName)) bundles.push(packageName)
  profile.bundles = bundles
  dsh.profile = profile
  const next: Record<string, unknown> = { ...manifest, dsh }

  const temporary = `${manifestPath}.qwm-tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, manifestPath)
  } catch {
    await rm(temporary, { force: true })
    return false
  }
  return true
}

/** Write a small receipt so the UI can tell a fresh install from a repeat. */
export async function writeInstallReceipt(
  receiptPath: string,
  receipt: { name: string; version: string; kind: 'skill' | 'plugin'; installedAt: string },
): Promise<void> {
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 })
}

/**
 * pnpm's ndjson reporter writes one JSON object per line. Failures are
 * reported as a record with `level: "error"` and a `code` plus a `hint`; some
 * pnpm versions instead nest the message under `error`. The raw stream is far
 * too noisy to hand to the UI as-is, so the most specific message is picked
 * out and the rest of the noise is dropped.
 */
export function describePnpmFailure(stdout: string, stderr: string): string {
  const reasons: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed) as unknown
    } catch {
      continue
    }
    if (parsed === null || typeof parsed !== 'object') continue
    const record = parsed as Record<string, unknown>

    const error = record.error
    if (error !== null && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string' && message.length > 0) reasons.push(message)
      continue
    }
    if (record.level !== 'error') continue
    const code = typeof record.code === 'string' ? record.code : undefined
    const hint = typeof record.hint === 'string' ? record.hint : undefined
    const text = [code, hint].filter((part): part is string => part !== undefined && part.length > 0).join(': ')
    if (text.length > 0) reasons.push(text)
  }
  if (reasons.length > 0) return reasons[reasons.length - 1]!.slice(0, 1_000)
  const stderrTail = stderr.trim().split('\n').slice(-5).join('\n')
  if (stderrTail.length > 0) return stderrTail.slice(0, 1_000)
  const stdoutTail = stdout.trim().split('\n').slice(-3).join('\n')
  return stdoutTail.slice(0, 1_000)
}
