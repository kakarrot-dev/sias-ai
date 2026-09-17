import { completionLabels, defaultDefinition, handoffEnabled } from './agent-definition'
import { fieldTypeLabels, outputFormatChoices, outputFormats, type InputField } from './interaction-model'
import { knowledgeExamples } from '../agent-experience'
import { capabilityCatalog, isCaptain, liveVersion, models, personName, type Agent, type CampusState, type Config, type ToolAccess } from './model'

const accessSummary = (a: ToolAccess) => `${a.auth === 'platform' ? '平台凭据' : '用户凭据'} / ${a.scope === 'platform' ? '平台范围' : '用户范围'}；确认人：${a.approval || '未配置'}；超时 ${a.timeout} 秒；重试 ${a.retry} 次；异常：${a.exception || '默认处理'}`
const bindingsSummary = (c: Config) => c.tools.map(b => {
  const cap = capabilityCatalog.find(t => t.id === b.id)
  return `${cap?.name ?? b.id} v${b.version} · ${b.enabled === false ? '未启用' : '已启用'}\n${b.actions ? b.actions.map(action => `${cap?.execution?.toolActions?.find(a => a.id === action.id)?.name ?? action.id}：${action.enabled ? '已启用' : '未启用'}；${accessSummary(action)}`).join('\n') : `${b.read ? '可读取' : '禁止读取'} / ${b.write ? '可写入' : '禁止写入'}；${accessSummary(b)}`}\n${b.requiresConfirmation ? `执行前确认：${b.confirmationFields?.join('、') || '具体业务内容'}` : ''}`
}).join('\n\n') || '未绑定能力'
const fieldsSummary = (fields: InputField[]) => fields.map(f => `${f.label} · ${fieldTypeLabels[f.type]} · ${({ required: '必填', optional: '选填', conditional: '条件必填' })[f.requirement]}${f.condition ? `（${fields.find(other => other.key === f.condition!.field)?.label ?? f.condition.field} ${f.condition.operator} ${f.condition.value}）` : ''}${f.options.length ? `；选项：${f.options.join('、')}` : ''}${f.minimum !== undefined || f.maximum !== undefined ? `；范围：${f.minimum ?? '不限'}–${f.maximum ?? '不限'}` : ''}${f.maxLength ? `；最多 ${f.maxLength} 字` : ''}${f.maxItems ? `；最多 ${f.maxItems} 项` : ''}${f.defaultValue !== undefined ? `；默认值：${JSON.stringify(f.defaultValue)}` : ''}${f.helpText ? `；说明：${f.helpText}` : ''}；${({ user: '用户填写', lookup: '目录查询', agent_prefill: 'AI 补充后确认' })[f.source]}`).join('\n') || '未设置固定字段'
const knowledgeSummary = (c: Config) => `${c.expert?.knowledgeIds.map(id => knowledgeExamples.find(k => k.id === id)?.name ?? id).join('、') || '未绑定知识源'}；${c.definition?.knowledge.retrieval === 'keyword' ? '关键词检索' : '混合检索'}；${c.definition?.knowledge.scope || '默认知识范围'}；回复语言 ${({ auto: '跟随用户', zh: '中文', en: '英文' })[c.expert?.replyLanguage ?? 'auto']}；最多 ${c.expert?.maxRounds ?? 50} 轮；${c.expert?.showProgress === false ? '隐藏过程摘要' : '显示过程摘要'}；无法回答：${c.expert?.unansweredReply || '默认话术'}；异常：${c.expert?.errorReply || '默认话术'}`

export function runtimeSummary(c: Config, section: string): string {
  const d = c.definition ?? defaultDefinition(c)
  const input = c.interaction?.input
  switch (section) {
    case 'input': return `${input?.entryMode === 'form' ? '先填表单 · ' : ''}${({ auto: '智能收集', text: '对话补充', form: '集中填表', choice: '选项补充' })[input?.followUp ?? 'auto']} · ${input?.fields.length ?? 0} 项信息`
    case 'io': return `${c.interaction ? outputFormats(c.interaction.output).map(format => outputFormatChoices.find(f => f.value === format)?.label).join(' + ') : '直接回答'} · ${c.interaction?.output.deliveryConfirm || c.interaction?.output.format === 'recipient' ? '交付前确认' : '直接交付'}`
    case 'handoff': return handoffEnabled(d) ? `已开启 · ${d.governance.handoffOwner ? personName(d.governance.handoffOwner) : '待选择接管人员'}` : '未开启 · 失败后停止并告知用户'
    case 'model': return `${models.find(m => m.id === c.model)?.name ?? c.model} · 最近 ${d.context.historyTurns} 轮对话`
    case 'knowledge': return `${c.expert?.knowledgeIds.length ?? 0} 个知识源 · 长期记忆未开启`
    case 'governance': return `${c.limits.minutes} 分钟 · 模型 ${c.limits.steps} 次 / 工具 ${d.runtime.maxToolCalls} 次`
    default: return ''
  }
}

export interface ConfigChange { label: string; before: string; after: string }
/** Compare saved draft to the active snapshot. Counts alone cannot hide changed bindings or limits. */
export function releaseChanges(agent: Agent, state: CampusState): ConfigChange[] {
  const snapshot = liveVersion(agent)?.config
  const previous = snapshot
  const draft = agent.draft
  const changes: ConfigChange[] = []
  const add = (label: string, read: (c: Config) => unknown, display: (c: Config) => string) => {
    if (agent.kind === 'team' && !['名称与简介', '归属与责任人', '适用场景', '队长与成员版本'].includes(label)) return
    if (!previous || JSON.stringify(read(previous)) !== JSON.stringify(read(draft))) changes.push({ label, before: previous ? display(previous) : '尚未发布', after: display(draft) })
  }
  const join = (values: string[]) => values.join('；') || '未设置'
  add('名称与简介', c => [c.name, c.description], c => `${c.name} · ${c.description || '未填写简介'}`)
  add('归属与责任人', c => [c.department, c.owner], c => `${c.department} · ${personName(c.owner)}`)
  if (agent.kind === 'team') add('适用场景', c => c.scenario, c => c.scenario || '未限定')
  else add('身份与职责', c => [c.prompt, c.duty, c.scenario, c.definition && [c.definition.task.audience, c.definition.task.supported, c.definition.task.prohibited, c.definition.task.preconditions]], c => join([c.prompt, c.duty, c.scenario ?? '', ...(c.definition ? [c.definition.task.audience, c.definition.task.supported, c.definition.task.prohibited, c.definition.task.preconditions] : [])].filter(Boolean)))
  if (!isCaptain(agent)) add('完成条件与证据', c => c.definition && [c.definition.task.success, c.definition.task.evidence, c.definition.task.completion, c.definition.task.receiptSystem], c => `完成条件：${completionLabels[c.definition?.task.completion ?? 'validated']}；回执来源：${c.definition?.task.receiptSystem || '未设置'}；标准：${c.definition?.task.success || '按成果约定'}；证据：${c.definition?.task.evidence || '按平台执行规则保留'}`)
  add('开场白与推荐问题', c => [c.opening, c.expert?.questions], c => join([c.opening || '默认开场白', ...(c.expert?.questions ?? [])]))
  add('模型与上下文', c => [c.model, c.temperature, c.topP, c.maxTokens, c.streaming, c.definition?.context], c => `${runtimeSummary(c, 'model')}；单次输出 ${c.maxTokens} Token；温度 ${c.temperature}；Top P ${c.topP}；${c.streaming ? '流式回复' : '完整回复'}；上下文预算 ${c.definition?.context.tokenBudget ?? '默认'} Token；${c.definition?.context.history === 'summary' ? '摘要历史' : '最近历史'}；${c.definition?.context.sources.join('、') ?? ''}；${c.definition?.context.requiredState ?? ''}`)
  add('技能、工具与确认规则', c => [c.tools, c.nodes], c => bindingsSummary(c) + `\n确认节点：${join(c.nodes.map(node => `${node.name} · ${node.trigger} · ${node.approver}`))}`)
  if (!isCaptain(agent)) add('用户输入', c => [c.input, c.interaction?.input, c.definition?.task.missingInput], c => `${runtimeSummary(c, 'input')}；缺少信息：${({ clarify: '询问用户', wait: '等待材料', stop: '停止并告知', handoff: '转人工' })[c.definition?.task.missingInput ?? 'clarify']}；表单标题：${c.interaction?.input.formTitle || '填写任务信息'}；提交按钮：${c.interaction?.input.submitLabel || '提交输入'}；输入说明：${c.interaction?.input.instructions || '未设置'}\n${fieldsSummary(c.interaction?.input.fields ?? [])}\n开始时收集：${join(c.interaction?.input.entryFields.map(key => c.interaction?.input.fields.find(f => f.key === key)?.label ?? key) ?? [])}；附件单文件 ${c.interaction?.input.attachments.fileMB ?? c.input.fileMB} MB / 最多 ${c.interaction?.input.attachments.count ?? c.input.count} 份`)
  if (!isCaptain(agent)) add('交付内容', c => [c.output, c.interaction?.output], c => `${runtimeSummary(c, 'io')}；模板：${c.interaction?.output.templateRef || '未引用'}；${c.interaction?.output.requirements || '按职责与技能要求交付'}；章节：${join(c.interaction?.output.sections.map(s => s.title) ?? [])}；接收人：${join(c.interaction?.output.recipients.map(personName) ?? [])}\n${fieldsSummary(c.interaction?.output.fields ?? [])}\n${c.interaction?.output.factChecks.length ?? 0} 项事实核对；${c.interaction?.output.sourceRequired ?? c.output.sources ? '需要来源' : '不要求来源'}`)
  add('运行限制与人工兜底', c => [c.limits, c.safety, c.definition?.runtime, c.definition?.governance], c => `${runtimeSummary(c, 'governance')}；${runtimeSummary(c, 'handoff')}；响应超时 ${c.limits.modelSeconds} 秒；运行预算 ${c.definition?.runtime.maxTotalTokens ?? '默认'} Token`)
  add('知识与对话偏好', c => [c.definition?.knowledge, c.expert && { knowledgeIds: c.expert.knowledgeIds, replyLanguage: c.expert.replyLanguage, maxRounds: c.expert.maxRounds, showProgress: c.expert.showProgress, unansweredReply: c.expert.unansweredReply, errorReply: c.expert.errorReply }], knowledgeSummary)
  add('分类与发布渠道', c => [c.expert?.category, c.expert?.tags, c.expert?.channels], c => `${c.expert?.category || '默认分类'}；${join(c.expert?.tags ?? [])}；${join(c.expert?.channels.map(ch => ({ web: 'Web 端', wecom: '企业微信', dingtalk: '钉钉', api: 'API' })[ch]) ?? [])}`)
  add('头像', c => [c.icon, c.expert?.iconImage, c.expert?.iconColor, c.expert?.iconStyle], c => c.expert?.iconStyle === 'upload' ? '上传图片' : c.expert?.iconStyle === 'letter' ? `名称首字 · ${c.name.slice(0, 1)}` : c.icon)
  if (agent.kind === 'team') add('队长与成员版本', c => [c.team.captain, c.team.members], c => join([c.team.captain, ...c.team.members].map(p => `${state.agents.find(a => a.id === p.id)?.draft.name ?? p.id} · ${p.version ? `v${p.version}` : '当前队长草稿'}`)))
  if (agent.kind === 'assistant') add('匹配与承接', c => c.assistant, c => `最多 ${c.assistant.candidates} 个候选；追问 ${c.assistant.clarify} 次；排除 ${join(c.assistant.exclude.map(id => state.agents.find(a => a.id === id)?.draft.name ?? id))}；无匹配时：${c.assistant.noMatch}`)
  add('补充示例与说明', c => [c.fewShots, c.note], c => `${c.fewShots.length} 组问答示例；${c.note || '无补充说明'}`)
  return changes
}
