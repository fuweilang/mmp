<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->
<!-- hackerFish/awesome-dsh-skills@main skills/dsh-plugin-dev -->
<!-- Adaptation: instructions-only; no scripts, secrets, or tool installation; omittedFiles=0 -->
# DSH 社区插件开发

> 猛犸精选适配：梳理插件结构、服务与事件契约；依赖目标项目已有 DSH 工具链。
> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、（已省略脚本命令：Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交）
> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。



# DSH 插件开发（依据官方包验证过的结构）

## 最小形态

插件 = 一个 npm 包 + `dsh.bundle` 声明（字段取自官方 `@deepseek-ai/dsh-base` 的真实清单）：

```jsonc
// package.json（节选）
{
  "name": "my-dsh-plugin",
  "version": "0.1.0",
  "main": "lib/index.js",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml` 是往 profile 配置栈插入的行列表（结构取自官方 base 清单）：

```yaml
- insert:
    - id: my-plugin
      name: 'my-dsh-plugin'
      config: {}
```

规则：行按 `id` 定位，**后写覆盖先写，且整行替换 `config` 而非合并**；行顺序不代表加载顺序。

## 调试循环

```bash
dsh plugin --profile web add /path/to/my-dsh-plugin --ignore-workspace-root-check
dsh --profile web --dump-config     # 确认你的行进入配置
```

- 隔离测试：把 `DSH_HOME` 指向临时目录，不污染真实环境
- 干净安装必须成功；改代码后重新 add 再验
- 冒烟：`dsh --profile headless "最小任务"` 确认不崩（需模型凭据）

## 发布与收录

1. `npm publish`（确保 `files` 包含 `cordis.patch.yml` 与构建产物）
2. GitHub 仓库打 `dsh-plugin` topic
3. README 写明开发/测试时的 DSH 版本（rc 期 API 在变）
4. 向社区目录提收录 PR，描述自己写

## 注意

- 依赖能省则省；避免 `postinstall`/`prepare` 脚本（会让用户安装变复杂）
- 官方当前不接受外部 PR，生态贡献以插件与内容为主
- 细分主题走专门技能：client 半端见 `dsh-plugin-client`，UI 国际化见 `dsh-plugin-i18n`，发布与生态收录见 `dsh-plugin-publish`
