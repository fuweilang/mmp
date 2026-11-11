# 完整技能包

管理员在“技能管理 → 新建技能 → 上传技能包”选择单技能ZIP。包以 `SKILL.md` 为入口，可以包含 `scripts/`、`references/`、`resources/`、`assets/`、`templates/` 和根目录辅助文件。文件内容与相对路径保持原样；平台的显示名称和分类独立保存。

默认限制为压缩12MiB、展开10MiB、主说明100KiB、500个文件。单个素材可以超过1MiB，但须在包总量内。`MMP_SKILL_MAX_FILES`、`MMP_SKILL_MAX_TOTAL_BYTES`、`MMP_SKILL_MAX_INSTRUCTION_BYTES` 可设置更低的服务端接纳额度；Host 的 `skillMaxFiles`、`skillMaxTotalBytes`、`skillMaxInstructionBytes` 同样只支持在协议上限内缩小。运行端在下载前核对声明容量与自身额度。

后端需要Node.js 22.2.0或更高版本，使用运行时自带的CRC32核对ZIP内容。CRC不匹配时拒绝整包，不替代后续SHA-256校验。

ZIP不能包含越界路径、符号链接、特殊文件、重复或跨平台冲突的路径。相对路径总长最多512个UTF-16代码单元，每个文件名或目录名最多255个UTF-8字节；后端预览与Host使用同一规则。仓库元数据和依赖缓存目录需要移除后重新打包；系统打包碎屑不作为技能内容。YAML说明头支持普通嵌套字段和多行文本，解析不会执行自定义标签。

新版本在数据库manifest中保存 `packageFormat: 2`、完整文件清单、包摘要和容量。每项文件含 `path`、`bytes`、`sha256`、`executable`。摘要是按路径代码单元排序后，对 `[path,bytes,sha256,executable]` 元组数组的JSON执行SHA-256。展开文件位于版本的 `content/` 中，原上传归档位于其外，包内的 `package.zip` 不会被覆盖。

Host以 `/content?revision=N&packageFormat=2` 请求完整包；旧格式包仍返回原有references响应。旧客户端读取新包会得到 `SKILL_CLIENT_UPGRADE_REQUIRED`。部署顺序为后端、再更新运行端。新格式资源接口只允许读取固定版本清单内的路径，按附件字节分发。

运行端将完整版本准备在所选工作区的 `.mmp/runtime/skill-packages/` 随机任务目录中，逐项核对字节数和摘要后才报告加载成功。自动选中的技能及技能工具都会提供正文和资源根目录，并由现有系统提示日志记录；脚本由标准会话已有的命令工具执行。上传和加载不执行脚本、不安装依赖，也不扩大工具与沙箱权限。执行环境缺少解释器、程序库或账号授权时，以实际工具错误为准。

目录准备失败不会保留失败缓存，修正目录后可在同一Provider直接重试。

每个会话拥有自己的执行副本。再次加载时重新核对声明文件；原文件被改写或删除会准备新的副本，旧副本留给仍在运行的命令，随Provider释放。新增缓存不成为发布包内容。切换任务选择或退出账号会取消旧准备过程（包括正文请求）并等待清理；加载取消不发布半包。

`examples/skills/complete-package-demo.zip` 是无外部API依赖的验收样例；源文件在同名目录。上传启用后，选择工作区并要求技能生成 `skill-demo-result.txt`，预期包含“完整技能包运行成功”和数值42。缺少Node运行环境时应明确报告错误。
