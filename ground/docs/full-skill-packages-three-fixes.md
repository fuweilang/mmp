# 三个对抗性测试问题的修复验收

**三个问题均已修复。本地相关128项测试全部通过；尚未上线。** 本轮在原隔离副本修改，没有提交、推送、合并或替换已安装客户端。

| 原问题 | 修复后的表现 | 实现出处 |
| --- | --- | --- |
| ZIP内部损坏仍被接纳 | 解压时逐块计算CRC，与ZIP条目记录比较；不一致直接拒绝整包 | [skill-zip.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-zip.ts:66) |
| 超长文件名预览通过、落盘失败 | 每段文件名或目录名最多255个UTF-8字节，超出时在预览拒绝；后端与Host一致 | [后端规则](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-package-format.ts:36)、[Host规则](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/src/skill-package-format.ts:22) |
| 修正不安全目录后仍复用旧错误 | 目录创建失败时删除对应失败缓存；仅删除本次预留条目，修复目录后可在同一Provider重试 | [skill-package.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/src/skill-package.ts:110) |

## 复验结果

- 后台68/68，包括真实本地HTTP的16项鉴权、查询和附件响应头检查。
- Host相关60/60，包括38项对抗性用例、取消、并发、目录隔离与原生工具执行。
- 合计128/128；其中81项为对抗性用例，47项为相关既有回归。
- 构建后的实际Loader/Node/Python/Shell工具执行6/6。
- Ground后台及前端构建通过；Host产物构建8项门禁通过；Host整体类型检查通过。
- 整个gallery模块94项中71项通过、23项为原有失败，逐项名称比对无新增失败。Client整体类型检查仍为原有5项错误，错误位置及编号与修复前相同。没有声称全仓库验证通过。
- 一次独立只读复核未发现本轮Critical / Important / Minor问题，且独立重跑后台27项对抗性测试、Host60项相关测试。

补充边界覆盖：未压缩ZIP损坏、DEFLATE多块二进制CRC错误、合法大二进制文件、空文件、255字节ASCII/255字节中文/252字节emoji名称可保存；256字节ASCII、258字节中文、256字节emoji名称在后端及Host拒绝；8次并发失败后修复目录并8次并发重试成功。超长元数据响应测试仍覆盖超过1MiB的合法清单。

CRC使用Node自带实现，无额外依赖；该接口自22.2.0提供，Ground根项目、后端package.json和README已将最低版本明确为22.2.0。生产Docker使用Node22系列，本次实际测试为macOS/Node26.13.0，没有实际运行Node22.2.0、Linux bwrap或Windows实机。

## 查看与复跑

所有操作已在Codex终端完成。可在**Codex文件预览窗口**查看本报告和同目录历史对抗性报告；证据在 `superpowers/evidence/full-skill-packages-three-fixes/`，历史失败日志保留。

在**Codex终端窗口**，后端目录运行 `node --import tsx --test test/official-skill/*.test.ts`；HTTP用例需先有 `pnpm build` 产物。Host目录运行：

```sh
pnpm exec vitest run packages/preset/official-agent-gallery/tests/adversarial-package.spec.ts packages/preset/official-agent-gallery/tests/full-package.spec.ts packages/preset/official-agent-gallery/tests/ground.spec.ts packages/preset/official-agent-gallery/tests/native-standard.spec.ts
```

`impact-after.json`确认256字符文件名在预览阶段被拒绝，CRC损坏归档也被拒绝；修复前实测内容保留在历史对抗性证据目录的 `impact.json`。

真实云端模型自主操作、生产数据库和真实账号的完整上传流程仍未验收；本地HTTP使用真实控制器及JWT密码学验证，数据库及用户是夹具。没有发布到生产。
