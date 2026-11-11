# 完整技能包改造：本地验收与使用说明

**后续对抗性测试发现的3项问题均已修复，相关128项复验通过。** 详见同目录 `full-skill-packages-three-fixes.md`；历史发现保留在 `full-skill-packages-adversarial-test.md`。下文为实现及初轮验收记录。

本次在隔离工作副本完成开发，原项目中的其他修改保留。没有发布到线上，也没有替换已安装的客户端。

## 改造后的使用过程

| 步骤 | 所在窗口 | 操作与预期 |
| --- | --- | --- |
| 1 | Finder（访达） | 找到 `ground/examples/skills/complete-package-demo.zip`。这是可上传的演示包，不需要自己编程。 |
| 2 | 管理后台浏览器 | 打开“技能管理 → 新建技能”，选择“上传技能包”，点击“选择 ZIP 技能包”。 |
| 3 | 同一个新建窗口 | 选择 ZIP 后检查名称、介绍、文件总数及脚本、参考资料、素材数量。此时只是校验，不会运行脚本。 |
| 4 | 同一个新建窗口 | 填写需要的名称、介绍、分类，点击“保存并启用”。原文件和目录仍按包中的样子保存。 |
| 5 | 更新后的运行端窗口 | 选择技能及本地工作区，发送：“请使用这个技能，生成 skill-demo-result.txt，并告诉我文件保存在哪里。” |
| 6 | Finder（访达） | 打开所选工作区，查看 `skill-demo-result.txt`，预期含“完整技能包运行成功”和“计算结果：42”。 |

上述页面操作是更新后的验收步骤，尚未在真实账号的管理页面逐项点击验收。上线前需要同时更新后端及运行端，旧客户端读取新包会明确提示更新客户端。

“上传后可以用”意味着说明、脚本、参考资料和素材都能送到执行环境；技能依赖的软件、解释器、账号和外部服务仍须实际可用。平台不会自动安装网上技能声明的依赖；缺少依赖应如实显示执行失败。

## 已验证的行为

- 包内 `scripts`、`references`、`resources`、`assets`、模板、辅助文件和二进制内容全部保留，包括原始 `skill.json` 和包内同名 `package.zip`。
- 原始压缩包与展开内容分开存储，文件摘要绑定到固定版本。显示名称、分类的编辑不改变原文件。
- 运行端在所选工作区内准备副本，完整校验后才注入说明及实际目录。第一次模型请求已可获得目录，且通过现有 system/message 事件记录。
- 复用前重新检查源文件，被修改时重新准备；选择切换、退出账号或关闭会话会取消准备并清理。
- Node、Python、直接执行 Shell、读取参考资料和二进制素材、写入结果均使用真实文件和原生工具执行。模型响应和 Ground HTTP 是测试夹具，不是真实云端模型。
- 缺少依赖的脚本实际返回 MODULE_NOT_FOUND；不会谎报生成成功。
- 非法路径、符号链接、重复/冲突名称、超限包、下载内容不符、取消加载均被覆盖。带前导空格的合法文件名原样保存，不会覆盖其他文件。

## 实现出处

| 功能 | 文件 |
| --- | --- |
| ZIP 安全逐项读取、展开限制 | [skill-zip.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-zip.ts:11) |
| 文件清单、摘要、可移植路径规则 | [skill-package-format.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-package-format.ts:76) |
| SKILL.md/YAML、原文件保存和上传预览 | [skill-package.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/skill-package.ts:334) |
| 固定版本正文与资源分发、旧格式兼容 | [official-skill.service.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/backend/src/official-skill/official-skill.service.ts:489) |
| 后台文件数量预览 | [AdminOfficialSkills.vue](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/ground/apps/frontend/src/views/admin/AdminOfficialSkills.vue:209) |
| Host 协议和下载字节上限 | [ground.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/src/ground.ts:414) |
| 工作区副本、逐文件校验、权限和清理 | [skill-package.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/src/skill-package.ts:70) |
| 按代取消整个加载并等待清理 | [skill-provider.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/src/skill-provider.ts:67) |
| 自动注入正文及目录、退出账号失效 | [index.ts](/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp/mammoth-agent/packages/preset/official-agent-gallery/src/index.ts:402) |

本次后台25项测试通过；运行端相关23项通过；构建后原生工具6项通过；后台及前端构建通过；运行端8项产物构建门禁通过，Host整体类型检查通过。完整模块56项测试中33项通过、23项为原有失败，没有新增失败。Client整体类型检查仍有5项原有错误，所以不能称全仓库验证通过。

具体测试结果及原有失败见同目录 `superpowers/plans/2026-11-10-full-skill-packages.md` 与 baseline JSON；验收日志、实际执行结果及独立审查记录保存在 `superpowers/evidence/full-skill-packages/`。

## 尚未完成的验收

真实账号上传、真实数据库和认证 HTTP 链路、云端模型自主执行，以及 Linux bwrap / Windows 实机还没有验收。本地 macOS 的真实脚本执行不能替代这些验收。没有执行生产部署、Git 提交、推送或合并。
