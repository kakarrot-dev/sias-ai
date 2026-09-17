import type { Config } from './model'
/** Frontend-only input/output contract. No model calls, external data or file bytes. */
export const fieldTypeLabels = { text: '短文本', long_text: '长文本', datetime: '日期与时间', datetime_range: '时间范围', number: '数字', enum: '单选', multi_enum: '多选', person: '人员', person_list: '多人', room: '场地', file: '附件', boolean: '是 / 否' }
export type FieldType = keyof typeof fieldTypeLabels
export interface InputField {
  id: string; key: string; label: string; type: FieldType
  requirement: 'required' | 'optional' | 'conditional'
  condition?: { field: string; operator: 'eq' | 'ne' | 'in' | 'not_empty' | 'empty'; value: string }
  source: 'user' | 'lookup' | 'agent_prefill'; sensitivity: 'low' | 'medium' | 'high'
  lookupSource: string; example: string; options: string[]; minimum?: number; maximum?: number; maxItems?: number; maxLength?: number
  helpText?: string; defaultValue?: string | number | boolean | string[]
}
export interface AttachmentLimits { fileMB: number; count: number; totalMB: number; audioMB: number; audioMinutes: number }
export interface FactCheck { id: string; outputKey: string; source: 'input' | 'directory'; inputKey: string; result: 'match' | 'different' | 'unknown' }
export interface InteractionConfig {
  input: { entryMode?: 'conversation' | 'form'; formTitle?: string; submitLabel?: string; instructions?: string; modalities: string[]; fields: InputField[]; entryFields: string[]; followUp: 'auto' | 'text' | 'form' | 'choice'; formThreshold: number; attachments: AttachmentLimits }
  output: { format: 'text' | 'markdown' | 'document' | 'pdf' | 'table' | 'recipient' | 'json'; additionalFormats?: Exclude<InteractionConfig['output']['format'], 'recipient'>[]; templateRef?: string; requirements: string; sections: { id: string; title: string }[]; fields: InputField[]; sourceRequired: boolean; deliveryConfirm: boolean; recipients: string[]; factChecks: FactCheck[] }
}
export const outputFormats = (output: InteractionConfig['output']) => [...new Set([output.format, ...(output.format === 'recipient' ? [] : Array.isArray(output.additionalFormats) ? output.additionalFormats : [])])]
export const inputMethodChoices = [
  { value: 'text', label: '文字', description: '描述需求、粘贴文字或提供文本文件', example: '直接输入 / TXT / MD' },
  { value: 'document', label: '文档', description: '提供方案、制度或会议材料', example: 'PDF、DOCX' },
  { value: 'spreadsheet', label: '表格', description: '提供名单、台账或统计数据', example: 'Excel、CSV' },
  { value: 'image', label: '图片', description: '提供截图、照片或扫描件', example: 'PNG、JPG' },
  { value: 'audio', label: '音频', description: '提供会议录音或语音材料', example: 'MP3、WAV、M4A' },
]
export const outputFormatChoices: { value: InteractionConfig['output']['format']; label: string; description: string; example: string }[] = [
  { value: 'text', label: '直接回答', description: '适合答疑、简短结论和建议', example: '这项申请需要补充两份材料……' },
  { value: 'markdown', label: '分段说明', description: '用标题和列表整理较长内容', example: '结论 → 依据 → 下一步建议' },
  { value: 'document', label: '可编辑文档', description: '适合报告、方案和会议纪要', example: '成果示例.docx' },
  { value: 'pdf', label: 'PDF 文件', description: '适合阅读、打印或留档', example: '成果示例.pdf' },
  { value: 'json', label: '结构化数据（JSON）', description: '用固定字段与类型约定结果，便于系统读取', example: '{"result": "待核对"}' },
  { value: 'table', label: '表格清单', description: '适合台账、对照表和待办清单', example: '事项 ｜ 负责人 ｜ 完成时间' },
  { value: 'recipient', label: '分别交付给多人', description: '为每位接收人准备内容并逐人确认', example: '给林晓的内容 · 等待确认' },
]
export const id = () => crypto.randomUUID()
export function defaultInteractionConfig(): InteractionConfig { return {
  input: { instructions: '', modalities: ['text'], fields: [], entryFields: [], followUp: 'auto', formThreshold: 2, attachments: { fileMB: 20, count: 10, totalMB: 100, audioMB: 200, audioMinutes: 60 } },
  output: { format: 'text', requirements: '', sections: [], fields: [], sourceRequired: true, deliveryConfirm: false, recipients: [], factChecks: [] }
} }
export const newInputField = (fields: InputField[] = []): InputField => {
  let number = fields.length + 1; while (fields.some(f => f.key === `field_${number}`)) number++
  return { id: id(), key: `field_${number}`, label: '', type: 'text', requirement: 'required', source: 'user', sensitivity: 'low', lookupSource: '', example: '', options: [], maxLength: 5000 }
}
export const peopleDirectory = [{ id: 'lin', name: '林晓', detail: '信息化处', active: true }, { id: 'chen', name: '陈明', detail: '信息化处', active: true }, { id: 'zhou', name: '周宁', detail: '教务处', active: true }, { id: 'zhou-old', name: '周宁', detail: '校办公室 · 已离岗', active: false }]
export const roomDirectory = [{ id: 'room-a', name: '行政楼 201', detail: '20 人 · 可用', active: true }, { id: 'room-b', name: '教学楼报告厅', detail: '80 人 · 可用', active: true }, { id: 'room-closed', name: '行政楼 301', detail: '维修中 · 不可用', active: false }]
export const empty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
export function fieldReferences(config: InteractionConfig, key: string): string[] { return [
  ...(config.input.entryFields.includes(key) ? ['入口表单'] : []),
  ...config.input.fields.filter(f => f.condition?.field === key).map(f => `条件字段「${f.label || f.key}」`),
  ...config.output.factChecks.filter(f => f.source === 'input' && f.inputKey === key).map(() => '输出事实比对')
] }
export function outputReferences(config: InteractionConfig, key: string): string[] { return config.output.factChecks.filter(f => f.outputKey === key).map(() => '输出事实比对') }
export function deleteField(config: InteractionConfig, key: string, output = false): InteractionConfig {
  const refs = output ? outputReferences(config, key) : fieldReferences(config, key)
  if (refs.length) throw new Error(`先解除引用：${refs.join('、')}`)
  const next = structuredClone(config); if (output) next.output.fields = next.output.fields.filter(f => f.key !== key); else next.input.fields = next.input.fields.filter(f => f.key !== key); return next
}
export function validateInteractionConfig(config: InteractionConfig, { complete = false, requireSources = true, singleUser = false, formatsOnly = false }: { complete?: boolean; requireSources?: boolean; singleUser?: boolean; formatsOnly?: boolean } = {}): string[] {
  const errors: string[] = []
  if (formatsOnly) {
    if (!Array.isArray(config?.input?.modalities) || !config?.output) return ['输入输出配置结构不正确']
    if (config.input.modalities.some(value => !inputMethodChoices.some(choice => choice.value === value)) || new Set(config.input.modalities).size !== config.input.modalities.length) errors.push('输入格式无效或重复')
    if (complete && !config.input.modalities.length) errors.push('至少选择一种输入格式')
    if (!outputFormatChoices.some(choice => choice.value !== 'recipient' && choice.value === config.output.format)) errors.push('请选择有效的输出格式')
    if (config.output.additionalFormats !== undefined && (!Array.isArray(config.output.additionalFormats) || config.output.additionalFormats.some(value => !outputFormatChoices.some(choice => choice.value !== 'recipient' && choice.value === value)) || new Set(config.output.additionalFormats).size !== config.output.additionalFormats.length)) errors.push('输出格式无效或重复')
    return errors
  }
  if (!config?.input || !config?.output || !config.input.attachments || ![config.input.fields, config.output.fields, config.input.entryFields, config.input.modalities, config.output.sections, config.output.factChecks, config.output.recipients].every(Array.isArray)) return ['输入输出配置结构不正确']
  const { input, output } = config
  if (input.entryMode !== undefined && !['conversation', 'form'].includes(input.entryMode)) errors.push('表单开始方式无效')
  for (const [value, label, max] of [[input.formTitle, '表单标题', 60], [input.submitLabel, '提交按钮文字', 20], [output.templateRef, '成果模板引用', 500]] as const) if (value !== undefined && (typeof value !== 'string' || value.length > max)) errors.push(`${label}最多 ${max} 字`)
  if (complete && input.entryMode === 'form' && !input.fields.length) errors.push('先填表单时，请至少添加一个填写项')
  if (output.additionalFormats !== undefined && (!Array.isArray(output.additionalFormats) || output.additionalFormats.some(format => !['text', 'markdown', 'document', 'pdf', 'table', 'json'].includes(format)) || new Set(output.additionalFormats).size !== output.additionalFormats.length)) errors.push('附加成果格式无效或重复')
  if (input.instructions !== undefined && (typeof input.instructions !== 'string' || input.instructions.length > 2000)) errors.push('填写提示须为不超过 2000 字的文字')
  if ([...input.fields, ...output.fields].some(f => !f || typeof f.id !== 'string' || typeof f.key !== 'string' || typeof f.label !== 'string' || !Array.isArray(f.options) || f.options.some(option => typeof option !== 'string'))) return ['输入输出字段结构不正确']
  if (output.sections.length > 20 || output.sections.some(s => !s || typeof s.title !== 'string' || s.title.length > 100)) errors.push('成果章节最多 20 项，每项标题最多 100 字')
  if (complete && output.sections.some(s => !s.title.trim())) errors.push('请填写成果章节标题')
  if (complete && requireSources && !output.sourceRequired) errors.push('成果来源核对不能关闭')
  if (complete && output.requirements.length > 5000) errors.push('成果要求最多 5000 字')
  const fieldGroups = [[input.fields, '输入'], [output.fields, '输出']] as const
  for (const [fields, label] of fieldGroups) {
    if (fields.length > 20) errors.push(`${label}字段最多 20 项`)
    if (new Set(fields.map(f => f.key)).size !== fields.length) errors.push(`${label}字段标识不能重复`)
    if (new Set(fields.map(f => f.id)).size !== fields.length) errors.push(`${label}字段身份不能重复`)
    fields.forEach(f => {
      const name = `${label}「${f.label || f.key}」`
      if (!/^[a-z][a-z0-9_]{0,49}$/.test(f.key)) errors.push(`${name}字段标识须以小写字母开头，最长 50 字符`)
      if (!Object.hasOwn(fieldTypeLabels, f.type) || !['required', 'optional', 'conditional'].includes(f.requirement) || !['user', 'lookup', 'agent_prefill'].includes(f.source) || !['low', 'medium', 'high'].includes(f.sensitivity)) errors.push(`${name}配置选项无效`)
      if (!f.label.trim()) errors.push(`${name}请填写名称`)
      if (f.sensitivity === 'high' && f.source === 'agent_prefill') errors.push(`${name}高敏感字段不能由 AI 推断，请更换来源`)
      if (['enum', 'multi_enum'].includes(f.type) && (f.options.length < 2 || f.options.some(v => !v.trim()) || new Set(f.options).size !== f.options.length)) errors.push(`${name}至少需要两个不重复的选项`)
      if (f.minimum !== undefined && !Number.isFinite(f.minimum) || f.maximum !== undefined && !Number.isFinite(f.maximum) || f.minimum !== undefined && f.maximum !== undefined && f.minimum > f.maximum) errors.push(`${name}数值范围不正确`)
      if (f.maxItems !== undefined && (!Number.isInteger(f.maxItems) || f.maxItems < 1 || f.maxItems > 100)) errors.push(`${name}最多选择数须为 1—100`)
      if (f.maxLength !== undefined && (!Number.isInteger(f.maxLength) || f.maxLength < 1 || f.maxLength > 20000)) errors.push(`${name}文字长度须为 1—20000`)
      if (f.helpText !== undefined && (typeof f.helpText !== 'string' || f.helpText.length > 500)) errors.push(`${name}填写说明最多 500 字`)
      if (f.defaultValue !== undefined && !empty(f.defaultValue)) {
        if (f.type === 'file' || f.source !== 'user') errors.push(`${name}默认值仅适用于用户填写的非附件字段`)
        else if (fieldValueErrors(f, f.defaultValue).length) errors.push(`${name}默认值不符合字段类型或填写限制`)
      }
      if (complete && f.source === 'lookup' && !['people', 'rooms'].includes(f.lookupSource)) errors.push(`${name}请选择模拟查找来源`)
    })
  }
  input.fields.filter(f => f.requirement === 'conditional').forEach(f => {
    if (!f.condition || !input.fields.some(other => other.key === f.condition!.field) || f.condition.field === f.key) errors.push(`「${f.label}」请选择其他输入字段作为条件`)
    if (f.condition && !['eq', 'ne', 'in', 'not_empty', 'empty'].includes(f.condition.operator)) errors.push(`「${f.label}」条件运算符无效`)
    const seen = new Set([f.key]); let cursor: InputField | undefined = f
    while (cursor?.requirement === 'conditional' && cursor.condition) { const key: string = cursor.condition.field; if (seen.has(key)) { errors.push(`「${f.label}」条件存在循环引用`); break } seen.add(key); cursor = input.fields.find(other => other.key === key) }
  })
  input.entryFields.forEach(key => { if (!input.fields.some(f => f.key === key && f.requirement === 'required')) errors.push(`入口表单「${key}」须引用无条件必填字段`) })
  if (!Number.isInteger(input.formThreshold) || input.formThreshold < 1 || input.formThreshold > 10) errors.push('多字段表单阈值须为 1—10')
  if (!['auto', 'text', 'form', 'choice'].includes(input.followUp)) errors.push('追问形式无效')
  if (complete && input.followUp === 'form' && !input.fields.length) errors.push('选择集中填表时，请至少添加一个填写项')
  if (input.modalities.some(v => !['text', 'document', 'spreadsheet', 'image', 'audio'].includes(v))) errors.push('输入方式无效')
  if (!['text', 'markdown', 'document', 'pdf', 'table', 'recipient', 'json'].includes(output.format)) errors.push('交付形式无效')
  if (complete && !input.modalities.length) errors.push('至少选择一种输入方式')
  const maxima: AttachmentLimits = { fileMB: 20, count: 10, totalMB: 100, audioMB: 200, audioMinutes: 60 }
  for (const key of Object.keys(maxima) as (keyof AttachmentLimits)[]) if (!Number.isInteger(input.attachments[key]) || input.attachments[key] < 1 || input.attachments[key] > maxima[key]) errors.push(`附件限制 ${key} 须为 1—${maxima[key]}`)
  output.factChecks.forEach(check => {
    if (!output.fields.some(f => f.key === check.outputKey)) errors.push('事实比对需要选择有效成果字段')
    if (check.source === 'input' && !input.fields.some(f => f.key === check.inputKey)) errors.push('事实比对需要选择有效输入字段')
    if (!['match', 'different', 'unknown'].includes(check.result) || !['input', 'directory'].includes(check.source)) errors.push('事实比对选项无效')
  })
  if (complete && outputFormats(output).includes('json') && !output.fields.length) errors.push('结构化输出至少需要一个成果字段')
  if (singleUser && output.format === 'recipient') errors.push('当前仅向发起用户返回结果，请选择其他输出格式')
  if (complete && output.format === 'recipient' && !output.recipients.length) errors.push('按接收人交付须选择至少一位接收人')
  if ((!singleUser || output.format === 'recipient') && output.recipients.some(person => !peopleDirectory.some(p => p.id === person && p.active))) errors.push('接收人包含已失效对象，请重新选择')
  return [...new Set(errors)]
}
export function fieldApplies(field: InputField, values: Record<string, unknown>, fields: InputField[], visited = new Set<string>()): boolean {
  if (field.requirement !== 'conditional') return true
  if (!field.condition || visited.has(field.key)) return false
  const parent = fields.find(f => f.key === field.condition!.field); if (!parent || !fieldApplies(parent, values, fields, new Set([...visited, field.key]))) return false
  const value = values[parent.key]; const expected = field.condition.value
  switch (field.condition.operator) {
    case 'empty': return empty(value)
    case 'not_empty': return !empty(value)
    case 'eq': return !empty(value) && String(value) === expected
    case 'ne': return !empty(value) && String(value) !== expected
    case 'in': return !empty(value) && expected.split(',').map(v => v.trim()).some(v => Array.isArray(value) ? value.includes(v) : String(value) === v)
  }
}
export function fieldValueErrors(field: InputField, value: unknown): string[] {
  if (empty(value)) return []
  const fail = (text: string) => [`${field.label}：${text}`]
  if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || field.minimum !== undefined && value < field.minimum || field.maximum !== undefined && value > field.maximum)) return fail('请填写允许范围内的数字')
  if (['text', 'long_text'].includes(field.type) && (typeof value !== 'string' || value.length > (field.maxLength ?? 5000))) return fail('文字格式或长度不正确')
  if (field.type === 'boolean' && typeof value !== 'boolean') return fail('请选择是或否')
  if (field.type === 'file' && (typeof value !== 'object' || value === null || !('name' in value) || !('size' in value) || typeof value.name !== 'string' || typeof value.size !== 'number' || !Number.isFinite(value.size) || value.size < 0)) return fail('请选择有效附件')
  if (field.type === 'datetime' && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) return fail('请选择有效日期时间')
  if (field.type === 'datetime_range' && (!Array.isArray(value) || value.length !== 2 || value.some(v => !v || !Number.isFinite(Date.parse(String(v)))) || Date.parse(value[0]) >= Date.parse(value[1]))) return fail('开始时间须早于结束时间')
  const directory = field.type === 'room' ? roomDirectory : peopleDirectory
  const options = ['person', 'person_list', 'room'].includes(field.type) ? directory.filter(p => p.active).map(p => p.id) : field.options
  if (['enum', 'person', 'room'].includes(field.type) && !options.includes(String(value))) return fail('选项已失效，请重新选择')
  if (['multi_enum', 'person_list'].includes(field.type) && (!Array.isArray(value) || value.some(v => !options.includes(v)) || value.length > (field.maxItems ?? 100))) return fail('选项无效或超过选择上限')
  return []
}
export function initialInputValues(config: InteractionConfig): Record<string, unknown> {
  const values = Object.fromEntries(config.input.fields.filter(f => f.source === 'user' && f.defaultValue !== undefined && !fieldValueErrors(f, f.defaultValue).length).map(f => [f.key, structuredClone(f.defaultValue)]))
  for (const field of config.input.fields) if (!fieldApplies(field, values, config.input.fields)) delete values[field.key]
  return values
}
export function inputIssues(config: InteractionConfig, values: Record<string, unknown>, confirmed: string[] = []): string[] {
  const applicable = config.input.fields.filter(f => fieldApplies(f, values, config.input.fields))
  const files = applicable.filter(f => f.type === 'file' && !empty(values[f.key]) && !fieldValueErrors(f, values[f.key]).length).map(f => values[f.key] as DemoFile)
  return [...applicable.flatMap(f => [
    ...(f.requirement !== 'optional' && empty(values[f.key]) ? [`请填写${f.label}`] : []),
    ...fieldValueErrors(f, values[f.key]),
    ...(f.source === 'agent_prefill' && !empty(values[f.key]) && !confirmed.includes(f.key) ? [`请确认 AI 推断的${f.label}`] : [])
  ]), ...attachmentIssues(files, config)]
}
export function missingPresentation(config: InteractionConfig, values: Record<string, unknown>, confirmed: string[] = []): 'ready' | 'text' | 'form' | 'data_select' {
  const missing = config.input.fields.filter(f => f.requirement !== 'optional' && fieldApplies(f, values, config.input.fields) && empty(values[f.key]))
  if (config.input.fields.some(f => fieldApplies(f, values, config.input.fields) && !empty(values[f.key]) && (fieldValueErrors(f, values[f.key]).length || f.source === 'agent_prefill' && !confirmed.includes(f.key)))) return 'form'
  if (!missing.length) return inputIssues(config, values, confirmed).length ? 'form' : 'ready'
  if (config.input.followUp === 'auto') return missing.length >= config.input.formThreshold ? 'form' : missing.length === 1 && ['enum', 'multi_enum', 'person', 'person_list', 'room', 'boolean'].includes(missing[0].type) ? 'data_select' : missing.some(f => ['datetime', 'datetime_range', 'file', 'number'].includes(f.type)) ? 'form' : 'text'
  if (config.input.followUp === 'form' || missing.length > 1) return 'form'
  if (missing.length === 1 && (config.input.followUp === 'choice' || ['enum', 'multi_enum', 'room'].includes(missing[0].type))) return 'data_select'
  return 'text'
}
export function exampleValue(f: InputField): unknown {
  if (f.type === 'number') return Number(f.example) || f.minimum || 1
  if (f.type === 'boolean') return true
  if (f.type === 'datetime') return '2026-09-16T09:00'
  if (f.type === 'datetime_range') return ['2026-09-16T09:00', '2026-09-16T10:00']
  if (f.type === 'person') return 'lin'
  if (f.type === 'person_list') return ['lin']
  if (f.type === 'room') return 'room-a'
  if (f.type === 'file') return { name: '说明.txt', size: 1024 }
  if (f.type === 'enum') return f.options[0] ?? ''
  if (f.type === 'multi_enum') return f.options.slice(0, 1)
  return f.example || `${f.label}示例`
}
export interface DemoFile { name: string; size: number; minutes?: number }
export function attachmentIssues(files: DemoFile[], config: InteractionConfig): string[] {
  const input = config.input; const limits = input.attachments; const errors: string[] = []
  const extensions: Record<string, string[]> = { text: ['TXT', 'MD'], document: ['PDF', 'DOCX'], spreadsheet: ['XLSX', 'CSV'], image: ['PNG', 'JPG'], audio: ['MP3', 'WAV', 'M4A'] }
  const allowed = input.modalities.flatMap(type => extensions[type] ?? [])
  const audio = files.filter(f => /\.(mp3|wav|m4a)$/i.test(f.name)); const other = files.filter(f => !audio.includes(f))
  if (files.some(f => !allowed.includes(f.name.split('.').pop()!.toUpperCase()))) errors.push('附件格式不在允许的输入方式中')
  if (other.length > limits.count || other.some(f => f.size > limits.fileMB * 1024 ** 2) || other.reduce((sum, f) => sum + f.size, 0) > limits.totalMB * 1024 ** 2) errors.push('非音频附件超过单文件、数量或合计限制')
  if (audio.length > 1 || audio.some(f => f.size > limits.audioMB * 1024 ** 2 || f.minutes !== undefined && f.minutes > limits.audioMinutes)) errors.push('音频超过数量、大小或时长限制')
  return errors
}
export interface DecisionState { interactionId: string; contentVersion: number; status: 'pending' | 'confirmed' | 'rejected'; keys: string[]; transitions: number }
export function applyDecision(state: DecisionState, action: { key: string; contentVersion: number; decision: 'confirm' | 'reject' | 'modify' }): DecisionState {
  if (state.keys.includes(action.key)) return state
  if (action.contentVersion !== state.contentVersion) throw new Error('内容已变化，请核对当前版本后重新确认')
  if (state.status !== 'pending') throw new Error('此审核项已处理，请重置样例后重试')
  return { ...state, contentVersion: state.contentVersion + (action.decision === 'modify' ? 1 : 0), status: action.decision === 'modify' ? 'pending' : action.decision === 'confirm' ? 'confirmed' : 'rejected', keys: [...state.keys, action.key], transitions: state.transitions + 1 }
}

/** Existing configurations are projected for display only; stored snapshots remain unchanged. */
export function interactionOf(c: Config): InteractionConfig {
  if (c.interaction) return c.interaction
  const value = defaultInteractionConfig()
  value.input.modalities = [...new Set(c.input.types.map(t => ['PNG', 'JPG'].includes(t) ? 'image' : ['MP3', 'WAV', 'M4A'].includes(t) ? 'audio' : ['PDF', 'DOCX'].includes(t) ? 'document' : ['XLSX', 'CSV'].includes(t) ? 'spreadsheet' : 'text'))]
  const { types: _, ...limits } = c.input; value.input.attachments = limits
  value.output.format = c.output.mode === 'task' ? 'markdown' : 'text'
  value.output.sourceRequired = c.output.sources
  value.output.deliveryConfirm = c.nodes.some(node => !node.tool)
  if (c.output.mode === 'task') value.output.sections = ['结果概述', '交付成果', '实际完成情况', '待处理事项'].map((title, i) => ({ id: `legacy-${i}`, title }))
  return value
}
