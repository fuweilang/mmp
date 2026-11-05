const { execSync } = require('child_process');
const port = process.env.PORT || 3100;
try {
  const pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
  if (pids) execSync(`kill ${pids.split('\n').join(' ')}`);
} catch {
  // port already free
}
