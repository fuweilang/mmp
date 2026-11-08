<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->
<!-- openai/skills@main skills/.curated/pdf -->
<!-- Adaptation: instructions-only; no scripts, secrets, or tool installation; omittedFiles=2 -->
# PDF 文档处理指南

> 猛犸精选适配：阅读、生成和检查 PDF；相关 （已省略脚本命令：Python 库或渲染工具需当前环境具备。）
> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、（已省略脚本命令：Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交）
> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。



# PDF Skill

## When to use
- Read or review PDF content where layout and visuals matter.
- Create PDFs programmatically with reliable formatting.
- Validate final rendering before delivery.

## Workflow
1. Prefer visual review: render PDF pages to PNGs and inspect them.
   - Use `pdftoppm` if available.
   - If unavailable, install Poppler or ask the user to review the output locally.
2. Use `reportlab` to generate PDFs when creating new documents.
3. Use `pdfplumber` (or `pypdf`) for text extraction and quick checks; do not rely on it for layout fidelity.
4. After each meaningful update, re-render pages and verify alignment, spacing, and legibility.

## Temp and output conventions
- Use `tmp/pdfs/` for intermediate files; delete when done.
- Write final artifacts under `output/pdf/` when working in this repo.
- Keep filenames stable and descriptive.

## Dependencies (install if missing)
Prefer `uv` for dependency management.

（已省略脚本命令：Python packages:）
```
uv pip install reportlab pdfplumber pypdf
```
If `uv` is unavailable:
```
（已省略脚本命令：python3 -m pip install reportlab pdfplumber pypdf）
```
System tools (for rendering):
```
# macOS (Homebrew)
brew install poppler

# Ubuntu/Debian
sudo apt-get install -y poppler-utils
```

If installation isn't possible in this environment, tell the user which dependency is missing and how to install it locally.

## Environment
No required environment variables.

## Rendering command
```
pdftoppm -png $INPUT_PDF $OUTPUT_PREFIX
```

## Quality expectations
- Maintain polished visual design: consistent typography, spacing, margins, and section hierarchy.
- Avoid rendering issues: clipped text, overlapping elements, broken tables, black squares, or unreadable glyphs.
- Charts, tables, and images must be sharp, aligned, and clearly labeled.
- Use ASCII hyphens only. Avoid U+2011 (non-breaking hyphen) and other Unicode dashes.
- Citations and references must be human-readable; never leave tool tokens or placeholder strings.

## Final checks
- Do not deliver until the latest PNG inspection shows zero visual or formatting defects.
- Confirm headers/footers, page numbering, and section transitions look polished.
- Keep intermediate files organized or remove them after final approval.
