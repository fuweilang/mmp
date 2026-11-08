/**
 * Bundled portraits for official Agents.
 * Same-key jpgs plus historical remaps from mammoth-platform-latest
 * official-agents.ts (ip→growth, gzh→copy, niche→data, sell→live,
 * method→trans, interview→qc). External CDN avatars are not vendored.
 */
import boss from './assets/avatars/boss.jpg'
import copy from './assets/avatars/copy.jpg'
import data from './assets/avatars/data.jpg'
import growth from './assets/avatars/growth.jpg'
import live from './assets/avatars/live.jpg'
import pyq from './assets/avatars/pyq.jpg'
import qc from './assets/avatars/qc.jpg'
import sifu from './assets/avatars/sifu.jpg'
import spy from './assets/avatars/spy.jpg'
import trans from './assets/avatars/trans.jpg'
import video from './assets/avatars/video.jpg'
import xhs from './assets/avatars/xhs.jpg'

const FILE_BY_NAME: Readonly<Record<string, string>> = {
  boss,
  copy,
  data,
  growth,
  live,
  pyq,
  qc,
  sifu,
  spy,
  trans,
  video,
  xhs,
}

/** Same-key files plus evidenced historical remaps. */
const BUNDLED_BY_KEY: Readonly<Record<string, string>> = {
  ...FILE_BY_NAME,
  ip: growth,
  gzh: copy,
  niche: data,
  sell: live,
  method: trans,
  interview: qc,
}

/** Prefer Ground avatarUrl; otherwise a bundled portrait when shipped. */
export function resolveCardAvatarSrc(key: string, avatarUrl: string | null | undefined): string | undefined {
  const remote = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''
  if (remote !== '') return remote
  return bundledOfficialAvatar(key)
}

export function bundledOfficialAvatar(key: string): string | undefined {
  return BUNDLED_BY_KEY[key]
}

export function hasBundledOfficialAvatar(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUNDLED_BY_KEY, key)
}
