import { pinyin } from 'pinyin-pro'
import { knowledgeExamples } from '../agent-experience'
import { defaultInteractionConfig } from './interaction-model'
import type { Actor, Agent, CampusState, Config, Grant } from './model'

export interface ExpertProfile {
  formVersion?: 'compact'
  replyLanguage?: 'auto' | 'zh' | 'en'
  maxRounds?: number
  showProgress?: boolean
  unansweredReply?: string
  errorReply?: string
  key: string
  keyManual: boolean
  category: string
  tags: string[]
  questions: string[]
  knowledgeIds: string[]
  channels: ('web' | 'wecom' | 'dingtalk' | 'api')[]
  iconStyle: 'letter' | 'preset' | 'upload'
  iconColor: string
  iconImage: string
  demoToken: string
}
export const expertCategories = ['人事', '财务', 'IT', '教务', '通用']
export const expertColors = ['#647650', '#517b8c', '#a27455', '#886c9b', '#99745f']
export const expertSections = [['basic', '基础信息'], ['conversation', '职责与提示词'], ['model', '模型与上下文'], ['input', '输入与用户表单'], ['io', '输出与验收'], ['handoff', '人工兜底'], ['knowledge', '知识与记忆'], ['tools', '工具'], ['skills', '技能'], ['governance', '运行与安全'], ['experience', '对话体验'], ['review', '检查配置']] as const
export type ExpertSection = typeof expertSections[number][0]
export interface ExpertIssue { field: string; section: ExpertSection; message: string }
const identityPromptHeadings = ['身份', '服务对象', '职责范围', '职责边界', '表达要求']
export const identityPromptTemplate = identityPromptHeadings.map(title => `## ${title}\n`).join('\n')
export function hasIdentityPromptContent(prompt: string) {
  return prompt.split('\n').some(line => {
    const text = line.trim().replace(/^#{1,6}\s+/, '')
    return text && !identityPromptHeadings.includes(text)
  })
}
/** Retain old responsibility declarations for review and explicit consolidation. */
export function legacyResponsibilityText(config: Config) {
  const task = config.definition?.task
  if (!task) return ''
  return ([['audience', '原目标用户'], ['supported', '原支持任务'], ['prohibited', '原非目标与禁止任务'], ['preconditions', '原前置条件']] as const)
    .filter(([key]) => typeof task[key] === 'string' && task[key].trim())
    .map(([key, label]) => `### ${label}\n${task[key]}`).join('\n\n')
}
export const profileDefaults = (): ExpertProfile => ({ key: '', keyManual: false, category: '', tags: [], questions: [], knowledgeIds: [], channels: ['web'], iconStyle: 'letter', iconColor: expertColors[0], iconImage: '', demoToken: '' })
export function generatedKey(name: string, state: CampusState, self = '') {
  const words = pinyin(name.trim(), { toneType: 'none', type: 'array' }).join('-').toLowerCase().replace(/ü/g, 'v').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  let base = (/^[a-z]/.test(words) ? words : `expert-${words || 'new'}`).slice(0, 28).replace(/-$/g, '')
  if (base.length < 3) base = `expert-${base}`
  let key = base; let n = 2
  while (state.agents.some(a => !a.deletedAt && a.id !== self && (a.key ?? a.draft.expert?.key ?? a.id) === key)) key = `${base}-${n++}`.slice(0, 32)
  return key
}
/** Project old drafts into the new form, without changing stored snapshots. */
export function expertEditingConfig(config: Config, state: CampusState, id?: string): Config {
  const c = structuredClone(config)
  const savedKey = state.agents.find(a => a.id === id)?.key
  c.expert ??= { ...profileDefaults(), key: savedKey ?? (id ? generatedKey(c.name, state, id) : ''), keyManual: !!id }
  if (!c.interaction) {
    c.interaction = defaultInteractionConfig()
    c.interaction.input.modalities = [...new Set(c.input.types.map(t => ['PNG', 'JPG'].includes(t) ? 'image' : ['MP3', 'WAV', 'M4A'].includes(t) ? 'audio' : ['PDF', 'DOCX'].includes(t) ? 'document' : ['XLSX', 'CSV'].includes(t) ? 'spreadsheet' : 'text'))]
    const { types: _, ...attachments } = c.input; c.interaction.input.attachments = attachments
  }
  return c
}
export function expertIssues(state: CampusState, config: Config, self = '', complete = true): ExpertIssue[] {
  const p = config.expert
  if (!p) return []
  const issues: ExpertIssue[] = []
  const add = (field: string, section: ExpertSection, message: string) => issues.push({ field, section, message })
  const name = config.name.trim()
  if (name.length < 2 || name.length > 20) add('name', 'basic', '智能体名称须为 2–20 字')
  if (state.agents.some(a => !a.deletedAt && a.id !== self && a.draft.name.trim() === name)) add('name', 'basic', '该名称已被使用')
  if (name && !/^[a-z][a-z0-9-]{2,31}$/.test(p.key)) add('key', 'basic', '标识须为 3–32 位小写字母、数字或 -，以字母开头')
  if (state.agents.some(a => !a.deletedAt && a.id !== self && (a.key ?? a.draft.expert?.key ?? a.id) === p.key)) add('key', 'basic', '该标识已被使用')
  if ((complete || config.description.trim()) && (config.description.trim().length < (p.formVersion ? 1 : 10) || config.description.trim().length > (p.formVersion ? 60 : 100))) add('description', 'basic', p.formVersion ? '请填写简介，不超过 60 字' : '简介须为 10–100 字')
  if (!p.formVersion && (complete || p.category) && !(state.expertCategories ?? expertCategories).includes(p.category)) add('category', 'basic', '请选择有效分类')
  if (p.tags.length > 5 || p.tags.some(t => !t.trim() || t.length > 10) || new Set(p.tags).size !== p.tags.length) add('tags', 'basic', '最多 5 个标签，每个 1–10 字，不能重复')
  if (config.opening.length > (p.formVersion ? 200 : 300)) add('opening', 'experience', `开场白不能超过 ${p.formVersion ? 200 : 300} 字`)
  if (p.questions.length > 4 || p.questions.some(q => !q.trim() || q.length > 30)) add('questions', 'experience', '推荐问题最多 4 条，每条 1–30 字')
  if ((complete && !hasIdentityPromptContent(config.prompt)) || config.prompt.length > 4000) add('prompt', 'conversation', '请填写系统提示词的具体内容，不能只有模板标题或超过 4000 字')
  if (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 1) add('temperature', 'model', '温度须为 0–1')
  if (!Number.isInteger(config.maxTokens) || config.maxTokens < 1 || config.maxTokens > 32768) add('maxTokens', 'model', '最大回复长度须为 1–32768')
  if (p.knowledgeIds.length > 10 || p.knowledgeIds.some(id => !knowledgeExamples.some(k => k.id === id)) || new Set(p.knowledgeIds).size !== p.knowledgeIds.length) add('knowledge', 'knowledge', '请选择有效知识库，最多 10 个')
  if ((complete && !p.channels.length) || p.channels.some(ch => !['web', 'wecom', 'dingtalk', 'api'].includes(ch))) add('channels', 'basic', '请至少选择一个有效发布渠道')
  if (p.replyLanguage !== undefined && !['auto', 'zh', 'en'].includes(p.replyLanguage)) add('replyLanguage', 'conversation', '请选择回复语言')
  if (p.maxRounds !== undefined && (!Number.isInteger(p.maxRounds) || p.maxRounds < 10 || p.maxRounds > 200)) add('maxRounds', 'conversation', '单次对话最多轮次须为 10–200')
  if ((p.unansweredReply?.length ?? 0) > 200 || (p.errorReply?.length ?? 0) > 200) add('fallback', 'experience', '兜底话术不能超过 200 字')
  config.tools.forEach(b => { if (b.displayName !== undefined && (!b.displayName.trim() || b.displayName.length > 10)) add('tools', 'tools', '工具显示名称须为 1–10 字') })
  if (p.iconImage && (!/^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(p.iconImage) || p.iconImage.length > 2800000)) add('icon', 'basic', '图标须为不超过 2MB 的 PNG、JPG 或 SVG')
  if (!/^#[0-9a-f]{6}$/i.test(p.iconColor) || !['letter', 'preset', 'upload'].includes(p.iconStyle)) add('icon', 'basic', '请选择有效图标和颜色')
  return issues
}
export const defaultExpertGrants = (actor: Actor, departments: string[]): Grant[] => (actor.role === 'admin' ? departments : [actor.department]).map(target => ({ id: `scope-${target}`, subject: 'department', target, children: false, effect: 'allow' }))
export function scopeIssues(grants: Grant[]): ExpertIssue[] { return grants.some(g => g.effect === 'allow') ? [] : [{ field: 'scope', section: 'basic', message: '请选择可见的部门或人员' }] }
export function expertKeyOf(a: Agent) { return a.key ?? a.draft.expert?.key ?? a.id }
