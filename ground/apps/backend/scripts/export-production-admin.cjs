/** Read-only export of one local super-admin identity. Never prints the password hash. */
const { PrismaClient } = require('@prisma/client');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
(async () => {
  if (!process.argv[2]) throw new Error('Usage: node scripts/export-production-admin.cjs /private/path/admin-bootstrap.json');
  process.loadEnvFile(resolve(__dirname, '../.env'));
  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({ where: { phone: '13800000001' }, select: { id: true, phone: true, name: true, passwordHash: true, isPlatformAdmin: true } });
    if (!user || !user.isPlatformAdmin) throw new Error('Expected local super administrator was not found');
    writeFileSync(resolve(process.argv[2]), JSON.stringify(user), { mode: 0o600, flag: 'wx' });
    console.log('Exported the selected administrator only; keep this file private.');
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
