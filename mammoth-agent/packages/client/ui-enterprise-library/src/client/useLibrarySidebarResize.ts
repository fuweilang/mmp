import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type { HostObservable } from '@mammoth-ai/mmp-client-ui-slots'

const STORAGE_KEY = 'mmp.library.navigation.width'
const MIN_WIDTH = 200
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 280

function clamp(width: number): number { return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) }

function readWidth(): number {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored?.trim()) return DEFAULT_WIDTH
    const width = Number(stored)
    return Number.isFinite(width) ? clamp(width) : DEFAULT_WIDTH
  } catch { return DEFAULT_WIDTH }
}

function saveWidth(width: number): void {
  try { window.localStorage.setItem(STORAGE_KEY, String(Math.round(width))) }
  catch { /* The current width remains usable when local storage is restricted. */ }
}

type Drag = {
  element: HTMLDivElement
  pointerId: number
  startX: number
  startWidth: number
  maxWidth: number
  userSelect: string
  cursor: string
}

/** Local directory sizing; completed interactions persist independently of library data. */
export function useLibrarySidebarResize(visibleWidth: number | null, setNavigationElement: (element: HTMLElement | null) => void) {
  const [width, setWidth] = useState(readWidth)
  const [resizing, setResizing] = useState(false)
  const currentWidth = useRef(width)
  const drag = useRef<Drag | null>(null)
  const pageRef = useRef<HTMLElement>(null)
  const navigationRef = useRef<HTMLElement | null>(null)
  const attachNavigation = useCallback((element: HTMLElement | null) => {
    navigationRef.current = element
    setNavigationElement(element)
  }, [setNavigationElement])
  const updateWidth = useCallback((next: number) => {
    currentWidth.current = clamp(next)
    setWidth(currentWidth.current)
  }, [])
  const finish = useCallback(() => {
    const active = drag.current
    if (!active) return
    drag.current = null
    if (active.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId)
    document.body.style.userSelect = active.userSelect
    document.body.style.cursor = active.cursor
    saveWidth(currentWidth.current)
    setResizing(false)
  }, [])
  useEffect(() => {
    window.addEventListener('blur', finish)
    return () => { window.removeEventListener('blur', finish); finish() }
  }, [finish])

  const availableMax = () => {
    const containerWidth = pageRef.current?.getBoundingClientRect().width ?? 0
    return containerWidth > 0 ? clamp(containerWidth - 320) : MAX_WIDTH
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      element: event.currentTarget, pointerId: event.pointerId, startX: event.clientX,
      startWidth: navigationRef.current?.getBoundingClientRect().width || currentWidth.current,
      maxWidth: availableMax(), userSelect: document.body.style.userSelect, cursor: document.body.style.cursor,
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    setResizing(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (active?.pointerId !== event.pointerId) return
    updateWidth(Math.min(active.maxWidth, active.startWidth + event.clientX - active.startX))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    onPointerMove(event)
    finish()
  }
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) finish()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? availableMax()
      : Math.min(availableMax(), (navigationRef.current?.getBoundingClientRect().width || currentWidth.current) + (event.key === 'ArrowRight' ? 16 : -16))
    updateWidth(next)
    saveWidth(currentWidth.current)
  }
  const style: CSSProperties & { '--library-navigation-width': string } = { '--library-navigation-width': `${width}px` }
  return {
    width, resizing, style, pageRef, attachNavigation,
    separatorProps: {
      role: 'separator', 'aria-orientation': 'vertical', 'aria-valuemin': MIN_WIDTH,
      'aria-valuemax': MAX_WIDTH, 'aria-valuenow': Math.round(visibleWidth ?? width), tabIndex: 0,
      onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture: onPointerCancel, onKeyDown,
    } as const,
  }
}

/** Injection-owned measurement publishes CSS-resolved pixels for separator accessibility. */
export function createLibraryNavigationMeasurement() {
  let width: number | null = null
  let observer: ResizeObserver | undefined
  const listeners = new Set<() => void>()
  const publish = (next: number | null) => {
    if (width === next) return
    width = next
    for (const listener of listeners) listener()
  }
  const source: HostObservable<number | null> = {
    getSnapshot: () => width,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  const attach = (element: HTMLElement | null) => {
    observer?.disconnect()
    observer = undefined
    if (!element) { publish(null); return }
    const measure = () => {
      const measured = element.getBoundingClientRect().width
      publish(measured > 0 ? measured : null)
    }
    // CSS sizes the track; only its pixel-valued ARIA readout needs observation.
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(element)
    }
    measure()
  }
  return { source, attach, dispose: () => { observer?.disconnect(); listeners.clear() } }
}
