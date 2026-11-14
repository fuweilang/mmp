"use client"

import { useEffect } from "react"

/** 旧根路径书签（带智能体参数）和旧 PWA（独立窗口）仍然指向 /，统一转到 /agent/。 */
const AGENT_PARAMS = ["expertId", "expertPreview", "expertEmbed", "session", "workspaceId"]

export function LegacyAgentRedirect() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.pathname !== "/") return
    const hasAgentParam = AGENT_PARAMS.some((name) => url.searchParams.has(name))
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false
    if (!hasAgentParam && !standalone) return
    window.location.replace(`/agent/${url.search}`)
  }, [])
  return null
}
