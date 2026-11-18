import existing from './expert-editor.vitest.config.mjs';
export default { ...existing, test: { ...existing.test, include: ['tests/expert-editor.client.spec.ts', 'tests/skill-save.client.spec.ts'] } };
