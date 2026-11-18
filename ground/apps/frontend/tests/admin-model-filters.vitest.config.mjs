import base from './admin-table.vitest.config.mjs';
export default {...base,test:{...base.test,include:['tests/admin-model-filters.client.spec.ts']}};
