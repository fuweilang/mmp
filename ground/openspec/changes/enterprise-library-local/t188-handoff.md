# t188 资料库 + t189导航图标交接

完成记录：2026-11-08 16:52 Asia/Shanghai（UTC+8）。本机唯一WIP增量，无commit/push/PR/生产发布。未主动kill/restart用户进程。

## 真实交付
| 范围 | 已实现 | 未验证/边界 |
|---|---|---|
|导航树|Web/desktop共享React与Console既有Vue导航：四类保留、我的资料树可收折、根文件与目录并列、按需子页、目录主列表/真实面包屑、文件预览；20条分页/更多；祖先重复和32层停止，旧损坏循环只给可见根不改数据|未操作真实浏览器/桌面；Vue树未单独做真实GUI交互验收|
|媒体|PNG/JPEG/GIF/WebP/AVIF、MP4/WebM/MOV，当前服务config大小/扩展名前端校验与后端独立校验；canonical媒体MIME/签名、原件存储与版本不变、鉴权inline下载、图片/视频预览、原件下载回退|默认所有类型同一20MiB上限（沿现有环境配置）；不支持SVG，不做转码、OCR、多模态理解；容器签名不是完整codec有效性校验|
|范围与上传|mine包含本人已共享；shared包含当前有权且已共享资料（含自己），同一记录不复制；默认私人不变；在shared/recent创建私有后切mine展示，上传失败不报成功|未改变任何既有资料scope，未操作真实用户资料|
|最近|成功文本/链接预览、原件/媒体字节读取、面板/＋真实draft插入后经过后端鉴权的used收据、资料ask API成功记当前user+tenant；列表/搜索/目录展开/行checkbox不记；prepare不记|不是“模型说读了就记”。native AgentLoop实际LLM消费未加全局hook；@候选构造本身不记成功；used收据失败不伪造，可能少记，不影响已真实插入草稿|
|视觉|沿现有mmp令牌/React组件和Console现有Vue/Element Plus；新建dropdown文件夹/保存链接，主上传；线性资料库图标，目标44px行/32px按钮/16px图标；范围与处理中/可供AI引用/仅保存/解析失败分开|参考了用户两张现状及第三张结构图，未抄WorkBuddy，不声称新界面视觉验收通过|
|t189|专家广场改现有IconUsersOutlineRegular，更多改现有IconEllipsisOutlineRegular；资料库轮廓一致|不改卡片自定义头像/Admin图标，不引新库|

## t189 来源证据
- 终端不是所有图标都来自一个第三方库。入口为`packages/client/ui-primitives`，package repository指向deepseek-ai/deepseek-harness同目录；`src/icons/index.tsx`封装productIcon，`src/icons/artwork.ts:1-5`说明随包产品SVG与ui-theme的dsw-icon sprite/主题覆盖。
- `ui-primitives/src/SiteGlyph.tsx`单独使用`simple-icons`（package devDependency 16.31.0）提供站点/品牌Logo；不要把它说成所有终端导航的图标库。Console本来另用lucide-vue-next（如AppShell），本轮没有引入新依赖。
- 改前`ui-official-agent-gallery/src/client/index.ts:13,114`及`ui-sidebar/src/client/SidebarRoot.tsx:22,116`确实同用IconAppsAddOutlineRegular；改后复用现成群组与省略号，实际两个client.js已含相应新引用。

## 验证与真实/替身区分
- Ground后端：`pnpm exec tsc -p tsconfig.build.json` PASS，实际dist生成。
- `pnpm run test:library` PASS 21项（含资料库与既有租户权限小组）；新用例覆盖自身共享/循环树、媒体只保存/超限/伪装类型/非媒体inline拒绝。服务存储为Memory fixture，非生产验收。
- `node --test test/library/library.http.test.cjs` PASS：9子场景，含父test共10项；真实Nest/Auth正常登录/JwtGuard/LibraryController/Prisma/Postgres，仅127.0.0.1:55439/mmp_library_acceptance；无读.env或用户token。新路径覆盖真实multipart PNG/MP4保存与下载字节、MIME/nosniff、成员/租户/撤销共享、prepare不记recent、used重鉴权、分页23=20+3和参数拒绝。结束实际计数tenants=0/users=0/libraryNodes=0。
- PNG为1px有效图片；MP4为头部合法的合成fixture，只证明保存/传输/MIME/权限，不是视频codec播放验收。
- React/原生：`pnpm exec tsc -p packages/client/ui-enterprise-library/tsconfig.json` PASS；指定panel/apply/draft-send与ground-library代理4文件32项PASS。真实React DOM/Menu/Modal/InputHub与Service路径；HTTP fetch/Host账号/LLM接收端是替身，不冒充真实云问答。覆盖懒加载/分页不漏/循环、媒体私有blob与释放、上传私有结果及失败提示、页尾缩短回退、固定版本草稿/拒绝保留等。
- Console：`pnpm --filter @mammoth/frontend typecheck` PASS、`... build` PASS（已有大chunk警告，不是错误），`node --import tsx --test apps/frontend/tests/library-navigation.test.ts` 4/4 PASS。
- Host账号包、专家广场、sidebar目标tsc PASS；资料库包tsdown PASS；`git diff --check` PASS。
- **构建范围记录**：一次tsdown重复`--config`调用意外退到根配置并重打多包bundle（13.7秒，exit0），不是预期的两包局部构建；未因此改其它包源码/模式或执行全仓测试。随后资料库最终产物再次单包生成，不能把这次调用描述为仅两包。没有运行完整桌面dev/常驻服务。

## 数据与WIP保全
- 没有migration/DB schema改动，没有对5433开发业务库查询、修改、分享、删除任何真实资料。仅隔离55439 fixture写入且已清理；没有声称获得开发资料DB前后hash。
- Prisma schema SHA256保持`b544ebe9f2abc10f8387ad6cb2fba14fc797aad2033661bb6191b78244a42374`。
- Harness原生preset/mode/standard/权限/审批/工具与模型路由未改；t170/t171继续暂停。既有Admin/资料库代管/115技能等其他WIP不覆盖。
- 定点源码保全/账本（无凭据/用户正文）：`/tmp/mmp-library-t188-20261108-163921`，baseline.json/before/changes.json/artifacts.json。

## 当前运行资源与刷新
- 实际lib/CSS与Ground dist已生成。desktop development/project下三个UI包与账号包链接均解析到当前workspace产物，SHA完全一致；这证明磁盘内容，不证明旧Host内存已热更新。
- Mac本地公开页面状态核查：`http://127.0.0.1:3080/`和`http://127.0.0.1:5201/console/library/mine`均HTTP200；没有利用已登录窗口或读用户内容。box的localhost不是Mac，不新增公网隧道。
- 先完整刷新Web/Console。既有desktop/Host内存或后端若仍加载旧模块，需要由用户正常重开相应dev/desktop；本轮未替用户重启。特别是新`used`代理白名单和`purpose=prepare` DTO必须Host/后端都加载新代码，不能只刷浏览器假称已生效。
- 待实际用户已登录窗口：展开/收起资料树与分页、上传本人非敏感图片/可播放MP4、核对仅保存与codec回退、分享/我的双视图、成功预览/下载后的最近、＋加草稿不自动发送。真实云模型没有本轮实跑，仍沿超管池；没有引新模型。

## 产物SHA256
- `mammoth-agent/packages/client/ui-enterprise-library/lib/client.js`: `8c3dd49d17371e3fc42841e0730a07f94a65d11a701804afe1511815563aace0`
- `mammoth-agent/packages/client/ui-official-agent-gallery/lib/client.js`: `3ce390e2e67bf07833a6325c789a4b350715e85ec77d991a79f01e780572874a`
- `mammoth-agent/packages/client/ui-sidebar/lib/client.js`: `78e20319c4de252f312f0446c0bc0ccec7713a0a28342ffade2e0009cadf3704`
- `mammoth-agent/packages/credentials/deepseek-account-platform/lib/types/ground-library.js`: `a3809fe659511b8865480ac519027929437772da0f3a1785a7b7d8f5152f5158`
- `ground/apps/backend/dist/library/library.service.js`: `b8f44471e1843203e0bf03d42638d7d3acfe6aef5696c0a0f5f37283079acc9a`
- `ground/apps/backend/dist/library/library.controller.js`: `c2e0834d361da4349e1886bdf0c831edce7861f5fd4c616188a6ec5f803c17fb`
- `ground/apps/frontend/dist/assets/Library-dS_cjt4o.js`: `36e22cbfd0b7d61c1d9f593e5e82d7f99d94fcf8abb37fc3bbb47950098e5e66`
- `ground/apps/frontend/dist/assets/AppShell-CoZ9Q3Mf.js`: `016f01982bc440a5f9f48433962220735c1254a06fc5e08b81a1f28305e914cf`

## 本轮源文件
- `ground/apps/backend/src/library/library.controller.ts`
- `ground/apps/backend/src/library/library.dto.ts`
- `ground/apps/backend/src/library/library.files.ts`
- `ground/apps/backend/src/library/library.limits.ts`
- `ground/apps/backend/src/library/library.parse.ts`
- `ground/apps/backend/src/library/library.service.ts`
- `ground/apps/backend/test/library/library.flow.spec.ts`
- `ground/apps/backend/test/library/library.http-fixture.cjs`
- `ground/apps/backend/test/library/library.http.test.cjs`
- `ground/apps/frontend/src/api/library.ts`
- `ground/apps/frontend/src/components/LibraryNavTree.vue`
- `ground/apps/frontend/src/layouts/AppShell.vue`
- `ground/apps/frontend/src/views/Library.vue`
- `ground/openspec/changes/enterprise-library-local/design.md`
- `ground/openspec/changes/enterprise-library-local/local-handoff.md`
- `ground/openspec/changes/enterprise-library-local/specs/library/spec.md`
- `ground/openspec/changes/enterprise-library-local/t188-handoff.md`
- `ground/openspec/changes/enterprise-library-local/tasks.md`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryIcon.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.module.css`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryTree.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/api.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/index.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/locales.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/selection.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/draft-send.client.spec.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/panel.client.spec.tsx`
- `mammoth-agent/packages/client/ui-official-agent-gallery/src/client/index.ts`
- `mammoth-agent/packages/client/ui-sidebar/src/client/SidebarRoot.tsx`
- `mammoth-agent/packages/credentials/deepseek-account-platform/src/ground-library.ts`
- `mammoth-agent/packages/credentials/deepseek-account-platform/tests/ground-library.spec.ts`
