import { activeVersion, hasDraftChanges, type AgentConfig, type Entity } from './shared'

/** Interaction-only settings. They travel with the existing browser draft and version snapshot. */
export interface AgentExperience {
  opening: string
  questions: string[]
  responseStyle: 'precise' | 'balanced' | 'creative'
  temperature: number
  maxTokens: number
  fallbackModel: string
  streaming: boolean
  knowledgeIds: string[]
  retrieval: 'hybrid' | 'keyword' | 'semantic'
  topK: number
  citations: boolean
  noAnswer: 'ask' | 'explain'
  modalities: ('text' | 'file' | 'image' | 'audio')[]
  maxFiles: number
  maxFileSize: number
  followUpLimit: number
  toolApproval: 'always' | 'external'
  outputFallback: 'retry' | 'text' | 'stop'
  contextTurns: number
  longTermMemory: boolean
  clearableMemory: boolean
  visibility: 'private' | 'workspace' | 'specified'
  audience: string
  dailyLimit: number
  redactSensitive: boolean
  channelIds: ('web' | 'api' | 'feishu' | 'wecom')[]
}

export const knowledgeExamples = [
  { id: 'kb-handbook', name: '员工制度与办事指南', description: '请假、报销、入职等常见问题', count: 24 },
  { id: 'kb-product', name: '产品与服务手册', description: '产品介绍、使用方法与常见问题', count: 18 },
  { id: 'kb-project', name: '项目方法与案例', description: '项目模板、交付规范与复盘案例', count: 12 }
] as const
export const channelLabels = { web: '网页', api: 'API', feishu: '飞书', wecom: '企业微信' }
export const defaultExperience = (): AgentExperience => ({ opening: '', questions: [], responseStyle: 'balanced', temperature: 0.5, maxTokens: 4096, fallbackModel: '', streaming: true, knowledgeIds: [], retrieval: 'hybrid', topK: 5, citations: true, noAnswer: 'ask', modalities: ['text', 'file'], maxFiles: 5, maxFileSize: 20, followUpLimit: 3, toolApproval: 'external', outputFallback: 'retry', contextTurns: 10, longTermMemory: false, clearableMemory: true, visibility: 'private', audience: '', dailyLimit: 100, redactSensitive: true, channelIds: ['web'] })
export const experienceOf = (config: AgentConfig): AgentExperience => config.experience ?? defaultExperience()
export function agentLifecycle(entity: Entity<AgentConfig>) {
  if (entity.deletedAt) return { key: 'deleted', label: '回收站', tone: 'disabled' }
  if (entity.asset?.status === 'archived') return { key: 'archived', label: '已归档', tone: 'disabled' }
  if (entity.disabled) return { key: 'offline', label: '已下线', tone: 'disabled' }
  if (!activeVersion(entity)) return { key: 'draft', label: '草稿', tone: 'draft' }
  if (hasDraftChanges(entity)) return { key: 'changes', label: '有未发布修改', tone: 'checked' }
  return { key: 'published', label: '已发布', tone: 'published' }
}

export function changedAgentSections(before: AgentConfig, after: AgentConfig): string[] {
  const sections: [string, (config: AgentConfig) => unknown][] = [
    ['工作内容与指令', c => [c.name, c.role, c.description, c.systemPrompt, c.setup?.supplement, c.experience?.opening, c.experience?.questions]],
    ['模型与工具', c => [c.modelId, c.capabilityVersionIds, c.experience?.temperature, c.experience?.maxTokens, c.experience?.fallbackModel, c.experience?.responseStyle, c.experience?.streaming, c.experience?.toolApproval]],
    ['知识库', c => [c.experience?.knowledgeIds, c.experience?.retrieval, c.experience?.topK, c.experience?.citations, c.experience?.noAnswer]],
    ['输入与输出', c => [c.contract, c.setup?.inputDescription, c.setup?.outputFormat, c.output, c.experience?.modalities, c.experience?.maxFiles, c.experience?.maxFileSize, c.experience?.followUpLimit, c.experience?.outputFallback]],
    ['记忆与运行边界', c => [c.memoryScopes, c.maxSteps, c.timeoutSeconds, c.setup?.approval, c.experience?.contextTurns, c.experience?.longTermMemory, c.experience?.clearableMemory]],
    ['使用权限与发布渠道', c => [c.purpose, c.owner, c.setup?.resourceScope, c.experience?.visibility, c.experience?.audience, c.experience?.dailyLimit, c.experience?.redactSensitive, c.experience?.channelIds]]
  ]
  return sections.filter(([, values]) => JSON.stringify(values(before)) !== JSON.stringify(values(after))).map(([label]) => label)
}

export function parseExperience(raw: unknown): AgentExperience {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('使用设置格式不正确')
  const value = raw as Record<string, unknown>
  const result = defaultExperience()
  for (const key of Object.keys(result) as (keyof AgentExperience)[]) {
    const item = value[key]
    if (typeof item !== typeof result[key] || Array.isArray(item) !== Array.isArray(result[key])) throw new Error(`使用设置 ${key} 格式不正确`)
  }
  const enums = { responseStyle: ['precise', 'balanced', 'creative'], retrieval: ['hybrid', 'keyword', 'semantic'], noAnswer: ['ask', 'explain'], toolApproval: ['always', 'external'], outputFallback: ['retry', 'text', 'stop'], visibility: ['private', 'workspace', 'specified'] }
  for (const [key, allowed] of Object.entries(enums)) if (!allowed.includes(value[key] as string)) throw new Error('使用设置选项不正确')
  const ranges: Record<string, [number, number]> = { temperature: [0, 1], maxTokens: [128, 32000], topK: [1, 20], maxFiles: [1, 10], maxFileSize: [1, 100], followUpLimit: [0, 10], contextTurns: [1, 50], dailyLimit: [1, 10000] }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const n = value[key] as number
    if (!Number.isFinite(n) || n < min || n > max || (key !== 'temperature' && !Number.isInteger(n))) throw new Error(`使用设置 ${key} 必须为 ${min} 至 ${max} ${key === 'temperature' ? '之间的数值' : '之间的整数'}`)
  }
  for (const key of ['opening', 'audience', 'fallbackModel']) if ((value[key] as string).length > 500) throw new Error('使用设置文本过长')
  const lists: Record<string, readonly string[] | undefined> = { questions: undefined, knowledgeIds: knowledgeExamples.map(k => k.id), modalities: ['text', 'file', 'image', 'audio'], channelIds: Object.keys(channelLabels) }
  for (const [key, allowed] of Object.entries(lists)) {
    const items = value[key] as unknown[]
    if (!Array.isArray(items) || items.length > 6 || items.some(s => typeof s !== 'string' || s.length > 200 || (allowed && !allowed.includes(s)))) throw new Error('使用设置列表包含无效内容')
  }
  if (!(value.modalities as string[]).length) throw new Error('至少保留一种输入方式')
  if (value.fallbackModel && !['deepseek-v4-pro', 'claude-sonnet-4.6'].includes(value.fallbackModel as string)) throw new Error('备用模型不存在')
  return Object.fromEntries(Object.keys(result).map(key => [key, structuredClone(value[key])])) as unknown as AgentExperience
}
