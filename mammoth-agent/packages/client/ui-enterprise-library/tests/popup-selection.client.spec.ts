import { expect, it, vi } from 'vitest'
import { PopupSelectController } from '../../ui-commands/src/client/popup.ts'
it('multi-select popup waits for explicit confirmation and keeps the captured real session', async () => {
 const select = vi.fn(), consume = vi.fn(() => true), focus = vi.fn()
 const popup = new PopupSelectController({ consume, focusComposer: focus })
 popup.open('library', { multiple: true, confirmLabel: '加入草稿', options: async () => [{ id:'a',label:'甲' },{id:'b',label:'乙'},{id:'zip',label:'压缩包',disabled:true}], onSelect: select }, { sessionId:'real' }, { via:'enter',token:'/library' })
 await vi.waitFor(() => expect(popup.state.getSnapshot().status).toBe('ready'))
 await popup.select(0); await popup.select(1); await popup.select(2)
 expect(popup.state.getSnapshot().selectedIds).toEqual(['a','b']); expect(select).not.toHaveBeenCalled(); expect(consume).not.toHaveBeenCalled()
 await popup.confirmSelection(); expect(select).toHaveBeenCalledTimes(2); expect(select.mock.calls.every(x => x[1].sessionId === 'real')).toBe(true); expect(popup.state.getSnapshot().open).toBe(false); expect(consume).toHaveBeenCalledOnce()
})
it('batch failure leaves popup selection and draft token available for retry', async () => {
 const consume = vi.fn(() => true), select = vi.fn(async () => { throw new Error('draft frozen') })
 const popup = new PopupSelectController({ consume, focusComposer: () => {} })
 popup.open('library', { multiple:true, options:async () => [{id:'a',label:'甲'}], onSelect:select }, {}, { via:'enter',token:'/library' })
 await vi.waitFor(() => expect(popup.state.getSnapshot().status).toBe('ready')); await popup.select(0); await popup.confirmSelection()
 expect(popup.state.getSnapshot()).toMatchObject({ open:true, selectedIds:['a'], error:'draft frozen' }); expect(consume).not.toHaveBeenCalled()
})
