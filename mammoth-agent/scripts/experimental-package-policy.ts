/** Experimental package identities, publication policy, and retained npm names. */

/**
 * Experimental packages whose npm names omit the experimental prefix, by directory: identities retained across
 * experimental classification and package-role moves, and packages named without the prefix so that leaving
 * experimental status keeps their names.
 */
export const EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS: Readonly<Record<string, string>> = {
  'packages/experimental/cua': '@mammoth-ai/mmp-cua',
  'packages/experimental/cua-bundle': '@mammoth-ai/mmp-cua-bundle',
  'packages/experimental/tool-session-query': '@mammoth-ai/mmp-tool-session-query',
  'packages/experimental/session-title-all-prompts-llm': '@mammoth-ai/mmp-session-title-all-prompts-llm',
  'packages/experimental/tool-terminal': '@mammoth-ai/mmp-tool-terminal',
  'packages/experimental/tool-ralph': '@mammoth-ai/mmp-tool-ralph',
  'packages/experimental/skill-badge': '@mammoth-ai/mmp-skill-badge',
  'packages/experimental/hook-protocol': '@mammoth-ai/mmp-hook-protocol',
  'packages/experimental/hooks-claude-code': '@mammoth-ai/mmp-hooks-claude-code',
  'packages/experimental/hooks-codex': '@mammoth-ai/mmp-hooks-codex',
  'packages/experimental/webhook': '@mammoth-ai/mmp-webhook',
  'packages/experimental/webhook-github': '@mammoth-ai/mmp-webhook-github',
  'packages/experimental/action-cards': '@mammoth-ai/mmp-action-cards',
  'packages/experimental/client-ui-action-cards': '@mammoth-ai/mmp-client-ui-action-cards',
  'packages/experimental/creation-recommendations': '@mammoth-ai/mmp-creation-recommendations',
  'packages/experimental/client-ui-creation-recommendations': '@mammoth-ai/mmp-client-ui-creation-recommendations',
  'packages/experimental/plugin-recommendations': '@mammoth-ai/mmp-plugin-recommendations',
  'packages/experimental/client-ui-plugin-recommendations': '@mammoth-ai/mmp-client-ui-plugin-recommendations',
  'packages/experimental/personalized-recommendations': '@mammoth-ai/mmp-personalized-recommendations',
} satisfies Record<`packages/experimental/${string}`, `@mammoth-ai/mmp-${string}`>

/** npm namespace for experimental packages without retained-name exceptions. */
export const EXPERIMENTAL_PACKAGE_NAME_PREFIX = '@mammoth-ai/mmp-experimental-'
const retainedNames = new Set(Object.values(EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS))

/**
 * Identify an experimental npm package independently of its installed directory.
 * @param name - complete npm package name, without a version or subpath.
 * @returns Whether the name uses the experimental prefix or a retained name.
 */
export function isExperimentalPackageName(name: string): boolean {
  return name.startsWith(EXPERIMENTAL_PACKAGE_NAME_PREFIX) || retainedNames.has(name)
}

/**
 * Find experimental identities in module ids, paths, subpaths, or npm alias specifications.
 * @param reference - package reference or bundler/runtime module identifier.
 * @returns Whether a delimited package name identifies an experimental capability.
 */
export function hasExperimentalPackageReference(reference: string): boolean {
  const normalized = reference.replaceAll('\\', '/')
  return [...normalized.matchAll(/(?:^|[/:\u0000])(@deepseek-ai\/[^/@?#:\s]+)(?=$|[/@?#:])/g)]
    .some(([, name]) => name !== undefined && isExperimentalPackageName(name))
}

/**
 * Derive the package-owned plugin record namespace without changing persisted names.
 * @param name - complete experimental npm package name.
 * @returns Capability suffix, or undefined for a non-experimental name.
 */
export function experimentalPackageRecordNamespace(name: string): string | undefined {
  if (!isExperimentalPackageName(name)) return undefined
  return name.slice(name.startsWith(EXPERIMENTAL_PACKAGE_NAME_PREFIX) ? EXPERIMENTAL_PACKAGE_NAME_PREFIX.length : '@mammoth-ai/mmp-'.length)
}

/** Experimental packages excluded from public releases and npm baselines. */
export const PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES: readonly string[] = []

/**
 * Whether an experimental package publishes under the default-public policy.
 * @param directory - repository-relative package directory.
 * @param privateDirectories - experimental directories excluded from publication.
 * @returns Whether the package publishes with the mmp family.
 */
export function isPublicExperimentalPackageDirectory(
  directory: string,
  privateDirectories: readonly string[] = PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES,
): boolean {
  return /^packages\/experimental\/[^/]+$/.test(directory)
    && !privateDirectories.includes(directory)
}
