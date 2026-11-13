import { expect, it } from 'vitest';
import { agentWebUrl } from '../src/utils/agent';

it('opens the local expert runtime through the same-origin gateway so embedded trial messages are admitted', () => {
  expect(agentWebUrl).toBe(new URL('/agent/', window.location.origin).href);
});
