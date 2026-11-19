# 生图模型统一管理

用户已确认：生图模型纳入模型管理，区分用途，不影响聊天；技能与专家生图选择器仅展示模型名称。

实现：复用 LlmModel.meta 标记 purpose，不改表结构；旧模型默认 chat。管理页支持用途列/筛选、生图模型同步、名称编辑、启停与删除。头像接口只读取已登记并启用的 image 模型，remote /models 仅作能力确认，不绕过管理开关。同步是显式 POST，不在 GET 中写数据；本地验收执行一次同步已确认的两个 SiliconFlow 模型，不覆盖既有开关/名称。聊天目录、手动/自动路由、探测与 OCR 明确排除非 chat。生图模型无聊天默认/工具/思考配置，管理页生图预览入口复用共享生成窗口。保留已有对话创建与编辑流程。

顺序：先隔离回归测试，再用途与同步 API，再管理与共享选择器 UI，最后编译、测试、独立复核及本地浏览器验收。不提交、不发布。

## 验收

- 本地数据源确认127.0.0.1:5433/mammoth_core_dev_20261117。通过管理页显式同步登记Kolors、Qwen-Image，两项purpose=image、enabled=true、isPreferred=false。同步不覆盖已有名称、启停。
- 浏览器验证用途筛选只列两项图片模型，隐藏聊天专用列；停用Qwen后专家生图选择器只含Kolors，恢复后含Kolors/Qwen-Image且无厂商前缀。已恢复两项启用。未改动专家内容或保存头像。
- 独立复核发现纯生图供应商丢失设置入口，已将厂商列名称改为可点击的设置入口，保留密钥和Base URL管理；新增UI断言先红后绿。
- 后端用途隔离/头像/health用例16项通过；前端完整36单测+179 UI通过，typecheck、前后端build通过，git diff --check通过（原bundle大小警告保留）。
- 额外聊天路由回归9/10通过，原有“official experts honor disabled thinking...”思考策略断言失败；使用HEAD原gateway代码临时转译重跑得到同一失败，确认基线问题，不在本次扩大修改。
- 实际聊天目录39个已启用模型，不含Kolors/Qwen-Image，默认deepseek/deepseek-flash保留。
- 截图 /tmp/mmp-image-model-management.jpg 与 /tmp/mmp-expert-image-model-names.jpg。无commit/push/发布。
