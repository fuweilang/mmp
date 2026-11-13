import { gzipSync } from "node:zlib"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const out = path.resolve(import.meta.dirname, "../out")

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) files.push(...walk(full))
    else files.push({ full, size: stat.size })
  }
  return files
}

const files = walk(out)
const groups = new Map()
for (const file of files) {
  const ext = path.extname(file.full) || "(none)"
  const group = groups.get(ext) ?? { bytes: 0, gzip: 0, count: 0 }
  group.bytes += file.size
  group.count += 1
  if ([".js", ".css", ".html", ".txt", ".webp", ".png"].includes(ext)) {
    group.gzip += gzipSync(readFileSync(file.full), { level: 6 }).length
  }
  groups.set(ext, group)
}

const total = files.reduce((sum, file) => sum + file.size, 0)
console.log("\n官网构建体积（未压缩 / gzip 后）")
for (const [ext, group] of [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
  const raw = `${(group.bytes / 1024).toFixed(0)} KiB`
  const gzip = group.gzip ? ` / gzip ${(group.gzip / 1024).toFixed(0)} KiB` : ""
  console.log(`  ${ext.padEnd(8)} ${String(group.count).padStart(3)} 个  ${raw}${gzip}`)
}
console.log(`  合计     ${files.length} 个  ${(total / 1024).toFixed(0)} KiB`)
console.log("JS、CSS 已由 Next 压缩。gzip 数字是传输体积；线上要在 nginx 打开 gzip 或 brotli 才会按这个发。")
