# poster-design-studio 0.2.4 调用测试

**本地Skill工具调用成功；海报生成调用在本地凭证检查处被拦截，没有发送到Beatra。** 按用户已选择的“不登录、不扣费”范围执行。

## 实际调用链

1. 在真实原生Loader/标准会话工具中调用 `skill({name: "poster-design-studio"})`，成功返回该包正文与实际资源目录。断言返回XML中的技能名和目录，不以模型口头声称成功作为证据。
2. 使用包内原始Python客户端调用 `mcp_client.call_tool("beatra.images.generate", ...)`，传入文档格式的prompt、model/count/canvas及请求标识。状态目录为隔离的空目录，外部传输回调禁止发请求。
3. 原客户端在读取凭证时返回 `CredentialsMissing`，实际结果如下：

```json
{
  "operation": "beatra.images.generate",
  "status": "blocked_missing_credentials",
  "remoteRequests": 0,
  "error": "Beatra credentials are missing. Reconnect with `python3 scripts/authorize.py` and follow its output until it prints \"Beatra is ready\"."
}
```

`remoteRequests: 0` 表示没有向远端发送请求，并非Beatra服务器返回了认证失败。因此不能声称MCP连接、远端图片服务或真实海报生成已经成功。

4. 所有22个文件运行前后逐字节一致，未自动更新、授权、上传业务文件、卸载或付费生成。

## 环境与验证边界

使用本机已有Python3.12.14执行；默认python3为3.9.6，先前已确认无法启动该包。没有安装新解释器或修改全局PATH。

真实执行的是Skill工具、文件工具、Bash和原包Python函数。模型为脚本化替身，Ground HTTP使用真实ZIP导入产出的数据夹具。未测试真实云端模型自主选择工具、生产账号/数据库或管理页面；没有上线。

证据位于 `superpowers/evidence/poster-design-studio-024-call/`。源码测试命令如下，在Codex终端的mammoth-agent目录运行；handoff生成步骤见同目录 `poster-design-studio-024-test.md`：

```sh
MMP_REAL_SKILL_HANDOFF=/tmp/mmp-poster-package-024-handoff.json MMP_REAL_SKILL_PYTHON=/Users/luoxiaojun/.local/share/uv/python/cpython-3.12-macos-aarch64-none/bin/python3 MMP_GALLERY_EVIDENCE_DIR=/tmp pnpm exec vitest run packages/preset/official-agent-gallery/tests/native-standard.spec.ts
```

测试源码：`mammoth-agent/packages/preset/official-agent-gallery/tests/native-standard.spec.ts` 中的 `uploaded-skill-invoke` 和 `uploaded-generate-attempt`。该用例断言生成调用因缺少凭证而被安全拦截；用例通过不代表生成业务成功。

本次源码原生测试7/7、构建产物原生测试7/7通过；Host整体类型检查通过，Client仍为原有5项错误，没有新增类型错误。
