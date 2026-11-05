// Keep each project's workspace, pnpm version and lockfile independent.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const command = process.argv[2];
if (!['install', 'build'].includes(command)) {
  console.error('Usage: node scripts/project-command.mjs install|build');
  process.exit(1);
}
const root = new URL('../', import.meta.url);
let active;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    active?.kill(signal);
  });
}
for (const project of ['ground', 'mammoth-agent']) {
  if (interrupted) break;
  console.log(`\n[mmp] ${project}: ${command}`);
  const args = command === 'install' ? ['install'] : ['run', 'build'];
  const code = await new Promise(resolve => {
    active = spawn('pnpm', args, {
      cwd: fileURLToPath(new URL(`${project}/`, root)),
      stdio: 'inherit',
    });
    active.once('error', error => {
      console.error(`Cannot run pnpm: ${error.message}`);
      resolve(1);
    });
    active.once('exit', code => resolve(code ?? 1));
  });
  active = undefined;
  if (code !== 0) {
    process.exitCode ||= code;
    break;
  }
}
