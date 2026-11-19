# 头像生图接入

用户授权优先复用现有供应商，发现可用模型直接接入。

- 只读检查现有供应商 /models：SiliconFlow 有 Kolors、Qwen-Image 等；极客智坊有 image 类型模型；DeepSeek、Moonshot 无文生图候选。
- SiliconFlow Kolors 使用已存密钥实测 HTTP 200。先接入已文档化的 Kolors、Qwen-Image，动态检查供应商启用状态与模型目录；其他模型不凭名字猜测协议。
- 新增管理员专用 API：GET /admin/avatar-generation/models，POST /admin/avatar-generation。
- 密钥仅在后端解密，图片下载仅接受 https://s3.siliconflow.cn 且禁跳转、有大小与像素限制。按管理员限制并发，错误不返回上游密钥。
- 共享头像编辑器：描述、模型选择、预览/重试、明确使用后转待保存 File；仍通过既有保存上传流程生效。取消忽略迟到结果。
- 不新增聊天模型、不改数据库结构、不迁移或发布。

验证：后端 4 个边界测试与前端 2 个交互测试先失败后通过。继续执行编译、完整前端测试、浏览器真实生成验收。

## 验收结果

- 后端边界测试 5/5；前端完整测试 36 个单测 + 178 个 UI 测试通过；前后端 build、前端 typecheck、git diff --check 通过。保留原有大 bundle 警告。
- 浏览器从技能编辑真实调用 Kolors，成功返回并显示图片；使用图片后为 blob 待保存预览；取消编辑重新打开后恢复已存原头像。未保存修改真实技能数据。
- 共享组件覆盖技能和专家头像入口；本轮真实生成验收在技能页。
- 独立复核修复生产 nginx 默认 60s 读取超时：仅 /admin/api/avatar-generation 设置180s，覆盖15+120+30s供应商预算。配置文件改动未发布，线上 nginx 未执行重载。
- Qwen-Image 已在远程模型目录确认，按官方接口接入，但本轮付费真实生成仅实测 Kolors。
- 本机原 API watch 在编译期间无监听，已从当前 build 启动本地 API 并验证 /admin/api/avatar-generation/models 有认证保护，UI 能完成实际请求。
