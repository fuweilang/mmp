# 完整技能包对抗性测试

**修复状态：本报告中的3个问题已修复，相关128项复验全部通过。** 见同目录 `full-skill-packages-three-fixes.md`。下文保留修复前的发现、影响和测试记录。

测试日期：2026-11-10。对象为当前隔离工作副本中的完整技能包实现。本轮新增测试和报告，未修改产品逻辑、提交、合并或发布。

**修复前结论：未通过。新增70项对抗性用例中67项通过、3项失败；当前三项均已修复，见上方复验报告。**

与原有47项相关回归一起运行：共117项，114项通过、3项失败。三个新增用例保留为可执行的修复验收条件，本轮修复后全部通过；本节计数为修复前记录。

| 范围 | 新增用例 | 结果 |
| --- | ---: | --- |
| ZIP输入、YAML、清单及落盘 | 23 | 21通过、2失败 |
| 运行端协议、篡改、并发、取消及会话隔离 | 31 | 30通过、1失败 |
| 真实本地HTTP控制器、JWT鉴权、参数和响应头 | 16 | 16通过 |

## 1. ZIP内部损坏仍被接纳（中等，完整性问题）

复现：制作未压缩ZIP，文件内容为 `CRC_ORIGINAL_SENTINEL`；只把数据区首字节改为X，保持ZIP记录的CRC和文件长度不变。解析器仍接纳为 `XRC_ORIGINAL_SENTINEL`，并为改变后的字节生成新的SHA-256。实际输出在证据 `impact.json`。

影响：损坏的资料或脚本可能被当成合法版本导入。这不表示运行端SHA-256失效，也不是签名绕过：运行端校验的是导入时已损坏的内容；恶意上传者本就可以重新计算CRC。问题是没有识别ZIP内部损坏。

依据：[ZIP逐项读取与保留文件](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-zip.ts:62)。该路径检查长度、类型和展开额度，未比较ZIP的CRC与实际解压数据。失败用例 `rejects CRC-invalid stored bytes instead of publishing a digest for corrupted content`。

修复方向：在有界读取过程中核对ZIP CRC，不匹配时拒绝整包，不创建新版本。

## 2. 超长单个文件名通过预览，保存失败（中等，可用性问题）

复现：技能包包含 `SKILL.md` 与 `assets/` 下一个由256个ASCII字母a组成的文件名。解析器返回2个文件，实际写盘在本机macOS报 `ENAMETOOLONG`。文件总路径未超过现有512字符限制。

影响：管理员先看到校验成功，真正保存时才失败；目前的“可移植路径”规则没有覆盖单个路径片段限制。此项在macOS实测，不推断Windows或Linux实机结果。

依据：[路径规则](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-package-format.ts:36)；[实际写盘](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-package.ts:426)。Host也使用相同的总长度规则，应同步调整。失败用例 `rejects filenames too long for the execution filesystem before preview succeeds`。

修复方向：在预览阶段明确校验每个文件/目录名称的支持上限，后端与Host保持一致，并检查多字节字符边界。

## 3. 不安全目录修正后，加载器仍缓存旧错误（低，可恢复性问题）

复现：把工作区 `.mmp` 指向临时外部目录，第一次加载正确拒绝；删除符号链接后，在同一Provider代次再次加载，仍抛出第一次的目录错误。

影响：环境已经修好，直接重试仍失败。缓存里保留的是一个已失败Promise；直到Provider失效重建或会话释放，才有机会重试。不涉及越界写入，测试确认外部文件未被修改。

依据：[目录创建Promise缓存及复用](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/src/skill-package.ts:104)。失败用例 `can retry after a rejected symlinked ancestor is repaired`。

修复方向：失败的目录创建不能长期作为成功缓存复用；释放对应失败条目后允许重新验证路径。

## 已通过的攻击面

- 原始ZIP路径：上级越界、绝对路径、盘符、反斜杠、空路径片段、点路径、数据流冒号、尾点尾空格、保留名称、NUL、非NFC名称。
- ZIP结构：加密、未知压缩方式、截断目录、伪造展开长度；既有回归覆盖符号链接、特殊文件、重复/大小写/文件目录冲突、压缩与展开上限。
- YAML：别名指数膨胀、自定义执行标签。导入和落盘不会执行包内脚本，空文件原样保留。
- 远程清单：路径绕过、大小写冲突、缺失入口、正文/包摘要不一致、容量超限、跨技能或版本响应、未知格式。
- 资源流：404、缺少字节、同长度篡改、额外字节、夸大或虚假的Content-Length。下载中取消后，在失效清理完成边界确认没有残留副本。
- 文件系统：缓存源文件替换为符号链接后重新准备，外部目标未改；12个并发加载内容一致，失效清理删除全部副本；同一工作区的不同Provider副本隔离。
- HTTP：真实JWT签名验证拒绝无凭证、伪造和browser-sso凭证；停用账号401、停用企业403；错误格式/参数400、未声明路径和版本404、旧客户端409；HTML-shaped资源以octet-stream、attachment、nosniff、no-store分发。

排除一个测试假阳性：调用方取消可先返回，后台清理随后完成，这是Skills服务明确的取消语义；最终取消用例等待 `invalidate()` 完成后断言，不把这一短暂时序当成泄漏。

## 在哪个窗口复跑

1. **Codex终端窗口**，工作目录切到 `ground/apps/backend`。先确保已有 `pnpm build` 产物；HTTP测试读取真实编译后的控制器及装饰器元数据。
2. 在同一终端运行 `node --import tsx --test test/official-skill/*.test.ts`。本轮64项，62通过、2个新增失败。
3. **Codex终端窗口**，工作目录切到 `mammoth-agent`，运行下方命令。本轮53项，52通过、1个新增失败。

```sh
pnpm exec vitest run packages/preset/official-agent-gallery/tests/adversarial-package.spec.ts packages/preset/official-agent-gallery/tests/full-package.spec.ts packages/preset/official-agent-gallery/tests/ground.spec.ts packages/preset/official-agent-gallery/tests/native-standard.spec.ts
```

4. **Finder或Codex文件预览窗口**，查看 `ground/docs/superpowers/evidence/full-skill-packages-adversarial/` 中的完整日志和 `impact.json`。重新执行影响探针可在后端目录运行 `node --import tsx test/official-skill/adversarial-impact.probe.ts`；探针只操作自动清理的临时目录。

## 证据与覆盖边界

本轮真实执行本地Nest HTTP服务器、JWT验证、磁盘读写、取消和并发操作。数据库和用户是测试夹具；资源HTTP及模型为合成测试。没有使用生产账号、真实数据库、远程云模型或外部网站，没有做高负载线上攻击。

没有验证Linux bwrap / Windows实机、浏览器逐点击和云端模型自主运行。未进行全仓库安全审计，不把本轮未复现出越权或自动执行解释为完整安全保证。前一轮已有23个模块失败和5个Client类型错误记录仍保留；本报告所列3个是本轮新增并确认的失败。

本轮新增Host测试通过整体类型检查；Client仍为原有5项错误，位置与错误码和上轮完全相同。类型日志在证据目录 `types.log`。
