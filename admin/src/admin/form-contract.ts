import type { ContractField, Issue } from './shared'

export type FormValues = Record<string, unknown>
export const fieldKinds = { string: '短文本', textarea: '长文本', number: '数字', date: '日期', boolean: '是 / 否', select: '单选', multiselect: '多选' }
export type FieldKind = keyof typeof fieldKinds
export const fieldKind = (f: ContractField): FieldKind => f.widget ?? (f.type === 'array' ? 'multiselect' : f.type)
export function changeFieldKind(f: ContractField, kind: FieldKind): ContractField {
  const { widget: _widget, options, minimum: _min, maximum: _max, ...base } = f
  return { ...base, type: kind === 'multiselect' ? 'array' : kind === 'number' || kind === 'boolean' ? kind : 'string',
    ...(['textarea', 'date', 'select', 'multiselect'].includes(kind) ? { widget: kind as ContractField['widget'] } : {}),
    ...(['select', 'multiselect'].includes(kind) ? { options: options?.length ? options : ['选项一', '选项二'] } : {}) }
}
export function fieldsSchema(fields: ContractField[]) {
  return { type: 'object', properties: Object.fromEntries(fields.map(f => [f.key, {
    type: f.type, title: f.label, description: f.help || f.label,
    ...(f.type === 'string' ? { maxLength: 5000, ...(f.required ? { minLength: 1 } : {}) } : {}),
    ...(f.widget === 'date' ? { format: 'date' } : {}),
    ...(f.widget === 'select' ? { enum: f.options ?? [] } : {}),
    ...(f.type === 'array' ? { items: { type: 'string', enum: f.options ?? [] }, uniqueItems: true, ...(f.required ? { minItems: 1 } : {}) } : {}),
    ...(f.minimum !== undefined ? { minimum: f.minimum } : {}), ...(f.maximum !== undefined ? { maximum: f.maximum } : {})
  }])), required: fields.filter(f => f.required).map(f => f.key), additionalProperties: false }
}
export function fieldExample(fields: ContractField[]): FormValues {
  return Object.fromEntries(fields.map(f => [f.key, f.type === 'array' ? (f.options ?? []).slice(0, 1)
    : f.widget === 'select' ? f.options?.[0] ?? '' : f.widget === 'date' ? '2026-09-21'
    : f.type === 'number' ? Math.min(f.maximum ?? Infinity, Math.max(f.minimum ?? -Infinity, 1))
    : f.type === 'boolean' ? true : `示例${f.label}`]))
}
export function emptyValue(value: unknown) { return value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length) }
export function fieldValueError(f: ContractField, value: unknown): string | undefined {
  // Null is not a JSON Schema value for our supported types; only undefined means omitted.
  if (value === undefined) return f.required ? `缺少必填字段：${f.key}（${f.label}）` : undefined
  if (typeof value !== (f.type === 'array' ? 'object' : f.type) || value === null || (f.type === 'array' && !Array.isArray(value))) return `${f.label} 类型不符合 ${f.type}`
  if (f.required && emptyValue(value)) return `请填写${f.label}`
  if (typeof value === 'string' && value.length > 5000) return `${f.label}最多 5000 个字`
  if (f.type === 'number' && (!Number.isFinite(value) || (f.minimum !== undefined && Number(value) < f.minimum) || (f.maximum !== undefined && Number(value) > f.maximum))) return `${f.label}需为有效数字${f.minimum !== undefined ? `，不小于 ${f.minimum}` : ''}${f.maximum !== undefined ? `，不大于 ${f.maximum}` : ''}`
  if (f.widget === 'date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return `${f.label}需为有效日期`
  if (f.widget === 'select' && !f.options?.includes(String(value))) return `${f.label}请选择提供的选项`
  if (f.type === 'array' && Array.isArray(value) && (value.some(v => typeof v !== 'string' || !f.options?.includes(v)) || new Set(value).size !== value.length)) return `${f.label}包含无效或重复选项`
}
export function validateContractValue(fields: ContractField[], value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['输入必须是 JSON 对象']
  const object = value as FormValues
  return [...fields.flatMap(f => { const error = fieldValueError(f, Object.hasOwn(object, f.key) ? object[f.key] : undefined); return error ? [error] : [] }),
    ...Object.keys(object).filter(key => !fields.some(f => f.key === key)).map(key => `未声明的输入字段：${key}`)]
}
export function fieldDefinitionIssues(fields: ContractField[], name: string, path: string, input = false): Issue[] {
  const issues: Issue[] = []
  const add = (message: string) => issues.push({ field: path, message })
  const keys = new Set<string>()
  if (fields.length > (name === '补充' ? 6 : 20)) add(`${name}字段最多 ${name === '补充' ? 6 : 20} 个`)
  for (const f of fields) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(f.key)) add(`${name}字段名需以英文字母开头，只含字母、数字和下划线，最多 40 字符`)
    if (keys.has(f.key)) add(`${name}字段名 ${f.key} 重复`)
    keys.add(f.key)
    if (!f.label.trim()) add(`请填写${name}字段的业务含义`)
    if (input && /^(tenant_?id|workspace_?id|user_?id|session_?id|credential.*|auth.*|identity|api_?key|access_?token|password|token|secret)$/i.test(f.key)) add(`${f.key} 属于身份或会话上下文及凭证，不能作为用户填写的业务输入`)
    if ((f.type === 'array' && f.widget !== 'multiselect') || (f.widget === 'multiselect' && f.type !== 'array') || (['select', 'date', 'textarea'].includes(f.widget ?? '') && f.type !== 'string')) add(`${name}字段 ${f.key} 的类型与控件不匹配`)
    if (f.widget === 'select' || f.type === 'array') {
      if (!f.options?.length || f.options.length > 30 || f.options.some(o => !o.trim()) || new Set(f.options).size !== f.options.length) add(`${name}字段 ${f.key} 需要 1–30 个非空且不重复的选项`)
    } else if (f.options !== undefined) add(`${name}字段 ${f.key} 只有选择类型可以设置选项`)
    if ((f.minimum !== undefined || f.maximum !== undefined) && f.type !== 'number') add(`${name}字段 ${f.key} 只有数字类型可以设置范围`)
    if ((f.minimum !== undefined && !Number.isFinite(f.minimum)) || (f.maximum !== undefined && !Number.isFinite(f.maximum)) || (f.minimum !== undefined && f.maximum !== undefined && f.minimum > f.maximum)) add(`${name}字段 ${f.key} 的数字范围不正确`)
  }
  return issues
}

export const formExamples: { id: string; name: string; inputs: ContractField[]; outputs: ContractField[]; followUp: ContractField[] }[] = [
  { id: 'report', name: '报告摘要', inputs: [{ key: 'topic', label: '报告主题', type: 'string', required: true }, { key: 'material', label: '参考材料', type: 'string', widget: 'textarea', required: true, help: '粘贴材料或提供可访问的资料链接。' }], outputs: [{ key: 'summary', label: '核心结论', type: 'string', widget: 'textarea', required: true }, { key: 'recommendation', label: '行动建议', type: 'string', widget: 'textarea', required: true }], followUp: [{ key: 'audience', label: '阅读对象', type: 'string', widget: 'select', options: ['管理层', '项目团队', '客户'], required: true }] },
  { id: 'task', name: '任务跟进', inputs: [{ key: 'meeting_notes', label: '会议记录', type: 'string', widget: 'textarea', required: true }], outputs: [{ key: 'task_name', label: '任务名称', type: 'string', required: true }, { key: 'assignee', label: '负责人', type: 'string', required: true }, { key: 'due_date', label: '截止日期', type: 'string', widget: 'date', required: true }, { key: 'priority', label: '优先级', type: 'string', widget: 'select', options: ['高', '中', '低'], required: true }, { key: 'categories', label: '任务分类', type: 'array', widget: 'multiselect', options: ['产品', '研发', '运营'], required: false }], followUp: [{ key: 'default_assignee', label: '未指定时的负责人', type: 'string', required: true }] },
  { id: 'request', name: '申请核对', inputs: [{ key: 'purpose', label: '申请用途', type: 'string', widget: 'textarea', required: true }, { key: 'amount', label: '申请金额', type: 'number', minimum: 0, maximum: 100000, required: true }], outputs: [{ key: 'conclusion', label: '核对结论', type: 'string', widget: 'textarea', required: true }, { key: 'amount', label: '核对金额', type: 'number', minimum: 0, maximum: 100000, required: true }, { key: 'needs_review', label: '需要进一步复核', type: 'boolean', required: true }], followUp: [{ key: 'evidence', label: '补充依据', type: 'string', widget: 'textarea', required: true }] }
]
