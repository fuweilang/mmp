import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { skillDiscovery, OFFICIAL_SKILL_DISCOVERY } from '../official-skill/skill-discovery';
export const EXPERT_DISCOVERY = {
    "agency-project-planner": {
        "capability": "product-project",
        "industries": []
    },
    "agency-backend-architect": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "agency-frontend-advisor": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "volt-api-designer": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "volt-code-reviewer": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "volt-database-optimizer": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "volt-debugger": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "volt-devops-advisor": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "volt-security-auditor": {
        "capability": "development",
        "industries": [
            "it"
        ]
    },
    "agency-ui-system": {
        "capability": "design",
        "industries": [
            "it"
        ]
    },
    "c3274112ed041": {
        "capability": "design",
        "industries": []
    },
    "copy-polish-master": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "pyq": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "xhs": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "live": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "ip": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "copy": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "video": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "gzh": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "sell": {
        "capability": "marketing",
        "industries": [
            "media"
        ]
    },
    "qc": {
        "capability": "sales-customer",
        "industries": []
    },
    "trans": {
        "capability": "sales-customer",
        "industries": []
    },
    "sifu": {
        "capability": "sales-customer",
        "industries": []
    },
    "agency-customer-success": {
        "capability": "sales-customer",
        "industries": []
    },
    "kw-account-strategy": {
        "capability": "sales-customer",
        "industries": []
    },
    "boss": {
        "capability": "business",
        "industries": []
    },
    "method": {
        "capability": "business",
        "industries": []
    },
    "mammoth": {
        "capability": "business",
        "industries": []
    },
    "growth": {
        "capability": "business",
        "industries": []
    },
    "niche": {
        "capability": "business",
        "industries": []
    },
    "agency-operations-manager": {
        "capability": "business",
        "industries": []
    },
    "agency-supply-chain": {
        "capability": "business",
        "industries": [
            "ecommerce"
        ]
    },
    "agency-business-strategy": {
        "capability": "business",
        "industries": []
    },
    "spy": {
        "capability": "research-data",
        "industries": []
    },
    "data": {
        "capability": "research-data",
        "industries": []
    },
    "interview": {
        "capability": "research-data",
        "industries": []
    },
    "enterprise-product-answer": {
        "capability": "research-data",
        "industries": []
    },
    "agency-ux-research": {
        "capability": "research-data",
        "industries": [
            "it"
        ]
    },
    "kw-data-quality-lead": {
        "capability": "research-data",
        "industries": []
    },
    "volt-literature-evidence": {
        "capability": "research-data",
        "industries": []
    },
    "volt-market-sizing": {
        "capability": "research-data",
        "industries": []
    },
    "volt-statistical-modeling": {
        "capability": "research-data",
        "industries": []
    },
    "kw-financial-controller": {
        "capability": "finance-legal",
        "industries": [
            "finance-tax"
        ]
    },
    "kw-legal-review-lead": {
        "capability": "finance-legal",
        "industries": [
            "legal-services"
        ]
    },
    "agency-hr-onboarding": {
        "capability": "people-learning",
        "industries": [
            "hr"
        ]
    },
    "agency-training-designer": {
        "capability": "people-learning",
        "industries": [
            "education"
        ]
    }
} as const;
export const DESCRIPTIONS: Record<string, {
    expectedOriginal: string;
    summary: string;
}> = {
    "academy-guide": {
        "expectedOriginal": ">",
        "summary": "根据学习目标筛选Claude Academy课程与教程，提供匹配资源及学习建议；不代替完成课程。"
    },
    "bailian-docs-llm-wiki": {
        "expectedOriginal": ">-",
        "summary": "依据包内可用百炼文档梳理API、模型规格和应用开发问题，整理参数解释与参考线索；缺资料时明确说明。"
    },
    "bailian-model-recommend": {
        "expectedOriginal": ">-",
        "summary": "依据可用资料比较百炼模型的场景、规格和限制，整理选型理由；不安装缺失脚本或切换猛犸云端模型池。"
    },
    "daily-hot-news": {
        "expectedOriginal": ">",
        "summary": "将可获得的多平台热点整理为带来源、时间和不可用说明的资讯表；包内抓取脚本已移除，不承诺实时抓取。"
    },
    "discernment-nudge": {
        "expectedOriginal": ">",
        "summary": "检查建议中的事实、推理与缺失背景，补充行动前应核实的要点和不确定性提醒。"
    },
    "novel-game": {
        "expectedOriginal": ">-",
        "summary": "将故事梳理为互动小说的剧情分支、人物和场景方案，产出游戏结构与代码稿；素材生成需另备工具。"
    },
    "vox-video-director": {
        "expectedOriginal": ">",
        "summary": "把主题拆成纸艺拼贴风的旁白、镜头与视觉提示词方案；实际生成和合成视频需额外已授权工具。"
    },
    "boss": {
        "expectedOriginal": "总控编排 · 单层委派专科智能体",
        "summary": "拆解复杂任务并在已授权专科专家间进行单层委派，汇总各子任务结果与待办。"
    },
    "spy": {
        "expectedOriginal": "公开信息竞品对比 · 带来源与访问时间",
        "summary": "比较可获取的公开竞品信息，输出带来源和访问时间的差异与情报摘要。"
    },
    "growth": {
        "expectedOriginal": "诊断增长瓶颈 · 给可落地策略",
        "summary": "梳理增长瓶颈与关键假设，输出优先级策略和可执行的验证计划。"
    },
    "pyq": {
        "expectedOriginal": "人设化朋友圈内容",
        "summary": "按人设和沟通目标设计朋友圈选题与文案，产出可修改的发布草稿。"
    },
    "qc": {
        "expectedOriginal": "会话质检与话术打分",
        "summary": "根据提供的客服会话检查服务问题与话术，输出质检意见和改进建议。"
    },
    "method": {
        "expectedOriginal": "沉淀可复用方法论与 SOP",
        "summary": "把经验和任务流程整理成可复用的方法论、步骤清单与SOP。"
    },
    "data": {
        "expectedOriginal": "经营表格洞察 · 确定性汇总与异常",
        "summary": "分析提供的经营表格，输出确定性汇总、异常线索和解释。"
    },
    "trans": {
        "expectedOriginal": "咨询逼单与异议处理",
        "summary": "梳理咨询场景的需求与异议，提供沟通建议和待使用的话术稿。"
    },
    "xhs": {
        "expectedOriginal": "选题 · 笔记 · 投放全链路",
        "summary": "围绕小红书内容目标规划选题、笔记和投放思路，输出内容方案与草稿。"
    },
    "mammoth": {
        "expectedOriginal": "通用助手 · 有问必答",
        "summary": "帮助梳理日常问题与任务，提供解释、方案或可继续完善的文字草稿。"
    },
    "live": {
        "expectedOriginal": "留人 · 逼单 · 憋单话术",
        "summary": "按直播阶段设计留人、互动和产品表达，输出分段话术与流程建议。"
    },
    "sifu": {
        "expectedOriginal": "私域成交与复购全流程",
        "summary": "梳理私域客户沟通、成交与复购流程，输出运营步骤和话术建议。"
    },
    "ip": {
        "expectedOriginal": "个人/企业 IP 定位与人设策划",
        "summary": "分析个人或企业IP定位与表达方式，输出人设、内容方向和策划方案。"
    },
    "copy": {
        "expectedOriginal": "高转化获客文案",
        "summary": "根据产品与获客目标撰写营销文案，提供可比较的表达方案与草稿。"
    },
    "video": {
        "expectedOriginal": "钩子 · 脚本 · 分镜",
        "summary": "将主题整理为短视频钩子、脚本和分镜，输出拍摄与剪辑参考稿。"
    },
    "interview": {
        "expectedOriginal": "深度访谈问题与追问链设计",
        "summary": "根据访谈目标设计问题层次与追问链，输出访谈提纲。"
    },
    "gzh": {
        "expectedOriginal": "公众号爆文改写与二次创作",
        "summary": "在尊重原文事实的基础上改写公众号内容，输出结构和表达更清楚的文章草稿。"
    },
    "niche": {
        "expectedOriginal": "利基市场切入与差异化战略",
        "summary": "分析利基市场的客户、切入点与差异化，输出战略选择与行动建议。"
    },
    "sell": {
        "expectedOriginal": "提炼产品卖点与高转化营销文案",
        "summary": "从产品资料中提炼用户价值与卖点，输出营销表达和可复用文案。"
    }
};
export type CatalogKind = 'expert' | 'skill';
export type CatalogQuery = {
    q?: string;
    capability?: string;
    industry?: string;
    cursor?: string;
};
export const discoveryOf = (kind: CatalogKind, key: string) => kind === 'skill' ? skillDiscovery(key) ?? { capability: 'general', industries: [] } : (Object.prototype.hasOwnProperty.call(EXPERT_DISCOVERY, key) ? EXPERT_DISCOVERY[key as keyof typeof EXPERT_DISCOVERY] : { capability: 'business', industries: [] });
export const discoveryKeys = (kind: CatalogKind) => kind === 'skill' ? Object.keys(OFFICIAL_SKILL_DISCOVERY) : Object.keys(EXPERT_DISCOVERY);
export function displaySummary(key: string, original: string) { const entry = Object.prototype.hasOwnProperty.call(DESCRIPTIONS, key) ? DESCRIPTIONS[key] : undefined; return entry && original === entry.expectedOriginal ? entry.summary : original; }
export function catalogQuery(query: CatalogQuery, kind: CatalogKind) {
    for (const value of Object.values(query))
        if (value !== undefined && typeof value !== 'string')
            throw new BadRequestException('查询参数无效');
    const q = (query.q ?? '').trim();
    if (q.length > 200)
        throw new BadRequestException('搜索词过长');
    const capability = query.capability ?? 'all', industry = query.industry ?? 'all';
    if (!/^[a-z0-9-]{1,64}$/.test(capability) || !/^[a-z0-9-]{1,64}$/.test(industry))
        throw new BadRequestException('筛选无效');
    const signature = createHash('sha256').update(JSON.stringify([kind, q, capability, industry])).digest('hex').slice(0, 24);
    let after: string | undefined;
    if (query.cursor) {
        try {
            if (query.cursor.length > 1000)
                throw new Error();
            const c = JSON.parse(Buffer.from(query.cursor, 'base64url').toString());
            if (c.signature !== signature || typeof c.key !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(c.key))
                throw new Error();
            after = c.key;
        }
        catch {
            throw new BadRequestException('分页游标已失效，请重新筛选');
        }
    }
    return { q, capability, industry, after, signature };
}
export const nextCatalogCursor = (key: string, signature: string) => Buffer.from(JSON.stringify({ key, signature })).toString('base64url');
export function catalogFacets(kind: CatalogKind, keys: string[]) { const capabilities: Record<string, number> = {}, industries: Record<string, number> = {}; for (const key of keys) {
    const d = discoveryOf(kind, key);
    capabilities[d.capability] = (capabilities[d.capability] ?? 0) + 1;
    for (const id of d.industries)
        industries[id] = (industries[id] ?? 0) + 1;
} return { total: keys.length, capabilities: Object.entries(capabilities).map(([id, count]) => ({ id, count })), industries: Object.entries(industries).map(([id, count]) => ({ id, count })) }; }
/** Include unmapped, user-created resources in their fallback facet instead of losing them on filter. */
export function catalogDiscoveryWhere(kind: CatalogKind, capability: string, industry: string) {
    const keys = discoveryKeys(kind);
    const accepts = (key: string) => { const d = discoveryOf(kind, key); return (capability === 'all' || d.capability === capability) && (industry === 'all' || (d.industries as readonly string[]).includes(industry)); };
    return { OR: [{ key: { in: keys.filter(accepts) } }, ...(accepts('') ? [{ key: { notIn: keys } }] : [])] };
}
