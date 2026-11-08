/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@mammoth-ai/cordis'
import productAnalyticsRemote from '@mammoth-ai/mmp-client-product-analytics/remote'
export type {} from '@mammoth-ai/mmp-client-product-analytics/remote'
import agentPresetsRemote from '@mammoth-ai/mmp-agent-preset-registry/remote'
import userQuestionsRemote from '@mammoth-ai/mmp-user-questions/remote'
import commandsRemote from '@mammoth-ai/mmp-commands/remote'
import accountRemote from '@mammoth-ai/mmp-api-account-controller/remote'
import settingsControllerRemote from '@mammoth-ai/mmp-api-settings-controller/remote'
import officeToPdfRemote from '@mammoth-ai/mmp-office-to-pdf/remote'
import goalsRemote from '@mammoth-ai/mmp-goal/remote'
import scheduleRemote from '@mammoth-ai/mmp-schedule/remote'
import llmRemote from '@mammoth-ai/mmp-llm/remote'
import dynamicRemote from '@mammoth-ai/mmp-cordis-host-runner/remote'
import pluginManagerRemote from '@mammoth-ai/mmp-plugin-manager/remote'
import toolResultsRemote from '@mammoth-ai/mmp-client-ui-trajectory/remote'
import pluginRegistryProbeRemote from '@mammoth-ai/mmp-client-ui-plugin-manager/remote'
import officialAgentGalleryRemote from '@mammoth-ai/mmp-official-agent-gallery/remote'
import pluginMarketRemote from '@mammoth-ai/mmp-plugin-market/remote'
import pluginInventoryRemote from '@mammoth-ai/mmp-host-plugin-inventory/remote'
import messageFeedbackRemote from '@mammoth-ai/mmp-message-feedback/remote'
import permissionPresetsRemote from '@mammoth-ai/mmp-permission-presets/remote'
import sessionFeedbackRemote from '@mammoth-ai/mmp-command-feedback/remote'
import fileUploadsRemote from '@mammoth-ai/mmp-client-file-upload/remote'
import sessionReferencesRemote from '@mammoth-ai/mmp-session-reference/remote'
import subagentsRemote from '@mammoth-ai/mmp-subagent/remote'
import sessionRemote from '@mammoth-ai/mmp-api-session-controller/remote'
import jobRemote from '@mammoth-ai/mmp-api-job-controller/remote'
import workspaceRemote from '@mammoth-ai/mmp-api-workspace-controller/remote'
import terminalRemote from '@mammoth-ai/mmp-api-terminal-controller/remote'
import workspaceFilesRemote from '@mammoth-ai/mmp-api-workspace-files/remote'
import type { ClientRemote } from '@mammoth-ai/mmp-api-gateway/client'

export type { ClientRemote } from '@mammoth-ai/mmp-api-gateway/client'
export type {
  BundleDetail, BundleInfo, BundleRowInfo, ChangeResult, IncompatiblePlugin, InspectOptions, InstallBundleOptions, InstallSpecKind,
  ManagementError, PackageResult,
  PluginChange, PluginEntryId, PluginInfo, PluginInspectProblem, PluginInstallCancellation, PluginInstallFailureKind,
  PluginInstallLogChunk, PluginInstallProgress, PluginInstallRequestId, PluginRegistries, PluginSpecInspection,
  PluginUpdateProgress, PluginUpdateResult, PluginUpdateStep, PluginVersion, PluginVersionList, RegistryAttempt,
  ReadOnlyReason, Registry, RestartReason,
} from '@mammoth-ai/mmp-plugin-manager/types'
export type {} from '@mammoth-ai/mmp-plugin-manager/remote'
export type {} from '@mammoth-ai/mmp-client-ui-plugin-manager/remote'
export type {} from '@mammoth-ai/mmp-official-agent-gallery/remote'
export type {} from '@mammoth-ai/mmp-client-ui-trajectory/remote'
export type {} from '@mammoth-ai/mmp-plugin-market/remote'
export type {
  MarketCompatibility, MarketIndexSummary, MarketInstallation, MarketInstallationStatus, MarketListingEntry, MarketListingVersion,
  MarketQuery, MarketSearchResult, MarketSort, PluginDetail, PluginDetailDocumentId, PluginDetailOrigin,
} from '@mammoth-ai/mmp-plugin-market/types'
export type { PluginInventorySnapshot } from '@mammoth-ai/mmp-host-plugin-inventory/types'
export type {} from '@mammoth-ai/mmp-agent-preset-registry/remote'
export type {} from '@mammoth-ai/mmp-user-questions/remote'
export type {} from '@mammoth-ai/mmp-commands/remote'
export type {} from '@mammoth-ai/mmp-api-settings-controller/remote'
export type {} from '@mammoth-ai/mmp-api-account-controller/remote'
export type {} from '@mammoth-ai/mmp-goal/remote'
export type {} from '@mammoth-ai/mmp-schedule/remote'
export type {} from '@mammoth-ai/mmp-office-to-pdf/remote'
export type {} from '@mammoth-ai/mmp-llm/remote'
export type {} from '@mammoth-ai/mmp-host-plugin-inventory/remote'
export type {} from '@mammoth-ai/mmp-message-feedback/remote'
export type {} from '@mammoth-ai/mmp-permission-presets/remote'
export type {} from '@mammoth-ai/mmp-command-feedback/remote'
export type {} from '@mammoth-ai/mmp-client-file-upload/remote'
export type {} from '@mammoth-ai/mmp-session-reference/remote'
export type {} from '@mammoth-ai/mmp-subagent/remote'
export type * from '@mammoth-ai/mmp-subagent/client'
export type {} from '@mammoth-ai/mmp-api-session-controller/remote'
export type * from '@mammoth-ai/mmp-api-session-controller/types'
export type {} from '@mammoth-ai/mmp-api-job-controller/remote'
export type * from '@mammoth-ai/mmp-api-job-controller/types'
export type {} from '@mammoth-ai/mmp-api-workspace-controller/remote'
export type * from '@mammoth-ai/mmp-api-workspace-controller/types'
export type {} from '@mammoth-ai/mmp-api-workspace-files/remote'
export type * from '@mammoth-ai/mmp-api-workspace-files/types'
export type {} from '@mammoth-ai/mmp-api-terminal-controller/remote'
export type * from '@mammoth-ai/mmp-api-terminal-controller/types'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@mammoth-ai/mmp-commands/types'
export type {} from '@mammoth-ai/mmp-cordis-host-runner/types'
export type {} from '@mammoth-ai/mmp-credentials/types'
export type {} from '@mammoth-ai/mmp-llm/types'
export type {} from '@mammoth-ai/mmp-agent-preset-registry/types'
export type {} from '@mammoth-ai/mmp-permission-presets/types'
export type {} from '@mammoth-ai/mmp-settings/types'
export type {} from '@mammoth-ai/mmp-user-approval/types'
export type {} from '@mammoth-ai/mmp-user-questions/types'
export type {} from '@mammoth-ai/mmp-api-session-controller/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ConnectionHandle, ConnectionSinks, ContentBlock,
  MessageId,
  RpcId, RpcRequest, RpcResponse, RpcResult, SessionId,
  StreamChunk,
} from '@mammoth-ai/mmp-client-connection/client'
export type {} from '@mammoth-ai/mmp-api-gateway/client'
export type {} from '@mammoth-ai/mmp-cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@mammoth-ai/mmp-cordis-host-runner/types'
// Credential state vocabulary for the credentials namespace (values never ride it).
export type { CredentialInfo } from '@mammoth-ai/mmp-credentials/types'
// Redacted namespace vocabulary for the settings namespace (secrets never ride
// it). It travels with its seam, whose `./types` the Client face already reads.
export type {
  SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView, SettingsSecretView,
} from '@mammoth-ai/mmp-settings/types'
// Provider registry and discovery vocabulary for the llm namespace.
export type {
  LlmConfigurableProvider, LlmDiscoveredModel,
  LlmModelDiscoveryRequest, LlmNativeAuth, LlmProviderInfo,
} from '@mammoth-ai/mmp-llm/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@mammoth-ai/mmp-file-reference/types'
export type { SessionReferenceMentionCandidate } from '@mammoth-ai/mmp-session-reference/types'

// The Remote failure vocabulary, re-exported so business packages keep naming
// this assembly alone. Types only: a value export would make spec imports load
// this module's owner /remote artifacts; specs take RemoteError from
// mmp-client-test-runtime instead.
export type {
  RemoteErrorCode, RemoteErrorDetailsMap, RemoteFailure, RemoteResult,
} from '@mammoth-ai/mmp-typert-protocol'
export type { RemoteHostFacts } from '@mammoth-ai/mmp-api-gateway/client'

declare module '@mammoth-ai/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: ClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      productAnalyticsRemote, agentPresetsRemote, commandsRemote, settingsControllerRemote, accountRemote,
      goalsRemote, llmRemote, dynamicRemote, scheduleRemote,
      pluginInventoryRemote, pluginManagerRemote, pluginMarketRemote, pluginRegistryProbeRemote, toolResultsRemote,
      messageFeedbackRemote, sessionFeedbackRemote,
      fileUploadsRemote, sessionReferencesRemote,
      permissionPresetsRemote, subagentsRemote, sessionRemote, jobRemote, workspaceRemote, workspaceFilesRemote, terminalRemote,
      officeToPdfRemote, userQuestionsRemote, officialAgentGalleryRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
