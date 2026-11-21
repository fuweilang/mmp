import fs from 'node:fs';
import { spawn } from 'node:child_process';

const file = process.argv[2];
const nodeArgs = process.argv.slice(3);
if (!file || nodeArgs.length === 0) {
  console.error('用法: node scripts/wait-for-file.mjs <file> <node args...>');
  process.exit(1);
}

const deadline = Date.now() + 120_000;
while (!fs.existsSync(file)) {
  if (Date.now() > deadline) {
    console.error(`等待编译产物超时：${file}`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const child = spawn(process.execPath, nodeArgs, { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
