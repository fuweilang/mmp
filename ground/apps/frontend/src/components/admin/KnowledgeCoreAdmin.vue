<template>
  <div class="knowledge-core-admin" v-loading="busy">
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <el-tabs v-model="tab">
      <el-tab-pane v-if="!settingsOnly" label="知识库与索引" name="bases">
        <div class="toolbar">
          <el-select v-model="baseId" placeholder="选择知识库" @change="()=>act(loadBase)">
            <el-option v-for="b in bases" :key="b.id" :label="`${b.name}${b.enabled?'':'（已归档）'}`" :value="b.id" />
          </el-select>
          <el-button @click="newBase">新建知识库</el-button>
          <el-button :disabled="!baseId" @click="renameBase">重命名</el-button>
          <el-button :disabled="!baseId" @click="toggleBase">{{ selectedBase?.enabled?'归档':'恢复' }}</el-button>
          <el-button @click="reload">刷新</el-button>
        </div>
        <el-alert v-if="!embeddings.some(p=>configured[p.id])" title="待配置语义服务：请先到「检索服务配置」新建 Embedding 配置；凭据可在同一页面加密配置。" type="warning" :closable="false" />
        <el-button v-if="!embeddings.some(p=>configured[p.id])" @click="tab='profiles'">配置检索服务</el-button>
        <template v-if="selectedBase?.enabled">
          <el-form inline class="upload-form">
            <el-form-item label="Embedding 配置">
              <el-select v-model="profileId" placeholder="选择服务配置">
                <el-option v-for="p in embeddings" :key="p.id" :label="`${p.model} · ${p.dimension}维 · ${p.id}`" :value="p.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="替换资料">
              <el-select v-model="documentId" clearable placeholder="留空新增，选择则新增修订">
                <el-option v-for="d in documents" :key="d.id" :label="d.title" :value="d.id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <input ref="fileInput" type="file" accept=".txt,.md,.markdown,.pdf,.docx,.pptx,.xlsx,.csv" aria-label="选择知识资料" @change="chooseFile" />
            </el-form-item>
            <el-button type="primary" :disabled="!file || !profileId || !configured[profileId]" @click="upload">上传资料</el-button>
          </el-form>
          <p class="muted">单文件 ≤20MiB。上传成功表示原文已保存，语义就绪需独立索引 Worker 完成；失败原文仍可下载。服务连接状态不代表检索质量验收。</p>
          <div v-for="d in documents" :key="d.id" class="document-card">
            <div class="toolbar">
              <strong>{{ d.title }}</strong>
              <el-tag :type="d.enabled?'success':'info'">{{d.enabled?'启用':'已停用'}}</el-tag>
              <el-button size="small" @click="toggleDocument(d)">{{d.enabled?'停用':'启用'}}</el-button>
            </div>
            <div v-for="r in d.revisions" :key="r.id" class="revision">
              <span>{{r.originalName}} · {{r.sizeBytes}} 字节 · {{r.id}}</span>
              <div class="toolbar">
                <a :href="api.originalUrl(d.id,r.id)" download>下载此修订原文</a>
                <el-button size="small" :disabled="!profileId || !d.enabled" @click="reindex(r.id)">新建索引</el-button>
              </div>
              <el-table :data="r.indexes" size="small" border>
                <el-table-column label="加入发布" width="100">
                  <template #default="{row}">
                    <el-checkbox :model-value="selectedIndexes.includes(row.id)" :disabled="!eligible.includes(row.id)" @change="(checked: boolean)=>selectIndex(row.id,checked)" />
                  </template>
                </el-table-column>
                <el-table-column label="状态" min-width="220">
                  <template #default="{row}">{{stateLabel(row.status)}}<p v-if="row.reasonCode" class="error">{{row.reasonCode}}</p>
                </template>
              </el-table-column>
              <el-table-column prop="id" label="不可变索引 ID" min-width="190"/>
              <el-table-column prop="profileId" label="服务配置 ID" min-width="190"/>
              <el-table-column prop="chunkCount" label="分段" width="75"/>
              <el-table-column label="预览" width="100">
                <template #default="{row}">
                  <el-button text :disabled="row.status!=='READY' || !d.enabled" @click="inspect(d.id,r.id,row.id)">正文 / 分段</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
        <el-empty v-if="!documents.length" description="暂无资料" />
        <div class="toolbar">
          <el-button type="primary" :disabled="!selectedIndexes.length" @click="publishRelease">发布选中的完整 READY 索引（{{selectedIndexes.length}}）</el-button>
          <span class="muted">发布版本不可变；归档 / 停用将立即撤销运行时访问。</span>
        </div>
        <el-table :data="releases" border>
          <el-table-column prop="version" label="知识发布版本" width="130"/>
          <el-table-column prop="id" label="发布 ID"/>
          <el-table-column label="索引数" width="100">
            <template #default="{row}">{{row.items.length}}</template>
          </el-table-column>
        </el-table>
      </template>
      <el-collapse v-if="jobs.length">
        <el-collapse-item title="本次管理任务（刷新可查状态；支持粘贴任务 ID 恢复）">
          <div class="toolbar">
            <el-input v-model="jobLookup" placeholder="任务 ID"/>
            <el-button :disabled="!jobLookup.trim()" @click="lookupJob">查看任务</el-button>
          </div>
          <el-table :data="jobs" border>
            <el-table-column prop="id" label="任务 ID"/>
            <el-table-column label="状态">
              <template #default="{row}">{{stateLabel(row.status)}} · {{row.stage}}<p v-if="row.index">索引：{{stateLabel(row.index.status)}}</p>
              <p>{{row.errorCode || ''}}</p>
            </template>
          </el-table-column>
          <el-table-column prop="attempts" label="尝试次数" width="90"/>
          <el-table-column label="操作" width="240">
            <template #default="{row}">
              <el-button text @click="refreshJob(row.id)">刷新</el-button>
              <el-button text :disabled="!['FAILED','CANCELLED'].includes(row.status)" @click="jobAction(row.id,'retry')">重试</el-button>
              <el-button text :disabled="!['QUEUED','RUNNING'].includes(row.status)" @click="jobAction(row.id,'cancel')">取消</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>
    <div v-else class="toolbar">
      <el-input v-model="jobLookup" placeholder="输入任务 ID 恢复查看"/>
      <el-button :disabled="!jobLookup.trim()" @click="lookupJob">查看任务</el-button>
    </div>
  </el-tab-pane>
  <el-tab-pane label="检索服务配置" name="profiles">
    <el-alert title="Embedding / Rerank 独立于聊天模型。支持本机真实模型服务和云端服务；供应商凭据加密保存。更换向量模型后，须为原文档重建索引，旧索引不会自动转换。" type="info" :closable="false" />
    <p class="muted">本机模型服务需持续运行；在其他服务器部署后台时，请将端点改为后台可访问的真实服务地址。Rerank 为可选项，未配置时使用向量与关键词融合检索。本地检查只验证配置；主动探测才会实际请求服务。</p>
    <div class="toolbar">
      <el-button @click="openProvider()">新建供应商凭据</el-button>
      <router-link to="/admin/models">聊天模型管理</router-link>
      <el-button @click="openProfile()">新建服务配置</el-button>
    </div>
    <el-table :data="providers" border aria-label="供应商凭据">
      <el-table-column prop="displayName" label="供应商" />
      <el-table-column prop="name" label="短名" />
      <el-table-column prop="baseUrl" label="Base URL" />
      <el-table-column label="密钥"><template #default="{row}">{{row.hasApiKey ? row.apiKeyMasked : '未配置'}}</template></el-table-column>
      <el-table-column label="聊天模型数"><template #default="{row}">{{row.models.length}}</template></el-table-column>
      <el-table-column label="状态"><template #default="{row}">{{row.enabled?'启用':'停用'}}</template></el-table-column>
      <el-table-column label="操作"><template #default="{row}"><el-button text @click="openProvider(row)">管理凭据</el-button></template></el-table-column>
    </el-table>
    <p class="muted">更换密钥影响所有引用此供应商的聊天模型及检索配置。若已有聊天模型，保存凭据或重新启用会触发现有聊天连通探测，可能计费。修改 Base URL 不会改写已冻结的检索端点；请创建后继服务配置。</p>
    <el-table :data="profiles" border>
      <el-table-column prop="task" label="任务" width="110"/>
      <el-table-column prop="model" label="供应商模型名"/>
      <el-table-column label="供应商与端点" min-width="240"><template #default="{row}"><span>{{providers.find(p=>p.id===row.providerId)?.displayName || '供应商不可用'}}</span><p class="muted">{{row.endpoint}}</p></template></el-table-column>
      <el-table-column prop="dimension" label="维度" width="80"/>
      <el-table-column prop="id" label="不可变配置 ID"/>
      <el-table-column label="状态" min-width="200">
        <template #default="{row}">{{row.enabled?'启用':'停用'}}<p>{{profileHealth[row.id] || '尚未检查本地配置'}}</p>
      </template>
    </el-table-column>
    <el-table-column label="操作" min-width="320">
      <template #default="{row}">
        <el-button text @click="health(row.id)">本地检查</el-button>
        <el-button text @click="probe(row.id)">主动探测（可能计费）</el-button>
        <el-button text @click="openProfile(row)">创建后继版本</el-button>
        <el-button text @click="enableProfile(row)">{{row.enabled?'停用':'启用'}}</el-button>
      </template>
    </el-table-column>
  </el-table>
  <el-empty v-if="!profiles.length" description="尚未配置检索服务" />
</el-tab-pane>
<el-tab-pane label="问题检索测试" name="test">
  <el-alert title="仅检索已发布的新知识版本。候选分数只在对应路线 / 配置内有效，跨配置按排名融合。测试结果不代表真实供应商质量已验收。" type="info" :closable="false" />
  <el-form label-width="110px">
    <el-form-item label="知识发布版本">
      <el-select v-model="testReleaseIds" multiple filterable placeholder="选择最多 20 个版本">
        <el-option v-for="r in allReleases" :key="r.id" :value="r.id" :label="`${r.baseName} · v${r.version} · ${r.id}`" />
      </el-select>
    </el-form-item>
    <el-form-item label="问题">
      <el-input v-model="query" type="textarea" :rows="3" maxlength="2000" show-word-limit/>
    </el-form-item>
    <el-form-item label="检索模式">
      <el-select v-model="mode">
        <el-option label="必须语义检索 required" value="required"/>
        <el-option label="允许明确降级 optional" value="optional"/>
      </el-select>
    </el-form-item>
    <el-form-item label="Embedding 约束">
      <el-select v-model="testEmbeddingId" clearable placeholder="可选，必须与全部索引兼容">
        <el-option v-for="p in embeddings" :key="p.id" :label="`${p.model} · ${p.id}`" :value="p.id" />
      </el-select>
    </el-form-item>
    <el-form-item label="Rerank">
      <el-select v-model="testRerankId" clearable placeholder="不配置则使用融合排序">
        <el-option v-for="p in reranks" :key="p.id" :label="`${p.model} · ${p.id}`" :value="p.id" />
      </el-select>
    </el-form-item>
    <el-form-item label="证据预算">
      <el-input-number v-model="budgetTokens" :min="0" :max="8000" :step="256"/>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" :disabled="testing || !query.trim() || !testReleaseIds.length || testReleaseIds.length>20" @click="runTest">运行检索测试</el-button>
      <el-button v-if="testing" @click="testAbort?.abort()">取消测试</el-button>
      <el-button @click="loadAllReleases">刷新发布版本</el-button>
    </el-form-item>
  </el-form>
  <template v-if="result">
    <el-alert :title="`检索状态：${result.status}`" :type="result.status==='READY'?'success':'warning'" :closable="false"/>
    <p>降级 / 错误：{{result.degradation?.join('；') || '无'}} · 证据 Token：{{result.context?.tokenCount ?? 0}} · 截断：{{result.context?.truncated?'是':'否'}}</p>
    <p>实际查询：{{result.queries?.join(' / ')}}</p>
    <pre>{{JSON.stringify({timings:result.timings,counts:result.diagnostics?.counts,stageTimings:result.diagnostics?.timings},null,2)}}</pre>
    <h3>最终证据</h3>
    <div v-for="e in result.evidence" :key="e.chunkId" class="document-card">
      <strong>[{{e.citation}}] {{e.sourceTitle}}</strong>
      <pre>{{e.text}}</pre>
      <pre>{{JSON.stringify(e.locator,null,2)}}</pre>
      <el-button @click="openEvidence(e)">打开精确引用原文</el-button>
    </div>
    <h3>检索候选</h3>
    <p v-if="result.diagnostics?.truncated">候选过多，仅显示受保护诊断的前 100 项。</p>
    <el-table :data="result.diagnostics?.candidates || []" border>
      <el-table-column prop="sourceTitle" label="来源"/>
      <el-table-column prop="snippet" label="片段" min-width="240"/>
      <el-table-column prop="reason" label="保留 / 丢弃原因"/>
      <el-table-column prop="fusionRank" label="融合排名" width="90"/>
      <el-table-column prop="rerankRank" label="重排排名" width="90"/>
      <el-table-column prop="finalRank" label="最终排名" width="90"/>
      <el-table-column type="expand">
        <template #default="{row}">
          <pre>{{JSON.stringify(row,null,2)}}</pre>
        </template>
      </el-table-column>
    </el-table>
  </template>
</el-tab-pane>
</el-tabs>
<el-dialog v-model="profileOpen" :title="profileForm.predecessorId?'创建后继配置（旧配置保持不变）':'新建检索配置'" width="650px">
  <el-form label-width="140px">
    <el-form-item label="供应商">
      <el-select v-model="profileForm.providerId" filterable>
        <el-option v-for="p in providers" :key="p.id" :value="p.id" :label="`${p.displayName}${p.enabled?'':'（停用）'}${p.hasApiKey?'':'（未配密钥）'}`" />
      </el-select>
    </el-form-item>
    <el-form-item label="任务">
      <el-select v-model="profileForm.task">
        <el-option label="Embedding" value="EMBEDDING"/>
        <el-option label="Rerank" value="RERANK"/>
      </el-select>
    </el-form-item>
    <el-form-item label="供应商模型名">
      <el-input v-model="profileForm.model" placeholder="填写供应商模型名，不是聊天模型数据库 ID" maxlength="200"/>
    </el-form-item>
    <el-form-item v-if="profileForm.task==='EMBEDDING'" label="向量维度">
      <el-input-number v-model="profileForm.dimension" :min="1" :max="16000"/>
    </el-form-item>
    <el-form-item label="Tokenizer">
      <el-select v-model="profileForm.tokenizer">
        <el-option label="cl100k_base" value="cl100k_base"/>
        <el-option label="o200k_base" value="o200k_base"/>
      </el-select>
    </el-form-item>
    <el-form-item label="完整接口 Endpoint">
      <el-input v-model="profileForm.endpoint" placeholder="HTTPS URL；留空由供应商基础地址派生" maxlength="2048"/>
    </el-form-item>
    <el-form-item label="超时（ms）">
      <el-input-number v-model="profileForm.timeoutMs" :min="1" :max="120000"/>
    </el-form-item>
    <el-form-item label="批量大小">
      <el-input-number v-model="profileForm.batchSize" :min="1" :max="128"/>
    </el-form-item>
    <el-form-item label="输入 Token 上限">
      <el-input-number v-model="profileForm.maxInputTokens" :min="1" :max="131072"/>
    </el-form-item>
    <el-form-item label="响应字节上限">
      <el-input-number v-model="profileForm.maxResponseBytes" :min="1024" :max="16777216"/>
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="profileOpen=false">取消</el-button>
    <el-button type="primary" :disabled="!profileForm.providerId || !profileForm.model.trim() || busy" @click="saveProfile">创建配置</el-button>
  </template>
</el-dialog>
<el-dialog v-model="providerOpen" :title="providerEditId ? '管理供应商凭据' : '新建供应商凭据'" width="620px" @closed="clearProviderSecret">
  <el-form label-width="100px">
    <el-form-item label="供应商短名"><el-input v-model="providerForm.name" :disabled="!!providerEditId" placeholder="字母、数字、点、下划线或短横线" /></el-form-item>
    <el-form-item label="显示名称"><el-input v-model="providerForm.displayName" /></el-form-item>
    <el-form-item label="Base URL"><el-input v-model="providerForm.baseUrl" placeholder="https://供应商地址/v1" /></el-form-item>
    <el-form-item label="API Key"><el-input v-model="providerForm.apiKey" type="password" autocomplete="new-password" :disabled="providerForm.clearApiKey" :placeholder="providerEditId ? '留空保留现有密钥；填写则轮换' : '输入供应商密钥（加密保存）'" /></el-form-item>
    <el-form-item v-if="providerEditId" label="清除密钥"><el-checkbox v-model="providerForm.clearApiKey" @change="providerForm.apiKey=''">明确清除已保存密钥</el-checkbox></el-form-item>
    <el-form-item label="启用"><el-switch v-model="providerForm.enabled" /></el-form-item>
  </el-form>
  <template #footer><el-button @click="providerOpen=false">取消</el-button><el-button type="primary" :disabled="busy || !providerForm.name.trim() || !providerForm.displayName.trim()" @click="saveProvider">保存凭据</el-button></template>
</el-dialog>
<el-dialog v-model="inspectionOpen" title="不可变正文与分段" width="850px">
  <p>正文按 UTF-16 偏移分页，分段保留定位信息；全部内容以纯文本显示。</p>
  <pre>{{extracted?.text}}</pre>
  <p v-if="extracted?.hasGaps">此窗口含无存储正文的间隙。</p>
  <el-button :disabled="extracted?.nextOffset==null" @click="moreText">下一段正文</el-button>
  <div v-for="c in chunkPage?.chunks" :key="c.id" class="document-card">
    <strong>#{{c.ordinal}} · {{c.id}} · {{c.sourceStart}}–{{c.sourceEnd}}</strong>
    <pre>{{c.text}}</pre>
    <pre>{{JSON.stringify(c.locator,null,2)}}</pre>
  </div>
  <el-button :disabled="chunkPage?.nextOffset==null" @click="moreChunks">下一页分段</el-button>
</el-dialog>
<el-dialog v-model="sourceOpen" title="精确引用原文" width="780px">
  <pre>{{source?.text}}</pre>
  <pre>{{JSON.stringify(source,null,2)}}</pre>
</el-dialog>
</div>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminKnowledgeCoreApi as api, type AdminLlmProviderRow, type KnowledgeProfile, type KnowledgeBase, type KnowledgeDocument, type KnowledgeRelease, type KnowledgeJob, type KnowledgeEvidence, type KnowledgeTestResult } from '../../api/admin';
import { knowledgeStateLabel as stateLabel, profileCreatePayload, releaseEligibleIndexes } from '../../utils/knowledge-admin';
const props = withDefaults(defineProps<{settingsOnly?:boolean}>(),{settingsOnly:false});
const tab = ref(props.settingsOnly ? 'profiles' : 'bases'), busy = ref(false), error = ref('');
const profiles = ref<KnowledgeProfile[]>([]), providers = ref<AdminLlmProviderRow[]>([]), bases = ref<KnowledgeBase[]>([]), baseId = ref(''), documents = ref<KnowledgeDocument[]>([]), releases = ref<KnowledgeRelease[]>([]), allReleases = ref<Array<KnowledgeRelease & {
    baseName: string;
}>>([]);
const profileId = ref(''), documentId = ref(''), file = ref<File>(), fileInput = ref<HTMLInputElement>(), selectedIndexes = ref<string[]>([]), jobs = ref<KnowledgeJob[]>([]), jobLookup = ref('');
const selectedBase = computed(() => bases.value.find(b => b.id === baseId.value)), embeddings = computed(() => profiles.value.filter(p => p.enabled && p.task === 'EMBEDDING')), reranks = computed(() => profiles.value.filter(p => p.enabled && p.task === 'RERANK')), eligible = computed(() => releaseEligibleIndexes(documents.value, profiles.value));
async function act(fn: () => Promise<void>) { error.value = ''; busy.value = true; try {
    await fn();
}
catch (e) {
    if (e === 'cancel' || e === 'close')
        return;
    error.value = e instanceof Error ? e.message : '操作失败，请重试';
}
finally {
    busy.value = false;
} }
async function loadBase() { documents.value = []; releases.value = []; selectedIndexes.value = []; documentId.value = ''; if (!selectedBase.value?.enabled)
    return; const id = baseId.value; const [d, r] = await Promise.all([api.documents(id), api.releases(id)]); if (id === baseId.value) {
    documents.value = d;
    releases.value = r;
} }
async function loadAllReleases() { await act(async () => { allReleases.value = (await Promise.all(bases.value.filter(b => b.enabled).map(async (b) => (await api.releases(b.id)).map(r => ({ ...r, baseName: b.name }))))).flat(); }); }
async function reload() { await act(async () => { [profiles.value, providers.value, bases.value] = await Promise.all([api.profiles(), api.providers(), api.bases()]); for (const p of profiles.value) {
    const h = await api.health(p.id);
    configured.value[p.id] = h.configured;
    profileHealth[p.id] = h.configured ? '本地配置有效（未请求供应商）' : `待配置：${h.errorCode}`;
} if (!baseId.value && bases.value.length)
    baseId.value = bases.value[0]!.id; await loadBase(); allReleases.value = (await Promise.all(bases.value.filter(b => b.enabled).map(async (b) => (await api.releases(b.id)).map(r => ({ ...r, baseName: b.name }))))).flat(); }); }
async function newBase() { await act(async () => { const { value } = await ElMessageBox.prompt('知识库名称', '新建知识库', { inputValidator: v => !!v.trim() || '请填写名称' }); const b = await api.createBase(value.trim()); bases.value.push(b); baseId.value = b.id; await loadBase(); }); }
async function renameBase() { await act(async () => { const { value } = await ElMessageBox.prompt('知识库名称', '重命名', { inputValue: selectedBase.value?.name, inputValidator: v => !!v.trim() || '请填写名称' }); await api.updateBase(baseId.value, { name: value.trim() }); await reload(); }); }
async function toggleBase() { await act(async () => { const enabled = !selectedBase.value?.enabled; await ElMessageBox.confirm(enabled ? '恢复知识库访问？' : '归档后，已发布专家也不能访问此知识库。', '确认'); await api.updateBase(baseId.value, { enabled }); await reload(); }); }
function chooseFile(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0]; }
function rememberJob(j: KnowledgeJob) { jobs.value = [j, ...jobs.value.filter(x => x.id !== j.id)]; }
async function upload() { await act(async () => { if (!file.value)
    return; if (file.value.size > 20 * 1024 * 1024)
    throw new Error('文件不能超过 20MiB'); const body = new FormData(); body.set('file', file.value); body.set('profileId', profileId.value); body.set('idempotencyKey', crypto.randomUUID()); if (documentId.value)
    body.set('documentId', documentId.value); rememberJob(await api.upload(baseId.value, body)); ElMessage.success('上传成功，语义索引尚未就绪；请刷新任务状态。'); file.value = undefined; if (fileInput.value)
    fileInput.value.value = ''; await loadBase(); }); }
async function reindex(id: string) { await act(async () => { rememberJob(await api.reindex(id, profileId.value)); await loadBase(); }); }
async function toggleDocument(d: KnowledgeDocument) { await act(async () => { await api.enableDocument(d.id, !d.enabled); await loadBase(); }); }
async function refreshJob(id: string) { await act(async () => { rememberJob(await api.job(id)); await loadBase(); }); }
async function lookupJob() { await refreshJob(jobLookup.value.trim()); }
async function jobAction(id: string, action: 'retry' | 'cancel') { await act(async () => { rememberJob(await api.jobAction(id, action)); await loadBase(); }); }
function selectIndex(id: string, checked: boolean) { selectedIndexes.value = checked ? [...new Set([...selectedIndexes.value, id])] : selectedIndexes.value.filter(x => x !== id); }
async function publishRelease() { await act(async () => { const ids = selectedIndexes.value.filter(id => eligible.value.includes(id)); if (ids.length !== selectedIndexes.value.length)
    throw new Error('所选索引已不可发布，请刷新'); await api.release(baseId.value, ids); ElMessage.success('不可变知识版本已发布'); await reload(); }); }
const providerOpen = ref(false), providerEditId = ref('');
const providerForm = reactive({name:'', displayName:'', baseUrl:'', apiKey:'', clearApiKey:false, enabled:true});
function clearProviderSecret() { providerForm.apiKey = ''; providerForm.clearApiKey = false; }
function openProvider(p?: AdminLlmProviderRow) {
  providerEditId.value = p?.id ?? '';
  Object.assign(providerForm, {name:p?.name ?? '', displayName:p?.displayName ?? '', baseUrl:p?.baseUrl ?? '', apiKey:'', clearApiKey:false, enabled:p?.enabled ?? true});
  providerOpen.value = true;
}
async function saveProvider() { await act(async () => {
  if (providerForm.clearApiKey) await ElMessageBox.confirm('清除后所有引用此供应商的服务将无法请求。确认清除？', '清除供应商密钥');
  const fields = {displayName:providerForm.displayName.trim(), baseUrl:providerForm.baseUrl.trim(), enabled:providerForm.enabled, ...(providerForm.apiKey.trim() ? {apiKey:providerForm.apiKey.trim()} : {})};
  if (providerEditId.value) await api.updateProvider(providerEditId.value, {...fields, clearApiKey:providerForm.clearApiKey});
  else await api.createProvider({...fields, name:providerForm.name.trim()});
  clearProviderSecret(); providerOpen.value = false; await reload(); ElMessage.success('供应商凭据已保存');
}); }
const configured = ref<Record<string, boolean>>({});
const profileOpen = ref(false), profileHealth = reactive<Record<string, string>>({});
const defaults = () => ({ providerId: '', task: 'EMBEDDING' as 'EMBEDDING' | 'RERANK', model: '', dimension: 1536, tokenizer: 'cl100k_base' as 'cl100k_base' | 'o200k_base', endpoint: '', timeoutMs: 30000, batchSize: 32, maxInputTokens: 8192, maxResponseBytes: 4194304, predecessorId: '' });
const profileForm = reactive(defaults());
function openProfile(p?: KnowledgeProfile) { Object.assign(profileForm, defaults(), p ? { ...p, dimension: p.dimension ?? 1536, predecessorId: p.id } : {}); profileOpen.value = true; }
async function saveProfile() { await act(async () => { await api.createProfile(profileCreatePayload(profileForm)); profileOpen.value = false; await reload(); }); }
async function enableProfile(p: KnowledgeProfile) { await act(async () => { await api.enableProfile(p.id, !p.enabled); await reload(); }); }
async function health(id: string) { await act(async () => { const r = await api.health(id); configured.value[id] = r.configured; profileHealth[id] = r.configured ? '本地配置有效（未请求供应商）' : `待配置：${r.errorCode}`; }); }
async function probe(id: string) { await act(async () => { await ElMessageBox.confirm('将向供应商发送固定的「连接测试」输入，可能产生计费。连接成功不代表检索质量合格。', '主动探测', { confirmButtonText: '发送探测（可能计费）' }); const r = await api.probe(id); profileHealth[id] = r.available ? `连接成功 · ${r.durationMs}ms · 估算 ${r.estimatedTokens} / 实际 ${r.actualTokens ?? '供应商未提供'} Token` : `连接失败：${r.errorCode}`; }); }
const inspectionOpen = ref(false), inspectIds = ref<string[]>([]), chunkPage = ref<Awaited<ReturnType<typeof api.chunks>>>(), extracted = ref<Awaited<ReturnType<typeof api.extracted>>>();
async function inspect(d: string, r: string, i: string) { await act(async () => { inspectIds.value = [d, r, i]; [chunkPage.value, extracted.value] = await Promise.all([api.chunks(d, r, i), api.extracted(d, r, i)]); inspectionOpen.value = true; }); }
async function moreText() { await act(async () => { const [d, r, i] = inspectIds.value; extracted.value = await api.extracted(d!, r!, i!, extracted.value?.nextOffset ?? 0); }); }
async function moreChunks() { await act(async () => { const [d, r, i] = inspectIds.value; chunkPage.value = await api.chunks(d!, r!, i!, chunkPage.value?.nextOffset ?? 0); }); }
const testReleaseIds = ref<string[]>([]), query = ref(''), mode = ref<'required' | 'optional'>('required'), budgetTokens = ref(8000), testEmbeddingId = ref(''), testRerankId = ref(''), testing = ref(false), result = ref<KnowledgeTestResult>();
let testAbort: AbortController | undefined;
async function runTest() { error.value = ''; testing.value = true; result.value = undefined; testAbort = new AbortController(); try {
    result.value = await api.test({ query: query.value, releaseIds: testReleaseIds.value, mode: mode.value, budgetTokens: budgetTokens.value, ...(testEmbeddingId.value ? { embeddingProfileId: testEmbeddingId.value } : {}), ...(testRerankId.value ? { rerankProfileId: testRerankId.value } : {}) }, testAbort.signal);
}
catch (e) {
    error.value = testAbort.signal.aborted ? '检索已取消' : e instanceof Error ? e.message : '检索失败';
}
finally {
    testing.value = false;
} }
const sourceOpen = ref(false), source = ref<Awaited<ReturnType<typeof api.openSource>>>();
async function openEvidence(e: KnowledgeEvidence) { await act(async () => { source.value = await api.openSource({ knowledgeReleaseId: e.knowledgeReleaseId, documentId: e.documentId, revisionId: e.revisionId, indexRevisionId: e.indexRevisionId, chunkId: e.chunkId }); sourceOpen.value = true; }); }
onMounted(reload);
onBeforeUnmount(() => testAbort?.abort());
</script>
<style scoped>
.knowledge-core-admin{min-width:0}.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0}.toolbar .el-input{max-width:420px}.el-select{min-width:240px;max-width:100%}.upload-form{margin-top:20px}.document-card{border:1px solid var(--el-border-color);padding:16px;margin:16px 0;border-radius:8px}.revision{border-top:1px solid var(--el-border-color-lighter);padding:12px 0}.muted{color:var(--el-text-color-secondary);font-size:13px}.error{color:var(--el-color-danger)}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--el-fill-color-light);padding:12px;max-height:420px;overflow:auto}a{color:var(--el-color-primary)}
</style>
