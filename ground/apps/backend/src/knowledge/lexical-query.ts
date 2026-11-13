/**
 * 知识检索的字面查询变体与摘录。官方知识库与知识核心共用同一份实现；
 * 两侧不再各留一份副本（此前两份逐字重复，修一处必须手动同步）。
 */
export function lexicalQueryVariants(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const variants = new Set<string>();
  const add = (value: string) => {
    const term = value.trim();
    // Keep focused keywords; long whole-sentence probes rarely exist as substrings.
    if (term.length >= 2 && term.length <= 32) variants.add(term);
  };

  // Title punctuation (·•) often appears in prompts/doc names but not body text.
  const normalized = trimmed.replace(/[·•・‧]/g, '');
  add(trimmed);
  add(normalized);
  for (const part of trimmed.split(/[·•・‧]+/)) add(part);

  let work = normalized
    .replace(/[？?！!。．.\s]+$/g, '')
    .replace(/(是什么|是多少|有哪些|包含哪些|怎么样|如何|吗|呢)+$/g, '')
    .trim();
  add(work);

  // Strip instruction wrappers models often append into the tool query.
  // Keep 请结合/请依据 scopes tight so "请结合知识库分析 利基市场…" does not erase the noun.
  work = work
    .replace(/请(?:依据|结合)(?:官方)?知识库/g, ' ')
    .replace(/请依据[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/并给出[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/用一句话[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/一句话说明[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/资料名称/g, ' ')
    .replace(/《([^》]+)》/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
  add(work);

  const compact = work.replace(/[？?！!，,。．.\s：:、；;（）()【】\[\]《》"'“”‘’]/g, '').trim();
  add(compact);

  // Mid-sentence question/connective split → OR terms (整句 contains 失败时仍可命中短词).
  for (const part of work.split(/(?:如何|怎么|怎样|有哪些|包含哪些|是什么|是多少|怎么样|以及|并且|能如何)/)) {
    add(part);
    add(part.replace(/[的地得]/g, ''));
  }
  for (const part of work.split(/[？?！!，,。．.\s：:、；;（）()【】\[\]《》"'“”‘’]+/)) {
    add(part);
  }

  // Sliding CJK windows recover noun phrases like「利基市场」「本质特征」「方法论智囊」.
  if (/[\u4e00-\u9fff]/.test(compact) && compact.length >= 4) {
    for (const win of [4, 6]) {
      if (compact.length < win) continue;
      for (let i = 0; i + win <= Math.min(compact.length, 24); i += 1) {
        add(compact.slice(i, i + win));
      }
    }
  }

  return [...variants].slice(0, 24);
}

export function snippetOf(content: string, query: string) {
  const needle = lexicalQueryVariants(query).find((term) => content.includes(term)) ?? query;
  const idx = content.indexOf(needle);
  const start = idx >= 0 ? Math.max(0, idx - 40) : 0;
  const slice = content.slice(start, start + 180).replace(/\s+/g, ' ').trim();
  return start > 0 ? `…${slice}` : slice;
}
