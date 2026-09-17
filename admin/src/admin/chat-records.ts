import { agentAvailable } from './campus/availability'
import { canSee, type Actor, type CampusState } from './campus/model'
import { actionLabels } from './components'
import { userDirectory } from './user-directory'
import type { AuditRecord } from './shared'
import { callAccessSnapshots } from './model-access'

export const replyLabels = { completed: '回复完成', generating: '生成中', failed: '回复失败', stopped: '用户停止' }
export type ReplyStatus = keyof typeof replyLabels
/** Read-only example metadata. No message bodies, task results or attachments. */
export interface ChatSession {
  id: string; agentId: string; agentName: string; version: number; model: string
  user: string; userName: string; startedAt: string; updatedAt: string
  rounds: number; status: ReplyStatus
}
export interface ChatCall {
  id: string; sessionId: string; at: string; status: ReplyStatus; durationMs: number | null
  inputTokens: number | null; outputTokens: number | null; error?: string
}
const at = (time: string) => `2026-09-17T${time}+08:00`
export const chatSessions: ChatSession[] = [
  { id: 'chat-0917-001', agentId: 'schedule', agentName: '会议安排专家', version: 1, model: 'campus-text', user: 'lin', userName: userDirectory.find(u => u.id === 'lin')!.name, startedAt: at('09:30:00'), updatedAt: at('09:42:00'), rounds: 3, status: 'completed' },
  { id: 'chat-0917-002', agentId: 'minutes', agentName: '会议纪要专家', version: 1, model: 'campus-text', user: 'chen', userName: userDirectory.find(u => u.id === 'chen')!.name, startedAt: at('09:20:00'), updatedAt: at('09:38:00'), rounds: 2, status: 'failed' },
  { id: 'chat-0917-003', agentId: 'assistant', agentName: '校园数字助理', version: 1, model: 'campus-text', user: 'zhou', userName: userDirectory.find(u => u.id === 'zhou')!.name, startedAt: at('09:36:00'), updatedAt: at('09:36:00'), rounds: 1, status: 'generating' },
  { id: 'chat-0917-004', agentId: 'old-office', agentName: '办公制度问答专家', version: 1, model: 'campus-text', user: 'xu', userName: userDirectory.find(u => u.id === 'xu')!.name, startedAt: at('09:00:00'), updatedAt: at('09:25:00'), rounds: 2, status: 'stopped' },
  { id: 'chat-0917-005', agentId: 'minutes', agentName: '会议纪要专家', version: 1, model: 'campus-text', user: 'lin', userName: userDirectory.find(u => u.id === 'lin')!.name, startedAt: at('09:10:00'), updatedAt: at('09:15:00'), rounds: 1, status: 'completed' },
  { id: 'chat-0917-006', agentId: 'assistant', agentName: '校园数字助理', version: 1, model: 'campus-text', user: 'li', userName: userDirectory.find(u => u.id === 'li')!.name, startedAt: at('08:50:00'), updatedAt: at('08:52:00'), rounds: 1, status: 'completed' }
]
export const chatCalls: ChatCall[] = [
  { id: 'call-001-1', sessionId: 'chat-0917-001', at: at('09:30:00'), status: 'completed', durationMs: 2400, inputTokens: 920, outputTokens: 380 },
  { id: 'call-001-2', sessionId: 'chat-0917-001', at: at('09:35:00'), status: 'completed', durationMs: 3200, inputTokens: 1520, outputTokens: 620 },
  { id: 'call-001-3', sessionId: 'chat-0917-001', at: at('09:42:00'), status: 'completed', durationMs: 4100, inputTokens: 2100, outputTokens: 840 },
  { id: 'call-002-1', sessionId: 'chat-0917-002', at: at('09:20:00'), status: 'completed', durationMs: 3800, inputTokens: 1840, outputTokens: 760 },
  { id: 'call-002-2', sessionId: 'chat-0917-002', at: at('09:38:00'), status: 'failed', durationMs: 90000, inputTokens: 2310, outputTokens: null, error: '模型响应超时，未完成本次回复。' },
  { id: 'call-003-1', sessionId: 'chat-0917-003', at: at('09:36:00'), status: 'generating', durationMs: null, inputTokens: null, outputTokens: null },
  { id: 'call-004-1', sessionId: 'chat-0917-004', at: at('09:00:00'), status: 'completed', durationMs: 1900, inputTokens: 420, outputTokens: 210 },
  { id: 'call-004-2', sessionId: 'chat-0917-004', at: at('09:25:00'), status: 'stopped', durationMs: 1500, inputTokens: 1250, outputTokens: 180 },
  { id: 'call-005-1', sessionId: 'chat-0917-005', at: at('09:15:00'), status: 'completed', durationMs: 2100, inputTokens: null, outputTokens: null },
  { id: 'call-006-1', sessionId: 'chat-0917-006', at: at('08:52:00'), status: 'completed', durationMs: 1700, inputTokens: 660, outputTokens: 320 }
]

export function visibleChatSessions(state: CampusState, actor: Actor, agentId?: string) {
  if (!['admin', 'auditor'].includes(actor.role)) return []
  const ids = new Set(state.agents.filter(a => agentAvailable(a) && canSee(actor, a)).map(a => a.id))
  return chatSessions.filter(s => ids.has(s.agentId) && (!agentId || s.agentId === agentId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
/** Each row is the latest reported value for one invocation. Duplicate deliveries replace, never add. */
export function uniqueCalls(calls: ChatCall[]) { return [...new Map(calls.map(c => [c.id, c])).values()] }
export function summarizeUsage(calls: ChatCall[]) {
  const rows = uniqueCalls(calls)
  const sum = (field: 'inputTokens' | 'outputTokens') => {
    const known = rows.filter(c => c[field] !== null)
    return known.length ? known.reduce((n, c) => n + c[field]!, 0) : null
  }
  const input = sum('inputTokens'); const output = sum('outputTokens')
  return { count: rows.length, input, output, total: input === null && output === null ? null : (input ?? 0) + (output ?? 0), pending: rows.filter(c => c.inputTokens === null || c.outputTokens === null).length }
}
export const usageDimensions = { agentId: '按智能体', user: '按用户', model: '按模型', id: '按会话', source: '按调用来源' }
export type UsageDimension = keyof typeof usageDimensions
export function groupUsage(sessions: ChatSession[], calls: ChatCall[], dimension: UsageDimension) {
  const bySession = new Map(sessions.map(s => [s.id, s]))
  const groups = new Map<string, { key: string; sessions: ChatSession[]; calls: ChatCall[] }>()
  for (const call of uniqueCalls(calls)) {
    const session = bySession.get(call.sessionId)
    if (!session) continue
    const key = dimension === 'source' ? callAccessSnapshots[call.id]?.source ?? '来源待补报' : dimension === 'model' ? callAccessSnapshots[call.id]?.model ?? session.model : session[dimension]
    const group = groups.get(key) ?? { key, sessions: [], calls: [] }
    if (!group.sessions.some(s => s.id === session.id)) group.sessions.push(session)
    group.calls.push(call); groups.set(key, group)
  }
  return [...groups.values()].map(g => ({ ...g, ...summarizeUsage(g.calls) }))
}
export interface ManagementAudit {
  id: string; objectId: string; objectName: string; action: string; actor: string; at: string
  source: string; detail: string; impact?: string; before?: string; after?: string
}
export function managementAudits(state: CampusState, actor: Actor, agentId?: string, legacy: AuditRecord[] = []): ManagementAudit[] {
  const global = ['admin', 'auditor'].includes(actor.role)
  const ids = new Set(state.agents.filter(a => canSee(actor, a)).map(a => a.id))
  const campus = state.audits.filter(a => (!agentId || a.agentId === agentId) && (global || ids.has(a.agentId))).map(a => ({
    id: a.id, objectId: a.agentId, objectName: state.agents.find(agent => agent.id === a.agentId)?.draft.name ?? a.agentId,
    action: a.action, actor: a.actor, at: a.at, source: '智能体中心', detail: a.basis, impact: a.impact, before: a.before, after: a.after
  }))
  const historical = !agentId && global ? legacy.map(a => ({ id: a.id, objectId: a.entityId, objectName: a.entityName, action: actionLabels[a.action] ?? a.action, actor: a.actor, at: a.at, source: a.kind === 'workspace' ? '系统设置' : '历史配置', detail: a.detail })) : []
  const users = !agentId && global ? (state.userCenter?.audits ?? []).map(a => ({ id: a.id, objectId: a.targetId, objectName: a.targetName, action: a.action, actor: `${a.actorName} · ${a.actorId}`, at: a.at, source: '用户中心', detail: a.detail, before: a.before, after: a.after })) : []
  return [...campus, ...historical, ...users].sort((a, b) => b.at.localeCompare(a.at))
}
