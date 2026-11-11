import { expect, it, vi } from 'vitest'
import { SessionId } from '@mammoth-ai/mmp-session'
import { GroundRequestAttribution } from '../src/attribution.ts'

it('owns one final wire guard per session and safely releases either lifecycle before replacement', () => {
  const service = new GroundRequestAttribution(), sessionId = SessionId('guard-owner'), guard = vi.fn()
  const request = {provider: 'mammoth-ground', model: 'auto', sessionId, messages: []}
  const dispose = service.guard(sessionId, guard)
  service.validateWire(request, {messages: []})
  expect(guard).toHaveBeenCalledOnce()
  expect(() => service.guard(sessionId, guard)).toThrow('already registered')
  dispose(); dispose()
  service.validateWire(request, {messages: []})
  expect(guard).toHaveBeenCalledOnce()
  service.guard(sessionId, guard)
  service.validateWire(request, {messages: []})
  expect(guard).toHaveBeenCalledTimes(2)
})
