"use client"

import { useEffect, useState } from "react"
import { downloads, webAppUrl } from "@/lib/site"

const primary =
  "inline-flex items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover"

const secondary =
  "inline-flex items-center justify-center rounded-xl border border-brand bg-white px-5 py-3 text-sm font-semibold text-brand hover:bg-brand-soft"

const fileLink =
  "inline-flex items-center justify-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"

/** 平台顺序固定；manifest 没有的平台不渲染按钮。 */
const PLATFORMS = [
  { key: "darwin-arm64", label: "Mac（Apple 芯片）", fallback: downloads.macArm },
  { key: "darwin-amd64", label: "Mac（Intel）", fallback: downloads.macIntel },
  { key: "windows-amd64", label: "Windows", fallback: downloads.windows },
] as const

interface ManifestPlatform {
  file?: unknown
}

interface Manifest {
  platforms?: Record<string, ManifestPlatform | undefined>
}

/** 只接受下载目录里的安全文件名，避免 manifest 被篡改成外链。 */
function manifestHref(file: unknown): string | undefined {
  return typeof file === "string" && /^[\w.-]+\.(dmg|exe)$/.test(file) ? `/downloads/${file}` : undefined
}

export function ActionPair({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <a className={primary} href="#download">
        下载客户端
      </a>
      <a className={secondary} href={webAppUrl}>
        打开网页版
      </a>
    </div>
  )
}

export function DownloadFiles() {
  // 首屏用固定别名兜底；拿到 manifest 后切到版本化文件，避免“页面新、包里旧”。
  const [manifest, setManifest] = useState<Manifest | null>(null)

  useEffect(() => {
    let active = true
    fetch("/downloads/mammoth-latest.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        if (active && value !== null && typeof value === "object") setManifest(value as Manifest)
      })
      .catch(() => {
        /* 没有 manifest（无客户端版本）时保留别名按钮 */
      })
    return () => {
      active = false
    }
  }, [])

  const entries = manifest
    ? PLATFORMS.flatMap((platform) => {
        const entry = manifest.platforms?.[platform.key]
        if (!entry) return []
        return [{ key: platform.key, label: platform.label, href: manifestHref(entry.file) ?? platform.fallback }]
      })
    : PLATFORMS.map((platform) => ({ key: platform.key, label: platform.label, href: platform.fallback }))
  const hasWindows = entries.some((entry) => entry.key === "windows-amd64")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {entries.map((entry) => (
          <a key={entry.key} className={fileLink} href={entry.href}>
            {entry.label}
          </a>
        ))}
      </div>
      <p className="text-xs leading-5 text-muted">
        {hasWindows
          ? "Windows 安装包若未签名，系统会提示未知发布者，确认后仍可安装。装好后没有应用内自动更新，新版本请回到本页下载。"
          : "Windows 版暂未提供，请先使用 Mac 版或网页版。"}
      </p>
    </div>
  )
}
