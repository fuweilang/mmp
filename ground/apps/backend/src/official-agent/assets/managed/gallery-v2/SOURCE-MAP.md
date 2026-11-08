# t128展示元数据来源（不新增专家/技能）

- 原46专家/115技能不覆盖、不重导入、不启用草稿。原包及许可继续见 `../v1/SOURCE-MAP.md` 与 `official-skill/assets/v1/SOURCE-MAP.md`。
- `DISCOVERY-INVENTORY.json` 记录46个专家key→岗位主类/可选行业；依据已有角色、指令与workflow，而非repo星数/评分。既有技能23能力/8行业映射原样复用。
- 26条用途投影：19专家来自本机已有角色指令，7技能来自各自SKILL.md。每项记录expectedOriginal、summary、evidence与evidenceSha256；只在原摘要完全一致时显示，不覆盖管理员后改摘要。
- `DESCRIPTION-INPUT.json` 为内部审计输入，包含既有角色正文；不通过公共目录API返回，不作为新专家包。
- 展示投影不修改任何原提示词、版本、revision、许可、冻结会话；并未新运行脚本/工具来证明能力。外部依赖不可用处明确限制。
- 功能SVG为仓内受控组件原创路径，不下载品牌头像，不引入图标依赖；管理员/旧头像URL优先。
- `BASELINE.json`、`PRESERVATION-RESULT.json` 为DB只读保全记录；新增技能icon列排除于旧hash之外，另对原22专家全行（含旧头像path）复核0差异。
- `PACKAGE-PRESERVATION.json`：115包797源文件sha256，差异0；许可证与正文未改。
- 这不是运行效果评分或验收结论；未跑测试、E2E、浏览器或QA。
