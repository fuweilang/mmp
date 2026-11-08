import type { OfficialSkillCard } from '@mammoth-ai/mmp-official-agent-gallery/types'
import type { OfficialAgentGalleryLocaleKey } from './locales.ts'

/** Labels only. Skill assignments arrive from Ground; no client catalog copy. */
export const CAPABILITIES = [
  {
    "id": "file-processing",
    "label": "capabilityFileProcessing",
    "icon": "file"
  },
  {
    "id": "writing",
    "label": "capabilityWriting",
    "icon": "file"
  },
  {
    "id": "data-analysis",
    "label": "capabilityDataAnalysis",
    "icon": "chart"
  },
  {
    "id": "research",
    "label": "capabilityResearch",
    "icon": "search"
  },
  {
    "id": "planning",
    "label": "capabilityPlanning",
    "icon": "plan"
  },
  {
    "id": "marketing",
    "label": "capabilityMarketing",
    "icon": "chart"
  },
  {
    "id": "code-development",
    "label": "capabilityCodeDevelopment",
    "icon": "code"
  },
  {
    "id": "debugging",
    "label": "capabilityDebugging",
    "icon": "code"
  },
  {
    "id": "code-review",
    "label": "capabilityCodeReview",
    "icon": "code"
  },
  {
    "id": "interface-design",
    "label": "capabilityInterfaceDesign",
    "icon": "design"
  },
  {
    "id": "visual-design",
    "label": "capabilityVisualDesign",
    "icon": "design"
  },
  {
    "id": "video-production",
    "label": "capabilityVideoProduction",
    "icon": "video"
  },
  {
    "id": "security",
    "label": "capabilitySecurity",
    "icon": "code"
  },
  {
    "id": "testing",
    "label": "capabilityTesting",
    "icon": "code"
  },
  {
    "id": "devops",
    "label": "capabilityDevops",
    "icon": "code"
  },
  {
    "id": "translation",
    "label": "capabilityTranslation",
    "icon": "file"
  },
  {
    "id": "customer-service",
    "label": "capabilityCustomerService",
    "icon": "plan"
  },
  {
    "id": "business-operations",
    "label": "capabilityBusinessOperations",
    "icon": "plan"
  },
  {
    "id": "people-operations",
    "label": "capabilityPeopleOperations",
    "icon": "plan"
  },
  {
    "id": "accounting",
    "label": "capabilityAccounting",
    "icon": "chart"
  },
  {
    "id": "legal-compliance",
    "label": "capabilityLegalCompliance",
    "icon": "file"
  },
  {
    "id": "knowledge",
    "label": "capabilityKnowledge",
    "icon": "file"
  },
  {
    "id": "learning",
    "label": "capabilityLearning",
    "icon": "file"
  },
  {
    "id": "general",
    "label": "capabilityGeneral",
    "icon": "plan"
  }
] as const satisfies readonly { id: string; label: OfficialAgentGalleryLocaleKey; icon: string }[]
export const INDUSTRIES = [
  {
    "id": "it",
    "label": "industryIt"
  },
  {
    "id": "finance-tax",
    "label": "industryFinanceTax"
  },
  {
    "id": "legal-services",
    "label": "industryLegalServices"
  },
  {
    "id": "ecommerce",
    "label": "industryEcommerce"
  },
  {
    "id": "hr",
    "label": "industryHr"
  },
  {
    "id": "media",
    "label": "industryMedia"
  },
  {
    "id": "education",
    "label": "industryEducation"
  },
  {
    "id": "robotics",
    "label": "industryRobotics"
  }
] as const satisfies readonly { id: string; label: OfficialAgentGalleryLocaleKey }[]
export type Capability = (typeof CAPABILITIES)[number]['id']
export type Industry = (typeof INDUSTRIES)[number]['id']
export function discoveryFor(skill: OfficialSkillCard): { capability: Capability; industries: Industry[] } {
  const capability = CAPABILITIES.find(item => item.id === skill.discovery?.capability)?.id ?? 'general'
  const industries = INDUSTRIES.filter(item => skill.discovery?.industries.includes(item.id)).map(item => item.id)
  return { capability, industries }
}

/** Expert labels are independent of the historical database category. */
export const EXPERT_CAPABILITIES = [
 {id:'product-project',label:'expertProductProject',icon:'plan'},
 {id:'development',label:'expertDevelopment',icon:'code'},
 {id:'design',label:'expertDesign',icon:'design'},
 {id:'marketing',label:'expertMarketing',icon:'write'},
 {id:'sales-customer',label:'expertSalesCustomer',icon:'people'},
 {id:'business',label:'expertBusiness',icon:'case'},
 {id:'research-data',label:'expertResearchData',icon:'search'},
 {id:'finance-legal',label:'expertFinanceLegal',icon:'scales'},
 {id:'people-learning',label:'expertPeopleLearning',icon:'people'},
] as const satisfies readonly {id:string;label:OfficialAgentGalleryLocaleKey;icon:string}[]
