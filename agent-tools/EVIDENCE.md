# 任务10 UI E2E 证据索引

## pre-fix（失败基线，勿覆盖）

`/tmp/mmp-gallery-advanced-ui/pre-fix-archive/`

- 广场可开聊 data/spy/boss，但 **工具未执行**（旧 Host `lib/index.js`）
- shots 01–06、chat-*.txt、CORRECTED_VERDICT.json

## post-fix（重建 lib + 重启 Dev 后）

`/tmp/mmp-gallery-advanced-ui/post-fix/`

- `POST_FIX_EVIDENCE.md` / `POST_FIX_RAW.md` / `SUMMARY.json` / `CORRECTED_VERDICT.json`
- 校正后：**data/spy/boss 工具链 UI PASS**（见 POST_FIX_EVIDENCE）
- OpenSpec：`ground/openspec/changes/official-agent-gallery-import/tasks.md` §10.9

未 commit / 未发版。
