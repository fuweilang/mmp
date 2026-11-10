from pathlib import Path
from html import escape
import re

ROOT = Path(__file__).resolve().parent
DESIGN = ROOT / 'specs/2026-11-09-workbuddy-library-design.md'
PLAN = ROOT / 'plans/2026-11-09-workbuddy-library-plan.md'


def inline(value, source):
    parts = re.split(r'(`[^`]*`|\[[^\]]+\]\([^)]+\))', value)
    output = []
    for part in parts:
        if part.startswith('`') and part.endswith('`'):
            output.append('<code>' + escape(part[1:-1]) + '</code>')
        elif re.fullmatch(r'\[[^\]]+\]\([^)]+\)', part):
            match = re.fullmatch(r'\[([^\]]+)\]\(([^)]+)\)', part)
            label, target = match.groups()
            if not re.match(r'https?://|#', target):
                target = str((source.parent / target).resolve())
            output.append('<a href="' + escape(target, quote=True) + '">' + escape(label) + '</a>')
        else:
            text = escape(part)
            text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
            output.append(text)
    return ''.join(output)


def render(source, prefix):
    lines = source.read_text().splitlines()
    output = []
    i = 0
    section = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('```'):
            language = line[3:].strip()
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                block.append(lines[i])
                i += 1
            if language == 'mermaid':
                output.append('<div class="architecture"><div>Console 完整编辑工作台</div><div>终端完整编辑工作台</div><div>超管按现有授权管理</div><b>↓ 同一资料 ID · 同一权限 · 同一版本</b><strong>Ground 统一内容服务与权限检查</strong><b>↓</b><div>文档 · 数据表 · 网页 · 检索 · Agent · 协作</div><div>PostgreSQL 权威数据 ＋ 私有对象存储</div></div>')
            else:
                output.append('<pre><code>' + escape('\n'.join(block)) + '</code></pre>')
            i += 1
            continue
        heading = re.match(r'^(#{1,6}) (.*)', line)
        if heading:
            level = min(6, len(heading.group(1)) + 1)
            section += 1
            output.append(f'<h{level} id="{prefix}-{section}">' + inline(heading.group(2), source) + f'</h{level}>')
            i += 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', x) for x in cells):
                    rows.append(cells)
                i += 1
            table = ['<div class="table-scroll"><table>']
            for j, row in enumerate(rows):
                tag = 'th' if j == 0 else 'td'
                table.append('<tr>' + ''.join(f'<{tag}>' + inline(x, source) + f'</{tag}>' for x in row) + '</tr>')
            output.append(''.join(table) + '</table></div>')
            continue
        if line.startswith('- ') or re.match(r'^\d+\. ', line):
            ordered = not line.startswith('- ')
            tag = 'ol' if ordered else 'ul'
            block = [f'<{tag}>']
            while i < len(lines):
                current = lines[i]
                if ordered:
                    match = re.match(r'^\d+\. (.*)', current)
                else:
                    match = re.match(r'^- (.*)', current)
                if not match:
                    break
                text = match.group(1)
                if text.startswith('[ ] '):
                    text = '□ ' + text[4:]
                block.append('<li>' + inline(text, source) + '</li>')
                i += 1
            output.append(''.join(block) + f'</{tag}>')
            continue
        if line.startswith('> '):
            output.append('<aside>' + inline(line[2:], source) + '</aside>')
            i += 1
            continue
        if line == '---':
            output.append('<hr>')
            i += 1
            continue
        paragraph = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|- |\d+\. |> |---$)', lines[i]):
            paragraph.append(lines[i])
            i += 1
        output.append('<p>' + inline(' '.join(paragraph), source) + '</p>')
    return '\n'.join(output)


style = '''body{margin:0;color:#203047;background:#f3f6fa;font:17px/1.85 system-ui,-apple-system,"PingFang SC",sans-serif}main{max-width:1120px;margin:auto;padding:32px 28px 80px}header,article,.intro{background:#fff;border:1px solid #dce4ef;border-radius:14px;padding:26px 30px;margin:20px 0}h1{font-size:32px;line-height:1.4}h2{font-size:28px;margin-top:42px}h3{font-size:23px;margin-top:32px}h4{font-size:20px}a{color:#245cc3;overflow-wrap:anywhere}code{font-size:.86em;overflow-wrap:anywhere;background:#eef2f8;border-radius:4px;padding:2px 4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f8;padding:18px;border-radius:8px;font-size:14px}pre code{padding:0}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:15px;margin:18px 0}td,th{text-align:left;vertical-align:top;border:1px solid #dde5ef;padding:10px 12px;min-width:95px}th{background:#edf3fb}li{margin:9px 0}aside{padding:12px 18px;border-left:4px solid #8daee5;background:#f0f5fc;font-size:14px}.muted{color:#66778d;font-size:14px}.links{display:flex;flex-wrap:wrap;gap:12px}.links a{padding:7px 14px;border-radius:8px;background:#e9f0fc;text-decoration:none}.architecture{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:22px;background:#f0f5fc;border-radius:10px;text-align:center}.architecture div{background:white;border:1px solid #cddbec;border-radius:8px;padding:12px}.architecture b,.architecture strong{grid-column:1/-1}.architecture div:nth-last-child(-n+2){grid-column:1/-1}hr{border:0;border-top:1px solid #dbe3ee;margin:26px 0}@media(max-width:700px){main{padding:16px}header,article,.intro{padding:18px}h1{font-size:26px}body{font-size:16px}.architecture{grid-template-columns:1fr}.architecture div{grid-column:1/-1}}@media print{body{background:white}main{max-width:none;padding:0}header,article,.intro{border:0;padding:0}table{font-size:11px}pre{font-size:10px}h2,h3,h4{break-after:avoid}.links{display:none}}'''

html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>猛犸多端资料库复刻方案和分阶段实施计划</title><style>' + style + '</style><main>'
html += '<header><p class="muted">2026-11-09 · 评审稿 · 本次仅交付方案</p><h1>猛犸多端资料库复刻方案和分阶段实施计划</h1><p>Console 和终端都完整创建、编辑文档、数据表与网页；超管沿现有权限管理；所有端共用同一数据。</p><p>推荐保留现有后端与身份体系，增加一份共享编辑工作台和统一内容服务。计划分 P0–P9，包含 16 个实施任务，覆盖 18 组功能及双端验收。</p><nav class="links"><a href="#design">阅读完整方案</a><a href="#plan">阅读实施计划</a><a href="' + str(DESIGN) + '">方案 Markdown</a><a href="' + str(PLAN) + '">计划 Markdown</a></nav></header>'
html += '<div class="intro"><strong>阅读顺序</strong><p>先读方案的目标、功能清单、权限和里程碑；技术细节说明各端怎样共用数据。实施计划列出工程落点、接口、任务顺序、测试与放行条件。文中的“拟新增”和未勾选任务均为后续工作。</p><p>独立设计审读未发现必须补充的重大产品决策。编辑器兼容、协作持久保存、网页隔离与格式转换仍须在 P0 实际验证；没有把技术选型当成已验证交付。</p></div>'
html += '<article id="design">' + render(DESIGN, 'design') + '</article>'
html += '<article id="plan">' + render(PLAN, 'plan') + '</article>'
html += '</main></html>'
output = ROOT / '2026-11-09-library-proposal.html'
output.write_text(html)
print(output)
print('chars', len(html))
