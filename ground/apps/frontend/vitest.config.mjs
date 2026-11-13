// Frontend component tests (jsdom). Reuses the monorepo's existing Vitest/jsdom
// from the sibling mammoth-agent workspace; no dependency installation here.
// Run via `pnpm --filter @mammoth/frontend test:ui` (auto-detected by Vitest).
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = createRequire(resolve(here, 'package.json'));
const native = createRequire(resolve(here, '../../../mammoth-agent/package.json'));
const { default: vue } = await import(pathToFileURL(frontend.resolve('@vitejs/plugin-vue')).href);

export default {
  root: here,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
      '@mammoth/shared': resolve(here, '../../packages/shared/src/index.ts'),
      // Shared route-component fixtures used by library specs.
      '@upload-fixture': resolve(here, 'src/components/LibraryUploadDialog.vue'),
      '@library-fixture': resolve(here, 'src/views/Library.vue'),
      '@admin-library-fixture': resolve(here, 'src/views/admin/AdminLibrary.vue'),
      '@custody-fixture': resolve(here, 'src/components/LibraryCustodyApproval.vue'),
      // Single copy of vitest so `vi` imported by the specs is the runner's own.
      vitest: resolve(dirname(native.resolve('vitest/package.json')), 'dist/index.js'),
    },
  },
  test: {
    environment: 'jsdom',
    // Glob, not an explicit file list: new *.client.spec.ts are picked up automatically.
    include: ['tests/**/*.client.spec.ts'],
    globals: false,
    pool: 'forks',
    server: { deps: { inline: [/\.vue$/] } },
  },
};
