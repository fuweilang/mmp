/** Allow-listed cloud transcript projection: no tool payloads, reasoning or file bytes. */
import { basename } from 'node:path'
import { isAppendSurfaceEvent, type SessionEvent } from '@mammoth-ai/mmp-session'

export interface HistoryMessage { seq: number; role: 'user' | 'assistant'; text: string; time: string }
export interface HistoryExport { messages: HistoryMessage[]; files: string[] }

/** Extract only visible human prompts and assistant text from append history, retaining conversations across model-context compaction. */
export function exportHistory(surface: readonly SessionEvent[]): HistoryExport {
  const messages: HistoryMessage[] = []
  const files = new Set<string>()
  for (const event of surface) {
    if (!isAppendSurfaceEvent(event)) continue
    if (event.type !== 'assistant/message' && !(event.type === 'user/message' && event.data.source.kind === 'user')) continue
    const content = event.type === 'user/message' ? event.data.content : event.data.message.content
    const text = content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    // Attachment blocks stay on their source device; only a display name can leave it.
    for (const block of content) {
      if (block.type === 'text' || block.type === 'reasoning' || block.type === 'tool-call') continue
      const candidate = block.type === 'image' || block.type === 'file' ? block.attachment.name
        : 'name' in block && typeof block.name === 'string' ? block.name
        : 'filename' in block && typeof block.filename === 'string' ? block.filename : undefined
      if (candidate) files.add(basename(candidate.replaceAll('\\', '/')).slice(0, 255))
    }
    if (text || content.some(block => block.type !== 'reasoning' && block.type !== 'tool-call' && block.type !== 'text')) messages.push({ seq: event.seq, role: event.type === 'user/message' ? 'user' : 'assistant',
      text, time: new Date(event.time).toISOString() })
  }
  return { messages, files: [...files].slice(0, 1000) }
}

/** Session turn boundaries determine the replicated status, including interrupted restored work. */
export function historyTaskState(events: readonly SessionEvent[]): 'idle' | 'running' | 'completed' | 'interrupted' | 'error' {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!
    if (event.type === 'turn/start') return 'running'
    if (event.type === 'turn/end') {
      const kind = event.data.reason.kind
      return kind === 'completed' ? 'completed' : kind === 'error' ? 'error' : 'interrupted'
    }
  }
  return 'idle'
}
