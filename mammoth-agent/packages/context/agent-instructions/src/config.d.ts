/**
 * Configuration normalization for workspace instruction discovery and rendering.
 *
 * @module @mammoth-ai/mmp-agent-instructions/config
 */
import z from '@mammoth-ai/schemastery';
/** User-facing workspace instruction loader configuration. */
export interface Config {
    /** Directory entries that identify the project root while walking upward from the current working directory. */
    projectRootMarkers?: string[];
    /**
     * UTF-8 byte cap for each instruction chain (user-global, project) within one
     * rendered baseline or dynamic batch, so a baseline or batch holding both
     * chains is at most twice this size; non-positive or non-finite disables loading.
     */
    maxBytes: number;
    /** Maximum UTF-8 bytes read from one instruction file; larger files are ignored. */
    maxSourceBytes?: number;
    /**
     * Ordered same-directory project candidates; every existing file loads, with
     * per-directory trimmed-content duplicates collapsed to the earliest candidate.
     */
    instructionFileCandidates?: string[];
    /**
     * Ordered same-directory local-overlay candidates loaded after the base files
     * under the same per-directory trimmed-content dedup; empty disables the overlay.
     */
    localInstructionFileCandidates?: string[];
}
export declare const Config: z<Config>;
/** Normalized instruction discovery configuration. */
export interface ResolvedDiscoveryConfig {
    mmpHome: string;
    agentsHome: string;
    projectRootMarkers: string[];
    instructionFileCandidates: string[];
    localInstructionFileCandidates: string[];
}
/** Normalized configuration used by discovery and reconciliation. */
export interface ResolvedConfig extends ResolvedDiscoveryConfig {
    maxBytes: number;
    maxSourceBytes: number;
}
/**
 * Identify the discovery, precedence, and budget semantics of one baseline.
 * @param config - normalized plugin configuration.
 * @param cwd - absolute session working directory.
 * @param projectRoot - project root selected for the current baseline.
 * @returns stable serialized identity for compatibility checks on resume.
 */
export declare function workspaceBaselineIdentity(config: ResolvedConfig, cwd: string, projectRoot: string): string;
/**
 * Resolve row defaults, the process harness home, and valid same-directory candidates.
 * Undeclared row fields cannot override the process home.
 * @param config - user-facing plugin configuration.
 * @returns normalized runtime configuration.
 */
export declare function resolveConfig(config: Config): ResolvedConfig;
/**
 * Resolve the subset of configuration used before instruction content is rendered.
 *
 * The harness home comes from the process environment through
 * {@link resolveMmpHome}; the row cannot point instruction loading at a second
 * root that other harness consumers would not share. An owner that already
 * resolved the homes passes them as `mmpHome` and `agentsHome`, which are
 * normalized here so discovery and reconciliation use the same values.
 * @param config - optional discovery controls plus the already-resolved homes.
 * @returns normalized home, root markers, and instruction candidates.
 */
export declare function resolveDiscoveryConfig(config: Pick<Config, 'projectRootMarkers' | 'instructionFileCandidates' | 'localInstructionFileCandidates'> & {
    mmpHome?: string;
    agentsHome?: string;
}): ResolvedDiscoveryConfig;
//# sourceMappingURL=config.d.ts.map