export const siteName = "猛犸智能体"

export const companyName = "深圳市猛犸世纪科技有限公司"

export const icpNumber = "粤ICP备14032401号"

export const icpUrl = "https://beian.miit.gov.cn/"

// 同源相对路径：官网在根，智能体网页版在 /agent/。
export const webAppUrl = "/agent/"

export const consoleLoginUrl = "/login"

// 兜底固定别名；页面优先使用 /downloads/mammoth-latest.json 里的版本化文件名。
export const downloads = {
  macArm: "/downloads/mammoth-agent-mac-arm64.dmg",
  macIntel: "/downloads/mammoth-agent-mac-x64.dmg",
  windows: "/downloads/mammoth-agent-win.exe",
} as const

export const agentPoints = [
  {
    title: "智能体广场",
    text: "按常用、内容营销、销售增长、专业知识和数据分析筛选。选中一位专家，直接开始对话。",
  },
  {
    title: "对话页",
    text: "输入时可以挂上企业知识库，回答对着企业自己的资料。",
  },
  {
    title: "工作区",
    text: "会话按工作区收着。做完的对话可以归档，不用堆在列表最上面。",
  },
] as const

export const platformItems = [
  {
    title: "工作台",
    text: "进门看到成员数、知识库材料、本月对话和 AI 币余额。余额用完时，对话可能被拦住。",
  },
  {
    title: "资料库",
    text: "我的资料、企业共享、最近使用、回收站。企业管理员还能查看成员资料。",
  },
  {
    title: "知识库",
    text: "企业材料在这里生效。生效之后，智能体对话里才能引用。",
  },
  {
    title: "成员和角色",
    text: "谁能使用智能体，谁能管理企业、邀请成员和充值，按角色分开。",
  },
  {
    title: "AI 币",
    text: "企业统一充值。用量按企业记账，能看到余额和消耗。",
  },
  {
    title: "审计和企业设置",
    text: "关键操作留在审计里。企业名称这类基础信息在企业设置中修改。",
  },
] as const

export const experts = [
  { name: "爆款小红书专家", line: "选题、笔记、投放", avatar: "/experts/xhs.webp" },
  { name: "获客文案大师", line: "获客文案、转化写作", avatar: "/experts/copy.webp" },
  { name: "朋友圈内容大师", line: "人设内容、朋友圈", avatar: "/experts/pyq.webp" },
  { name: "短视频脚本官", line: "脚本、分镜、钩子", avatar: "/experts/video.webp" },
  { name: "私域运营大师", line: "私域成交、复购", avatar: "/experts/sifu.webp" },
  { name: "直播话术专家", line: "留人、逼单", avatar: "/experts/live.webp" },
  { name: "增长战略顾问", line: "增长诊断、策略", avatar: "/experts/growth.webp" },
  { name: "数据分析师", line: "表格和经营洞察", avatar: "/experts/data.webp" },
  { name: "竞品情报官", line: "公开信息、竞品动态", avatar: "/experts/spy.webp" },
  { name: "猛犸大总管", line: "把任务分给专家", avatar: "/experts/boss.webp" },
] as const
