/** Pull-driven Remote event frame queue owned by one Client event generation. */
import { Deque } from '@mammoth-ai/mmp-deque'
import type {
  RemoteEventCancellationFrame,
  RemoteEventEmitFrame,
  RemoteEventInvocationFrame,
} from './stream-protocol.ts'

type RemoteEventWireFrame =
  | RemoteEventEmitFrame
  | RemoteEventInvocationFrame
  | RemoteEventCancellationFrame

/** Pull-driven queue owned by one connected Client event generation. */
export class RemoteEventQueue {
  private readonly frames = new Deque<RemoteEventWireFrame>()
  private waiter: (() => void) | undefined
  private closed = false

  /**
   * Append one frame and wake a waiting consumer.
   * @param frame - the next frame for the Client stream.
   */
  push(frame: RemoteEventWireFrame): void {
    if (this.closed) return
    this.frames.pushBack(frame)
    this.waiter?.()
  }

  /** End the stream after the buffered frames, waking a waiting consumer. */
  end(): void {
    if (this.closed) return
    this.closed = true
    this.waiter?.()
  }

  /**
   * Yield buffered and later frames until the queue ends or `signal` aborts.
   * An abort discards the frames still buffered, so a revoked Peer receives none of them.
   * @param signal - Client generation lifetime.
   * @returns the queued wire frames in push order.
   */
  async *iterate(signal: AbortSignal): AsyncGenerator<RemoteEventWireFrame> {
    const abort = (): void => { this.end() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (true) {
        while (this.frames.size > 0 && !signal.aborted) yield this.frames.popFront() as RemoteEventWireFrame
        if (this.closed || signal.aborted) return
        await new Promise<void>((resolve) => { this.waiter = resolve })
        this.waiter = undefined
      }
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }
}
