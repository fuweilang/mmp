# 任务 — zh-only-ui

## 1. 默认中文

- [x] `localePrefs.ts` 的 `detectBrowserLocale()`：按 §3 验收口径做成「永远返回 `zh`」，不再看浏览器语言（en-US 首访也是中文）。
- [x] `i18n.ts` 复核 `fallbackLng`：本来就是「另一门语言」（`initial === "zh" ? "en" : "zh"`），已加注释说明不要改成固定 `en`。
- [x] 用户已显式保存过语言（`octop:ui-locale`）时仍尊重其选择，不被默认值覆盖（`resolveInitialLocale` 先读存储；单测覆盖存 en 后仍是 en）。
- [x] 服务端下发的 locale（`applyUserLocale`）优先级不变，仍是最后生效者（未改动 `utils/locale.ts`）。

## 2. 停写英文

- [x] 约定写入 `Octop/AGENTS.md` 的「Adding strings (checklist)」第 0 条：新增 key **只加 `zh.json`**，`en.json` 只读不改。
- [x] 桌面端 `desktop/src/assets/copy.json` 同样只加中文条目（已写进同一条约定；文件本身结构不动）。
- [x] pre-commit / CI 的 `en.json` 只能减不能增检查：本轮按「成本过高」走 review 约定（写进 `AGENTS.md`），不做机械校验。

## 3. 验证

- [x] 缺 key 场景：`fallbackLng` 指向另一门语言，en 界面缺条目会回退中文；按配置走查，未在浏览器里造缺失 key 实测。
- [x] 浏览器语言为 `en-US`、无本地存储时，首次进入显示中文（单测断言 `detectBrowserLocale()` 在 en-US 下返回 `zh`）。
- [x] 已有用户主动切到英文后刷新，仍保持英文（单测覆盖 `octop:ui-locale=en` 时 `resolveInitialLocale()` 返回 `en`）。
- [x] `pnpm run build` 与 `pnpm exec tsc -b` 通过（另有 `vitest run src/utils/localePrefs.test.ts` 3 条通过）。

## 4. 后续（不在本次）

- [ ] 若将来确有海外客户：按 `zh.json` 的 key 集合线性回填 `en.json`，一次性补齐。
- [ ] 若确需长期双语：再评估引入翻译平台，不要回到「手工双写」。