/**
 * Node half entry point.
 *
 * The plugin waits for the Host services it needs, then mounts the market
 * routes on the host web server. It stays inert on a host that provides no
 * web server, so importing it can never break a profile boot.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { MarketApiClient } from './market-api.js'
import { mountMarketRoutes, resolveDshHome } from './routes.js'
import type { PnpmRunner } from './plugin-install.js'

export const name = 'dsh-market'

/** Host services this plugin consumes. */
export const inject = ['webServer']

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void
  }): () => void
}

interface DesktopPnpmLike extends PnpmRunner {}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServerLike
    desktopPnpm?: DesktopPnpmLike
  }
}

export interface DshMarketConfig {
  /** Override the market backend base URL. */
  readonly apiBaseUrl?: string
  /** Override the DSH home used to locate the user skill root. */
  readonly dshHome?: string
  /** Override the profile directory plugins are installed into. */
  readonly profileDir?: string
  /** Override the npm registry used for plugin installs. */
  readonly registry?: string
}

/** Apply the plugin to a cordis context. */
export function apply(ctx: Context, config: DshMarketConfig = {}): void {
  ctx.inject(['webServer'], (hostCtx) => {
    const dshHome = resolveDshHome(config.dshHome)
    const skillRoot = join(dshHome, 'skills')
    const receiptDir = join(dshHome, 'dsh-market')

    const mount = (): (() => void) => {
      const pnpm = hostCtx.get('desktopPnpm')
      const profileDir = config.profileDir ?? resolve(defaultProfileDir(hostCtx))
      const profileName = defaultProfileName(hostCtx)
      const market = new MarketApiClient(config.apiBaseUrl)
      return mountMarketRoutes(
        route => hostCtx.webServer.register(route),
        {
          market,
          // Without the host pnpm service there is no safe way to install a
          // plugin, so the route answers with a clear failure instead.
          pnpm: pnpm ?? unavailablePnpm(),
          skillRoot,
          profileDir,
          profileName,
          receiptDir,
          ...(config.registry === undefined ? {} : { registry: config.registry }),
        },
      )
    }

    const dispose = mount()
    ctx.effect(() => dispose, 'dsh-market: http routes')
  })
}

function defaultProfileDir(ctx: Context): string {
  const profiles = ctx.get('desktopProfiles') as { current?: { dir?: string } } | undefined
  const dir = profiles?.current?.dir
  if (typeof dir === 'string' && dir.length > 0) return dir
  return join(resolveDshHome(), 'profiles', 'web')
}

/** Name of the active profile, e.g. `desktop`. */
function defaultProfileName(ctx: Context): string {
  const profiles = ctx.get('desktopProfiles') as { current?: { name?: string } } | undefined
  const name = profiles?.current?.name
  if (typeof name === 'string' && name.length > 0) return name
  return 'web'
}

function unavailablePnpm(): PnpmRunner {
  return {
    runPlugin() {
      const handle = {
        stdout: null as unknown as NodeJS.ReadableStream,
        stderr: null as unknown as NodeJS.ReadableStream,
        done: Promise.resolve({ exitCode: 1, signal: null }),
        cancel() {},
      }
      return handle
    },
  }
}
