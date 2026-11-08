# enterprise-library 设计

## 现状

- 中台：NestJS + Prisma + Vue3 / Element Plus。登录态在 Cookie JWT，`JwtGuard` 把 `tenantId` 写进请求。
- 知识库：`kb_folder` / `kb_document` / `kb_chunk`。上传类型比资料库窄，可见性是全员或指定成员，没有版本和回收站。保留不动。
- 模型：`LlmChatGatewayService` 用超管模型池和首选 / AUTO 回落。资料库问答走这条网关，不新增厂商配置。
- 容量：现有 `Quota` 是轮次和 Token，没有文件容量字段。资料库用环境变量，不把 `Quota` 改成文件配额后台。
- 终端：`mammoth-agent` 的侧栏槽位属于 `ui-sidebar`。接入要新的 client 插件、词典和快照。首期不做。

## 数据

`LibraryNode` 是文件、文件夹或链接。`LibraryVersion` 是文件的一个字节版本。`LibraryChunk` 只属于一个版本。替换版本是新增行，不改旧行的正文。

`scope` 只有 `PRIVATE` 和 `ENTERPRISE`。移动只改 `parentId`。共享只改 `scope`，且请求必须带 `confirmShare=true`。

`state`：`ACTIVE`、`RECYCLED`、`PURGED`。回收写 `recycledAt`。超过保留天数后清正文并标 `PURGED`，行还在，用来回答「这份来源没了」。不把引用改到别的 ID。

物理键是 `tenantId/versionId.ext`。原始文件名只做显示。首次上传先把节点写入事务，再写版本和摘录，因为 `library_version.node_id` 外键指向 `library_node`。文件字节在事务外；事务失败就删掉刚写入的文件。替换版本同样把新版本、摘录和当前版本指针放在一个事务里。

## 权限

能看见，才可能出现在列表、搜索、下载、预览、问答和引用里。看不见一律 404，正文和标题都不返回。

- 私人：所有者，且仍是本企业成员。企业管理员没有额外权利。
- 企业共享：本企业成员可读。改名、移动、回收、彻底删除：所有者或企业管理员。
- 平台管理员：默认可看各租户的数量和容量，不能读正文。代管记录写明租户、范围（企业共享，或某一所有者的私人）、权限（只读或代管写）、到期和原因。撤销后后续请求失败。不承诺抹掉已经读过的历史。
- 成员离开企业：不改 `scope`。他不再是成员，连自己的私人资料也进不去；其他人仍然看不见。

代管不绕过回收和彻底删除的状态。

## 解析

允许扩展名：pdf、doc、docx、ppt、pptx、xls、xlsx、md、markdown、txt、csv、html、htm、zip。其它拒绝。单文件默认 20MB，与知识库上限一致，可用 `LIBRARY_MAX_FILE_BYTES` 覆盖。企业容量默认 5GB（`LIBRARY_TENANT_QUOTA_BYTES`），计入未彻底删除的全部版本，含回收站和旧版本。回收保留默认 30 天（`LIBRARY_RECYCLE_DAYS`）。

| 类型 | 结果 |
|----|------|
| md、txt、csv、html | 提取文字。HTML 去掉 script/style，预览不当成页面执行 |
| docx | 只读 `word/document.xml` 的段落 |
| 文字型 pdf | 能对应到页面内容流才写页码，否则只写段落 |
| 无可提取文字的 pdf | 仅下载，原因写明 OCR 后置 |
| ppt、pptx、xls、xlsx、doc、zip | 仅下载。zip 不枚举、不解压、不建 chunk |
| 解析异常 | 失败，可重试。重试先删该版本的 chunk 再写入 |

上传传输进度和解析状态是两个字段。支持上传不等于支持问答。

## 问答

调用方提交 versionId 列表和问题。服务端按每条版本重新鉴权。未就绪、仅下载、失败、回收、删除、越权都排除。越权只计数量，不报标题。

摘录有 `LIBRARY_ASK_MAX_CHARS`（默认 12000）。截断必须写进给模型和返回给用户的说明。资料放在不可信数据区，不能当成工具指令。模型只能走云端网关。没有可用模型时返回 `model_unconfigured`，不编答案。

返回的引用只来自这次放进上下文的 chunk，带 nodeId、versionId、locator。模型文本里对不上的引用编号会删掉。没有页码定位时 `preciseHighlight=false`。

## 客户端规则

选文件确认后只增加输入框 chips，`sent` 保持 false。本地临时文件 `persisted=false`，只有明确「保存到资料库」才上传，且默认私人。列表请求失败时保留已有行和输入。

## 迁移

新迁移 `20261108040000_enterprise_library`。不回填 `kb_*`。部署时跑现有 `prisma migrate deploy`。可选环境变量见上。不需要新的管理配置页。
