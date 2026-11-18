
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createApp, h, reactive, nextTick, type App } from "vue";
import ElementPlus, { ElMessageBox } from "element-plus";
import Processing from "../src/components/admin/KnowledgeDocumentProcessingDialog.vue";
const api = vi.hoisted(() => ({
    preparationContext: vi.fn(),
    preparationPreview: vi.fn(),
    reindex: vi.fn()
}));
vi.mock("../src/api/admin", async (original) => ({
    ...await original<typeof import("../src/api/admin")>(),
    adminKnowledgeCoreApi: api
}));
const config = {
    parseMode: "text" as const,
    targetTokens: 400,
    maxTokens: 600,
    overlapTokens: 40
};
const doc = (id = "a", rev = "ra"): any => ({
    id,
    title: `${id}.pdf`,
    enabled: true,
    requestedIndexId: "ix",
    revisions: [{
            id: rev,
            originalName: `${id}.pdf`,
            parserFormat: ".pdf",
            createdAt: "2026-11-17",
            indexes: [{
                    id: "ix",
                    status: "READY"
                }]
        }]
});
const result = (cfg = config): any => ({
    previewKey: "a".repeat(64),
    profileId: "profile-private",
    parseStatus: "READY",
    readyForReprocess: true,
    resolvedConfig: {
        ...cfg
    },
    displayText: "真实解析原文",
    totalOriginalChars: 6,
    textPage: 1,
    textPageCount: 1,
    displayTextTruncated: false,
    displayChunks: [{
            ordinal: 0,
            text: "真实切分内容",
            tokenCount: 6,
            locator: {
                page: 2,
                paragraph: 3
            },
            sourceStart: 0,
            sourceEnd: 6
        }],
    totalChunkCount: 1,
    totalChunkTokens: 6,
    chunkPage: 1,
    chunkPageCount: 1,
    displayChunkTruncated: false
});
let app: App | undefined, root: HTMLElement, props: any, confirm: ReturnType<typeof vi.spyOn>;
function deferred<T>() {
    let resolve!: (v: T) => void, reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => {
        resolve = a;
        reject = b;
    });
    return {
        promise,
        resolve,
        reject
    };
}
beforeEach(() => {
    vi.resetAllMocks();
    api.preparationContext.mockImplementation(async (d, r) => ({
        documentId: d,
        revisionId: r,
        profileId: "profile-private",
        tokenizer: "cl100k_base",
        capacityTokens: 800,
        capabilities: {
            ocrAvailable: false
        },
        defaultConfig: {
            ...config
        }
    }));
    api.preparationPreview.mockImplementation(async (_d, _r, body) => result(body.config));
    api.reindex.mockResolvedValue({
        id: "job",
        status: "PENDING"
    });
    confirm = vi.spyOn(ElMessageBox, "confirm").mockResolvedValue("confirm");
});
afterEach(() => {
    app?.unmount();
    root?.remove();
    app = undefined;
    vi.restoreAllMocks();
    document.querySelectorAll(".el-overlay,.el-popper,.el-message").forEach(el => el.remove());
});
async function mount(document = doc()) {
    root = window.document.createElement("div");
    window.document.body.append(root);
    props = reactive({
        modelValue: true,
        document,
        "onUpdate:modelValue": (v: boolean) => {
            props.modelValue = v;
        },
        onChanged: vi.fn()
    });
    app = createApp({
        render: () => h(Processing, props)
    });
    app.use(ElementPlus);
    app.mount(root);
    await vi.waitFor(() => expect(button("预览解析和分段")?.disabled).toBe(false));
}
function button(label: string) {
    return [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label);
}
async function click(label: string) {
    expect(button(label)).toBeTruthy();
    button(label)!.click();
    await nextTick();
}
async function preview() {
    await click("预览解析和分段");
    await vi.waitFor(() => expect(document.body.textContent).toContain("真实切分内容"));
}
async function typeTarget(value: string) {
    const input = document.querySelector<HTMLInputElement>("input[aria-label=\"目标 Token\"]")!;
    expect(input).toBeTruthy();
    input.value = value;
    input.dispatchEvent(new Event("input", {
        bubbles: true
    }));
    await nextTick();
}
it("previews actual extraction and queues exact resolved configuration without exposing service identifiers", async () => {
    await mount();
    await preview();
    expect(api.preparationPreview).toHaveBeenCalledWith("a", "ra", {
        config,
        textPage: 1,
        chunkPage: 1
    }, expect.any(AbortSignal));
    expect(document.body.textContent).toContain("真实解析原文");
    expect(document.body.textContent).toContain("第 2 页");
    expect(document.body.textContent).not.toContain("profile-private");
    expect(document.body.textContent).not.toContain("cl100k_base");
    await click("重新处理");
    await vi.waitFor(() => expect(api.reindex).toHaveBeenCalledWith("ra", "profile-private", config, expect.stringMatching(/^[0-9a-f-]{36}$/i)));
    expect(props.onChanged).toHaveBeenCalledOnce();
    expect(props.modelValue).toBe(false);
});
it("typing invalidates completed and in-flight previews even if the request ignores abort", async () => {
    await mount();
    await preview();
    expect(button("重新处理")?.disabled).toBe(false);
    await typeTarget("401");
    expect(button("重新处理")?.disabled).toBe(true);
    const pending = deferred<any>();
    api.preparationPreview.mockReturnValueOnce(pending.promise);
    await click("预览解析和分段");
    await typeTarget("402");
    pending.resolve(result({
        ...config,
        targetTokens: 401
    }));
    await nextTick();
    await nextTick();
    expect(button("重新处理")?.disabled).toBe(true);
    expect(button("预览解析和分段")?.disabled).toBe(false);
    await preview();
    expect(button("重新处理")?.disabled).toBe(false);
});
it("switching requested revision ignores a late old preview and reloads only on identity changes", async () => {
    await mount();
    const pending = deferred<any>();
    api.preparationPreview.mockReturnValueOnce(pending.promise);
    await click("预览解析和分段");
    props.document = {
        ...doc(),
        title: "renamed.pdf"
    };
    await nextTick();
    expect(api.preparationContext).toHaveBeenCalledTimes(1);
    props.document = {
        ...doc("a", "new"),
        revisions: [...doc("a", "new").revisions, ...doc().revisions]
    };
    await vi.waitFor(() => expect(api.preparationContext).toHaveBeenLastCalledWith("a", "new", expect.any(AbortSignal)));
    pending.resolve(result());
    await nextTick();
    expect(button("重新处理")?.disabled).toBe(true);
    await preview();
    await click("重新处理");
    await vi.waitFor(() => expect(api.reindex.mock.calls[0]?.[0]).toBe("new"));
});
it("cancelled or stale confirmation never writes and cannot close another document", async () => {
    await mount();
    await preview();
    confirm.mockRejectedValueOnce("cancel");
    await click("重新处理");
    await nextTick();
    expect(api.reindex).not.toHaveBeenCalled();
    const pending = deferred<any>();
    confirm.mockReturnValueOnce(pending.promise);
    await click("重新处理");
    expect(button("重新处理")?.disabled).toBe(true);
    props.document = doc("b", "rb");
    await vi.waitFor(() => expect(api.preparationContext).toHaveBeenLastCalledWith("b", "rb", expect.any(AbortSignal)));
    pending.resolve("confirm");
    await nextTick();
    await nextTick();
    expect(api.reindex).not.toHaveBeenCalled();
    expect(props.modelValue).toBe(true);
});
it("preview and queue errors allow retry and preserve a short stable idempotency key", async () => {
    await mount();
    api.preparationPreview.mockRejectedValueOnce(new Error("OCR_RECOGNITION_FAILED"));
    await click("预览解析和分段");
    await vi.waitFor(() => expect(document.body.textContent).toContain("识别失败"));
    expect(button("预览解析和分段")?.disabled).toBe(false);
    await preview();
    api.reindex.mockRejectedValueOnce(new Error("network"));
    await click("重新处理");
    await vi.waitFor(() => expect(api.reindex).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(button("重新处理")?.disabled).toBe(false));
    const key = api.reindex.mock.calls[0][3];
    await click("重新处理");
    await vi.waitFor(() => expect(api.reindex).toHaveBeenCalledTimes(2));
    expect(api.reindex.mock.calls[1][3]).toBe(key);
});
it("closed dialog ignores deferred results and reopening starts clean; unsupported OCR is disabled", async () => {
    await mount();
    expect(document.querySelector<HTMLSelectElement>("[aria-label=\"解析方式\"] option[value=\"ocr\"]")?.disabled).toBe(true);
    const pending = deferred<any>();
    api.preparationPreview.mockReturnValueOnce(pending.promise);
    await click("预览解析和分段");
    props.modelValue = false;
    await nextTick();
    props.modelValue = true;
    await vi.waitFor(() => expect(api.preparationContext).toHaveBeenCalledTimes(2));
    pending.resolve(result());
    await nextTick();
    expect(button("重新处理")?.disabled).toBe(true);
    await preview();
    expect(button("重新处理")?.disabled).toBe(false);
});
it("partial extraction remains diagnostic only and failed jobs never claim queued", async () => {
    await mount();
    api.preparationPreview.mockResolvedValueOnce({
        ...result(),
        parseStatus: "PARTIAL",
        readyForReprocess: false,
        whyPartial: "EXTRACTION_CHAR_LIMIT",
        displayTextTruncated: true
    });
    await preview();
    expect(document.body.textContent).toContain("提取不完整");
    expect(button("重新处理")?.disabled).toBe(true);
    await preview();
    api.reindex.mockResolvedValueOnce({
        id: "job",
        status: "FAILED",
        errorCode: "PROFILE_DISABLED"
    });
    await click("重新处理");
    await vi.waitFor(() => expect(document.body.textContent).toContain("服务已停用"));
    expect(props.modelValue).toBe(true);
    expect(props.onChanged).not.toHaveBeenCalled();
});
it("reads structured API error codes and backend row/heading locators", async () => {
    await mount();
    api.preparationPreview.mockRejectedValueOnce(Object.assign(new Error("请求失败"), {
        code: "OCR_RECOGNITION_FAILED"
    }));
    await click("预览解析和分段");
    await vi.waitFor(() => expect(document.body.textContent).toContain("识别失败"));
    api.preparationPreview.mockResolvedValueOnce({
        ...result(),
        displayChunks: [{
                ...result().displayChunks[0],
                locator: {
                    rowStart: 3,
                    rowEnd: 8,
                    headingPath: ["章节", "小节"]
                }
            }]
    });
    await preview();
    expect(document.body.textContent).toContain("第 3–8 行");
    expect(document.body.textContent).toContain("章节 / 小节");
});
it("late context and accepted queue responses cannot update a newly opened document", async () => {
    await mount();
    const queue = deferred<any>();
    api.reindex.mockReturnValueOnce(queue.promise);
    await preview();
    await click("重新处理");
    await vi.waitFor(() => expect(api.reindex).toHaveBeenCalledOnce());
    const late = deferred<any>();
    api.preparationContext.mockReturnValueOnce(late.promise);
    props.document = doc("b", "rb");
    await nextTick();
    props.document = doc("c", "rc");
    await vi.waitFor(() => expect(api.preparationContext).toHaveBeenLastCalledWith("c", "rc", expect.any(AbortSignal)));
    late.resolve({
        documentId: "b",
        revisionId: "rb",
        profileId: "old",
        capacityTokens: 800,
        capabilities: {
            ocrAvailable: true
        },
        defaultConfig: config
    });
    queue.resolve({
        id: "oldjob",
        status: "PENDING"
    });
    await nextTick();
    await nextTick();
    expect(props.modelValue).toBe(true);
    expect(props.onChanged).not.toHaveBeenCalled();
    await preview();
    expect(api.preparationPreview.mock.calls.at(-1)?.slice(0, 2)).toEqual(["c", "rc"]);
});
it("requested index selects the matching revision and repeated clicks open one confirmation", async () => {
    await mount({
        ...doc(),
        requestedIndexId: "oldix",
        revisions: [{
                ...doc("a", "new").revisions[0],
                indexes: [{
                        id: "newix",
                        status: "READY"
                    }]
            }, {
                ...doc("a", "older").revisions[0],
                indexes: [{
                        id: "oldix",
                        status: "READY"
                    }]
            }]
    });
    expect(api.preparationContext.mock.calls[0].slice(0, 2)).toEqual(["a", "older"]);
    await preview();
    const pending = deferred<any>();
    confirm.mockReturnValueOnce(pending.promise);
    await click("重新处理");
    await click("重新处理");
    expect(confirm).toHaveBeenCalledOnce();
    pending.resolve("confirm");
    await vi.waitFor(() => expect(api.reindex).toHaveBeenCalledOnce());
    expect(api.reindex.mock.calls[0][0]).toBe("older");
});
it("rejects mismatched preview profile and uses the real service capacity", async () => {
    await mount();
    await typeTarget("801");
    expect(button("预览解析和分段")?.disabled).toBe(true);
    await typeTarget("400");
    api.preparationPreview.mockResolvedValueOnce({
        ...result(),
        profileId: "other-profile"
    });
    await click("预览解析和分段");
    await vi.waitFor(() => expect(document.body.textContent).toContain("分段参数无效"));
    expect(button("重新处理")?.disabled).toBe(true);
    await preview();
});
it('context failures are recoverable and options changed during confirmation cancel the intent', async () => {
    api.preparationContext.mockRejectedValueOnce(Object.assign(new Error('请求失败'), {code:'EMBEDDING_SERVICE_UNCONFIGURED'}));
    root=document.createElement('div'); document.body.append(root);
    props=reactive({modelValue:true,document:doc(),'onUpdate:modelValue':(v:boolean)=>{props.modelValue=v;}});
    app=createApp({render:()=>h(Processing,props)}); app.use(ElementPlus); app.mount(root);
    await vi.waitFor(()=>expect(document.body.textContent).toContain('尚未配置检索服务'));
    await click('重新加载设置');
    await vi.waitFor(()=>expect(button('预览解析和分段')?.disabled).toBe(false));
    await preview();
    const pending=deferred<any>(); confirm.mockReturnValueOnce(pending.promise);
    await click('重新处理');
    expect(document.querySelector<HTMLInputElement>('input[aria-label="目标 Token"]')?.disabled).toBe(true);
    await typeTarget('401'); pending.resolve('confirm'); await nextTick(); await nextTick();
    expect(api.reindex).not.toHaveBeenCalled();
    expect(button('重新处理')?.disabled).toBe(true);
});
it('OCR requires both PDF format and server capability, and paging preserves the configuration', async () => {
    api.preparationContext.mockImplementation(async(d,r)=>({documentId:d,revisionId:r,profileId:'profile-private',capacityTokens:800,capabilities:{ocrAvailable:true},defaultConfig:config}));
    await mount();
    const select=document.querySelector<HTMLSelectElement>('[aria-label="解析方式"]')!;
    expect(select.options[1].disabled).toBe(false); select.value='ocr'; select.dispatchEvent(new Event('change',{bubbles:true})); await nextTick();
    api.preparationPreview.mockImplementation(async(_d,_r,body)=>({...result(body.config),textPage:body.textPage,textPageCount:2,displayTextTruncated:true}));
    await preview(); expect(button('重新处理')?.disabled).toBe(false);
    await click('下一页原文'); await vi.waitFor(()=>expect(api.preparationPreview.mock.calls.at(-1)?.[2]).toEqual({config:{...config,parseMode:'ocr'},textPage:2,chunkPage:1}));
    props.document={...doc('b','rb'),revisions:[{...doc('b','rb').revisions[0],parserFormat:'.md',originalName:'b.md'}]};
    await vi.waitFor(()=>expect(document.querySelector<HTMLSelectElement>('[aria-label="解析方式"] option[value="ocr"]')?.disabled).toBe(true));
});

it('explains separately why text files and PDFs cannot use OCR', async () => {
    await mount({ ...doc(), title: 'notes.md', revisions: [{ ...doc().revisions[0], originalName: 'notes.md', parserFormat: '.md' }] });
    expect(document.body.textContent).toContain('当前文件是文本格式，可直接提取文字，无需 OCR');
    expect(document.body.textContent).not.toContain('当前未配置可用的视觉识别模型');
    props.document = doc('pdf', 'pdf-rev');
    await vi.waitFor(() => expect(button('预览解析和分段')?.disabled).toBe(false));
    await vi.waitFor(() => expect(document.body.textContent).toContain('当前未配置可用的视觉识别模型'));
    expect(document.body.textContent).not.toContain('当前文件是文本格式');
});

it('shows PDF OCR scope only after server capability is available', async () => {
    api.preparationContext.mockImplementation(async (d, r) => ({ documentId:d, revisionId:r, profileId:'profile-private', capacityTokens:800, capabilities:{ocrAvailable:true}, defaultConfig:config }));
    await mount();
    expect(document.body.textContent).toContain('PDF 默认自动识别：直接提取文字，扫描页自动转 OCR');
    expect(document.querySelector<HTMLOptionElement>('option[value="ocr"]')?.disabled).toBe(false);
});

it('images use vision OCR automatically and pin the route when previewing and reprocessing',async()=>{
 const imageConfig={...config,parseMode:'ocr' as const,ocrModelId:'vision-1',ocrRouteHash:'a'.repeat(64)};
 api.preparationContext.mockImplementation(async(d,r)=>({documentId:d,revisionId:r,profileId:'profile-private',capacityTokens:800,capabilities:{ocrAvailable:true},defaultConfig:imageConfig}));
 await mount({...doc(),title:'scan.png',revisions:[{...doc().revisions[0],originalName:'scan.png',parserFormat:'.png'}]});
 const select=document.querySelector<HTMLSelectElement>('[aria-label="解析方式"]')!;
 expect(select.value).toBe('ocr');expect(select.options[0].disabled).toBe(true);expect(select.options[1].disabled).toBe(false);
 await preview();expect(api.preparationPreview.mock.calls.at(-1)?.[2].config).toEqual(imageConfig);
 await click('重新处理');await vi.waitFor(()=>expect(api.reindex).toHaveBeenCalled());expect(api.reindex.mock.calls[0][2]).toEqual(imageConfig);
});

it('a long scan sample is labelled and starts full background processing without pretending the sample is the whole document',async()=>{
 await mount();api.preparationPreview.mockImplementation(async(_d,_r,body)=>({...result(body.config),ocrSample:{totalPages:120,sampledPages:3},backgroundReprocessAvailable:true,readyForReprocess:false}));
 await preview();expect(document.body.textContent).toContain('仅抽样预览前 3 页，文档共 120 页');expect(document.body.textContent).toContain('抽样原文');expect(button('启动后台处理')?.disabled).toBe(false);
 await click('启动后台处理');await vi.waitFor(()=>expect(api.reindex).toHaveBeenCalled());expect(confirm.mock.calls[0][0]).toContain('全部 120 页');
});

it('PDF automatic parsing is the saved default and does not require a working vision model for native text',async()=>{
 const automatic={...config,parseMode:'auto' as const};api.preparationContext.mockImplementation(async(d,r)=>({documentId:d,revisionId:r,profileId:'profile-private',capacityTokens:800,capabilities:{ocrAvailable:false},defaultConfig:automatic}));
 await mount();expect(document.querySelector<HTMLSelectElement>('[aria-label="解析方式"]')?.value).toBe('auto');expect(button('预览解析和分段')?.disabled).toBe(false);await preview();expect(api.preparationPreview.mock.calls.at(-1)?.[2].config.parseMode).toBe('auto');expect(button('重新处理')?.disabled).toBe(false);
});
