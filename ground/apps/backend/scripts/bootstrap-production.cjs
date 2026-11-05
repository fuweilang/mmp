/** Initialize a NEW database only: built-in permission packs and one preserved super administrator. */
const { readFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { BUILTIN_ROLE_KEYS, ROLE_META, ROLE_PERMISSION_PACKS } = require('../dist/permissions/catalog.js');
(async () => {
  const file = process.env.BOOTSTRAP_ADMIN_FILE;
  if (!file) throw new Error('Set BOOTSTRAP_ADMIN_FILE to the private exported administrator JSON');
  const user = JSON.parse(readFileSync(file, 'utf8'));
  if (user.phone !== '13800000001' || typeof user.id !== 'string' || typeof user.name !== 'string'
    || typeof user.passwordHash !== 'string' || !/^\$2[aby]\$\d\d\$/.test(user.passwordHash)) throw new Error('Invalid administrator export');
  const db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      if (await tx.user.count() || await tx.tenant.count()) throw new Error('Refusing to bootstrap a nonempty database; no data was deleted');
      for (const key of BUILTIN_ROLE_KEYS) {
        const meta = ROLE_META[key];
        const data = { key, name: meta.name, description: meta.description, scope: meta.scope, builtIn: true, editable: meta.editable };
        const role = await tx.role.upsert({ where: { key }, create: data, update: data });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({ data: ROLE_PERMISSION_PACKS[key].map(permKey => ({ roleId: role.id, permKey })) });
      }
      const admin = await tx.user.create({ data: { id: user.id, phone: user.phone, name: user.name, passwordHash: user.passwordHash, isPlatformAdmin: true, status: 'active' } });
      const role = await tx.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
      await tx.userRole.create({ data: { userId: admin.id, roleId: role.id } });
    }, { timeout: 30000 });
    console.log('Initialized built-in roles and the preserved administrator. No demo users, enterprises or balances were imported.');
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
