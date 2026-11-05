import os from 'node:os';

function lanUrls(port) {
  const out = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
    }
  }
  return out;
}

const g = 5201;
const lans = lanUrls(g);
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 浏览器请开（网关）:
   Local:   http://127.0.0.1:${g}
${lans.map((u) => `   Network: ${u}`).join('\n') || '   Network: (无局域网地址)'}
 中台 web 直连 :5202 / api :3100（一般不用开）
 还须另开: pnpm octop  （:8088 + :5203）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
