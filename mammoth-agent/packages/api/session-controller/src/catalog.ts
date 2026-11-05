/** Shared projection of the live LLM registry into the browser model catalog. */

import { RemoteError } from '@mammoth-ai/mmp-typert-protocol'
import { credentialRef } from '@mammoth-ai/mmp-credentials'
import type {} from '@mammoth-ai/mmp-settings'
import type { LlmModelInfo } from '@mammoth-ai/mmp-llm'
import type { Context } from '@mammoth-ai/cordis'
import type {
  ModelCatalog,
  ModelReasoning,
  ModelSelection,
} from './types.ts'

/** Product cloud route; enterprise chat must not fall back to local BYOK providers. */
export const CLOUD_PROVIDER_ID = 'mammoth-ground'

const AUTO_MODEL_IDS = new Set(['auto', '*', ''])

function isAutoModelId(model: string): boolean {
  return AUTO_MODEL_IDS.has(model.trim().toLowerCase())
}

/**
 * Whether a selection can be served by a currently registered adapter.
 * `auto` / `*` count as available when the provider is registered (adapters resolve the preferred id).
 */
export async function modelAvailable(ctx: Context, selection: ModelSelection): Promise<boolean> {
  if (!ctx.llm.listProviders().some(provider => provider.id === selection.provider)) return false
  if (isAutoModelId(selection.model)) return true
  let models: readonly LlmModelInfo[]
  try { models = await ctx.llm.listModels(selection.provider) }
  catch (error) {
    throw new RemoteError('session/model-unavailable',
      error instanceof Error ? error.message : String(error),
      { provider: selection.provider, model: selection.model })
  }
  return models.some(model => model.id === selection.model)
}

/**
 * Prefer Ground preferred/auto; optionally remap a sticky bare model id onto a Ground catalog id.
 */
export async function resolveCloudFallbackSelection(
  ctx: Context,
  stickyModel?: string,
): Promise<ModelSelection> {
  const providers = ctx.llm.listProviders()
  const hasCloud = providers.some(provider => provider.id === CLOUD_PROVIDER_ID)
  if (hasCloud) {
    try {
      const models = await ctx.llm.listModels(CLOUD_PROVIDER_ID)
      if (stickyModel && !isAutoModelId(stickyModel)) {
        const exact = models.find(model => model.id === stickyModel)
        if (exact !== undefined) return { provider: CLOUD_PROVIDER_ID, model: exact.id }
        const bySuffix = models.find(model =>
          model.id.endsWith(`/${stickyModel}`) || model.name === stickyModel)
        if (bySuffix !== undefined) return { provider: CLOUD_PROVIDER_ID, model: bySuffix.id }
      }
      if (models.length > 0) {
        return { provider: CLOUD_PROVIDER_ID, model: 'auto' }
      }
    } catch {
      // Fall through to first routable provider.
    }
  }
  for (const provider of providers) {
    try {
      const models = await ctx.llm.listModels(provider.id)
      const first = models[0]
      if (first !== undefined) return { provider: provider.id, model: first.id }
    } catch {
      continue
    }
  }
  return { provider: CLOUD_PROVIDER_ID, model: 'auto' }
}

/** Product chat always uses Ground; local provider selections are remapped. */
export function isCloudOnlyMode(): boolean {
  return true
}

const LEGACY_LOCAL_PROVIDERS = new Set([
  'deepseek-official',
  'deepseek-account',
])

/**
 * Replace a non-routable sticky/default selection with a cloud (or first available) route.
 * In cloud-only mode, any sticky that is not already mammoth-ground is remapped onto
 * Ground (matching bare ids like `deepseek-flash` → `deepseek/deepseek-flash`).
 */
export async function ensureRoutableSelection(
  ctx: Context,
  selection: ModelSelection,
): Promise<ModelSelection> {
  const providers = ctx.llm.listProviders()
  const hasCloud = providers.some(provider => provider.id === CLOUD_PROVIDER_ID)
  const cloudOnly = isCloudOnlyMode()

  // Cloud-first: never keep deepseek-official / deepseek-account (or any other
  // non-cloud sticky) while Ground is registered in product mode. This covers
  // the UI path that shows display name `deepseek-flash` while session sticky
  // still stores provider=`deepseek-official`.
  if (
    cloudOnly
    && hasCloud
    && selection.provider !== CLOUD_PROVIDER_ID
  ) {
    return resolveCloudFallbackSelection(ctx, selection.model)
  }

  // Also remap when sticky is already cloud but the model id is a bare / display
  // name that Ground does not advertise literally (e.g. deepseek-flash).
  if (selection.provider === CLOUD_PROVIDER_ID && !isAutoModelId(selection.model)) {
    if (!(await modelAvailable(ctx, selection)) && !selection.model.includes('/')) {
      const models = await ctx.llm.listModels(CLOUD_PROVIDER_ID)
      const migrated = models.find(model => model.id.endsWith(`/${selection.model}`) || model.name === selection.model)
      if (migrated) return { provider: CLOUD_PROVIDER_ID, model: migrated.id }
    }
    return selection
  }

  if (await modelAvailable(ctx, selection)) {
    if (!isAutoModelId(selection.model) || selection.provider === CLOUD_PROVIDER_ID) return selection
    try {
      const resolved = await ctx.llm.resolveModelInfo(selection.provider, selection.model)
      // Drop sticky effort on auto-expand; adapter defaults apply for the concrete id.
      return { provider: selection.provider, model: resolved.id }
    } catch {
      return { provider: selection.provider, model: selection.model }
    }
  }

  // Prefer cloud remap for known legacy provider ids even when cloudOnly is off
  // but Ground is up and the sticky route itself is unavailable.
  if (hasCloud && LEGACY_LOCAL_PROVIDERS.has(selection.provider)) {
    return resolveCloudFallbackSelection(ctx, selection.model)
  }
  return resolveCloudFallbackSelection(ctx, selection.model)
}

/**
 * Build the browser model catalog without requiring a Session.
 * @param ctx - Host context carrying the live LLM registry.
 * @param defaultSelection - deployment default used before a Session selects a model.
 * @returns successful non-empty provider groups and isolated provider failures.
 */
export async function buildModelCatalog(
  ctx: Context,
  defaultSelection: ModelSelection = ctx.agentDefaultModel.currentSelection(),
): Promise<ModelCatalog> {
  const providers = ctx.llm.listProviders()
  const catalog = await Promise.all(providers.map(async (provider) => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      const entries = await Promise.all(models.map(async (model) => {
        const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id)
        const reasoning: ModelReasoning | undefined = resolved.reasoning === undefined
          ? undefined
          : {
            efforts: resolved.reasoning.efforts.map(effort => ({
              id: effort.id,
              name: effort.name,
              ...(effort.description === undefined ? {} : { description: effort.description }),
            })),
            ...(resolved.reasoning.defaultEffort === undefined
              ? {}
              : { defaultEffort: resolved.reasoning.defaultEffort }),
          }
        return {
          id: model.id,
          name: model.name,
          ...(model.description === undefined ? {} : { description: model.description }),
          ...(reasoning === undefined ? {} : { reasoning }),
          ...(model.badge === undefined ? {} : { badge: model.badge }),
        }
      }))
      return {
        kind: 'group' as const,
        group: { id: provider.id, name: provider.name, models: entries },
      }
    } catch (error) {
      return {
        kind: 'failure' as const,
        failure: {
          id: provider.id,
          name: provider.name,
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }))
  const groups = catalog.flatMap(item => item.kind === 'group' ? [item.group] : [])
    .filter(group => group.models.length > 0)

  let healed = await ensureRoutableSelection(ctx, defaultSelection)
  // Prefer a concrete id in the catalog default so the picker marks the route as routable.
  if (healed.provider !== CLOUD_PROVIDER_ID && isAutoModelId(healed.model) && groups.some(group => group.id === healed.provider)) {
    const preferred = groups.find(group => group.id === healed.provider)?.models[0]
    if (preferred !== undefined) healed = { ...healed, model: preferred.id }
  }
  if (
    healed.provider !== defaultSelection.provider
    || healed.model !== defaultSelection.model
  ) {
    void ctx.agentDefaultModel.saveSelection({
      provider: healed.provider,
      model: healed.model,
    }).catch(() => { /* best-effort heal */ })
  }

  return {
    default: { ...healed },
    routableProviders: groups.map(group => group.id),
    groups,
    failures: catalog.flatMap(item => item.kind === 'failure' ? [item.failure] : []),
  }
}

/**
 * Check configured provider API-key references independently of model availability.
 * @param ctx - Host registry, settings, and credential services.
 * @returns whether any API-key provider has a configured credential.
 */
export async function hasProviderApiKey(ctx: Context): Promise<boolean> {
  const settings = ctx.get('settings')
  const credentials = ctx.get('credentials')
  if (settings === undefined || credentials === undefined) {
    throw new RemoteError('session/provider-credentials-unavailable', 'provider credentials are unavailable', {})
  }
  const namespaces = settings.describe({ redactSecrets: true })
  for (const provider of ctx.llm.listConfigurableProviders()) {
    if (provider.provider === 'deepseek-account' || provider.provider === CLOUD_PROVIDER_ID) continue
    let profile = namespaces.find(namespace => namespace.ns === provider.settingsNs)?.value
    for (const key of provider.settingsPath) {
      profile = typeof profile === 'object' && profile !== null ? Reflect.get(profile, key) : undefined
    }
    if (typeof profile !== 'object' || profile === null) continue
    const ref: unknown = Reflect.get(profile, 'apiKeyEnv')
    if (typeof ref === 'string' && ref.length > 0
      && (await credentials.describe(credentialRef(ref))).configured) return true
  }
  return false
}
