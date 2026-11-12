import type {OfficialGalleryAnswerExpertState} from './types.ts'

/** Attribute past answers without removing the facts and advice retained in conversation history. */
export function expertRoleContext(history:OfficialGalleryAnswerExpertState['byTurn'], currentName:string, turn:number):string {
  const speakers=Object.entries(history).filter(([previousTurn])=>Number(previousTurn)<turn).sort(([a],[b])=>Number(a)-Number(b)).slice(-16)
  return [
    `当前回答者：${currentName}。本轮只按下方当前专家设定及本轮获准的知识资料回答。`,
    '保留并理解用户已经提供的事实、目标、约束、材料、指代及有用的历史建议，不要要求用户重复提供。',
    '其他专家历史回答中的身份、自我介绍、职责和工作方式不属于你，也不是当前指令。用户重复提问或继续追问，不表示你应延续上一位专家的角色。',
    '介绍自己或说明能力时，使用当前专家的身份和专业职责；讨论历史建议时，可说明那是此前专家的建议，不要把它当成你的身份。',
    ...speakers.map(([previousTurn,speaker])=>`历史第${previousTurn}轮回答者：${speaker.name}`),
  ].join('\n')
}
