# 任务

- [x] OpenSpec
- [x] Console：PeecAI 风格充值弹窗（选金额/出码/轮询；无席位套餐）
- [x] Prisma：vendorUnitPrices；Admin 配置 + 对账 API/页
- [x] 文档与手测路径
- [x] 计价配置改为厂商级 DeepSeek/Kimi 单价 + 建议 N；不迁 models 到 Admin；扣费仍 1:1

- [x] pricing-model-sync：计价页厂商目录同步 Octop models（含 zhipu），动态提问/回复价 + 建议 N

- [x] 建议 N：有效星标厂商 mid → 否则 model_pool_order 首个可用聊天模型厂商 → 否则 0；文案同步；取消全厂商/DeepSeek 均值
- [x] Octop ActiveModelPool：黄星再点清除 preferred_model（toggle unstar）
