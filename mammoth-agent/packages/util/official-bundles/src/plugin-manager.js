/** The package names the plugin manager protects, hides, orders, or marks experimental. */
/**
 * Plugin packages the plugin manager refuses to disable or remove, because management itself needs them; a bundle that
 * contains one is read-only as well. Removing a name drops only this `management-required` refusal; the manager's own
 * entry, installation-carried bundles, and unaddressable rows stay protected by their own rules.
 */
export const PROTECTED_PLUGINS = new Set([
    '@mammoth-ai/mmp-plugin-manager', '@mammoth-ai/cordis-plugin-loader',
    '@mammoth-ai/cordis-plugin-include', '@mammoth-ai/mmp-api-gateway',
    '@mammoth-ai/mmp-host-webserver', '@mammoth-ai/mmp-client-modules',
    '@mammoth-ai/mmp-client-ui-settings-plugin-inventory', '@mammoth-ai/mmp-client-ui-plugin-manager',
    '@mammoth-ai/mmp-host-plugin-inventory', '@mammoth-ai/mmp-typert-registry',
    '@mammoth-ai/mmp-api-remotes', '@mammoth-ai/mmp-api-remote-access',
    '@mammoth-ai/cordis-plugin-timer', '@mammoth-ai/mmp-client-connection',
    '@mammoth-ai/mmp-host-frontend-static', '@mammoth-ai/mmp-tools',
    '@mammoth-ai/mmp-hmr',
]);
/**
 * Built-in profile bundles and persistent terminals, which have no plugin manager page.
 * Their Host availability and activation stay intact.
 */
export const HIDDEN_BUNDLES = new Set([
    '@mammoth-ai/mmp-base',
    '@mammoth-ai/mmp-web-app',
    '@mammoth-ai/mmp-headless',
    '@mammoth-ai/mmp-sdk-app',
    '@mammoth-ai/mmp-acp-app',
    '@mammoth-ai/mmp-sdk-minimal',
    '@mammoth-ai/mmp-experimental-terminal-bundle',
]);
/**
 * The optional bundles the plugin manager's main and More lists rank first, in this order. {@link MORE_BUNDLES}, not
 * this list, decides whether a bundle appears on the main list.
 */
export const EXTENSION_BUNDLES = [
    '@mammoth-ai/mmp-experimental-agent-team-profile',
    '@mammoth-ai/mmp-experimental-voice-input-bundle',
    '@mammoth-ai/mmp-experimental-plugin-market-bundle',
    '@mammoth-ai/mmp-experimental-auto-review',
];
/**
 * The optional bundles the plugin manager's main list leaves out until the profile enables them; its More list,
 * which includes every eligible bundle, ranks them last in this order.
 */
export const MORE_BUNDLES = [
    '@mammoth-ai/mmp-personalized-recommendations',
    '@mammoth-ai/mmp-experimental-inspector-profile',
    '@mammoth-ai/mmp-cua-bundle',
    '@mammoth-ai/mmp-experimental-tool-worktree',
    '@mammoth-ai/mmp-experimental-cot-translation-bundle',
    '@mammoth-ai/mmp-experimental-session-search',
    '@mammoth-ai/mmp-experimental-session-titles-bundle',
    '@mammoth-ai/mmp-experimental-badge-skill-bundle',
    '@mammoth-ai/mmp-experimental-ralph-bundle',
    '@mammoth-ai/mmp-subagent-codex',
    '@mammoth-ai/mmp-subagent-claude-code',
];
/** Official bundles the plugin manager marks with the Experimental badge. */
export const EXPERIMENTAL_BUNDLES = new Set([
    '@mammoth-ai/mmp-personalized-recommendations',
    '@mammoth-ai/mmp-cua-bundle',
    '@mammoth-ai/mmp-experimental-agent-team-profile',
    '@mammoth-ai/mmp-experimental-voice-input-bundle',
    '@mammoth-ai/mmp-experimental-auto-review',
    '@mammoth-ai/mmp-experimental-inspector-profile',
    '@mammoth-ai/mmp-experimental-forge-bundle',
    '@mammoth-ai/mmp-experimental-tool-worktree',
    '@mammoth-ai/mmp-experimental-cot-translation-bundle',
    '@mammoth-ai/mmp-experimental-session-search',
    '@mammoth-ai/mmp-experimental-session-titles-bundle',
    '@mammoth-ai/mmp-experimental-badge-skill-bundle',
    '@mammoth-ai/mmp-experimental-ralph-bundle',
    '@mammoth-ai/mmp-experimental-plugin-market-bundle',
    '@mammoth-ai/mmp-experimental-liveshare',
]);
//# sourceMappingURL=plugin-manager.js.map