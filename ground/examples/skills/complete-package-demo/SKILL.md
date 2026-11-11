---
name: complete-package-demo
description: |
  验证完整技能包的脚本、参考资料和素材能一起使用。
  运行后在工作区生成可核对的结果文件。
---
# 完整技能包验收

先通过技能工具取得本技能的资源根目录，再读取 `references/guide.md`。

使用会话现有命令工具执行 `node <资源根目录>/scripts/report.cjs <工作区>/skill-demo-result.txt`。请将资源根目录与工作区替换为实际绝对路径，并正确引用包含空格的路径。

脚本会读取包内 `references/numbers.json` 和 `assets/template.txt`，生成结果文件。完成后读取该文件，核对结果为42，再向用户提供生成文件。若命令失败，报告实际错误，不宣称生成成功。
