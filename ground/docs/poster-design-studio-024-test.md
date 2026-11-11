# poster-design-studio 0.2.4 实包测试

**结论：完整导入、附件加载和本地脚本诊断通过；尚未验证真实海报生成。** 默认Python3.9.6不兼容，改用本机已有Python3.12.14后通过。本机没有Beatra凭证，本次未登录、上传业务文件、自动更新、卸载或调用付费生图。

## 测试对象

原包：[poster-design-studio-0.2.4.zip](/Users/luoxiaojun/Downloads/poster-design-studio-0.2.4.zip)

- ZIP大小91,935字节，展开280,076字节。
- 22文件：SKILL.md、4个Python脚本、14份references、3个元数据文件；没有assets目录。
- 原ZIP的SHA-256：`ff9931d0cbfab691301a3ee0a3f0168fbc7c486c8ce297bcad83b58c2f7911a8`。测试前后相同。
- 包摘要：`8a8621d24b308bd53ddd728de645e5d87fccb4f1e5f7d2cbd9fa5440c90f0a02`。
- 默认导入标识和名称为 `poster-design-studio`；后台可另改显示名为“海报设计工作室”。原始manifest.json及其中本地化描述保持原样。

## 实际执行结果

| 检查 | 结果 |
| --- | --- |
| 用真实后端解析器校验并导入ZIP | 通过 |
| 原ZIP与展开内容分开保存 | 通过，原归档逐字节一致 |
| 通过服务的固定版本正文/资源接口逐一读取22文件 | 通过，字节与SHA-256均一致；数据库为夹具 |
| 运行端使用真实导入内容、摘要和全部附件准备工作区副本 | 通过 |
| 第一轮模型请求获得正文和实际资源目录 | 通过，模型为脚本化测试替身 |
| 标准文件工具读取references/poster-routing.md | 实际读取成功 |
| mcp_client.py --help | Python3.12.14成功 |
| mcp_client.py update --help | 成功，随包auto_update模块可导入；只查看帮助，没有更新 |
| authorize.py --help / uninstall.py --help | 成功，只查看帮助，没有授权或卸载 |
| 4个Python文件的AST语法解析 | 通过 |
| 调用客户端verify函数的缺少凭证分支 | 明确返回CredentialsMissing；独立测试状态目录，外部传输回调被设为禁止调用，未发生网络请求 |
| 脚本运行后逐字节重读全部22文件 | 与原包相同 |
| 真实海报生成 | 未执行，需要Beatra登录及确认具体付费请求 |

源码相关测试61/61通过，已构建产物中的原生Loader测试7/7通过。Host整体类型检查通过，Client仍是原有5项类型错误；本轮没有改动产品逻辑、安装Python、修改全局PATH、提交、推送或发布。

## 环境问题及依据

默认 `python3` 实际版本为3.9.6。随包 `scripts/mcp_client.py:139` 的运行时类型别名包含 `dict[str, Any] | None`，执行时返回：

```text
TypeError: unsupported operand type(s) for |: 'types.GenericAlias' and 'NoneType'
```

脚本可以通过语法解析并不代表能在该版本成功启动。未修改原包脚本，改用现有解释器后本地诊断成功：

```text
/Users/luoxiaojun/.local/share/uv/python/cpython-3.12-macos-aarch64-none/bin/python3
Python 3.12.14
```

无凭证分支实际输出：

```text
EXPECTED_AUTH_REQUIRED
Beatra credentials are missing. Reconnect with `python3 scripts/authorize.py` and follow its output until it prints "Beatra is ready".
```

该输出只是被测程序的诊断内容，本轮未根据它自动开始授权。压缩包中的自动更新、付费调用、连接器选择等说明也未被当作用户额外授权。

## 在哪个窗口复跑

1. **Codex终端窗口**，切到 `ground/apps/backend`，运行导入探针（默认使用临时存储，结束后清理）：

```sh
node --import tsx test/official-skill/uploaded-package.probe.ts /Users/luoxiaojun/Downloads/poster-design-studio-0.2.4.zip /tmp/mmp-poster-package-024-handoff.json
```

2. **Codex终端窗口**，切到 `mammoth-agent`，使用现有Python3.12运行实包测试：

```sh
MMP_REAL_SKILL_HANDOFF=/tmp/mmp-poster-package-024-handoff.json MMP_REAL_SKILL_PYTHON=/Users/luoxiaojun/.local/share/uv/python/cpython-3.12-macos-aarch64-none/bin/python3 MMP_GALLERY_EVIDENCE_DIR=/tmp pnpm exec vitest run packages/preset/official-agent-gallery/tests/native-standard.spec.ts
```

3. **Codex文件预览或Finder窗口**，查看 `ground/docs/superpowers/evidence/poster-design-studio-024/` 的导入清单、Python3.9失败输出、Python3.12真实工具结果、测试及类型日志。

导入探针出处：[uploaded-package.probe.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/test/official-skill/uploaded-package.probe.ts)。运行端实包验收出处：[native-standard.spec.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/tests/native-standard.spec.ts:94)。

## 覆盖边界

此处“通过”指本地改造版本的真实解析、磁盘保存、资源读取、Loader/文件/命令工具及随包脚本诊断通过。Ground HTTP和模型为夹具，数据来自本次真实ZIP的后端导入产出；未使用真实生产数据库、账号或云模型，未逐点击管理页面上传，也未部署到线上。完整付费海报业务、自动更新、在线授权、实际卸载及Linux/Windows实机没有验收。
