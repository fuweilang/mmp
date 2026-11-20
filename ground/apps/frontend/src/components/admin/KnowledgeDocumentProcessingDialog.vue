<template>
  <el-dialog :model-value="modelValue" title="文档处理设置" width="960px" align-center append-to-body destroy-on-close @update:model-value="emit('update:modelValue',$event)">
    <div class="document-processing" v-loading="contextLoading">
      <p class="processing-lead">{{ document?.title }} · 调整解析和分段方式，先预览再重新处理。后台处理期间，专家继续使用已成功的内容。</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <div class="processing-controls">
        <label>解析方式<select v-model="form.parseMode" aria-label="解析方式" aria-describedby="knowledge-ocr-note" :disabled="controlsDisabled"><option value="text" :disabled="imageDocument">提取文档文字</option><option value="ocr" :disabled="!ocrAvailable">扫描 PDF／图片文字识别（OCR）</option><option v-if="pdfDocument" value="auto">自动识别（文字／扫描 PDF）</option></select></label>
        <label>目标 Token<input v-model.number="form.targetTokens" aria-label="目标 Token" type="number" min="1" :max="capacity" step="1" :disabled="controlsDisabled" /></label>
        <label>最大 Token<input v-model.number="form.maxTokens" aria-label="最大 Token" type="number" min="1" :max="capacity" step="1" :disabled="controlsDisabled" /></label>
        <label>重叠 Token<input v-model.number="form.overlapTokens" aria-label="重叠 Token" type="number" min="0" :max="Math.max(0,Number(form.targetTokens)-1)" step="1" :disabled="controlsDisabled" /></label>
      </div>
      <p id="knowledge-ocr-note" class="processing-note">{{ ocrNote }}</p>
      <p v-if="context" class="processing-note">目标是期望长度，最大值是硬上限；优先保留完整小节、段落和句子。重叠按完整句段保留，不保证用满；每段最多 {{ capacity }} Token。</p>
      <p v-if="context && !validConfig" class="processing-invalid">请输入有效整数：1 ≤ 目标 ≤ 最大 ≤ {{ capacity }}，0 ≤ 重叠 &lt; 目标。</p>
      <div class="processing-actions"><el-button :loading="previewLoading" :disabled="!validConfig || !context || busy || !processable" @click="loadPreview()">预览解析和分段</el-button><el-button :disabled="busy || contextLoading || !processable" @click="loadContext">重新加载设置</el-button></div>
      <template v-if="preview">
        <el-alert v-if="preview.ocrSample" :title="`仅抽样预览前 ${preview.ocrSample.sampledPages} 页，文档共 ${preview.ocrSample.totalPages} 页。完整识别和入库将在后台分批完成；此处数量仅代表样本。`" type="info" :closable="false" show-icon />
        <el-alert v-else-if="preview.parseStatus !== 'READY' || !preview.readyForReprocess" :title="`提取不完整或暂不可处理：${safeReason(preview.failureReason || preview.whyPartial)}`" type="warning" :closable="false" />
        <p class="processing-count">{{ preview.ocrSample ? '抽样原文' : '解析原文' }}共 {{ preview.totalOriginalChars }} 字符；共 {{ preview.totalChunkCount }} 个分段，{{ preview.totalChunkTokens }} Token。</p>
        <p v-if="preview.displayTextTruncated || preview.displayChunkTruncated" class="processing-note">当前仅分页展示预览内容，展示分页不代表提取不完整。</p>
        <el-tabs v-model="tab">
          <el-tab-pane label="解析原文" name="text"><pre class="processing-original">{{ preview.displayText || '未提取到文字' }}</pre><div class="processing-pager"><el-button :disabled="busy || previewLoading || preview.textPage <= 1" @click="loadPreview(preview.textPage-1,preview.chunkPage)">上一页原文</el-button><span>{{ preview.textPage }} / {{ preview.textPageCount }} 页</span><el-button :disabled="busy || previewLoading || preview.textPage >= preview.textPageCount" @click="loadPreview(preview.textPage+1,preview.chunkPage)">下一页原文</el-button></div></el-tab-pane>
          <el-tab-pane label="分段预览" name="chunks"><div class="processing-chunks"><article v-for="chunk in preview.displayChunks" :key="chunk.ordinal"><small>分段 {{ chunk.ordinal+1 }} · {{ chunk.tokenCount }} Token<span v-if="location(chunk.locator)"> · {{ location(chunk.locator) }}</span></small><pre>{{ chunk.text }}</pre></article></div><div class="processing-pager"><el-button :disabled="busy || previewLoading || preview.chunkPage <= 1" @click="loadPreview(preview.textPage,preview.chunkPage-1)">上一页分段</el-button><span>{{ preview.chunkPage }} / {{ preview.chunkPageCount }} 页</span><el-button :disabled="busy || previewLoading || preview.chunkPage >= preview.chunkPageCount" @click="loadPreview(preview.textPage,preview.chunkPage+1)">下一页分段</el-button></div></el-tab-pane>
        </el-tabs>
      </template>
      <el-empty v-else-if="!contextLoading" description="点击预览，查看实际解析原文和分段结果" />
    </div>
    <template #footer><el-button @click="emit('update:modelValue',false)">关闭</el-button><el-button type="primary" :loading="busy" :disabled="!canReprocess || busy" @click="reprocess">{{ preview?.ocrSample ? '启动后台处理' : '重新处理' }}</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { adminKnowledgeCoreApi as api, type KnowledgeDocument, type KnowledgeIndexConfig, type KnowledgePreparationContext, type KnowledgePreparationPreview } from "../../api/admin";
import { latestKnowledgeRevision } from "../../utils/knowledge-files";
const props = defineProps<{
    modelValue: boolean;
    document?: KnowledgeDocument;
}>();
const emit = defineEmits<{
    "update:modelValue": [
        boolean
    ];
    changed: [
    ];
}>();
const context = ref<KnowledgePreparationContext>(), preview = ref<KnowledgePreparationPreview>(), error = ref(""), tab = ref("chunks");
const contextLoading = ref(false), previewLoading = ref(false), confirming = ref(false), queueLoading = ref(false);
const form = reactive<{
    parseMode: "text" | "ocr" | "auto";
    targetTokens: number | string;
    maxTokens: number | string;
    overlapTokens: number | string;
}>({
    parseMode: "text",
    targetTokens: 600,
    maxTokens: 900,
    overlapTokens: 80
});
const revision = computed(() => props.document && latestKnowledgeRevision(props.document));
const processable = computed(() => !!props.document?.enabled && !props.document.deletedAt && !!revision.value);
const identity = computed(() => JSON.stringify([props.modelValue, props.document?.id, revision.value?.id, props.document?.requestedIndexId, props.document?.enabled, props.document?.deletedAt]));
const capacity = computed(() => Math.min(8192, context.value?.capacityTokens || 0));
const pdfDocument = computed(() => revision.value?.parserFormat?.toLowerCase() === ".pdf");
const imageDocument = computed(() => [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(revision.value?.parserFormat?.toLowerCase() || ""));
const ocrAvailable = computed(() => !!context.value?.capabilities.ocrAvailable && (imageDocument.value || revision.value?.parserFormat?.toLowerCase() === ".pdf"));
const ocrNote = computed(() => {
    const format = revision.value?.parserFormat?.toLowerCase();
    if ([".md", ".markdown", ".txt", ".csv"].includes(format || "")) return "当前文件是文本格式，可直接提取文字，无需 OCR。OCR 用于识别扫描 PDF 中的文字。";
    if (!imageDocument.value && format !== ".pdf") return "此文件格式暂不支持 OCR；如需识别其中的图片文字，请将文档导出为 PDF 后上传。";
    if (!context.value || contextLoading.value) return "正在确认扫描 PDF／图片的 OCR 能力；若设置加载失败，请重新加载设置。";
    if (!ocrAvailable.value) return "当前未配置可用的视觉识别模型；请在模型管理中启用支持图片输入的模型并配置厂商密钥。";
    return "PDF 默认自动识别：直接提取文字，扫描页自动转 OCR；图片直接识别。看不清或识别不完整时会提示，请核对原图。";
});
const busy = computed(() => confirming.value || queueLoading.value);
const controlsDisabled = computed(() => !context.value || contextLoading.value || busy.value || !processable.value);
const config = computed<KnowledgeIndexConfig>(() => ({
    parseMode: form.parseMode,
    ...(form.parseMode !== "text" && context.value?.defaultConfig.ocrModelId ? {ocrModelId:context.value.defaultConfig.ocrModelId, ...(context.value.defaultConfig.ocrRouteHash ? {ocrRouteHash:context.value.defaultConfig.ocrRouteHash} : {})} : {}),
    targetTokens: Number(form.targetTokens),
    maxTokens: Number(form.maxTokens),
    overlapTokens: Number(form.overlapTokens)
}));
const validConfig = computed(() => [form.targetTokens, form.maxTokens, form.overlapTokens].every(v => typeof v === "number" && Number.isInteger(v)) && config.value.targetTokens >= 1 && config.value.targetTokens <= config.value.maxTokens && config.value.maxTokens <= capacity.value && config.value.overlapTokens >= 0 && config.value.overlapTokens < config.value.targetTokens && (form.parseMode === "text" || form.parseMode === "auto" && pdfDocument.value || ocrAvailable.value));
let contextEpoch = 0, previewEpoch = 0, queueEpoch = 0, contextAbort: AbortController | undefined, previewAbort: AbortController | undefined, initializing = false, alive = true;
let previewIdentity = "", previewConfig = "", intentKey = "";
const sameConfig = (a: KnowledgeIndexConfig, b: KnowledgeIndexConfig) => a.parseMode === b.parseMode && a.ocrModelId === b.ocrModelId && a.ocrRouteHash === b.ocrRouteHash && a.targetTokens === b.targetTokens && a.maxTokens === b.maxTokens && a.overlapTokens === b.overlapTokens;
const canReprocess = computed(() => props.modelValue && processable.value && validConfig.value && !!context.value && !!preview.value && ((preview.value.parseStatus === "READY" && preview.value.readyForReprocess) || (!!preview.value.ocrSample && preview.value.backgroundReprocessAvailable === true)) && preview.value.profileId === context.value.profileId && /^[a-f0-9]{64}$/i.test(preview.value.previewKey) && previewIdentity === identity.value && previewConfig === JSON.stringify(config.value) && sameConfig(preview.value.resolvedConfig, config.value) && !previewLoading.value);
function safeReason(code?: string) {
    return ({
        INVALID_INDEX_CONFIGURATION: "分段参数无效，请检查后重试",
        OCR_CHECKPOINT_UNAVAILABLE: "处理断点暂不可用，请联系管理员检查存储",
        OCR_CHECKPOINT_MISMATCH: "文档处理断点与当前配置不一致，请联系管理员检查",
        OCR_CONFIGURATION_CHANGED: "识别模型配置已变更，请重新加载设置并预览",
        OCR_PARTIAL: "部分文字无法辨认，请核对原图或上传更清晰的文件",
        OCR_IMAGE_LIMIT: "图片超过识别大小或尺寸限制，请压缩或拆分后上传",
        OCR_INVALID_IMAGE: "图片损坏、格式不支持或包含动画，请上传清晰静态图片",
        OCR_INVALID_RESPONSE: "识别结果不完整，请重试或上传更清晰的文件",
        OCR_CACHE_UNAVAILABLE: "识别结果暂不可用，请联系管理员检查存储",
        OCR_REQUIRED_FOR_IMAGE: "图片需要使用文字识别（OCR）",
        OCR_BUSY: "已有文字识别任务正在运行，请稍后重试",
        OCR_TIMEOUT: "文字识别超时，请拆分 PDF 后重试",
        OCR_OUTPUT_LIMIT: "识别文字量超过限制，请拆分 PDF 后重试",
        OCR_UNAVAILABLE: "未配置可用的视觉识别模型，请检查模型管理",
        OCR_UNSUPPORTED_FORMAT: "此文件格式不支持 OCR",
        OCR_UNSUPPORTED_DOCUMENT: "此文件不支持 OCR",
        OCR_PAGE_LIMIT: "PDF 超过 2000 页，请拆分后上传",
        OCR_PAGE_MISSING: "PDF 缺少可识别页面",
        OCR_RENDER_LIMIT: "PDF 页面渲染超出限制",
        OCR_RECOGNITION_FAILED: "文字识别失败，请重试或转换文件",
        OCR_FAILED: "文字识别失败，请重试或转换文件",
        OCR_EMPTY: "PDF 未识别到文字",
        OCR_NO_TEXT: "PDF 未识别到文字",
        OCR_PAGE_EMPTY: "部分 PDF 页面未识别到文字",
        PDF_RENDER_FAILED: "PDF 页面渲染失败，请检查文件",
        PDF_TEXT_UNAVAILABLE: "PDF 未提取到文字，可尝试 OCR",
        UPLOAD_SIZE_LIMIT: "文件大小超过限制，请拆分后上传",
        EXTRACTION_CHAR_LIMIT: "文档文字量超过提取限制，请拆分后上传",
        EXTRACTION_TOKEN_LIMIT: "文档 Token 数超过提取限制，请拆分后上传",
        DOCUMENT_CHUNK_LIMIT: "分段数量超过限制，请调整参数或拆分文件",
        PREVIEW_RESPONSE_LIMIT: "预览内容超过限制，请调整参数",
        PROFILE_DISABLED: "检索服务已停用，请到检索服务检查",
        EMBEDDING_SERVICE_UNCONFIGURED: "尚未配置检索服务，请到检索服务配置",
        PROVIDER_CREDENTIALS_MISSING: "检索服务凭据未配置，请到检索服务检查",
        KNOWLEDGE_DISABLED: "文档已停用",
        KNOWLEDGE_REVISION_NOT_FOUND: "文件版本已变更，请重新打开设置"
    } as Record<string, string>)[code || ""] || "处理未完成，请重试或检查文件与检索服务配置";
}
function failure(e: unknown) {
    const code = e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : undefined;
    return safeReason(code || (e instanceof Error ? e.message : undefined));
}
function location(locator: Record<string, unknown>) {
    const parts: string[] = [];
    for (const [key, label] of [["page", "页"], ["paragraph", "段"]] as const) {
        const value = locator[key];
        if (typeof value === "number" || typeof value === "string")
            parts.push(`第 ${String(value)}${key === "paragraph" && typeof locator.paragraphEnd === "number" && locator.paragraphEnd !== value ? `–${locator.paragraphEnd}` : ""} ${label}`);
    }
    const row = locator.rowStart ?? locator.row;
    if (typeof row === "number" || typeof row === "string")
        parts.push(`第 ${String(row)}${locator.rowEnd !== undefined && locator.rowEnd !== row ? `–${String(locator.rowEnd)}` : ""} 行`);
    if (Array.isArray(locator.headingPath))
        parts.push(locator.headingPath.filter(v => typeof v === "string").join(" / "));
    for (const key of ["heading", "sheet", "slide"]) {
        const value = locator[key];
        if (typeof value === "string" || typeof value === "number")
            parts.push(`${{
                heading: "标题",
                sheet: "工作表",
                slide: "幻灯片"
            }[key]}：${String(value)}`);
    }
    return parts.filter(Boolean).join(" · ");
}
function invalidatePreview() {
    previewEpoch++;
    previewAbort?.abort();
    previewAbort = undefined;
    previewLoading.value = false;
    preview.value = undefined;
    previewIdentity = "";
    previewConfig = "";
    intentKey = "";
    queueEpoch++;
    confirming.value = false;
    queueLoading.value = false;
}
function invalidateAll() {
    contextEpoch++;
    contextAbort?.abort();
    contextAbort = undefined;
    contextLoading.value = false;
    context.value = undefined;
    invalidatePreview();
    error.value = "";
}
async function loadContext() {
    invalidateAll();
    if (!alive || !props.modelValue || !processable.value || !props.document || !revision.value)
        return;
    const epoch = contextEpoch, id = identity.value, d = props.document.id, r = revision.value.id;
    const abort = new AbortController();
    contextAbort = abort;
    contextLoading.value = true;
    try {
        const value = await api.preparationContext(d, r, abort.signal);
        if (!alive || epoch !== contextEpoch || id !== identity.value || abort.signal.aborted)
            return;
        if (value.documentId !== d || value.revisionId !== r || !value.profileId || !Number.isInteger(value.capacityTokens) || value.capacityTokens < 1)
            throw new Error("INVALID_INDEX_CONFIGURATION");
        context.value = value;
        initializing = true;
        Object.assign(form, value.defaultConfig);
        initializing = false;
    }
    catch (e) {
        if (alive && epoch === contextEpoch && id === identity.value && !abort.signal.aborted)
            error.value = failure(e);
    }
    finally {
        if (epoch === contextEpoch)
            contextLoading.value = false;
    }
}
async function loadPreview(textPage = 1, chunkPage = 1) {
    if (!props.modelValue || !processable.value || !context.value || !validConfig.value || busy.value || !props.document || !revision.value)
        return;
    invalidatePreview();
    error.value = "";
    const epoch = previewEpoch, id = identity.value, d = props.document.id, r = revision.value.id, profile = context.value.profileId, cfg = {
        ...config.value
    }, abort = new AbortController();
    previewAbort = abort;
    previewLoading.value = true;
    try {
        const value = await api.preparationPreview(d, r, {
            config: cfg,
            textPage,
            chunkPage
        }, abort.signal);
        if (!alive || epoch !== previewEpoch || id !== identity.value || profile !== context.value?.profileId || !sameConfig(cfg, config.value) || abort.signal.aborted)
            return;
        if (value.profileId !== profile || !sameConfig(value.resolvedConfig, cfg) || !/^[a-f0-9]{64}$/i.test(value.previewKey))
            throw new Error("INVALID_INDEX_CONFIGURATION");
        preview.value = value;
        previewIdentity = id;
        previewConfig = JSON.stringify(cfg);
    }
    catch (e) {
        if (alive && epoch === previewEpoch && id === identity.value && !abort.signal.aborted)
            error.value = failure(e);
    }
    finally {
        if (epoch === previewEpoch)
            previewLoading.value = false;
    }
}
async function reprocess() {
    if (busy.value || !canReprocess.value || !preview.value || !context.value || !revision.value)
        return;
    const epoch = ++queueEpoch, id = identity.value, p = preview.value, profile = context.value.profileId, r = revision.value.id, cfg = {
        ...p.resolvedConfig
    };
    if (!intentKey)
        intentKey = crypto.randomUUID();
    const key = intentKey;
    const current = () => alive && epoch === queueEpoch && id === identity.value && props.modelValue && canReprocess.value && preview.value === p && context.value?.profileId === profile && sameConfig(cfg, config.value) && intentKey === key;
    confirming.value = true;
    try {
        await ElMessageBox.confirm(p.ocrSample ? `当前仅预览前 ${p.ocrSample.sampledPages} 页，将在后台分批识别全部 ${p.ocrSample.totalPages} 页并入库。处理失败可从已完成页面继续重试。新内容成功前继续使用原有内容。` : "将按本次预览的解析和分段设置重新处理。新内容成功前继续使用原有内容。", "重新处理文档", {
            confirmButtonText: "确认重新处理",
            cancelButtonText: "取消",
            type: "warning"
        });
    }
    catch {
        return;
    }
    finally {
        if (epoch === queueEpoch)
            confirming.value = false;
    }
    if (!current())
        return;
    queueLoading.value = true;
    error.value = "";
    try {
        const job = await api.reindex(r, profile, cfg, key);
        if (!current())
            return;
        if (["FAILED", "CANCELLED"].includes(job.status)) {
            error.value = job.errorCode ? safeReason(job.errorCode) : "处理任务失败或已取消，请检查后重试或重新预览";
            return;
        }
        ElMessage.success(["READY", "SUCCEEDED"].includes(job.status) ? "此处理任务已完成" : "已提交后台处理");
        emit("changed");
        emit("update:modelValue", false);
    }
    catch (e) {
        if (current())
            error.value = failure(e);
    }
    finally {
        if (epoch === queueEpoch)
            queueLoading.value = false;
    }
}
watch(() => [form.parseMode, form.targetTokens, form.maxTokens, form.overlapTokens], () => {
    if (!initializing) {
        invalidatePreview();
        error.value = "";
    }
}, {
    flush: "sync"
});
watch(identity, () => {
    tab.value = "chunks";
    void loadContext();
}, {
    immediate: true,
    flush: "sync"
});
onBeforeUnmount(() => {
    alive = false;
    invalidateAll();
});
</script>
<style scoped>
.document-processing{display:grid;gap:14px;min-height:160px;max-height:calc(100dvh - 220px);overflow:auto;padding-right:4px}.processing-lead,.processing-note,.processing-count{margin:0;line-height:1.7}.processing-note{color:var(--el-text-color-secondary);font-size:13px}.processing-controls{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:14px}.processing-controls label{display:grid;gap:7px;font-size:13px}.processing-controls input,.processing-controls select{width:100%;box-sizing:border-box;min-width:0;height:34px;border:1px solid var(--el-border-color);border-radius:4px;padding:0 8px;background:var(--el-bg-color);color:var(--el-text-color-primary)}.processing-controls :disabled{background:var(--el-disabled-bg-color);color:var(--el-disabled-text-color);cursor:not-allowed}.processing-actions,.processing-pager{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.processing-invalid{margin:0;color:var(--el-color-danger);font-size:13px}.processing-chunks{display:grid;gap:12px;max-height:40vh;overflow:auto}.processing-chunks article{border:1px solid var(--el-border-color-light);padding:14px;border-radius:6px}.processing-chunks small{color:var(--el-text-color-secondary)}.processing-chunks pre,.processing-original{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.7;font-size:13px}.processing-original{max-height:40vh;overflow:auto}.processing-pager{margin-top:12px;font-size:13px}@media(max-width:700px){.processing-controls{grid-template-columns:1fr 1fr}}
</style>
