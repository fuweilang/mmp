import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const sql = process.argv[2];
try { console.log(JSON.stringify(await p.$queryRawUnsafe(sql), (k,v)=>typeof v==='bigint'?Number(v):v, 2)); }
catch(e){ console.error('ERR:', e.code, e.message.slice(0,300)); }
finally { await p.$disconnect(); }
