import type { ChatCall, ChatSession } from './chat-records'

/** Read-only prototype fixtures. These contain no credentials or live service results. */
export const sourceLabels = { platform: '平台统一 Key', personal: '用户专属 Key' }
export type KeySource = keyof typeof sourceLabels
export const accessLabels = { ready: '已连接', missing: '待用户连接', expired: 'Key 已过期', exhausted: '额度已用尽', revoked: '授权已撤销', empty: '无可见模型', error: '模型查询失败' }
export type AccessStatus = keyof typeof accessLabels
export const DEMO_USAGE_DATE = '2026-09-17'
export interface UsageSnapshot { requests: number | null; tokens: number | null; cost: number | null; actualCost: number | null }
export interface KeyAccess {
  source: KeySource; status: AccessStatus; keyId?: string; keyName?: string; masked?: string
  group?: { id: number; name: string; protocol: string }; expiresAt?: string | null
  models: string[]; checkedAt?: string; consentAt?: string
  mode?: 'wallet' | 'quota' | 'subscription'; unit?: string; balance?: number; quota?: number; used?: number; remaining?: number
  subscription?: { name: string; window: string; remaining: number }; rateWindow?: string
  total?: UsageSnapshot; serverToday?: UsageSnapshot; days?: { date: string; timezone: string; usage: UsageSnapshot }[]
}
const time = '2026-09-17T10:00:00+08:00'
export const platformAccess: KeyAccess = {
  source: 'platform', status: 'ready', keyId: 'demo-platform-901', keyName: '平台专家服务', masked: '•••• P901', group: { id: 17, name: '平台通用组', protocol: 'OpenAI-compatible（示例）' }, expiresAt: null,
  models: ['deepseek-v4', 'glm-5.2'], checkedAt: time, mode: 'quota', unit: 'USD', quota: 100, used: 12.5, remaining: 87.5,
  total: { requests: 2400, tokens: 6800000, cost: 15, actualCost: 12.5 }, serverToday: { requests: 80, tokens: 200000, cost: .6, actualCost: .5 },
  days: [{ date: DEMO_USAGE_DATE, timezone: 'Asia/Shanghai', usage: { requests: 72, tokens: 182000, cost: .54, actualCost: .45 } }]
}
export const personalAccess: Record<string, KeyAccess> = {
  lin: { source: 'personal', status: 'ready', keyId: 'demo-lin-101', keyName: '林晓的专家专用 Key', masked: '•••• A101', group: { id: 42, name: '个人通用组', protocol: 'OpenAI-compatible（示例）' }, expiresAt: null, models: ['deepseek-v4', 'glm-5.2'], checkedAt: time, consentAt: '2026-09-15T09:00:00+08:00', mode: 'wallet', unit: 'USD', balance: 28.5,
    total: { requests: 300, tokens: 900000, cost: 4, actualCost: 3.2 }, serverToday: { requests: 10, tokens: 25000, cost: .12, actualCost: .1 }, days: [{ date: DEMO_USAGE_DATE, timezone: 'Asia/Shanghai', usage: { requests: 8, tokens: 21000, cost: .1, actualCost: .08 } }] },
  chen: { source: 'personal', status: 'expired', keyId: 'demo-chen-102', keyName: '陈明的专家专用 Key', masked: '•••• B102', group: { id: 42, name: '个人通用组', protocol: 'OpenAI-compatible（示例）' }, expiresAt: '2026-09-17T09:00:00+08:00', models: ['deepseek-v4'], checkedAt: '2026-09-16T10:00:00+08:00', consentAt: '2026-09-01T09:00:00+08:00', mode: 'quota', unit: 'USD', quota: 10, used: 2, remaining: 8, total: { requests: 90, tokens: 210000, cost: 2.5, actualCost: 2 } },
  zhou: { source: 'personal', status: 'missing', models: [] },
  xu: { source: 'personal', status: 'exhausted', keyId: 'demo-xu-104', keyName: '许嘉的专家专用 Key', masked: '•••• D104', group: { id: 42, name: '个人通用组', protocol: 'OpenAI-compatible（示例）' }, expiresAt: null, models: ['glm-5.2'], checkedAt: time, consentAt: '2026-09-02T09:00:00+08:00', mode: 'quota', unit: 'USD', quota: 5, used: 5, remaining: 0, rateWindow: '1d 滚动窗口（独立于自然日统计）', total: { requests: 150, tokens: 350000, cost: 6, actualCost: 5 }, days: [{ date: DEMO_USAGE_DATE, timezone: 'Asia/Shanghai', usage: { requests: 0, tokens: 0, cost: 0, actualCost: 0 } }] },
  li: { source: 'personal', status: 'empty', keyId: 'demo-li-105', keyName: '李敏的专家专用 Key', masked: '•••• E105', group: { id: 63, name: '订阅组', protocol: '协议待确认' }, expiresAt: null, models: [], checkedAt: time, consentAt: '2026-09-03T09:00:00+08:00', mode: 'subscription', unit: 'USD', subscription: { name: '个人订阅', window: '当前订阅月周期', remaining: 18 } }
}
const selectedSources: Record<string, KeySource> = { lin: 'personal', chen: 'platform', zhou: 'personal', xu: 'personal', li: 'personal' }
export const selectedSource = (userId: string): KeySource => selectedSources[userId] ?? 'platform'
export const accessFor = (userId: string, source = selectedSource(userId)): KeyAccess => source === 'platform' ? platformAccess : personalAccess[userId] ?? { source: 'personal', status: 'missing', models: [] }
export const accessHelp: Record<AccessStatus, string> = {
  ready: '模型列表已获取。实际调用仍需校验专家所选模型、协议、Key 状态及额度。',
  missing: '尚未授权本平台使用专属 Key；不代表用户在 Token超市没有 Key。请用户前往 Token超市选取或创建专属 Key，再主动连接。',
  expired: '已有 Key 已过期，请用户在 Token超市处理有效期或重新授权专属 Key；不自动新建或改用平台额度。',
  exhausted: '已有 Key 的额度已用尽，请用户处理额度后重试；不自动切换计费分组或调用来源。',
  revoked: '用户已撤销授权，停止使用此来源。登录平台不会自动恢复授权。',
  empty: '当前 Key 没有返回可用模型。请用户检查分组或权限，不用固定模型列表填补结果。',
  error: '模型列表暂不可用，请检查凭据、权限或服务状态；不把读取失败显示成空目录。'
}
export const displayCount = (value: number | null | undefined) => value == null ? '未提供' : value.toLocaleString('zh-CN')
export const displayMoney = (value: number | null | undefined, unit?: string) => value == null ? '未提供' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })} ${unit || '单位未提供'}`
export const dailySnapshot = (access: KeyAccess, date: string, timezone: string) => access.days?.find(day => day.date === date && day.timezone === timezone)?.usage

export interface CallAccessSnapshot {
  source: KeySource; keyId: string; masked: string; groupName: string; groupId: number
  model: string; protocol: string; cost: number | null; actualCost: number | null; unit: string; httpStatus: number | null; advice?: string
}
/** Immutable example attribution for each invocation, independent of current user settings. */
export const callAccessSnapshots: Record<string, CallAccessSnapshot> = Object.fromEntries([
  ['call-001-1', 'personal', 'lin', 'deepseek-v4', .003, .0024, 200], ['call-001-2', 'personal', 'lin', 'deepseek-v4', .005, .004, 200], ['call-001-3', 'personal', 'lin', 'deepseek-v4', .007, .0056, 200],
  ['call-002-1', 'platform', '', 'glm-5.2', .006, .0048, 200], ['call-002-2', 'platform', '', 'glm-5.2', null, null, 504],
  ['call-003-1', 'platform', '', 'deepseek-v4', null, null, null], ['call-004-1', 'personal', 'xu', 'glm-5.2', .001, .0008, 200], ['call-004-2', 'personal', 'xu', 'glm-5.2', .003, .0024, 200],
  ['call-005-1', 'personal', 'lin', 'deepseek-v4', null, null, 200], ['call-006-1', 'platform', '', 'deepseek-v4', .002, .0016, 200]
].map(([id, source, user, model, cost, actualCost, httpStatus]) => {
  const key = accessFor(String(user), source as KeySource)
  return [id, { source, keyId: key.keyId!, masked: key.masked!, groupName: key.group!.name, groupId: key.group!.id, model, protocol: 'Chat Completions（示例）', cost, actualCost, unit: 'USD', httpStatus, ...(httpStatus === 504 ? { advice: '网关响应超时；结果及费用可能延迟上报。核对原调用后再由用户发起新的请求，不自动重复消费。' } : {}) }]
})) as Record<string, CallAccessSnapshot>
export function scopedCalls(sessions: ChatSession[], calls: ChatCall[]) {
  const ids = new Set(sessions.map(s => s.id))
  return [...new Map(calls.filter(c => ids.has(c.sessionId)).map(c => [c.id, c])).values()].sort((a, b) => b.at.localeCompare(a.at))
}
export const callModels = (sessions: ChatSession[], calls: ChatCall[]) => [...new Set(scopedCalls(sessions, calls).map(c => callAccessSnapshots[c.id]?.model).filter((model): model is string => !!model))]
export function callCostSummary(calls: ChatCall[]) {
  const rows = [...new Map(calls.map(call => [call.id, call])).values()].map(call => callAccessSnapshots[call.id])
  const sum = (field: 'cost' | 'actualCost') => {
    const amounts = new Map<string, number>()
    for (const row of rows) if (row?.[field] != null) amounts.set(row.unit, (amounts.get(row.unit) ?? 0) + row[field]!)
    return amounts.size ? [...amounts].map(([unit, amount]) => displayMoney(amount, unit)).join('；') : '未提供'
  }
  return { cost: sum('cost'), actualCost: sum('actualCost'), pending: rows.filter(row => row?.cost == null || row?.actualCost == null).length }
}
