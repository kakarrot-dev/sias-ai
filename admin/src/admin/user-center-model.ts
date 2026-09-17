import { userDirectory } from './user-directory'
import type { Actor, CampusState } from './campus/model'

// Preserve previously stored role data without exposing or applying it in the MVP.
export interface UserRole { id: string; name: string; description: string; area: 'consumer' | 'admin'; permissions: string[]; builtin: boolean; enabled: boolean }
export interface ConsumerUser {
  id: string; displayName: string; status: 'active' | 'disabled'; roleIds: string[]; createdAt: string; lastLoginAt: string | null
  identity: { issuer: string; subject: string; status: 'linked' | 'revoked'; boundAt: string }
}
export interface UserAudit { id: string; targetId: string; targetName: string; action: string; at: string; detail: string; before: string; after: string; actorId: string; actorName: string }
export interface UserCenterState { version: 1; revision: number; users: ConsumerUser[]; roles: UserRole[]; audits: UserAudit[] }
export function seedUserCenter(): UserCenterState {
  return { version: 1, revision: 1, users: userDirectory.map((person, index) => ({
    id: person.id, displayName: person.name, status: index === 4 ? 'disabled' : 'active', roleIds: [],
    createdAt: `2026-09-0${index + 1}T09:00:00+08:00`, lastLoginAt: `2026-09-17T08:${String(10 + index * 8)}:00+08:00`,
    identity: { issuer: 'https://identity.example.invalid/oidc', subject: `demo-subject-${person.id}`, status: 'linked', boundAt: `2026-09-0${index + 1}T09:00:00+08:00` }
  })), roles: [], audits: [] }
}
/** Account eligibility preview only; a real backend must validate the login session. */
export function userAccessDecision(center: UserCenterState, id: string): { allowed: boolean; reason: string } {
  const user = center.users.find(u => u.id === id)
  if (!user) return { allowed: false, reason: '请先登录' }
  if (user.status !== 'active') return { allowed: false, reason: '用户账号已停用' }
  if (user.identity.status !== 'linked') return { allowed: false, reason: '身份绑定已撤销，请重新认证' }
  return { allowed: true, reason: '登录后即可使用' }
}
export type UserCenterAction = { type: 'user-status'; id: string; status: ConsumerUser['status']; reason: string }
export function applyUserCenterAction(state: CampusState, actor: Actor, revision: number, action: UserCenterAction): void {
  if (actor.role !== 'admin') throw new Error('当前演示身份只可查看，平台管理员可执行此操作')
  const center = state.userCenter!
  if (center.revision !== revision) throw new Error('用户中心已更新，请刷新后重试')
  if (action.type !== 'user-status') throw new Error('当前 MVP 仅支持账号启停，不开放角色和权限配置')
  const user = center.users.find(u => u.id === action.id)
  if (!user) throw new Error('用户不存在，请刷新后重试')
  if (typeof action.reason !== 'string' || !action.reason.trim() || action.reason.trim().length > 200) throw new Error('请填写 1–200 字操作原因')
  if (!['active', 'disabled'].includes(action.status)) throw new Error('账号状态无效')
  if (user.status === action.status) return
  const before = user.status === 'active' ? '正常' : '已停用'
  user.status = action.status
  center.audits.unshift({
    id: crypto.randomUUID(), targetId: user.id, targetName: user.displayName,
    action: action.status === 'active' ? '启用用户' : '停用用户', at: new Date().toISOString(), detail: action.reason.trim(),
    before, after: action.status === 'active' ? '正常' : '已停用', actorId: 'local-admin', actorName: '本地管理员（演示）'
  })
  center.revision++; state.revision++
}
