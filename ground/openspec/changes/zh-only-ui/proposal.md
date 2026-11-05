# zh-only-ui

界面只维护中文：新增文案只写 `zh.json`，默认语言固定为中文，英文资源保留但不再维护。目标是把「每加一个按钮要动两个文件」减半。

## 问题

- `Octop/dashboard/src/locales/zh.json` 与 `en.json` 各 **7062 行**，完全对称。每加一个按钮文案要写两遍，漏一处就露裸 key 或英文。
- `desktop/src/assets/copy.json` 同样是中英双语，桌面端提示也要写两遍。
- `localePrefs.ts` 的 `detectBrowserLocale()` 在无法识别时返回 `en`；浏览器语言是英文的用户（包含不少国内开发机、macOS 英文系统）打开就是英文界面。产品实际只面向中文用户。
- 结果是：工作量翻倍、语言状态不确定，还没带来任何真实收益。

## 目标

- **新增文案只写中文**：`zh.json` 加 key，`en.json` 不动。
- **默认中文**：`detectBrowserLocale()` 识别不出时返回 `zh`；`i18n.ts` 的 `fallbackLng` 保持「另一门语言」，缺 key 时回退到中文而不是露裸 key。
- **不删 `en.json`**：保留为存档，避免将来若跟进上游时每次 merge 都冲突。
- 桌面端 `copy.json` 同样只加中文条目。

## 范围

- `Octop/dashboard/src/utils/localePrefs.ts`（默认语言）。
- `Octop/dashboard/src/i18n.ts`（fallback / supportedLngs 复核）。
- `Octop/dashboard/src/locales/zh.json`（后续新增只写这里）。
- `Octop/desktop/src/assets/copy.json`（后续新增只写中文）。

## 非目标

- 不删除 `en.json`、不改 i18n 框架、不做语言切换器的 UI 改版（现有切换入口保留）。
- 不改 ground 前端：它没有 i18n 体系，本来就是纯中文。
- 不回填历史缺失翻译；已存在的英文条目原样保留。
- 不引入自动翻译 / 翻译平台。