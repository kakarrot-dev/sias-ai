// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { App } from './App'
import { prototypeStore, resetPrototype } from './prototype-store'
import { UserModelAccess } from './ModelAccessPanels'
import { KeyUsage } from './ModelAccessPanels'
import { ChatRecords } from './RunCenter'
import { seedCampus } from './campus/model'
import { chatCalls, chatSessions, groupUsage, summarizeUsage } from './chat-records'
import { accessFor, callAccessSnapshots, dailySnapshot, displayMoney, selectedSource } from './model-access'

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); resetPrototype()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close') })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))
async function open(path = '/users') { window.history.replaceState(null, '', `#${path}`); render(<App />); await screen.findByRole('heading', { name: path.startsWith('/users') ? '用户中心' : '运行中心', level: 1 }) }

it('filters user source and access, distinguishes current source from inspecting another source, and preserves data', async () => {
  const before = prototypeStore().state(); await open()
  fireEvent.change(screen.getByLabelText('用户调用来源筛选'), { target: { value: 'personal' } })
  fireEvent.change(screen.getByLabelText('用户接入状态筛选'), { target: { value: 'missing' } })
  expect(screen.getAllByRole('row')).toHaveLength(2); click('查看用户 周宁'); tab('模型接入')
  expect(screen.getByRole('dialog')).toHaveTextContent('不代表用户在 Token超市没有 Key')
  click('平台统一 Key'); expect(screen.getByRole('dialog')).toHaveTextContent('•••• P901')
  expect(screen.getByRole('dialog')).toHaveTextContent('当前调用来源：用户专属 Key')
  expect(selectedSource('zhou')).toBe('personal'); expect(prototypeStore().state()).toEqual(before)
  expect(within(screen.getByRole('dialog')).queryByRole('textbox')).not.toBeInTheDocument()
})
it('keeps wallet, quota and subscription amounts separate, with zero distinct from missing', () => {
  const users = prototypeStore().state().campus!.userCenter!.users
  const { rerender } = render(<UserModelAccess key="lin" user={users.find(u => u.id === 'lin')!} usage />)
  expect(screen.getByText('账号钱包余额（Key 返回）')).toBeVisible(); expect(screen.getByText('28.5 USD')).toBeVisible()
  expect(screen.queryByText('Key 剩余额度')).not.toBeInTheDocument()
  rerender(<UserModelAccess key="xu" user={users.find(u => u.id === 'xu')!} usage />)
  expect(screen.getByText('Key 剩余额度')).toBeVisible(); expect(screen.getAllByText('0 USD').length).toBeGreaterThan(0)
  expect(screen.queryByText('账号钱包余额（Key 返回）')).not.toBeInTheDocument()
  rerender(<UserModelAccess key="li" user={users.find(u => u.id === 'li')!} usage />)
  expect(screen.getByText('订阅剩余额度')).toBeVisible(); expect(screen.getByText('18 USD')).toBeVisible()
  expect(displayMoney(undefined, 'USD')).toBe('未提供'); expect(displayMoney(0, 'USD')).toBe('0 USD')
})
it('does not relabel server today or cumulative statistics when selecting date and timezone', () => {
  const access = accessFor('lin', 'personal'); render(<KeyUsage access={access} />)
  expect(screen.getByText('21,000')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Key 用量时区'), { target: { value: 'UTC' } })
  expect(screen.getByText('此日期 / 时区的统计暂不可用，不表示零消费。')).toBeVisible()
  expect(screen.getByText('900,000')).toBeVisible(); expect(screen.getByText('25,000')).toBeInTheDocument()
  expect(dailySnapshot(access, '2026-09-18', 'Asia/Shanghai')).toBeUndefined()
})
it('attributes model and source totals to call snapshots instead of current user settings', () => {
  const models = groupUsage(chatSessions, chatCalls, 'model')
  expect(models.map(g => g.key).sort()).toEqual(['deepseek-v4', 'glm-5.2'])
  expect(models.reduce((sum, g) => sum + (g.total ?? 0), 0)).toBe(summarizeUsage(chatCalls).total)
  expect(groupUsage(chatSessions, chatCalls, 'source').reduce((sum, g) => sum + g.count, 0)).toBe(chatCalls.length)
  expect(selectedSource('zhou')).toBe('personal'); expect(callAccessSnapshots['call-003-1'].source).toBe('platform')
})
it('links a user to their calls and shows attribution, fees and incomplete timeout reports', async () => {
  await open(); click('查看用户 陈明'); click('查看此用户调用')
  await screen.findByRole('tab', { name: '模型调用', selected: true })
  expect(screen.getAllByRole('row')).toHaveLength(3)
  click('查看调用 call-002-2'); const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('平台统一 Key'); expect(dialog).toHaveTextContent('glm-5.2')
  expect(dialog).toHaveTextContent('费用'); expect(dialog).toHaveTextContent('实际费用'); expect(dialog).toHaveTextContent('504')
  expect(dialog).toHaveTextContent('用量尚未完整上报'); expect(within(dialog).queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
})
it('filters call sources and keeps platform Key upstream totals separate from one user', async () => {
  await open('/runs?view=calls')
  fireEvent.change(screen.getByLabelText('调用来源筛选'), { target: { value: 'personal' } })
  expect(screen.getAllByRole('row')).toHaveLength(7)
  expect(screen.queryByRole('button', { name: '查看调用 call-002-1' })).not.toBeInTheDocument()
  tab('用量统计'); click('Key 上游统计')
  expect(screen.getByText(/平台共享 Key；额度属于平台/)).toBeVisible()
  click('用户专属 Key'); fireEvent.change(screen.getByLabelText('Key 统计用户'), { target: { value: 'chen' } })
  expect(screen.getByText('Key 已过期')).toBeVisible(); expect(screen.getByText('8 USD')).toBeVisible()
  expect(screen.queryByText('900,000')).not.toBeInTheDocument()
})
it('does not expose Key upstream statistics to configuration-only operators', () => {
  render(<ChatRecords state={seedCampus()} actor={{ role: 'configurer', department: '信息化处' }} />)
  tab('用量统计'); click('Key 上游统计')
  expect(screen.getByText('暂无可查看用户')).toBeVisible(); expect(screen.queryByText('87.5 USD')).not.toBeInTheDocument()
})
