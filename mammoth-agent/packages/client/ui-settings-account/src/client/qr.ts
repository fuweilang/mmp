/**
 * Minimal QR Code encoder (byte mode, ECC level M) for payment code URLs.
 * Adapted from Project Nayuki's QR Code generator (MIT License).
 */

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
/** ECC level M format bits. */
const FORMAT_BITS_M = 0

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function dataCodewords(ver: number): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver]! * BLOCKS_M[ver]!
}

function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xFF
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j]!, root)
      if (j + 1 < result.length) result[j] = result[j]! ^ result[j + 1]!
    }
    root = gfMul(root, 0x02)
  }
  return result
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ result.shift()!
    result.push(0)
    divisor.forEach((coef, i) => { result[i] = result[i]! ^ gfMul(coef, factor) })
  }
  return result
}

function alignmentPositions(ver: number, size: number): number[] {
  if (ver === 1) return []
  const numAlign = Math.floor(ver / 7) + 2
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2
  const result: number[] = []
  for (let i = 0, pos = size - 7; i < numAlign - 1; i++, pos -= step) result.unshift(pos)
  result.unshift(6)
  return result
}

const bit = (x: number, i: number): boolean => ((x >>> i) & 1) !== 0

/**
 * Encode text into a QR matrix.
 * @param text - UTF-8 payload (e.g. weixin://… or https://qr.alipay.com/…).
 * @param forcedMask - mask 0–7, or -1 to choose by penalty.
 * @returns rows of dark (true) / light (false) modules.
 */
export function encodeQr(text: string, forcedMask = -1): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  let ver = 1
  for (; ; ver++) {
    if (ver > 40) throw new Error('QR payload too long')
    const used = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8
    if (used <= dataCodewords(ver) * 8) break
  }
  // Data bit stream
  const bits: number[] = []
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  push(0x4, 4)
  push(bytes.length, ver < 10 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  const capacity = dataCodewords(ver) * 8
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) push(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]!
    data.push(v)
  }
  // ECC + interleave
  const numBlocks = BLOCKS_M[ver]!
  const eccLen = ECC_PER_BLOCK_M[ver]!
  const rawCodewords = Math.floor(rawDataModules(ver) / 8)
  const numShort = numBlocks - (rawCodewords % numBlocks)
  const shortLen = Math.floor(rawCodewords / numBlocks)
  const div = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, div)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(block[i]!)
    })
  }
  // Matrix
  const size = ver * 4 + 17
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const setFn = (x: number, y: number, dark: boolean) => { modules[y]![x] = dark; fn[y]![x] = true }
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0) }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = cx + dx, yy = cy + dy
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }
  const align = alignmentPositions(ver, size)
  const n = align.length
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setFn(align[i]! + dx, align[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }
  const drawFormat = (mask: number) => {
    const d = (FORMAT_BITS_M << 3) | mask
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const f = ((d << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(f, i))
    setFn(8, 7, bit(f, 6)); setFn(8, 8, bit(f, 7)); setFn(7, 8, bit(f, 8))
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(f, i))
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(f, i))
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(f, i))
    setFn(8, size - 8, true)
  }
  drawFormat(0)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25)
    const v = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3)
      setFn(a, b, bit(v, i)); setFn(b, a, bit(v, i))
    }
  }
  // Codewords zig-zag
  let idx = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!fn[y]![x] && idx < codewords.length * 8) {
          modules[y]![x] = bit(codewords[idx >>> 3]!, 7 - (idx & 7))
          idx++
        }
      }
    }
  }
  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let invert: boolean
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break
          case 1: invert = y % 2 === 0; break
          case 2: invert = x % 3 === 0; break
          case 3: invert = (x + y) % 3 === 0; break
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
        }
        if (!fn[y]![x] && invert) modules[y]![x] = !modules[y]![x]
      }
    }
  }
  let mask = forcedMask
  if (mask < 0) {
    let best = Infinity
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m)
      const p = penalty(modules)
      if (p < best) { best = p; mask = m }
      applyMask(m) // XOR undo
    }
  }
  applyMask(mask)
  drawFormat(mask)
  return modules
}

/** Simplified ISO penalty (rules 1, 2, 4); any mask decodes, this only improves scan robustness. */
function penalty(m: boolean[][]): number {
  const size = m.length
  let result = 0
  for (let y = 0; y < size; y++) {
    for (const horizontal of [true, false]) {
      let run = 1
      for (let x = 1; x < size; x++) {
        const cur = horizontal ? m[y]![x] : m[x]![y]
        const prev = horizontal ? m[y]![x - 1] : m[x - 1]![y]
        if (cur === prev) { run++; if (run === 5) result += 3; else if (run > 5) result++ }
        else run = 1
      }
    }
  }
  let dark = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (m[y]![x]) dark++
      if (y < size - 1 && x < size - 1) {
        const c = m[y]![x]
        if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) result += 3
      }
    }
  }
  const total = size * size
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
  return result
}
