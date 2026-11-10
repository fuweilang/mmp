// Reuse the monorepo's existing Vitest/jsdom; no dependency installation or runtime changes.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const frontend = createRequire(resolve(here, '../package.json'));
const native = createRequire(resolve(here, '../../../../mammoth-agent/package.json'));
const { default: vue } = await import(pathToFileURL(frontend.resolve('@vitejs/plugin-vue')).href);
export default {
  root: resolve(here, '..'), plugins: [vue()],
  resolve: { alias: { '@upload-fixture': resolve(here, '../src/components/LibraryUploadDialog.vue'), '@library-fixture': resolve(here, '../src/views/Library.vue'), '@admin-library-fixture': resolve(here, '../src/views/admin/AdminLibrary.vue'), '@mammoth/shared': resolve(here, '../../../packages/shared/src/index.ts'), vitest: resolve(dirname(native.resolve('vitest/package.json')), 'dist/index.js') } },
  test: { environment: 'jsdom', include: ['tests/library-upload.client.spec.ts', 'tests/library-dialog.client.spec.ts', 'tests/library-admin.client.spec.ts', 'tests/library-sharing.client.spec.ts', 'tests/library-members.client.spec.ts'], globals: false, pool: 'forks', server: { deps: { inline: [/\.vue$/] } } },
};
