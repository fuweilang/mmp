// Launcher for the frontend vitest suites.
// Resolves the Vitest binary from the sibling mammoth-agent workspace (the one
// already used by this repo's *.vitest.config.mjs files) so `ground` needs no
// extra test dependency. Extra args are forwarded, e.g. `--config <file>` or a path.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRequire = createRequire(resolve(here, '../../../../mammoth-agent/package.json'));
// `vitest` does not export its CLI through "exports"; resolve the package root instead.
const vitestBin = resolve(dirname(repoRequire.resolve('vitest/package.json')), 'vitest.mjs');

const args = process.argv.slice(2);
const hasMode = args.some(arg => arg === 'run' || arg === 'watch' || arg === 'dev');
const child = spawn(process.execPath, [vitestBin, ...(hasMode ? [] : ['run']), ...args], {
  stdio: 'inherit',
  cwd: resolve(here, '..'),
});
child.on('exit', code => process.exit(code ?? 1));
