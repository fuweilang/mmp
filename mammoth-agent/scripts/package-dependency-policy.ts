/** Explicit exceptions and Host packages for the published dependency policy. */

/** Packages treated as Client/Host packages without declaring `mmp.client`. */
const CLIENT_FACE_INCLUDE: readonly string[] = []

/** Packages exempted from automatic Client/Host treatment despite declaring `mmp.client`. */
const CLIENT_FACE_EXCLUDE: readonly string[] = [
  '@mammoth-ai/mmp-api-session-controller',
  '@mammoth-ai/mmp-api-workspace-controller',
]

/** Host-only packages whose peer relays are deliberately flattened. */
const HOST_DEPENDENCY_PACKAGES: readonly string[] = [
  '@mammoth-ai/mmp-llm',
  '@mammoth-ai/mmp-session',
]

/** Required Cordis services whose Host imports are type-only. */
const REQUIRED_SERVICE_PEERS = {
  '@mammoth-ai/mmp-api-terminal-controller': ['@mammoth-ai/mmp-subprocess'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Development-only package relationships not represented by source imports. */
const CONFIGURATION_ONLY_DEV_DEPENDENCIES = {
  '@mammoth-ai/mmp-client-locale': ['@mammoth-ai/mmp-api-remotes'],
  '@mammoth-ai/mmp-client-ui-conversation': [
    '@mammoth-ai/mmp-api-remotes',
    '@mammoth-ai/mmp-client-ui-workspace',
  ],
  '@mammoth-ai/mmp-client-ui-model-selection': ['@mammoth-ai/mmp-client-ui-input-trigger'],
  '@mammoth-ai/mmp-client-ui-sidebar': ['@mammoth-ai/mmp-client-ui-workspace'],
  '@mammoth-ai/mmp-client-ui-subagent': ['@mammoth-ai/mmp-client-ui-input-trigger'],
  '@mammoth-ai/mmp-client-ui-theme': ['@mammoth-ai/mmp-api-remotes'],
  '@mammoth-ai/mmp-client-ui-tool': ['@mammoth-ai/mmp-api-remotes'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Workspace packages whose complete runtime surface is safe across duplicate installations. */
const DUPLICATE_SAFE_PACKAGES: readonly string[] = [
  '@mammoth-ai/mmp-brand',
  '@mammoth-ai/mmp-lazy-require',
  '@mammoth-ai/mmp-typert-protocol',
  '@mammoth-ai/mmp-util-code-language',
  '@mammoth-ai/mmp-util-crypto',
  '@mammoth-ai/mmp-util-values',
]

/**
 * Runtime exports whose values remain valid when npm installs another package copy.
 * New entries are forbidden by default. Automated agents must not add an
 * exception; every addition requires explicit human review and a dedicated,
 * prominent heading in the pull request description.
 */
const SAFE_HOST_DEPENDENCY_EXPORTS = {
  '@mammoth-ai/mmp-atomic-write': ['withFileLock', 'writeFileAtomic'],
  '@mammoth-ai/mmp-computer-use/brand': ['ComputerUseProviderName'],
  '@mammoth-ai/mmp-credentials': ['credentialKey'],
  '@mammoth-ai/mmp-deque': ['Deque'],
  // The Liveshare wire codec and identity helpers are stateless functions over caller-owned values.
  '@mammoth-ai/mmp-experimental-liveshare-protocol': [
    'LIVESHARE_CAPABILITIES', 'LIVESHARE_PROTOCOL_VERSION', 'parseRelayFrame', 'parseShareAccessState',
    'parseTunnelWorkerCommand', 'parseTunnelWorkerEvent', 'rawText', 'sendFrame', 'unsupportedFrameRefusal',
    'viewerRequestFields', 'identityFromKey', 'identityKeyOf',
  ],
  '@mammoth-ai/mmp-llm': ['callConfigEquals'],
  '@mammoth-ai/mmp-llm/user-content': ['userContentText'],
  '@mammoth-ai/mmp-session': ['SessionId'],
  '@mammoth-ai/mmp-session-format': ['sessionFormatLogFilename'],
  '@mammoth-ai/mmp-storage-domain': ['defineDomain'],
  '@mammoth-ai/mmp-timeout': ['MAX_TIMER_DELAY_MS'],
  '@mammoth-ai/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  // Profile settings must match the installed Node provider's configuration schema.
  '@mammoth-ai/mmp-ptc-runtime-node/configuration': ['resolvePersistentExecution'],
  // CUA checks UserQuestionError and preserves AttachmentError from image admission.
  '@mammoth-ai/mmp-attachment': ['admitEncodedImages'],
  '@mammoth-ai/mmp-user-questions': ['UserQuestionError'],
  // `instanceof` checks need the translator's own class instance.
  '@mammoth-ai/mmp-experimental-translator': ['TranslationError'],
  // Stateless; a safe classification would turn the forge panel's forge and worktree peers into dependencies.
  '@mammoth-ai/mmp-experimental-forge': ['changeRequestKey'],
  '@mammoth-ai/mmp-experimental-worktree': ['generatedWorktreeName'],
  // The forge panel matches ctx.fs failures with `instanceof FsError`.
  '@mammoth-ai/mmp-fs': ['FsError'],
  '@mammoth-ai/mmp-scope': ['carrierKeyOf', 'createScope', 'scopeOf', 'scopeTarget'],
  // appendPluginRecord writes through the Session class's private log; pluginRecordOf is stateless.
  '@mammoth-ai/mmp-session': ['SESSION_FORMAT_VERSION', 'appendPluginRecord', 'pluginRecordOf'],
  '@mammoth-ai/mmp-session-persistence': ['SessionPersistenceNotFoundError'],
  // Readers recognize a deadline's TimeoutReason only by `instanceof` against their own copy.
  '@mammoth-ai/mmp-timeout': ['deadline'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly requiredServicePeers?: Readonly<Record<string, readonly string[]>>
  readonly configurationOnlyDevDependencies: Readonly<Record<string, readonly string[]>>
  readonly duplicateSafePackages?: readonly string[]
  readonly safeHostDependencyExports: HostDependencyExports
  readonly peerRequiredHostExports: HostDependencyExports
}

/** Repository dependency policy consumed by verification and benchmarking. */
export const PACKAGE_DEPENDENCY_POLICY: PackageDependencyPolicy = {
  clientFaceInclude: CLIENT_FACE_INCLUDE,
  clientFaceExclude: CLIENT_FACE_EXCLUDE,
  hostPackages: HOST_DEPENDENCY_PACKAGES,
  requiredServicePeers: REQUIRED_SERVICE_PEERS,
  configurationOnlyDevDependencies: CONFIGURATION_ONLY_DEV_DEPENDENCIES,
  duplicateSafePackages: DUPLICATE_SAFE_PACKAGES,
  safeHostDependencyExports: SAFE_HOST_DEPENDENCY_EXPORTS,
  peerRequiredHostExports: PEER_REQUIRED_HOST_EXPORTS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a package manifest declares a dynamically loaded Client entry. */
export function hasClientDeclaration(mmpField: unknown): boolean {
  return isRecord(mmpField) && Object.hasOwn(mmpField, 'client')
}
