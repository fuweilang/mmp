/** Desktop keeps graph delivery without following Web workspace rebuilds. */
import { fileURLToPath } from 'node:url'
import { Context } from '@mammoth-ai/cordis'
import Loader from '@mammoth-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@mammoth-ai/mmp-app-boot'
import { expect, it, onTestFinished } from 'vitest'

it.each(['web', 'desktop'])('configures bundle watches for %s through the Loader', async (profile) => {
  const rows = loadOverlayPatches('hmr-defaults', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
    .flatMap(patch => patch.insert ?? []).filter(row => row.id === 'client-hmr')
  expect(rows).toHaveLength(1)
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('profileContext', {
    name: profile, dir: '/profile', patchPath: '/profile/cordis.patch.yml', installAnchor: '/profile/package.json',
    cwd: '/workspace', home: '/home', startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
  })
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  let observed: { watchBundles?: boolean } | undefined
  ctx.loader.builtins.hmrProbe = { apply(_ctx: Context, config: { watchBundles?: boolean }) { observed = config } }
  await ctx.loader.root.update([{ ...rows[0]!, name: 'cordis:hmrProbe' }])
  await ctx.loader.await()
  expect(observed?.watchBundles).toBe(profile !== 'desktop')
})
