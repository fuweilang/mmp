/**
 * Fetch one published package tarball into a directory through `npm pack`.
 * @param spec - Package name with an exact version.
 * @param destination - Directory receiving the tarball.
 * @param registry - npm registry URL.
 * @returns Resolves when the tarball lands in the destination.
 */
export function packRegistryPackage(spec: string, destination: string, registry: string): Promise<void>
