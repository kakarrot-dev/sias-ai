// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { App } from './App'
import { ChatRecords } from './RunCenter'
import { chatCalls, chatSessions, groupUsage, managementAudits, summarizeUsage, usageDimensions, visibleChatSessions, type ChatCall, type UsageDimension } from './chat-records'
import { blankConfig, clone, seedCampus, type Actor } from './campus/model'
import { prototypeStore, resetPrototype } from './prototype-store'

const admin: Actor = { role: 'admin', department: '信息化处' }
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
async function open(path = '/runs') { window.history.replaceState(null, '', `#${path}`); render(<App />); await screen.findByRole('tab', { name: '会话记录' }) }
const clickTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))

describe('reported chat usage', () => {
  it('deduplicates deliveries but counts distinct retry calls and failed/stopped consumption', () => {
    const call = chatCalls[0]
    const retry: ChatCall = { ...call, id: 'retry', status: 'failed', inputTokens: 100, outputTokens: 0 }
    expect(summarizeUsage([call, call, retry])).toEqual({ count: 2, input: 1020, output: 380, total: 1400, pending: 0 })
    expect(summarizeUsage(chatCalls.filter(c => c.status === 'stopped'))).toMatchObject({ total: 1430, pending: 0 })
  })
  it('keeps zero distinct from missing and accepts a later completed report only once', () => {
    const missing = { ...chatCalls[0], inputTokens: null, outputTokens: null }
    expect(summarizeUsage([missing])).toMatchObject({ input: null, output: null, total: null, pending: 1 })
    expect(summarizeUsage([{ ...missing, inputTokens: 0, outputTokens: 0 }])).toMatchObject({ total: 0, pending: 0 })
    expect(summarizeUsage([missing, chatCalls[0]])).toMatchObject({ count: 1, total: 1300, pending: 0 })
  })
  it('marks partial input/output reporting without dropping known consumption', () => {
    expect(summarizeUsage(chatCalls.filter(c => c.sessionId === 'chat-0917-002'))).toEqual({ count: 2, input: 4150, output: 760, total: 4910, pending: 1 })
  })
  it.each(Object.keys(usageDimensions) as UsageDimension[])('keeps totals identical when grouping by %s', dimension => {
    const groups = groupUsage(chatSessions, [...chatCalls, chatCalls[0]], dimension)
    expect(groups.reduce((n, g) => n + (g.total ?? 0), 0)).toBe(summarizeUsage(chatCalls).total)
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(10)
    expect(groups.reduce((n, g) => n + g.pending, 0)).toBe(3)
  })
  it('scopes every grouping to visible sessions, never task or member records', () => {
    const sessions = visibleChatSessions(seedCampus(), admin, 'minutes')
    const groups = groupUsage(sessions, chatCalls, 'agentId')
    expect(groups).toHaveLength(1); expect(groups[0]).toMatchObject({ key: 'minutes', count: 3, pending: 2, total: 4910 })
  })
  it('hides unavailable teams/captains and limits consumer records to administrator or auditor', () => {
    const state = seedCampus()
    expect(visibleChatSessions(state, admin).some(s => s.agentId === 'old-office')).toBe(true)
    const schedule = state.agents.find(a => a.id === 'schedule')!; schedule.dutyType = 'captain'
    expect(visibleChatSessions(state, admin).some(s => s.agentId === 'schedule')).toBe(false)
    expect(visibleChatSessions(state, { role: 'configurer', department: '信息化处' }).map(s => s.agentId)).toEqual([])
    expect(visibleChatSessions(state, { role: 'publisher', department: '教务处' })).toEqual([])
  })
})

describe('chat Run Center', () => {
  it('has conversation, invocation, usage and audit views while preserving stored business history', async () => {
    const before = clone(prototypeStore().state())
    await open()
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['会话记录', '模型调用', '用量统计', '管理审计'])
    expect(screen.queryByText(/业务办理记录|人工确认|演示确认后继续|协作进度/)).not.toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(7); expect(rows[1]).toHaveTextContent('chat-0917-001')
    expect(prototypeStore().state()).toEqual(before)
  })
  it('filters sessions, handles no results and restores the list', async () => {
    await open()
    fireEvent.change(screen.getByLabelText('筛选智能体'), { target: { value: 'minutes' } })
    fireEvent.change(screen.getByLabelText('筛选回复状态'), { target: { value: 'failed' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('搜索会话'), { target: { value: '不存在' } })
    expect(screen.getByText('没有匹配的记录')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getAllByRole('row')).toHaveLength(7)
  })
  it.each([
    ['001', '回复完成', '6,380'], ['002', '回复失败', '4,910'], ['003', '生成中', '待补报'], ['004', '用户停止', '2,060'], ['005', '回复完成', '待补报']
  ])('shows metadata and reported usage in session %s without transcript or task fields', async (suffix, status, total) => {
    await open(); fireEvent.click(screen.getByRole('button', { name: `查看会话 chat-0917-${suffix}` }))
    const modal = screen.getByRole('dialog', { name: '会话详情' })
    expect(modal).toHaveTextContent(status); expect(modal).toHaveTextContent(total)
    expect(modal).toHaveTextContent('会话使用版本'); expect(modal).toHaveTextContent('最近活动')
    expect(modal).not.toHaveTextContent(/任务标识|业务生效|人工确认|请整理这份材料/)
    expect(within(modal).queryByRole('button', { name: /重试|继续|查看聊天正文/ })).not.toBeInTheDocument()
    fireEvent.click(within(modal).getByRole('button', { name: '关闭详情' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows call-level usage detail, partial reports and alternate grouping', async () => {
    await open(); clickTab('用量统计')
    fireEvent.click(screen.getByRole('button', { name: '查看用量 会议纪要专家' }))
    const modal = screen.getByRole('dialog', { name: '用量详情' })
    expect(modal).toHaveTextContent('2 个会话 · 3 次模型调用'); expect(modal).toHaveTextContent('2 次调用尚未完整上报')
    expect(modal).toHaveTextContent('call-002-2'); expect(modal).toHaveTextContent('模型响应超时')
    fireEvent.click(within(modal).getByRole('button', { name: '关闭详情' }))
    fireEvent.change(screen.getByLabelText('用量汇总维度'), { target: { value: 'user' } })
    expect(screen.getByRole('button', { name: '查看用量 林晓' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('搜索用量记录'), { target: { value: 'chat-0917-005' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('待补报')
  })
  it('shows newly persisted Agent audit details along with read-only legacy records', async () => {
    const store = prototypeStore(); const state = store.state().campus!
    const config = { ...blankConfig(), name: '审计验收专家' }
    store.campusAction(state.revision, admin, { type: 'create', kind: 'expert', config })
    await open(); clickTab('管理审计')
    const audit = store.state().campus!.audits[0]
    fireEvent.click(screen.getByRole('button', { name: `查看审计 ${audit.action} 审计验收专家` }))
    const modal = screen.getByRole('dialog', { name: '管理审计详情' })
    expect(modal).toHaveTextContent(audit.id); expect(modal).toHaveTextContent(audit.basis)
    expect(modal).toHaveTextContent(audit.before); expect(modal).toHaveTextContent(audit.after)
    expect(modal).toHaveTextContent('不包含逐字段差异')
    fireEvent.click(within(modal).getByRole('button', { name: '关闭详情' }))
    expect(screen.getAllByText('研究与写作专家组').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '研究与写作专家组' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索管理审计'), { target: { value: '没有这个操作' } })
    expect(screen.getByText('没有匹配的管理操作')).toBeVisible()
  })
  it('uses the same scoped views in the Agent records route', async () => {
    await open('/agents/minutes/edit/records')
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.queryByText('业务运行记录')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('筛选智能体')).not.toBeInTheDocument()
    clickTab('用量统计'); expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('4,910')
  })
  it('does not manufacture conversations for a new or draft-only Agent', () => {
    render(<ChatRecords state={seedCampus()} actor={admin} agentId="policy" />)
    expect(screen.getByText('暂无会话记录')).toBeVisible()
    clickTab('管理审计'); expect(screen.getByText('暂无管理操作')).toBeVisible()
  })
  it('keeps the selected demo role scope when opening the global Run Center', async () => {
    sessionStorage.setItem('campus-demo-actor', JSON.stringify({ role: 'configurer', department: '信息化处' }))
    await open(); expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('周宁 · 教务处')).not.toBeInTheDocument()
    clickTab('管理审计'); expect(screen.getByText('暂无管理操作')).toBeVisible()
    expect(managementAudits(seedCampus(), { role: 'configurer', department: '信息化处' }, undefined, prototypeStore().state().audits)).toEqual([])
  })
})
