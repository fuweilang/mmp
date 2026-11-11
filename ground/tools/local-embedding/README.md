# 本地真实中文向量服务

使用 FastEmbed / ONNX Runtime 在本机运行 `BAAI/bge-small-zh-v1.5`，输出512维归一化向量，兼容后台现有 OpenAI Embeddings 接口。没有固定向量、聊天生成代替向量或上游失败后的模拟回退。

模型资料：[BAAI 模型说明](https://huggingface.co/BAAI/bge-small-zh-v1.5)、[FastEmbed 支持模型](https://qdrant.github.io/fastembed/examples/Supported_Models/)。模型首次启动会下载约90MB权重，之后可使用 `--local-files-only` 离线启动。此工具是可选的独立进程，不改变 NestJS、Vue 或 pgvector 的技术栈。

## 启动

需要 Python 3.10+；下面命令在 `ground/tools/local-embedding` 窗口执行。缓存、虚拟环境和本机访问令牌放在仓库以外的私有目录。令牌只用于本机进程间鉴权，不需要购买云服务密钥。

```sh
export MMP_EMBEDDING_HOME="$HOME/.local/share/mammoth-embedding"
mkdir -p "$MMP_EMBEDDING_HOME"
python3 -m venv "$MMP_EMBEDDING_HOME/venv"
"$MMP_EMBEDDING_HOME/venv/bin/pip" install -r requirements.txt
"$MMP_EMBEDDING_HOME/venv/bin/python" -c 'import os,secrets; from pathlib import Path; p=Path(os.environ["MMP_EMBEDDING_HOME"])/"service-key"; fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(fd,secrets.token_urlsafe(48).encode()); os.close(fd)'
"$MMP_EMBEDDING_HOME/venv/bin/python" server.py --cache-dir "$MMP_EMBEDDING_HOME/models" --key-file "$MMP_EMBEDDING_HOME/service-key" --port 62565
```

令牌创建命令仅首次执行，已有令牌不会覆盖。服务固定监听 `127.0.0.1`，不直接暴露给局域网。保持该终端运行；`GET http://127.0.0.1:62565/healthz` 返回模型、维度和就绪状态。更换令牌需同步更新后台供应商凭据并重启本服务。

## 后台配置窗口

在平台管理打开“猛犸知识库 → 高级设置 → 检索服务配置”。

1. 新建供应商：Base URL为 `http://127.0.0.1:62565/v1`；密钥在后台密码输入框填写本机令牌，只加密保存，不写进聊天或日志。此供应商不需要创建聊天模型。
2. 新建 Embedding 服务：模型 `BAAI/bge-small-zh-v1.5`，向量维度512，端点 `http://127.0.0.1:62565/v1/embeddings`，tokenizer `cl100k_base`，批量16，超时120000ms，最大输入384 token。
3. 点击主动探测，确认实际连接成功。健康检查仅验证配置完整，不等于已经请求模型。
4. 对原文档重建索引。建议目标192 / 最大256 / 重叠32 token；原文、修订和历史索引保留，新模型不复用旧向量。Markdown按标题聚合短段落，后续切片的向量输入会补充所属章节；返回的引用正文仍是精确原文，不把章节补充文字写入原文范围。
5. 确认新索引全部 READY，再切换知识版本并停用旧模拟配置。不要把不同模型的原始分数放在同一向量空间比较。

此模型实际输入上限512个模型token；服务会按模型原生tokenizer检查并拒绝超长输入，不截掉原文。后台cl100k限制是保守配置，不能等同于BGE原生tokenizer；超长问题需缩短，超长切片需重建更小的索引。

Rerank是可选的独立服务；未配置时无需模拟重排。本地服务仅完成向量化，文档切分、pgvector存储、权限、召回、引用原文和生成回答仍由平台现有流程处理。

## 验证

```sh
"$MMP_EMBEDDING_HOME/venv/bin/pip" install -r requirements-dev.txt
"$MMP_EMBEDDING_HOME/venv/bin/python" -m unittest discover -s . -v
```

单元测试使用明确标注的测试编码器验证鉴权、批量协议、维度和长度拒绝。真实模型验收另需检查语义相近与无关文本的向量区别，并使用真实文档重建索引、核对回答引用与原文；单元测试不能代替这部分验收。
