import existing from './expert-editor.vitest.config.mjs';
export default {...existing,test:{...existing.test,include:['tests/knowledge-files.client.spec.ts']}};
