<template>
  <!-- Expert: minimal horizontal preview + single upload button (t74/t75). -->
  <div v-if="profile === 'expert'" class="catalog-icon-editor catalog-icon-editor--expert">
    <div class="catalog-icon-preview catalog-icon-preview--expert" aria-hidden="true">
      <img v-if="preview && !broken" :src="preview" alt="" @error="broken = true" />
      <ImageIcon v-else :size="22" />
    </div>
    <div class="catalog-icon-controls catalog-icon-controls--expert">
      <div class="catalog-icon-buttons">
        <el-upload
          ref="upload"
          :accept="accept"
          :auto-upload="false"
          :show-file-list="false"
          :disabled="disabled || checking"
          :on-change="picked"
        >
          <el-button :disabled="disabled" :loading="checking">上传图片</el-button>
        </el-upload>
        <el-button
          v-if="preview || modelValue"
          text
          type="danger"
          :disabled="disabled || checking"
          @click="remove"
        >
          移除
        </el-button>
        <el-button
          v-if="removed && currentUrl"
          text
          :disabled="disabled || checking"
          @click="emit('update:removed', false)"
        >
          保留原图
        </el-button>
      </div>
      <p class="catalog-icon-hint">支持 PNG/JPG/WebP/GIF/SVG，最大 5MB。</p>
    </div>
  </div>

  <!-- Skill: legacy compact icon picker (unchanged semantics). -->
  <div v-else class="catalog-icon-editor">
    <div class="catalog-icon-preview" aria-hidden="true">
      <img v-if="preview && !broken" :src="preview" alt="" @error="broken = true" />
      <ImageIcon v-else :size="24" />
    </div>
    <div class="catalog-icon-controls">
      <div class="catalog-icon-buttons">
        <el-upload
          ref="upload"
          :accept="accept"
          :auto-upload="false"
          :show-file-list="false"
          :disabled="disabled || checking"
          :on-change="picked"
        >
          <el-button :disabled="disabled" :loading="checking">
            {{ preview ? '替换图标' : '选择图标' }}
          </el-button>
        </el-upload>
        <el-button v-if="preview || modelValue" :disabled="disabled || checking" @click="remove">
          移除图标
        </el-button>
        <el-button
          v-if="removed && currentUrl"
          :disabled="disabled || checking"
          @click="emit('update:removed', false)"
        >
          保留原图
        </el-button>
      </div>
      <p>可选PNG / JPG / WebP，≤2MB，建议方图；无图使用功能图标。</p>
      <p>
        {{
          removed
            ? '保存后移除图标，取消不会生效。'
            : '选择后仅预览，保存才上传；取消不会改动现有图标。'
        }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage, type UploadFile, type UploadInstance } from 'element-plus';
import { Image as ImageIcon } from 'lucide-vue-next';
import {
  sanitizeSvgTextForPreview,
  validateCatalogImage,
  type CatalogImageProfile,
} from '../utils/catalog-image';

const props = withDefaults(
  defineProps<{
    modelValue: File | null;
    removed: boolean;
    currentUrl?: string | null;
    disabled?: boolean;
    /** skill: legacy 2MB raster-only. expert: 5MB + GIF/SVG, direct centered preview, no crop. */
    profile?: CatalogImageProfile;
  }>(),
  { profile: 'skill' },
);
const emit = defineEmits<{
  'update:modelValue': [File | null];
  'update:removed': [boolean];
  validating: [boolean];
}>();

const upload = ref<UploadInstance>();
const checking = ref(false);
const localUrl = ref('');
const broken = ref(false);
let sequence = 0;

const preview = computed(() => (props.removed ? '' : localUrl.value || props.currentUrl || ''));
const accept = computed(() =>
  props.profile === 'expert'
    ? '.png,.jpg,.jpeg,.webp,.gif,.svg,image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
    : '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
);

/** Display URL for a pending file. SVG uses a sanitized blob so preview never executes scripts. Original File is still emitted for server-side rasterization. */
async function buildPreviewUrl(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (name.endsWith('.svg') || mime.includes('svg')) {
    const raw = await file.text();
    const sanitized = sanitizeSvgTextForPreview(raw);
    return URL.createObjectURL(new Blob([sanitized], { type: 'image/svg+xml' }));
  }
  return URL.createObjectURL(file);
}

watch(
  () => props.modelValue,
  async (file) => {
    if (localUrl.value) URL.revokeObjectURL(localUrl.value);
    localUrl.value = '';
    if (!file) return;
    try {
      localUrl.value = await buildPreviewUrl(file);
    } catch {
      // Fallback object URL; broken flag handles decode failures in <img>.
      localUrl.value = URL.createObjectURL(file);
    }
  },
  { immediate: true },
);
watch(preview, () => {
  broken.value = false;
});

async function picked(value: UploadFile) {
  const file = value.raw;
  upload.value?.clearFiles();
  if (!file || props.disabled) return;
  const request = ++sequence;
  checking.value = true;
  emit('validating', true);
  try {
    await validateCatalogImage(file, props.profile);
    if (request !== sequence) return;
    // Keep the original bytes for upload; backend does safe format conversion. No client crop/scale.
    emit('update:modelValue', file);
    emit('update:removed', false);
  } catch (error) {
    if (request === sequence) ElMessage.error(error instanceof Error ? error.message : '图片无效');
  } finally {
    if (request === sequence) {
      checking.value = false;
      emit('validating', false);
    }
  }
}

function remove() {
  emit('update:modelValue', null);
  emit('update:removed', true);
}

onBeforeUnmount(() => {
  sequence += 1;
  if (localUrl.value) URL.revokeObjectURL(localUrl.value);
  emit('validating', false);
});
</script>

<style scoped>
.catalog-icon-editor {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  max-width: 100%;
}
.catalog-icon-editor--expert {
  align-items: center;
  gap: 12px;
}
.catalog-icon-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 64px;
  height: 64px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  overflow: hidden;
}
.catalog-icon-preview--expert {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  /* Checkerboard so transparent PNGs are visible without stretching. */
  background-color: #f2f4f7;
  background-image:
    linear-gradient(45deg, #e4e7ec 25%, transparent 25%),
    linear-gradient(-45deg, #e4e7ec 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e4e7ec 75%),
    linear-gradient(-45deg, transparent 75%, #e4e7ec 75%);
  background-size: 12px 12px;
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
}
.catalog-icon-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.catalog-icon-preview--expert img {
  /* t75: center + contain — no cover crop, no stretch. */
  object-fit: contain;
  object-position: center;
  background: transparent;
}
.catalog-icon-controls {
  min-width: 0;
}
.catalog-icon-controls--expert {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.catalog-icon-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.catalog-icon-buttons > .el-button {
  margin-left: 0;
}
.catalog-icon-controls p,
.catalog-icon-hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
  margin: 5px 0 0;
}
.catalog-icon-controls--expert .catalog-icon-hint {
  margin: 0;
}
@media (max-width: 560px) {
  .catalog-icon-editor {
    flex-direction: column;
    gap: 10px;
  }
}
</style>
