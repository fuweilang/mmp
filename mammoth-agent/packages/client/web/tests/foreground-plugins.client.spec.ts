import { describe, expect, it } from 'vitest'
import { foregroundPluginIds } from '../src/foreground-plugins.ts'

describe('foregroundPluginIds', () => {
  it('includes the welcome plugin and the packages it injects', () => {
    const ids = foregroundPluginIds([
      { id: '@mammoth-ai/mmp-client-ui-settings-account', inject: ['@mammoth-ai/mmp-client-ui-layout'] },
      { id: '@mammoth-ai/mmp-client-ui-layout', inject: ['@mammoth-ai/mmp-client-ui-renderer'] },
      { id: '@mammoth-ai/mmp-client-ui-renderer' },
      { id: 'later', inject: ['@mammoth-ai/mmp-client-ui-renderer'] },
    ])
    expect([...ids].sort()).toEqual([
      '@mammoth-ai/mmp-client-ui-layout',
      '@mammoth-ai/mmp-client-ui-renderer',
      '@mammoth-ai/mmp-client-ui-settings-account',
    ])
  })

  it('is empty when the graph has none of the shell packages', () => {
    expect(foregroundPluginIds([{ id: 'consumer' }]).size).toBe(0)
  })
})
