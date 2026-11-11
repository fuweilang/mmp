import { GuideArtworkBrowser } from '@mammoth-ai/mmp-client-ui-primitives';
/** Browser tab kind. */
export const BROWSER_KIND = 'browser';
/** Browser implementation identity and keyed Slot dispatch key. */
export const BROWSER_ID = '@mammoth-ai/mmp-client-ui-sidebar-browser';
/** Build the Browser type with locale-live copy. */
export function browserDefinition(t) {
    return {
        id: BROWSER_ID,
        kind: BROWSER_KIND,
        multiple: true,
        priority: 'builtin',
        title: () => t('type.label'),
        guide: [{
                id: 'new', commandId: 'browser.new', order: 30, title: () => t('guide.title'),
                description: () => t('guide.description'), icon: GuideArtworkBrowser,
            }],
    };
}
//# sourceMappingURL=definition.js.map