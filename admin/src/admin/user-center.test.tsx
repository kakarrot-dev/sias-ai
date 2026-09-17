// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { App } from './App'
import { UserCenter } from './UserCenter'
import { PrototypeStore, prototypeStore, resetPrototype, STORAGE_KEY } from './prototype-store'
import { userAccessDecision, type UserCenterAction } from './user-center-model'
import { usageDecision, releaseIssues, people } from './campus/model'
import { applyCampusAction } from './campus/actions'
import { chatSessions, managementAudits } from './chat-records'

const admin = { role: 'admin', department: '信息化处' } as const
class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
  key(index: number) { return [...this.values.keys()][index] ?? null }
}
beforeEach(() => {
  vi.stubGlobal('Storage', MemoryStorage); vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); resetPrototype()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const center = (store = prototypeStore()) => store.state().campus!.userCenter!
const change = (action: UserCenterAction, store = prototypeStore()) => store.userCenterAction(center(store).revision, admin, action)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))
async function open(path = '/users') { window.history.replaceState(null, '', `#${path}`); render(<App />); await screen.findByRole('heading', { name: path.startsWith('/users') ? '用户中心' : '运行中心', level: 1 }) }

describe('consumer MVP account policy', () => {
  it('adds the user directory to old storage without resetting Agent configurations or history', () => {
    const storage = new MemoryStorage(); const original = new PrototypeStore(storage); const before = original.state()
    const oldData = JSON.parse(storage.getItem(STORAGE_KEY)!); oldData.campus = before.campus; delete oldData.campus.userCenter; storage.setItem(STORAGE_KEY, JSON.stringify(oldData))
    const migrated = new PrototypeStore(storage).state()
    expect(migrated.campus!.agents).toEqual(before.campus!.agents); expect(migrated.campus!.runs).toEqual(before.campus!.runs)
    expect(migrated.audits).toEqual(before.audits); expect(migrated.campus!.userCenter!.users.map(u => u.id)).toEqual(people.map(p => p.id))
    expect(chatSessions.every(s => migrated.campus!.userCenter!.users.some(u => u.id === s.user))).toBe(true)
  })
  it('persists account changes and blocks access while retaining identity, grants and history', () => {
    const store = prototypeStore(); const before = store.state(); const user = center().users[0]
    change({ type: 'user-status', id: user.id, status: 'disabled', reason: '用户申请暂停' })
    expect(userAccessDecision(center(), user.id).allowed).toBe(false)
    expect(center().users[0]).toEqual({ ...user, status: 'disabled' })
    expect(store.state().campus!.agents).toEqual(before.campus!.agents); expect(store.state().campus!.runs).toEqual(before.campus!.runs)
    expect(center(new PrototypeStore(localStorage)).users[0].status).toBe('disabled')
    expect(managementAudits(store.state().campus!, admin).find(a => a.source === '用户中心')).toMatchObject({ before: '正常', after: '已停用' })
    change({ type: 'user-status', id: user.id, status: 'active', reason: '恢复使用' })
    expect(userAccessDecision(center(), user.id).allowed).toBe(true)
  })
  it.each(['save-role', 'user-roles', 'role-status', 'delete-role'])('rejects deferred %s operations without changing stored data', type => {
    const before = prototypeStore().state()
    expect(() => change({ type, id: 'lin' } as unknown as UserCenterAction)).toThrow('当前 MVP 仅支持账号启停')
    expect(prototypeStore().state()).toEqual(before)
  })
  it('requires a valid account, state and operation reason', () => {
    const before = prototypeStore().state()
    for (const action of [
      { type: 'user-status', id: 'lin', status: 'disabled', reason: ' ' },
      { type: 'user-status', id: 'missing', status: 'disabled', reason: '暂停' },
      { type: 'user-status', id: 'lin', status: 'invalid', reason: '暂停' },
    ]) expect(() => change(action as UserCenterAction)).toThrow()
    expect(prototypeStore().state()).toEqual(before)
  })
  it('rejects stale revisions and read-only actors and rolls back storage failures', () => {
    const store = prototypeStore(); const before = store.state(); const action: UserCenterAction = { type: 'user-status', id: 'lin', status: 'disabled', reason: '停用测试' }
    expect(() => store.userCenterAction(0, admin, action)).toThrow('已更新')
    expect(() => store.userCenterAction(center().revision, { ...admin, role: 'auditor' }, action)).toThrow('只可查看')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('存储不可用') })
    expect(() => change(action)).toThrow('存储不可用'); expect(store.state()).toEqual(before)
  })
  it('allows valid C users without roles or individual grants and ignores historical permission settings', () => {
    const state = prototypeStore().state().campus!; const agent = state.agents.find(a => a.id === 'schedule')!; const users = state.userCenter!
    users.users[0].roleIds = ['retired-role']; users.roles = [{ id: 'retired-role', name: '旧角色', description: '', area: 'consumer', permissions: [], enabled: false, builtin: false }]
    agent.grants = [{ id: 'deny', subject: 'user', target: 'lin', children: false, effect: 'deny' }]; agent.usageMode = 'internal'; agent.sync = 'failed'
    const before = structuredClone(state)
    expect(usageDecision(agent, 'lin', users)).toEqual({ allowed: true, reason: '登录后即可使用' })
    expect(state).toEqual(before)
    expect(usageDecision(agent, '', users).reason).toContain('请先登录')
    users.users[0].identity.status = 'revoked'
    expect(usageDecision(agent, 'lin', users).reason).toContain('身份绑定已撤销')
    users.users[0].identity.status = 'linked'; users.users[0].status = 'disabled'
    expect(usageDecision(agent, 'lin', users).reason).toContain('账号已停用')
    users.users[0].status = 'active'; agent.disabled = true
    expect(usageDecision(agent, 'lin', users).allowed).toBe(false)
    agent.disabled = false; agent.live = undefined
    expect(usageDecision(agent, 'lin', users).reason).toContain('尚未发布')
    agent.live = 999
    expect(usageDecision(agent, 'lin', users).allowed).toBe(false)
  })
  it('ignores retired synchronization gates when publishing or restoring an existing version', () => {
    const state = prototypeStore().state().campus!; const agent = state.agents.find(a => a.id === 'schedule')!
    agent.sync = 'failed'; const originalGrants = structuredClone(agent.grants)
    applyCampusAction(state, admin, { type: 'from-version', id: agent.id, version: 1 })
    expect(releaseIssues(state, agent).some(issue => /同步/.test(issue))).toBe(false)
    applyCampusAction(state, admin, { type: 'publish', id: agent.id, note: 'MVP 发布验证' })
    expect(agent.live).toBe(2)
    applyCampusAction(state, admin, { type: 'rollback', id: agent.id, version: 1, note: '恢复旧版' })
    expect(agent.live).toBe(1); expect(agent.grants).toEqual(originalGrants); expect(agent.sync).toBe('failed')
    expect(usageDecision(agent, 'lin', state.userCenter).allowed).toBe(true)
  })
  it('does not allow old Agent authorization actions to mutate the MVP', () => {
    const store = prototypeStore(); const before = store.state()
    for (const action of [{ type: 'grants', id: 'schedule', grants: [], fail: false }, { type: 'sync', id: 'schedule' }, { type: 'usage-mode', id: 'schedule', mode: 'internal' }] as Parameters<typeof store.campusAction>[2][]) {
      expect(() => store.campusAction(before.campus!.revision, admin, action)).toThrow('当前 MVP 登录即可使用')
      expect(store.state()).toEqual(before)
    }
  })

})

describe('user center workflows', () => {
  it('lists C users with working filters, read-only identity and no organization or fabricated contacts', async () => {
    await open()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText(/分配角色|角色管理|权限查询|可用角色/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(6)
    expect(screen.queryByText(/组织目录|所属部门|邮箱|手机号/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('账号状态筛选'), { target: { value: 'disabled' } }); expect(screen.getAllByRole('row')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('搜索用户'), { target: { value: 'unknown' } }); expect(screen.getByText('没有匹配的用户')).toBeVisible()
    click('清除筛选'); click('查看用户 林晓')
    const dialog = screen.getByRole('dialog', { name: '用户详情' }); expect(dialog).toHaveTextContent('lin'); expect(dialog).toHaveTextContent('可登录平台'); expect(dialog).not.toHaveTextContent('分配角色')
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument(); expect(within(dialog).getByText('Issuer')).toBeInTheDocument()
  })
  it('disables a user only with a reason and shows the persisted denial and audit', async () => {
    await open(); click('查看用户 林晓'); click('停用账号')
    expect(screen.getByRole('button', { name: '确认停用' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '用户申请暂停' } }); click('确认停用')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    click('查看用户 林晓'); expect(screen.getByRole('dialog')).toHaveTextContent('用户账号已停用'); expect(screen.getByRole('button', { name: '启用账号' })).toBeVisible()
    cleanup(); await open('/runs'); tab('管理审计'); click('查看审计 停用用户 林晓')
    const dialog = screen.getByRole('dialog'); expect(dialog).toHaveTextContent('用户申请暂停'); expect(dialog).toHaveTextContent('权限或状态变更'); expect(dialog).not.toHaveTextContent('配置指纹')
  })
  it('opens only the selected user sessions and usage and can return to all records', async () => {
    await open(); click('查看用户 陈明'); click('查看此用户会话')
    await screen.findByRole('heading', { name: '运行中心', level: 1 })
    expect(screen.getAllByRole('row')).toHaveLength(chatSessions.filter(s => s.user === 'chen').length + 1)
    expect(screen.queryByRole('tab', { name: '管理审计' })).not.toBeInTheDocument()
    expect(screen.queryByText('chat-0917-001')).not.toBeInTheDocument()
    click('查看全部用户记录'); await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(7))
    cleanup(); await open('/runs?user=chen&view=usage'); expect(screen.getByRole('tab', { name: '用量统计' })).toHaveAttribute('aria-selected', 'true')
    cleanup(); window.history.replaceState(null, '', '#/runs?user=missing'); render(<App />); expect(await screen.findByText('用户不存在')).toBeVisible()
  })
  it('keeps a failed save editable, and avoids duplicate submission after a successful write with failed refresh', async () => {
    const store = prototypeStore(); const reload = vi.fn().mockRejectedValue(new Error('读取失败'))
    render(<UserCenter data={store.state()} route="/users" reload={reload} navigate={vi.fn()} notify={vi.fn()} />)
    click('查看用户 林晓'); click('停用账号'); fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '暂停使用' } })
    const writing = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('存储不可用') })
    click('确认停用'); await screen.findByText('存储不可用'); expect(screen.getByLabelText('操作原因')).toHaveValue('暂停使用'); expect(center().audits).toHaveLength(0)
    writing.mockRestore(); click('确认停用'); await screen.findByText('修改已保存，页面读取失败。请重新读取，不会重复提交。')
    expect(center().audits).toHaveLength(1); expect(screen.getByRole('button', { name: '查看用户 林晓' })).toBeDisabled()
    reload.mockResolvedValue(undefined); click('重新读取'); await waitFor(() => expect(screen.queryByRole('button', { name: '重新读取' })).not.toBeInTheDocument())
    expect(center().audits).toHaveLength(1)
  })
  it('keeps read-only operators from mutating users and roles', async () => {
    sessionStorage.setItem('campus-demo-actor', JSON.stringify({ ...admin, role: 'auditor' }))
    await open(); expect(screen.queryByRole('button', { name: '分配角色 林晓' })).not.toBeInTheDocument()
    click('查看用户 林晓'); expect(screen.queryByRole('button', { name: '停用账号' })).not.toBeInTheDocument()
    click('关闭对话框'); expect(screen.queryByRole('button', { name: '创建角色' })).not.toBeInTheDocument()
  })
  it('does not expose conversation totals through user details to configuration-only operators', async () => {
    sessionStorage.setItem('campus-demo-actor', JSON.stringify({ ...admin, role: 'configurer' }))
    await open(); click('查看用户 林晓')
    expect(screen.getByText('当前演示身份无权查看用户会话与用量。')).toBeVisible()
    expect(screen.queryByRole('button', { name: '查看此用户会话' })).not.toBeInTheDocument()
  })

})
