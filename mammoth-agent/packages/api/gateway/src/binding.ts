/**
 * Argument validation and service-binding resolution for dispatched Remote
 * calls: descriptor codecs, exact argument sets, and the SRC parameter-name
 * contract.
 * @module @mammoth-ai/mmp-api-gateway/binding
 */

import { symbols } from '@mammoth-ai/cordis'
import type {
  InvocationDescriptor,
  TypertCodec,
  TypertGatewayBinding,
} from '@mammoth-ai/mmp-typert-protocol'
import { TypertGatewayError } from './errors.ts'

/** One Service's validated `typertRemote` binding and its original object. */
export interface ResolvedBinding {
  readonly binding: TypertGatewayBinding
  readonly original: object
}

/**
 * Resolve one Service's visible `typertRemote` binding.
 * @param receiver - the Service instance the call dispatches to.
 * @param serviceKey - Cordis service key naming the receiver.
 * @param namespace - Remote namespace the call addressed.
 * @param endpoint - canonical endpoint named in failures.
 * @returns the validated binding plus the Service's original object.
 */
export function validateBinding(
  receiver: object,
  serviceKey: string,
  namespace: string,
  endpoint: string,
): ResolvedBinding {
  const original = originalOf(receiver)
  const value: unknown = Reflect.get(original, 'typertRemote')
  if (value === undefined) {
    throw new TypertGatewayError(
      'gateway/binding-invalid',
      endpoint,
      `Service ${JSON.stringify(serviceKey)} has no visible typertRemote binding`,
    )
  }
  return {
    binding: readBinding(value, original, serviceKey, endpoint, namespace),
    original,
  }
}

/**
 * Accept a binding only when it names this Service, key, and namespace.
 * @param value - the candidate `typertRemote` value.
 * @param original - the Service's original object the binding must name.
 * @param serviceKey - Cordis service key naming the receiver.
 * @param endpoint - canonical endpoint named in failures.
 * @param namespace - Remote namespace the call addressed, when the caller knows it.
 * @returns the accepted binding.
 */
export function readBinding(
  value: unknown,
  original: object,
  serviceKey: string,
  endpoint: string,
  namespace?: string,
): TypertGatewayBinding {
  if (!isObject(value)
    || Reflect.get(value, 'service') !== original
    || Reflect.get(value, 'serviceKey') !== serviceKey
    || typeof Reflect.get(value, 'namespace') !== 'string'
    || (namespace !== undefined && Reflect.get(value, 'namespace') !== namespace)) {
    throw new TypertGatewayError(
      'gateway/binding-invalid',
      endpoint,
      `Service ${JSON.stringify(serviceKey)} has an inconsistent typertRemote binding`,
    )
  }
  return value as TypertGatewayBinding
}

/**
 * Resolve the Service object behind a Cordis view wrapper.
 * @param receiver - the Service instance or view a call dispatches to.
 * @returns the Service's original object when wrapped by `symbols.original`.
 */
export function originalOf(receiver: object): object {
  const original: unknown = Reflect.get(receiver, symbols.original)
  return isObject(original) ? original : receiver
}

/**
 * Read one SRC method's parameter names from its JavaScript signature.
 * @param service - the Service instance owning the method.
 * @param method - the method name.
 * @param endpoint - canonical endpoint named in failures.
 * @returns the parameter names in signature order.
 */
export function methodParameterNames(service: object, method: string, endpoint: string): readonly string[] {
  let prototype: object | null = Object.getPrototypeOf(service) as object | null
  let implementation: ((this: object, ...args: never[]) => unknown) | undefined
  while (prototype !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, method)
    if (descriptor !== undefined) {
      if ('value' in descriptor && typeof descriptor.value === 'function') {
        implementation = descriptor.value as (this: object, ...args: never[]) => unknown
      }
      break
    }
    prototype = Object.getPrototypeOf(prototype) as object | null
  }
  if (implementation === undefined) {
    throw new TypertGatewayError(
      'gateway/method-unavailable',
      endpoint,
      `Remote marker has no prototype method ${JSON.stringify(method)}`,
    )
  }
  const source = Function.prototype.toString.call(implementation)
  const open = source.indexOf('(')
  const close = source.indexOf(')', open + 1)
  /* v8 ignore next -- standard public class-method syntax always contains a parenthesized parameter list. */
  if (open < 0 || close < 0) return invalidSignature(endpoint, method)
  const body = source.slice(open + 1, close).trim()
  if (body.length === 0) return []
  const parts = body.split(',').map(part => part.trim())
  const names = new Set<string>()
  for (const part of parts) {
    if (!/^[$A-Z_a-z][$\w]*$/u.test(part) || names.has(part)) return invalidSignature(endpoint, method)
    names.add(part)
  }
  return [...names]
}

function invalidSignature(endpoint: string, method: string): never {
  throw new TypertGatewayError(
    'gateway/signature-invalid',
    endpoint,
    `SRC method ${JSON.stringify(method)} must use unique identifier parameters without destructuring, defaults, or rest`,
  )
}

/**
 * Refuse an argument object whose fields do not match the descriptor.
 * @param args - the wire argument object.
 * @param descriptor - the resolved invocation descriptor.
 * @param endpoint - canonical endpoint named in failures.
 */
export function assertExactArguments(
  args: Readonly<Record<string, unknown>>,
  descriptor: InvocationDescriptor,
  endpoint: string,
): void {
  if (!isPlainObject(args)) {
    throw new TypertGatewayError('gateway/arguments-invalid', endpoint, 'args must be a plain object')
  }
  const expected = new Set(descriptor.parameters.map(parameter => parameter.wire))
  if (descriptor.invocation.kind === 'context') expected.add(descriptor.invocation.wire)
  const actual = Reflect.ownKeys(args)
  const extra = actual.filter(key => typeof key !== 'string' || !expected.has(key))
  // A JSON field may be omitted when the strict descriptor declares absence,
  // and always under SRC: a weak descriptor reads parameter names from the
  // JavaScript signature and cannot see which are optional, so LIB is where an
  // omitted required argument is caught. Lookup ids are never omissible.
  const acceptsMissing = new Set(descriptor.parameters
    .filter(parameter => parameter.source === 'json'
      && (parameter.acceptsUndefined === true || parameter.codec.mode === 'src-json'))
    .map(parameter => parameter.wire))
  const missing = [...expected].filter(key => !Object.hasOwn(args, key) && !acceptsMissing.has(key))
  if (extra.length === 0 && missing.length === 0) return
  const clauses: string[] = []
  if (missing.length > 0) clauses.push(`missing ${missing.map(key => JSON.stringify(key)).join(', ')}`)
  if (extra.length > 0) clauses.push(`unexpected ${extra.map(key => JSON.stringify(String(key))).join(', ')}`)
  throw new TypertGatewayError('gateway/arguments-invalid', endpoint, `args fields do not match the descriptor: ${clauses.join('; ')}`)
}

/**
 * Decode every present JSON argument once through its parameter codec; a
 * Typert codec drops object fields its compiled type does not declare. Lookup
 * and Context identities keep their wire values; dispatch decodes and resolves
 * them only after the access check. An absent field stays absent; a present
 * `undefined` is not JSON-safe and fails decoding.
 * @param descriptor - the resolved invocation descriptor.
 * @param args - the wire argument object.
 * @param endpoint - canonical endpoint named in failures.
 * @returns the decoded argument object.
 */
export function validateArguments(
  descriptor: InvocationDescriptor,
  args: Readonly<Record<string, unknown>>,
  endpoint: string,
): Readonly<Record<string, unknown>> {
  const entries: [string, unknown][] = []
  if (descriptor.invocation.kind === 'context') entries.push([descriptor.invocation.wire, args[descriptor.invocation.wire]])
  for (const parameter of descriptor.parameters) {
    if (!Object.hasOwn(args, parameter.wire)) continue
    const value = args[parameter.wire]
    entries.push([parameter.wire, parameter.source === 'json' ? decode(parameter.codec, value, endpoint, parameter.wire) : value])
  }
  return Object.fromEntries(entries)
}

/**
 * Decode or validate one wire value through its codec.
 * @param codec - the parameter or uplink codec.
 * @param value - the wire value.
 * @param endpoint - canonical endpoint named in failures.
 * @param field - affected wire field named in failures.
 * @returns the accepted JSON value.
 */
export function decode(
  codec: TypertCodec,
  value: unknown,
  endpoint: string,
  field: string,
): unknown {
  try {
    if (codec.mode === 'strict') {
      value = codec.create().parse(value)
      /* v8 ignore next -- generated optional-input codecs are the only strict codecs that return undefined. */
      if (value === undefined) return value
    }
    assertJsonValue(value, new Set())
    return value
  } catch (cause) {
    throw new TypertGatewayError(
      'gateway/input-invalid',
      endpoint,
      `wire field ${JSON.stringify(field)} failed boundary validation`,
      { cause, field },
    )
  }
}

/**
 * Refuse any value that would not survive a JSON round trip unchanged.
 * @param value - the candidate JSON value.
 * @param ancestors - objects on the current descent path, for cycle detection.
 */
export function assertJsonValue(value: unknown, ancestors: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new TypeError('non-finite number is not JSON-safe')
  }
  if (!isObject(value)) throw new TypeError(`${typeof value} is not JSON-safe`)
  if (ancestors.has(value)) throw new TypeError('cyclic value is not JSON-safe')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) {
        throw new TypeError('sparse or decorated array is not JSON-safe')
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('sparse array is not JSON-safe')
        assertJsonValue(value[index], ancestors)
      }
      return
    }
    if (!isPlainObject(value)) throw new TypeError('non-plain object is not JSON-safe')
    if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError('symbol property is not JSON-safe')
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      /* v8 ignore next -- ownKeys() just returned this key; only a hostile same-process Proxy can delete it between operations. */
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError('non-data property is not JSON-safe')
      }
      assertJsonValue(descriptor.value, ancestors)
    }
  } finally {
    ancestors.delete(value)
  }
}

/**
 * Whether an object carries only indexed data fields.
 * @param value - the candidate object.
 * @returns whether the value has a null or `Object.prototype` prototype.
 */
export function isPlainObject(value: object): value is Record<string, unknown> {
  if (Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === null || prototype === Object.prototype
}

/**
 * Whether a value can carry properties, functions included.
 * @param value - the candidate value.
 * @returns whether the value is an object or function.
 */
export function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}
