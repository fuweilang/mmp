/**
 * Open-in-app browsing surface, node half. Pure UI plugin: the empty apply
 * exists so the plugin appears in the host cordis.yml / Loader; the browser
 * half ships via exports["./client"], discovered through the package.json
 * mmp.client declaration. The routes it drives live in
 * `@mammoth-ai/mmp-host-open-in-app`.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
