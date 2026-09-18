/** Shared display fixtures for the two browser prototypes. No service or payment is called. */
export type KeySource = 'platform' | 'personal'
export type ServiceScenario = 'normal' | 'literature' | 'material-failed' | 'output-failed' | 'notice' | 'notice-unauthorized' | 'notice-unknown' | 'call-failed' | 'usage-pending'
export type OperationState = 'none' | 'awaiting' | 'denied' | 'unauthorized' | 'succeeded' | 'unknown' | 'verified'
export interface ServiceRecord {
  id: string; conversationId: string; agentId: string; agentName: string; version: number; model: string;
  material: 'none' | 'read-demo' | 'failed'; delivery: 'none' | 'failed' | 'ready' | 'download-requested';
  source: KeySource; scenario: ServiceScenario; operation: OperationState; tokens: number | null; amount: number | null; at: string;
}
export interface PublicExpertPreview {
  id: string; name: string; description: string; model: string; version: number; disabled: boolean;
  audience: 'student' | 'staff'; category: string; inputs: string[]; fileMB: number; count: number; totalMB: number;
  outputs: string[]; notice: boolean;
}
export const rmb = (value: number | null) => value === null ? '待补报' : `¥${value.toFixed(2)}`
export const sourceName = (source: KeySource) => source === 'platform' ? '平台 Key' : '个人 Key'
export const scenarioLabels: Record<ServiceScenario, string> = {
  normal: '普通对话', literature: '文献摘要与文件', 'material-failed': '材料读取失败', 'output-failed': '成果生成失败',
  notice: '通知发送成功', 'notice-unauthorized': '通知未授权', 'notice-unknown': '通知结果未知', 'call-failed': '回复失败但有消耗', 'usage-pending': '用量待补报',
}
export const operationLabels: Record<OperationState, string> = {
  none: '无外部操作', awaiting: '待本人确认', denied: '已拒绝 · 未发送', unauthorized: '未授权 · 未发送',
  succeeded: '已发送（演示）', unknown: '结果未知 · 请勿重发', verified: '已核实发送成功（演示）',
}
export function makeServiceRecord(input: Pick<ServiceRecord, 'id' | 'conversationId' | 'agentId' | 'agentName' | 'version' | 'model' | 'source' | 'scenario'>): ServiceRecord {
  const pending = input.scenario === 'usage-pending'
  const materialFailed = input.scenario === 'material-failed'
  return { ...input, material: materialFailed ? 'failed' : ['literature', 'output-failed'].includes(input.scenario) ? 'read-demo' : 'none', delivery: input.scenario === 'output-failed' ? 'failed' : input.scenario === 'literature' ? 'ready' : 'none', at: new Date().toISOString(), tokens: pending ? null : materialFailed ? 0 : input.scenario === 'call-failed' ? 600 : 1800,
    amount: input.source === 'personal' || materialFailed ? 0 : pending ? null : input.scenario === 'call-failed' ? .04 : .12,
    operation: input.scenario === 'notice-unauthorized' ? 'unauthorized' : input.scenario.startsWith('notice') ? 'awaiting' : 'none' }
}
export const serviceExamples: ServiceRecord[] = (['literature', 'notice', 'notice-unknown', 'call-failed', 'usage-pending', 'normal', ...Array.from({ length: 17 }, () => 'normal')] as ServiceScenario[]).map((scenario, index) => ({
  ...makeServiceRecord({ id: `SIAS-0917-${String(index + 1).padStart(3, '0')}`, conversationId: `chat-service-${index + 1}`, agentId: scenario.startsWith('notice') ? 'staff.notice-writer' : 'staff.literature-reader', agentName: scenario.startsWith('notice') ? '通知公文助手' : '文献阅读助手', version: 1, model: 'deepseek-v4', source: index === 5 ? 'personal' : 'platform', scenario }),
  at: index === 0 ? '2026-09-17T01:30:00.000Z' : `2026-09-${String(17 - Math.floor(index / 2)).padStart(2, '0')}T${index % 2 ? '01' : '05'}:00:00.000Z`, operation: scenario === 'notice' ? 'succeeded' : scenario === 'notice-unknown' ? 'unknown' : 'none',
}))
export const examplePlatformBalance = 28.60
export const campusIdentities: Record<string, { kind: string; label: string; number: string }> = {
  lin: { kind: '教职工', label: '工号', number: 'T20260001' }, chen: { kind: '教职工', label: '工号', number: 'T20260002' },
  zhou: { kind: '学生', label: '学号', number: '20260001' }, xu: { kind: '学生', label: '学号', number: '20260002' }, li: { kind: '未提供', label: '校园编号', number: '未提供' },
}
const string = (value: unknown, max = 300): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
export function parseServiceRecord(value: string | null): ServiceRecord | undefined {
  try {
    const r = JSON.parse(value ?? 'null') as ServiceRecord
    if (!r || ![r.id, r.conversationId, r.agentId, r.agentName, r.model, r.at].every(v => string(v)) || !Number.isInteger(r.version) || r.version < 1 || !['platform', 'personal'].includes(r.source) || !Object.hasOwn(scenarioLabels, r.scenario) || !Object.hasOwn(operationLabels, r.operation) || !['none', 'read-demo', 'failed'].includes(r.material) || !['none', 'failed', 'ready', 'download-requested'].includes(r.delivery) || ![r.amount, r.tokens].every(n => n === null || typeof n === 'number' && Number.isFinite(n) && n >= 0)) return
    return { id: r.id, conversationId: r.conversationId, agentId: r.agentId, agentName: r.agentName, version: r.version, model: r.model, at: r.at, source: r.source, scenario: r.scenario, operation: r.operation, material: r.material, delivery: r.delivery, amount: r.amount, tokens: r.tokens }
  } catch { return }
}
export function parseExpertPreview(hash: string): PublicExpertPreview | undefined {
  try {
    const r = JSON.parse(new URLSearchParams(hash.replace(/^#/, '')).get('expert') ?? 'null') as PublicExpertPreview
    if (!r || ![r.id, r.name, r.description, r.model, r.category].every(v => string(v)) || !Number.isInteger(r.version) || r.version < 1 || typeof r.disabled !== 'boolean' || !['student', 'staff'].includes(r.audience) || ![r.inputs, r.outputs].every(v => Array.isArray(v) && v.length <= 20 && v.every(s => string(s, 40))) || ![r.fileMB, r.count, r.totalMB].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0) || typeof r.notice !== 'boolean') return
    return r
  } catch { return }
}
export function attachmentIssue(files: { name: string; size: number }[], rule = { inputs: ['TXT', 'MD', 'PDF', 'DOCX'], fileMB: 20, count: 10, totalMB: 100 }): string | undefined {
  if (files.length > rule.count) return `最多添加 ${rule.count} 个文件，请移除多余文件。`
  if (files.some(f => !rule.inputs.includes(f.name.split('.').at(-1)?.toUpperCase() ?? ''))) return `支持 ${rule.inputs.join('、')}，请更换不支持的文件。`
  if (files.some(f => f.size > rule.fileMB * 1024 * 1024)) return `单个文件不能超过 ${rule.fileMB} MB。`
  if (files.reduce((sum, f) => sum + f.size, 0) > rule.totalMB * 1024 * 1024) return `文件总大小不能超过 ${rule.totalMB} MB。`
}
