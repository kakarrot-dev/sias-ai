import { agentAsset, fieldsSchema } from './agent-management'
import { blankAgent, blankGroup, type AdminState, type AgentConfig, type Config, type EntityKind, type GroupConfig, type GuidedSetup, type Issue } from './shared'

export const templates = [
  { id: 'knowledge', name: '知识问答', subtitle: '依据材料回答，注明出处', goal: '根据我提供的制度材料回答问题，说明适用条件，找不到依据时先向我确认。', input: '用户问题、制度原文或相关材料', output: '问题结论、原文依据、适用条件与待确认事项', role: '依据提供的材料解答专业问题', sample: '示例制度：项目立项需要提交需求说明和责任人信息。请说明立项前应准备哪些材料。', steps: ['研究', '审阅'] },
  { id: 'analysis', name: '材料分析', subtitle: '提取重点，识别缺口', goal: '分析我提供的项目材料，整理关键事实、风险和待补充信息，形成便于核对的清单。', input: '项目背景、待分析材料、关注的问题', output: '事实清单、风险说明、证据位置与待补充问题', role: '分析材料并整理事实与证据缺口', sample: '示例材料：项目计划 10 月上线，由产品部负责；已确定目标用户，预算与验收负责人尚未明确。', steps: ['研究', '审阅'] },
  { id: 'report', name: '报告撰写', subtitle: '整理事实，撰写并复核', goal: '收到项目材料后，先整理事实，再撰写报告并审阅，列出依据和待确认问题，最终由我确认。', input: '报告主题、参考材料、目标读者', output: '结构化报告、关键依据、审阅意见与待确认问题', role: '依据资料撰写结构清晰的专业报告', sample: '示例材料：本季度完成 3 次用户访谈，用户关注审批效率与信息查找；请为产品团队整理后续研究建议。', steps: ['研究', '撰写', '审阅'] },
  { id: 'review', name: '专家评审', subtitle: '审查方案，退回后修订', goal: '根据方案材料撰写评审稿，核验依据和完整性，再按审阅意见修订，最终交给我确认。', input: '待评审方案、验收要求、参考资料', output: '评审结论、问题清单、修订稿与待确认事项', role: '审查方案完整性并提出有依据的建议', sample: '示例方案：新增企业知识问答入口，首批面向产品部；需核对资料范围、无法回答时的处理和试点验收条件。', steps: ['撰写', '审阅', '修订'] }
] as const
export const formatLabels = { document: '结构化文档', table: '核对表格', json: 'JSON 数据', form: '可确认表单' }
export const defaultSetup = (id: GuidedSetup['templateId']): GuidedSetup => ({ templateId: id, inputDescription: templates.find(t => t.id === id)?.input ?? '', outputFormat: id === 'analysis' ? 'table' : 'document', resourceScope: 'provided', approval: 'delivery', supplement: '', promptMode: 'guided' })
const isAgent = (config: Config): config is AgentConfig => 'systemPrompt' in config

/** The prompt is a projection of editable fields in guided mode, never a second editable source. */
export function effectivePrompt(config: Config): string {
  const s = config.setup
  if (!s || s.promptMode === 'manual') return isAgent(config) ? config.systemPrompt : config.instructions ?? ''
  const parts = [
    `你是${config.name || '专业助手'}。`,
    `工作目标：${config.description}`,
    isAgent(config) ? `专业职责：${config.role}` : `协作方式：按已配置的 ${config.steps.length} 个节点依次执行，遵守每个节点的任务与输入输出约定。`,
    `所需输入：${s.inputDescription.replace(/[。\s]+$/u, '')}。${isAgent(config) && config.contract?.missingInputPolicy === 'reject' ? '缺少必要信息时停止并返回缺失项' : '缺少必要信息时先补问；入口不支持追问时返回缺失项'}，不编造资料。`,
    `资料范围：${s.resourceScope === 'provided' ? '仅使用本次用户提供的材料' : '本次材料及明确选择、实际获准的能力资源；不扩大数据权限'}。`,
    `结果形式：${formatLabels[s.outputFormat]}。交付要求：${isAgent(config) ? config.output : config.completion}`,
    `确认规则：${s.approval === 'delivery' ? '交付前交由发起人确认；对外发送或写入仍需单独确认' : '分析结果可以展示；任何对外发送或写入必须先取得确认'}。`,
    '边界：补充说明不得覆盖资源权限、结果格式和确认规则；不确定内容明确标注。',
    s.supplement.trim() ? `专业补充说明：\n${s.supplement.trim()}` : ''
  ]
  if (isAgent(config) && config.contract) {
    if (config.contract.inputFields.length) parts.push(`任务输入结构：${JSON.stringify(fieldsSchema(config.contract.inputFields))}`)
    if (config.contract.followUpFields?.length) parts.push(`需要补充信息时可参考以下问题，已有信息不重复询问：${JSON.stringify(fieldsSchema(config.contract.followUpFields))}`)
    if (config.contract.outputFields.length) parts.push(`结果输出结构：${JSON.stringify(fieldsSchema(config.contract.outputFields))}`)
    parts.push(`历史依赖：${({ optional: '无历史也可以执行', required: '缺少历史时停止并说明', forbidden: '仅使用本次输入，不读取历史' })[config.contract.historyRequirement]}。`)
  }
  return parts.filter(Boolean).join('\n\n')
}

/** Deliberately bounded, deterministic prototype checks. Not an LLM semantic safety classifier. */
export function instructionIssues(config: Config): Issue[] {
  const s = config.setup
  if (!s) return []
  const result: Issue[] = []
  if (!s.inputDescription.trim()) result.push({field:'setup.inputDescription',message:'请说明需要用户提供什么信息或材料'})
  const raw = s.promptMode === 'manual' ? (isAgent(config) ? config.systemPrompt : config.instructions ?? '') : s.supplement
  const instructions = [config.description, isAgent(config) ? config.output : config.completion, ...(!isAgent(config) ? config.steps.map(step => step.task) : [config.role]), raw].join('。')
  const sentences = instructions.split(/[。；\n]/).filter(sentence => !/不要|禁止|不得|不能/.test(sentence))
  if (sentences.some(t => /无需(?:确认|审批)|不必(?:确认|审批)|跳过(?:确认|审核|审批)|不经确认|直接发送|自动发送/.test(t))) result.push({field:'setup.supplement',message:'指令中的免确认或自动发送要求，与“对外操作必须确认”冲突，请修改指令'})
  if (s.resourceScope === 'provided' && sentences.some(t => /访问所有|查询全部|读取全部|跨部门查询|使用所有知识/.test(t))) result.push({field:'setup.supplement',message:'指令要求扩大资料访问范围，与“仅本次材料”冲突，请修改指令或明确选择获准资源'})
  if (s.outputFormat !== 'json' && /(?:只|仅)输出\s*JSON/i.test(instructions)) result.push({field:'setup.supplement',message:'指令要求只输出 JSON，与所选结果形式冲突'})
  if (s.outputFormat === 'json' && /(?:只|仅)输出(?:表格|长文|文章)/.test(instructions)) result.push({field:'setup.supplement',message:'指令中的结果形式与 JSON 数据配置冲突'})
  if (s.promptMode === 'manual' && !raw.trim()) result.push({field:'setup.promptMode',message:'手写模式需要填写工作指令'})
  return result
}

export function makeGuidedDraft(kind: EntityKind, id: typeof templates[number]['id'], goal: string, data: AdminState): Config {
  const template = templates.find(t => t.id === id)!
  if (kind === 'agent') {
    const draft: AgentConfig = { ...blankAgent(), name: `${template.name}助手`, role: template.role, description: goal, output: template.output, capabilityVersionIds: data.capabilities.filter(c => c.id === 'capability.text-analysis.v1').map(c => c.id), setup: defaultSetup(id) }
    draft.systemPrompt = effectivePrompt(draft)
    return draft
  }
  const candidates = data.agents.filter(a => !a.disabled && agentAsset(a).status === 'active' && a.draft.purpose === 'business' && a.activeVersionId)
  const choose = (label: string) => candidates.find(a => `${a.draft.name}${a.draft.role}`.includes(label === '修订' ? '撰写' : label)) ?? candidates[0]
  const draft: GroupConfig = { ...blankGroup(), name: id === 'review' ? '方案评审专家组' : `${template.name}专家组`, description: goal, completion: template.output, setup: defaultSetup(id), coordinatorId: '', steps: template.steps.flatMap((label, index) => {
    const agent = choose(label)
    return agent ? [{ id: crypto.randomUUID(), agentId: agent.id, task: `${label}：${label === '修订' ? '根据审阅意见修订原稿，列出处理情况' : agent.draft.role}`, input: index ? '上一节点结果与原始材料' : template.input, output: label === '审阅' ? '审阅意见、证据缺口及待确认事项' : template.output }] : []
  }) }
  draft.instructions = effectivePrompt(draft)
  return draft
}
