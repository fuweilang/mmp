/**
 * Optional local SenseVoice provider.
 * `prepareOnStart` downloads a missing model during activation; otherwise activation only inspects disk.
 */
import { isAbsolute } from 'node:path'
import type { Context } from '@mammoth-ai/cordis'
import type {} from '@mammoth-ai/mmp-experimental-speech-to-text'
import type {} from '@mammoth-ai/mmp-subprocess'
import type { SpeechProviderId } from '@mammoth-ai/mmp-experimental-speech-to-text/types'
import { Config } from './config.ts'
import { SenseVoiceWorker } from './recognizer.ts'
import { languages } from './input.ts'

export { Config } from './config.ts'
export const name = 'experimental-speech-to-text-sensevoice'
export const inject = ['speechToText', 'subprocess']

/**
 * Register the local recognizer. `prepareOnStart` downloads and loads a missing cache; otherwise only inspect disk.
 * @param ctx - Host registry and subprocess owner.
 * @param config - validated runtime configuration.
 */
export function apply(ctx: Context, config: Config): void {
  for (const path of [config.dataRoot, config.modelDirectory, config.vadModelPath]) {
    if (path !== undefined && !isAbsolute(path)) throw new Error(`SenseVoice paths must be absolute: ${path}`)
  }
  for (const origin of config.modelOrigin === undefined ? config.modelOrigins : [config.modelOrigin]) new URL(origin)
  const worker = new SenseVoiceWorker(ctx, config)
  const estimatedBytes = config.precision === 'int8' ? 1_000_000_000 : 2_000_000_000
  ctx.effect(() => {
    const unregister = ctx.speechToText.register({
      info: { id: config.providerId as SpeechProviderId, name: `SenseVoiceSmall (${config.precision.toUpperCase()})`, location: 'host-local', languages, downloadSources: worker.downloadSources,
        setupEstimate: { recommendedDiskBytes: estimatedBytes, expectedMemoryBytes: estimatedBytes,
          minimumMinutes: 1, maximumMinutes: 10 } },
      preparation: worker,
      transcribe: async (input, signal) => await worker.transcribe(input, signal),
    })
    if (config.prepareOnStart) worker.prepareIfMissing()
    else worker.inspect()
    return async () => {
      const removing = unregister()
      await worker.dispose()
      await removing
    }
  })
}
