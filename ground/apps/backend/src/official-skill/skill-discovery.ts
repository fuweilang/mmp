/** Curated display-only facets for the 115 licensed catalog keys.
 * One primary capability, zero or more industries. Not tool permissions, package
 * metadata, professional certification, or a session snapshot. Do not rewrite
 * skill manifests/revisions to maintain discovery. Unknown keys remain untagged.
 */
export interface SkillDiscovery {
  capability: string;
  industries: string[];
}
export const OFFICIAL_SKILL_DISCOVERY: Readonly<Record<string, SkillDiscovery>> = {
  "academy-guide": {
    "capability": "learning",
    "industries": [
      "education"
    ]
  },
  "algorithmic-art": {
    "capability": "visual-design",
    "industries": [
      "media"
    ]
  },
  "bailian-docs-llm-wiki": {
    "capability": "research",
    "industries": [
      "it"
    ]
  },
  "bailian-model-recommend": {
    "capability": "research",
    "industries": [
      "it"
    ]
  },
  "brand-guidelines": {
    "capability": "visual-design",
    "industries": [
      "media"
    ]
  },
  "canvas-design": {
    "capability": "visual-design",
    "industries": [
      "media"
    ]
  },
  "cloudbase": {
    "capability": "devops",
    "industries": [
      "it"
    ]
  },
  "cn-punctuation-checker": {
    "capability": "writing",
    "industries": []
  },
  "codex-cli-creator": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "codex-define-goal": {
    "capability": "planning",
    "industries": []
  },
  "codex-jupyter-notebook": {
    "capability": "data-analysis",
    "industries": [
      "it",
      "education"
    ]
  },
  "codex-pdf": {
    "capability": "file-processing",
    "industries": []
  },
  "codex-security-best-practices": {
    "capability": "security",
    "industries": [
      "it"
    ]
  },
  "codex-security-threat-model": {
    "capability": "security",
    "industries": [
      "it"
    ]
  },
  "community-dsh-debug-session": {
    "capability": "debugging",
    "industries": [
      "it"
    ]
  },
  "community-dsh-plugin-client": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "community-dsh-plugin-dev": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "community-dsh-preset-authoring": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "community-dsh-skill-adapter": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "cycle-delivery": {
    "capability": "planning",
    "industries": [
      "it"
    ]
  },
  "daily-hot-news": {
    "capability": "research",
    "industries": []
  },
  "daily-trend-writer": {
    "capability": "writing",
    "industries": [
      "media"
    ]
  },
  "discernment-nudge": {
    "capability": "planning",
    "industries": []
  },
  "docx-diff-comment": {
    "capability": "file-processing",
    "industries": []
  },
  "dsh-client-ui-ux": {
    "capability": "interface-design",
    "industries": [
      "it"
    ]
  },
  "dsh-code-review": {
    "capability": "code-review",
    "industries": [
      "it"
    ]
  },
  "dsh-doc": {
    "capability": "writing",
    "industries": [
      "it"
    ]
  },
  "dsh-error-handling": {
    "capability": "debugging",
    "industries": [
      "it"
    ]
  },
  "dsh-find-simplifications": {
    "capability": "code-review",
    "industries": [
      "it"
    ]
  },
  "dsh-pr-description": {
    "capability": "writing",
    "industries": [
      "it"
    ]
  },
  "dsh-prose-standard": {
    "capability": "writing",
    "industries": [
      "it"
    ]
  },
  "dsh-responsive-ui": {
    "capability": "interface-design",
    "industries": [
      "it"
    ]
  },
  "dsh-speed-up-perf": {
    "capability": "debugging",
    "industries": [
      "it"
    ]
  },
  "dsh-translate-docs": {
    "capability": "translation",
    "industries": [
      "it"
    ]
  },
  "dsh-trim-cot-leakage": {
    "capability": "code-review",
    "industries": [
      "it"
    ]
  },
  "entropy-box-zh": {
    "capability": "research",
    "industries": [
      "robotics"
    ]
  },
  "find-skill-skillhub": {
    "capability": "research",
    "industries": []
  },
  "frontend-design": {
    "capability": "interface-design",
    "industries": [
      "it"
    ]
  },
  "gbr-pair": {
    "capability": "devops",
    "industries": [
      "it"
    ]
  },
  "git-commit-generator": {
    "capability": "writing",
    "industries": [
      "it"
    ]
  },
  "happyhorse-prompt-studio": {
    "capability": "video-production",
    "industries": [
      "media"
    ]
  },
  "industry-accounting-audit-support": {
    "capability": "accounting",
    "industries": [
      "finance-tax"
    ]
  },
  "industry-accounting-close-management": {
    "capability": "accounting",
    "industries": [
      "finance-tax"
    ]
  },
  "industry-accounting-financial-statements": {
    "capability": "accounting",
    "industries": [
      "finance-tax"
    ]
  },
  "industry-accounting-reconciliation": {
    "capability": "accounting",
    "industries": [
      "finance-tax"
    ]
  },
  "industry-accounting-variance-analysis": {
    "capability": "accounting",
    "industries": [
      "finance-tax"
    ]
  },
  "industry-commerce-inventory-planner": {
    "capability": "business-operations",
    "industries": [
      "ecommerce"
    ]
  },
  "industry-commerce-restock": {
    "capability": "business-operations",
    "industries": [
      "ecommerce"
    ]
  },
  "industry-data-data-visualization": {
    "capability": "data-analysis",
    "industries": []
  },
  "industry-data-explore-data": {
    "capability": "data-analysis",
    "industries": []
  },
  "industry-data-sql-queries": {
    "capability": "data-analysis",
    "industries": []
  },
  "industry-data-statistical-analysis": {
    "capability": "data-analysis",
    "industries": []
  },
  "industry-data-validate-data": {
    "capability": "data-analysis",
    "industries": []
  },
  "industry-design-accessibility-review": {
    "capability": "interface-design",
    "industries": [
      "it"
    ]
  },
  "industry-design-user-research": {
    "capability": "research",
    "industries": []
  },
  "industry-hr-interview-prep": {
    "capability": "people-operations",
    "industries": [
      "hr"
    ]
  },
  "industry-hr-onboarding": {
    "capability": "people-operations",
    "industries": [
      "hr"
    ]
  },
  "industry-hr-org-planning": {
    "capability": "people-operations",
    "industries": [
      "hr"
    ]
  },
  "industry-hr-performance-review": {
    "capability": "people-operations",
    "industries": [
      "hr"
    ]
  },
  "industry-legal-compliance-check": {
    "capability": "legal-compliance",
    "industries": [
      "legal-services"
    ]
  },
  "industry-legal-legal-risk-assessment": {
    "capability": "legal-compliance",
    "industries": [
      "legal-services"
    ]
  },
  "industry-legal-review-contract": {
    "capability": "legal-compliance",
    "industries": [
      "legal-services"
    ]
  },
  "industry-legal-triage-nda": {
    "capability": "legal-compliance",
    "industries": [
      "legal-services"
    ]
  },
  "industry-ops-capacity-plan": {
    "capability": "business-operations",
    "industries": []
  },
  "industry-ops-process-optimization": {
    "capability": "business-operations",
    "industries": []
  },
  "industry-ops-risk-assessment": {
    "capability": "business-operations",
    "industries": []
  },
  "industry-ops-runbook": {
    "capability": "business-operations",
    "industries": []
  },
  "industry-product-synthesize-research": {
    "capability": "research",
    "industries": []
  },
  "industry-product-write-spec": {
    "capability": "planning",
    "industries": [
      "it"
    ]
  },
  "industry-smb-tax-prep": {
    "capability": "accounting",
    "industries": [
      "finance-tax"
    ]
  },
  "industry-smb-tax-season-organizer": {
    "capability": "accounting",
    "industries": [
      "finance-tax"
    ]
  },
  "industry-support-draft-response": {
    "capability": "customer-service",
    "industries": []
  },
  "industry-support-kb-article": {
    "capability": "customer-service",
    "industries": []
  },
  "industry-support-ticket-triage": {
    "capability": "customer-service",
    "industries": []
  },
  "internal-comms": {
    "capability": "writing",
    "industries": []
  },
  "kz-article-deep-analysis": {
    "capability": "research",
    "industries": []
  },
  "marketing-ab-testing": {
    "capability": "data-analysis",
    "industries": []
  },
  "marketing-churn-prevention": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-community-marketing": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-content-strategy": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-copywriting": {
    "capability": "writing",
    "industries": []
  },
  "marketing-customer-research": {
    "capability": "research",
    "industries": []
  },
  "marketing-launch": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-marketing-plan": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-marketing-psychology": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-pricing": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-referrals": {
    "capability": "marketing",
    "industries": []
  },
  "marketing-seo-audit": {
    "capability": "marketing",
    "industries": []
  },
  "mcp-builder": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "novel-game": {
    "capability": "writing",
    "industries": [
      "it",
      "media"
    ]
  },
  "office-docx-zh": {
    "capability": "file-processing",
    "industries": []
  },
  "office-pptx-zh": {
    "capability": "file-processing",
    "industries": []
  },
  "office-router-zh": {
    "capability": "file-processing",
    "industries": []
  },
  "office-xlsx-zh": {
    "capability": "data-analysis",
    "industries": []
  },
  "project-governance": {
    "capability": "knowledge",
    "industries": [
      "it"
    ]
  },
  "skill-creator": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "skillhub-trace-evaluator": {
    "capability": "code-review",
    "industries": [
      "it"
    ]
  },
  "spark-video": {
    "capability": "video-production",
    "industries": [
      "media"
    ]
  },
  "superpowers-brainstorming": {
    "capability": "planning",
    "industries": [
      "it"
    ]
  },
  "superpowers-executing-plans": {
    "capability": "planning",
    "industries": [
      "it"
    ]
  },
  "superpowers-receiving-code-review": {
    "capability": "code-review",
    "industries": [
      "it"
    ]
  },
  "superpowers-requesting-code-review": {
    "capability": "code-review",
    "industries": [
      "it"
    ]
  },
  "superpowers-systematic-debugging": {
    "capability": "debugging",
    "industries": [
      "it"
    ]
  },
  "superpowers-test-driven-development": {
    "capability": "testing",
    "industries": [
      "it"
    ]
  },
  "superpowers-verification-before-completion": {
    "capability": "testing",
    "industries": [
      "it"
    ]
  },
  "superpowers-writing-plans": {
    "capability": "planning",
    "industries": [
      "it"
    ]
  },
  "superpowers-writing-skills": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "theme-factory": {
    "capability": "visual-design",
    "industries": [
      "media"
    ]
  },
  "trae-claw-install": {
    "capability": "devops",
    "industries": [
      "it"
    ]
  },
  "video-to-keyframes": {
    "capability": "video-production",
    "industries": [
      "media"
    ]
  },
  "vox-video-director": {
    "capability": "video-production",
    "industries": [
      "media"
    ]
  },
  "web-artifacts-builder": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "web-design-teroop": {
    "capability": "interface-design",
    "industries": [
      "it"
    ]
  },
  "wechat-mini-program-development": {
    "capability": "code-development",
    "industries": [
      "it"
    ]
  },
  "zopia-ai-skills": {
    "capability": "video-production",
    "industries": [
      "media"
    ]
  }
};
export function skillDiscovery(key: string): SkillDiscovery | undefined {
  const entry = Object.prototype.hasOwnProperty.call(OFFICIAL_SKILL_DISCOVERY, key) ? OFFICIAL_SKILL_DISCOVERY[key] : undefined;
  return entry ? { capability: entry.capability, industries: [...entry.industries] } : undefined;
}
