// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ExpertPreviewEntry, isEmbeddedExpertPreview, parseExpertPreview } from '../src/client/ExpertPreviewEntry.tsx';
import { KnowledgeSources } from '../src/client/KnowledgeSources.tsx';
import { CompactExpertMessages } from '../src/client/CompactExpertPreview.tsx';
const t = (key: string) => key;
afterEach(cleanup);
it('keeps retrieval-only sources hidden while waiting and reveals them only after an actual citation', () => {
    const chat:any={nodes:[{kind:'user',seq:1,content:[{type:'text',text:'用户问题'}]},{kind:'assistant',seq:2,turn:1,blocks:[]}],partial:null};
    const props:any={sessionId:'preview',useChat:(select:any)=>select({legacy:chat}),useSession:(select:any)=>select({running:true,promptError:null}),usePreviewProfile:(select:any)=>select({name:'专家',avatarUrl:null}),useProjection:()=>[{recordId:'record',turn:1,messageId:'m',label:'T1L1S1',title:'资料',locator:'第1段'}],reportContent:vi.fn(),reportState:vi.fn(),openSource:vi.fn(),chatText:t,t};
    const view=render(<CompactExpertMessages {...props}/>);
    expect(view.container.querySelector('details')).toBeNull();
    expect(view.container.querySelector('[data-role="assistant-waiting"]')).not.toBeNull();
    chat.partial={turn:1,blocks:[{kind:'text',text:'根据资料回答 [T1L1S1]'}]};
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

// Regression: six admitted passages must not become six claimed answer sources.
const citationSources = [
    {recordId:'r1',turn:1,messageId:'m1',label:'T1L1S1',title:'赖直纯.pdf',locator:'{"page":1}'},
    ...Array.from({length:5},(_,i)=>({recordId:'r1',turn:1,messageId:'m1',label:`T1L1S${i+2}`,title:'aigc.pdf',locator:JSON.stringify({page:i+2})})),
];
function citationPreview(chat:any, sources=citationSources) {
    const props:any={sessionId:'preview',useChat:(select:any)=>select({legacy:chat}),useSession:(select:any)=>select({running:false,promptError:null}),usePreviewProfile:(select:any)=>select({name:'专家',avatarUrl:null}),useProjection:(key:string)=>key==='officialExpertKnowledge'?sources:undefined,reportContent:vi.fn(),reportState:vi.fn(),openSource:vi.fn(async()=>({text:'确切来源',locator:{page:1}})),chatText:t,t};
    return {props,...render(<CompactExpertMessages {...props}/>)};
}
it('shows only the cited passage out of six retrieval candidates and opens its exact record', async()=>{
    const view=citationPreview({nodes:[{kind:'assistant',seq:1,turn:1,blocks:[{kind:'text',text:'分享主题 [T1L1S1]'}]}],partial:null});
    expect(view.container.querySelector('summary')?.textContent).toBe('knowledgeSources · 1');
    expect(view.container.textContent).not.toContain('aigc.pdf');
    fireEvent.click(view.getByRole('button',{name:/T1L1S1/}));
    await waitFor(()=>expect(view.props.openSource).toHaveBeenCalledWith('preview','r1','T1L1S1'));
    view.unmount();
});
it('combines citations across answer messages and blocks, deduplicating repeated citations',()=>{
    const view=citationPreview({nodes:[
        {kind:'assistant',seq:1,turn:1,blocks:[{kind:'text',text:'第一点 [T1L1S1]'}]},
        {kind:'assistant',seq:2,turn:1,blocks:[{kind:'text',text:'第二点 [T1L1S2]'}, {kind:'text',text:'再引用 [T1L1S1]'}]},
    ],partial:null});
    expect(view.container.querySelectorAll('details')).toHaveLength(1);
    expect(view.container.querySelector('summary')?.textContent).toBe('knowledgeSources · 2');
    expect(view.container.textContent).toContain('aigc.pdf');
    expect(view.container.querySelectorAll('details button')).toHaveLength(2);
    view.unmount();
});
it('does not claim a source for uncited text, unknown labels or incomplete streaming labels',()=>{
    const chat:any={nodes:[],partial:{turn:1,blocks:[{kind:'text',text:'无引用；T1L1S1；[T1L1S99]；[T1L1S'}]}};
    const view=citationPreview(chat);
    expect(view.container.querySelector('details')).toBeNull();
    chat.partial.blocks[0].text='回答 [T1L1S1]';
    view.rerender(<CompactExpertMessages {...view.props}/>);
    expect(view.container.querySelector('summary')?.textContent).toBe('knowledgeSources · 1');
    view.unmount();
});
it('resolves explicitly cited historical evidence without attaching all earlier sources',()=>{
    const view=citationPreview({nodes:[
        {kind:'assistant',seq:1,turn:1,blocks:[{kind:'text',text:'前文 [T1L1S1]'}]},
        {kind:'user',seq:2,turn:2,content:[{type:'text',text:'继续'}]},
        {kind:'assistant',seq:3,turn:2,blocks:[{kind:'text',text:'继续依据 [T1L1S1]'}]},
    ],partial:null});
    expect([...view.container.querySelectorAll('summary')].map(node=>node.textContent)).toEqual(['knowledgeSources · 1','knowledgeSources · 1']);
    view.unmount();
});

it('accepts a grouped citation while excluding unmentioned passages',()=>{
    const view=citationPreview({nodes:[{kind:'assistant',seq:1,turn:1,blocks:[{kind:'text',text:'综合结论 [T1L1S1, T1L1S3]'}]}],partial:null});
    expect(view.container.querySelector('summary')?.textContent).toBe('knowledgeSources · 2');
    expect([...view.container.querySelectorAll('details button')].map(node=>node.textContent)).toEqual(['T1L1S1knowledgePage','T1L1S3knowledgePage']);
});
it('does not manufacture a citation across independently rendered text blocks',()=>{
    const view=citationPreview({nodes:[{kind:'assistant',seq:1,turn:1,blocks:[{kind:'text',text:'说明 [T1L1S1,'},{kind:'text',text:'T1L1S2]'}]}],partial:null});
    expect(view.container.querySelector('details')).toBeNull();
});
