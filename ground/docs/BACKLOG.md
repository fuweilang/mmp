# 待办（第二批，暂停中，择机启动）

## 中台 backend（李庚）
- [ ] P2 中文文件名上传乱码（存量）：`knowledge.service.ts:90` multer latin1 解码，修法 `defParamCharset: 'utf8'` 或 Buffer 转码
- [ ] P0级 docx/pdf 解析实际失效（正则解不了压缩流）——第二批首项
- [ ] 测试基线：tenant 隔离矩阵 + index-text 单测 + OIDC 集成
- [ ] replaceGrants 事务化 + userIds 校验租户成员；reindex 批量 SQL
- [ ] knowledge.service 拆 Document/Indexer/Search 三件
- [ ] P3：DELETE /admin/users 复用末位管理员保护；updateUser 防御分支补单测或移除
- [ ] 排期：refresh_token、管理员 TOCTOU 事务、CORS 启动日志

## 中台 frontend（李庚）
- [ ] 抽 useListPage/FormDialog/DotTag 消 ~900 行重复；拆 AdminUsers/Knowledge/Login
- [ ] P3：AppShell.vue 末尾补换行
- [ ] 产品确认（甜甜/林杰）：登录页协议勾选默认值语义

## Octop（王总，见 docs/OCTOP-FORK-STRATEGY.md 阶段二）
- [ ] UsersListPanel provision 逻辑挪进 mammothConsole.ts（rebase 高危首位）
- [ ] useVoiceInput / attachment_hints 提 PR 或 revert

## 未提交文件（grok 在改，勿动）
- scripts/dev-gateway.mjs、infra/baota/nginx-mammoth.conf（下载缓存 ETag/304，待浪哥复核语义后由其提交）
