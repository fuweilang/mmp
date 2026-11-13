/**
 * RPC response envelopes: success encoding with byte attachments, failure
 * mapping into the Connection result vocabulary, and endpoint naming.
 * @module @mammoth-ai/mmp-api-gateway/envelope
 */

import type {
  ConnectionRpcAttachment,
  ConnectionRpcHandler,
} from '@mammoth-ai/mmp-client-connection'
import type { TypertCodec } from '@mammoth-ai/mmp-typert-protocol'
import { remoteErrorOf } from '@mammoth-ai/mmp-typert-protocol'
import type { RemoteStreamFailure } from './stream-protocol.ts'

/** The carrier's settled RPC result envelope. */
export type ConnectionRpcResult = Awaited<ReturnType<ConnectionRpcHandler>>
/** The carrier's failure member inside {@link ConnectionRpcResult}. */
export type ConnectionRpcError = Extract<ConnectionRpcResult, { readonly ok: false }>['error']

/**
 * Encode one successful result, moving `Uint8Array` leaves into attachments.
 * @param value - the method's return value.
 * @param codec - the descriptor codec; strict codecs own their encoding.
 * @returns the carrier result envelope.
 */
export function encodeRpcResult(value: unknown, codec: TypertCodec): ConnectionRpcResult {
  const attachments: ConnectionRpcAttachment[] = []
  const writeBytes = (bytes: Uint8Array, path: readonly (string | number)[]): null => {
    attachments.push({ path: [...path], bytes })
    return null
  }
  const encoded = codec.mode === 'strict'
    ? codec.encode?.(value, writeBytes) ?? value
    : encodeRuntimeResult(value, writeBytes)
  return { ok: true, value: encoded, ...(attachments.length === 0 ? {} : { attachments }) }
}

function encodeRuntimeResult(
  input: unknown,
  writeBytes: (bytes: Uint8Array, path: readonly (string | number)[]) => null,
): unknown {
  const path: (string | number)[] = []
  const ancestors = new Set<object>()
  const extract = (input: unknown, key: string): unknown => {
    // Capture accessors and toJSON once, before materializing the JSON metadata.
    let value = input
    if (input !== null && typeof input === 'object' && !(input instanceof Uint8Array)) {
      const toJSON: unknown = Reflect.get(input, 'toJSON')
      if (typeof toJSON === 'function') value = Reflect.apply(toJSON, input, [key])
    }
    if (value instanceof Uint8Array) return writeBytes(value, path)
    if (typeof value !== 'object' || value === null) return value
    if (value instanceof Number || value instanceof String || value instanceof Boolean) return value.valueOf()
    if (ancestors.has(value)) throw new TypeError('gateway: circular RPC result')
    ancestors.add(value)
    let copy: object
    if (Array.isArray(value)) {
      const items: unknown[] = []
      // JSON arrays include every index, even holes and non-enumerable elements.
      for (let index = 0, length = value.length; index < length; index++) items.push(child(value[index], index))
      copy = items
    } else {
      const fields: Record<string, unknown> = {}
      for (const key of Object.keys(value)) {
        const item: unknown = Reflect.get(value, key)
        // A toJSON method on the projected object must not run a second time.
        if (key === 'toJSON' && typeof item === 'function') continue
        const extracted = child(item, key)
        if (key === '__proto__') Object.defineProperty(fields, key, { value: extracted, enumerable: true })
        else fields[key] = extracted
      }
      copy = fields
    }
    ancestors.delete(value)
    return copy
  }
  const child = (value: unknown, key: string | number): unknown => {
    if (typeof value !== 'object' || value === null) return value
    path.push(key)
    const extracted = extract(value, String(key))
    path.pop()
    return extracted
  }
  return extract(input, 'value')
}

/**
 * Map any thrown value into the carrier's failure envelope.
 * @param error - the thrown value; Remote failures keep their code, message, and details.
 * @returns the carrier failure envelope.
 */
export function rpcFailure(error: unknown): ConnectionRpcResult {
  const remote = remoteErrorOf(error)
  if (remote !== undefined) {
    return { ok: false, error: { code: remote.code, message: remote.message, details: remote.details } }
  }
  return {
    ok: false,
    error: {
      code: 'gateway/internal',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}

/**
 * Project any thrown value onto the stream carrier's failure member.
 * @param error - the value a stream or upgrade failed with.
 * @returns the same failure as the stream carrier's failure member.
 */
export function rpcError(error: unknown): ConnectionRpcError & RemoteStreamFailure {
  return (rpcFailure(error) as Extract<ConnectionRpcResult, { readonly ok: false }>).error
}

/**
 * Compose the canonical endpoint both failures and dispatch keys use.
 * @param namespace - Remote namespace segment.
 * @param method - Remote method segment.
 * @returns the canonical `<namespace>/<method>` endpoint.
 */
export function endpointOf(namespace: string, method: string): string {
  return `${namespace}/${method}`
}
