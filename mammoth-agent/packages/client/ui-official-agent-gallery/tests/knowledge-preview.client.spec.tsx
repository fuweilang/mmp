// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpertPreviewEntry, isEmbeddedExpertPreview, parseExpertPreview } from '../src/client/ExpertPreviewEntry.tsx';
import { KnowledgeSources } from '../src/client/KnowledgeSources.tsx';
import { CompactExpertMessages } from '../src/client/CompactExpertPreview.tsx';
const t = (key: string) => key;
it('keeps retrieval-only sources hidden while waiting and reveals them with the first answer text', () => {
    const chat:any={nodes:[{kind:'user',seq:1,content:[{type:'text',text:'用户问题'}]},{kind:'assistant',seq:2,turn:1,blocks:[]}],partial:null};
    const props:any={sessionId:'preview',useChat:(select:any)=>select({legacy:chat}),useSession:(select:any)=>select({running:true,promptError:null}),usePreviewProfile:(select:any)=>select({name:'专家',avatarUrl:null}),useProjection:()=>[{recordId:'record',turn:1,messageId:'m',label:'T1L1S1',title:'资料',locator:'第1段'}],reportContent:vi.fn(),openSource:vi.fn(),chatText:t,t};
    const view=render(<CompactExpertMessages {...props}/>);
    expect(view.container.querySelector('details')).toBeNull();
    expect(view.container.querySelector('[data-role="assistant-waiting"]')).not.toBeNull();
    chat.partial={turn:1,blocks:[{kind:'text',text:'根据资料回答'}]};
    view.rerender(<CompactExpertMessages {...props}/>);
    expect(view.container.textContent).toContain('根据资料回答');
    expect(view.container.querySelector('details')).not.toBeNull();
    view.unmount();
});
it('opens only the immutable expertPreview URL identity through the supplied standard launch capability', async () => {
    const target = parseExpertPreview('?expertPreview=preview-one&expertId=expert-one')!;
    const launch = vi.fn(async () => undefined);
    render(<ExpertPreviewEntry target={target} launch={launch} t={t as never}/>);
    await waitFor(() => expect(launch).toHaveBeenCalledWith(target));
    expect(parseExpertPreview('?expertId=expert-one')).toBeNull();
});
it('old citation opens its owning record and unknown generated labels have no clickable source', async () => {
    const open = vi.fn(async () => ({ text: 'Exact older revision', locator: { page: 2 } }));
    render(<KnowledgeSources sources={[{ recordId: 'old-record', turn: 1, messageId: 'm1', label: 'T1L1S1', title: 'Old document', locator: 'page2' }, { recordId: 'new-record', turn: 2, messageId: 'm2', label: 'T2L1S1', title: 'New document', locator: 'page3' }]} open={open} t={t as never}/>);
    fireEvent.click(screen.getByRole('button', { name: /T1L1S1/ }));
    await screen.findByText('Exact older revision');
    expect(open).toHaveBeenCalledWith('old-record', 'T1L1S1');
    expect(screen.queryByRole('button', { name: 'S99' })).toBeNull();
});
it('a header rerender does not strand a pending exact source open', async () => {
    let finish!: (value: {text: string; locator: unknown}) => void;
    const pending = new Promise<{text: string; locator: unknown}>(resolve => {finish = resolve});
    const source = [{recordId: 'pending-record', turn: 1, messageId: 'm', label: 'T3L1S1', title: 'Pending source', locator: 'page1'}];
    const view = render(<KnowledgeSources sources={source} open={() => pending} t={t as never}/>);
    fireEvent.click(screen.getByRole('button', {name: /T3L1S1/}));
    view.rerender(<KnowledgeSources sources={source} open={() => pending} t={t as never}/>);
    finish({text: 'Exact pending body', locator: {page: 1}});
    await screen.findByText('Exact pending body');
    expect(screen.getByRole('button', {name: /T3L1S1/}).hasAttribute('disabled')).toBe(false);
});


it('isolates compact presentation only for an explicit valid expert embed launch', () => {
    expect(isEmbeddedExpertPreview('?expertPreview=p&expertId=e&expertEmbed=1')).toBe(true);
    expect(isEmbeddedExpertPreview('?expertPreview=p&expertId=e')).toBe(false);
    expect(isEmbeddedExpertPreview('?expertPreview=p&expertId=e&expertEmbed=0')).toBe(false);
    expect(isEmbeddedExpertPreview('?expertEmbed=1')).toBe(false);
    expect(isEmbeddedExpertPreview('?expertPreview=p&expertEmbed=1')).toBe(false);
});

it('embedded startup omits the standalone preview heading and expiry description', () => {
    const target={agentId:'expert-one',previewId:'preview-one'};
    const view=render(<ExpertPreviewEntry embedded target={target} launch={()=>new Promise(()=>{})} t={t as never}/>);
    expect(view.container.querySelector('h2')).toBeNull();
    expect(view.container.querySelector('p')).toBeNull();
});

it('embedded startup reports a launch failure so the parent can recreate the hidden frame', async () => {
    const onUnavailable=vi.fn();
    render(<ExpertPreviewEntry embedded target={{agentId:'expert-one',previewId:'preview-one'}} launch={async()=>'previewUnavailable'} onUnavailable={onUnavailable} t={t as never}/>);
    await waitFor(()=>expect(onUnavailable).toHaveBeenCalledTimes(1));
});

it('shows document headings and paragraph locations instead of raw locator JSON', async () => {
    const locator = { paragraph: 124, headingPath: ['营销战略知识库', '经典案例', '身份型定位语'] };
    const open = vi.fn(async () => ({ text: '完整原文，保留换行。\n第二行。', locator }));
    const translate = (key: string, values?: Record<string, unknown>) => key === 'knowledgeParagraph' ? `第 ${values?.value} 段` : key;
    const view = render(<KnowledgeSources embedded sources={[{ recordId: 'json-record', turn: 1, messageId: 'm', label: 'T4L1S1', title: '营销文档.md', locator: JSON.stringify(locator) }]} open={open} t={translate as never}/>);
    const source = view.getByRole('button', { name: /T4L1S1/ });
    expect(source.textContent).toContain('营销战略知识库 › 经典案例 › 身份型定位语');
    expect(source.textContent).toContain('第 124 段');
    expect(view.container.textContent).not.toContain('headingPath');
    expect(view.container.textContent).not.toContain('paragraph');
    fireEvent.click(source);
    await waitFor(() => expect(view.container.querySelector('pre')?.textContent).toBe('完整原文，保留换行。\n第二行。'));
    expect(open).toHaveBeenCalledWith('json-record', 'T4L1S1');
    expect(view.container.textContent).not.toContain('headingPath');
    expect(view.container.textContent).not.toContain('paragraph');
});
