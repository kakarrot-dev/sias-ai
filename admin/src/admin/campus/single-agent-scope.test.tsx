// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { App } from '../App'
import { PrototypeStore, prototypeStore, resetPrototype, STORAGE_KEY } from '../prototype-store'
import { applyCampusAction, type CampusAction } from './actions'
import { blankConfig, clone, seedCampus, usageDecision } from './model'

const admin = { role: 'admin', department: '信息化处' } as const
class MemoryStorage implements Storage {
  data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}
beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); resetPrototype()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function open(path = '/agents') {
  window.history.replaceState(null, '', `#${path}`)
  render(<App />)
  await screen.findByText('系统管理员 · 原型操作身份')
}

it.each(['/agents', '/agents?kind=team'])('only lists single experts, including with an old team filter: %s', async path => {
  await open(path)
  expect(screen.getByRole('button', { name: '会议安排专家' })).toBeVisible()
  expect(screen.queryByRole('button', { name: /专家团|会议统筹专家/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '筛选智能体角色' })).not.toBeInTheDocument()
  expect(document.querySelector('.campus-center')).not.toHaveTextContent(/专家团|队长|团内/)
})

it.each(['/agents/new/team', '/agents/new/captain', '/agents/meeting-team', '/agents/meeting-team/edit/team', '/agents/meeting-team/edit/release', '/agents/captain/view', '/agents/captain/edit/basic', '/agents/captain/edit/history'])('blocks a disabled creation or detail link: %s', async path => {
  const before = prototypeStore().state().campus
  await open(path)
  expect(screen.getByRole('heading', { name: '当前仅开放单个智能体' })).toBeVisible()
  expect(screen.queryByRole('textbox', { name: /名称/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /保存|发布|恢复/ })).not.toBeInTheDocument()
  expect(prototypeStore().state().campus).toEqual(before)
})

it.each(['/agents/new', '/agents/manual', '/agents/new/expert'])('keeps the single expert creation route: %s', async path => {
  await open(path)
  expect(screen.getByRole('heading', { name: '创建专家智能体' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '创建专家，或组织专家团' })).not.toBeInTheDocument()
})

it('creates a standalone draft from the catalog and keeps it after reloading', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: '创建专家' }))
  fireEvent(window, new HashChangeEvent('hashchange'))
  await screen.findByRole('heading', { name: '创建专家智能体' })
  fireEvent.change(screen.getByRole('textbox', { name: '专家名称' }), { target: { value: '独立材料专家' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(prototypeStore().state().campus!.agents.some(a => a.draft.name === '独立材料专家')).toBe(true))
  const saved = prototypeStore().state().campus!.agents.find(a => a.draft.name === '独立材料专家')!
  expect(saved).toMatchObject({ kind: 'expert', usageMode: 'public', grants: [] })
  expect(saved.dutyType).toBeUndefined()
  expect(usageDecision(saved, 'lin').allowed).toBe(false)
  expect(new PrototypeStore(localStorage).state().campus!.agents.find(a => a.id === saved.id)).toEqual(saved)
})

it.each([
  { type: 'create', kind: 'team', config: blankConfig() },
  { type: 'create', kind: 'expert', dutyType: 'captain', config: blankConfig() },
  { type: 'copy', id: 'meeting-team', name: '不应创建的副本' },
  { type: 'copy', id: 'captain', name: '不应创建的队长' },
  { type: 'publish', id: 'meeting-team', note: '不应发布' },
  { type: 'from-version', id: 'captain', version: 1 },
  { type: 'save', id: 'meeting-team', config: blankConfig(), credentialChecked: true },
  { type: 'owners', ids: ['schedule', 'captain'], owner: 'lin' },
] satisfies CampusAction[])('rejects disabled operations without changing stored data: $type $id', action => {
  const state = seedCampus(); const before = clone(state)
  expect(() => applyCampusAction(state, admin, action)).toThrow('当前仅开放单个智能体')
  expect(state).toEqual(before)
  const store = prototypeStore(); const stored = store.state().campus!
  expect(() => store.campusAction(stored.revision, admin, action)).toThrow('当前仅开放单个智能体')
  expect(store.state().campus).toEqual(stored)
})

it('keeps saved multi-agent history and denies new use without changing existing expert grants', () => {
  const store = prototypeStore(); const before = store.state().campus!
  // Persist the historical fixture; initial seeding is deliberately lazy.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY)!), campus: before }))
  expect(usageDecision(before.agents.find(a => a.id === 'meeting-team')!, 'lin').allowed).toBe(false)
  expect(usageDecision(before.agents.find(a => a.id === 'captain')!, 'lin').allowed).toBe(false)
  const expert = before.agents.find(a => a.id === 'schedule')!
  expect(usageDecision(expert, 'lin').allowed).toBe(true)
  const reloaded = new PrototypeStore(localStorage).state().campus!
  expect(reloaded.agents).toEqual(before.agents)
  expect(reloaded.runs).toEqual(before.runs)
})

it('does not expose disabled teams through a single expert release summary', async () => {
  await open('/agents/schedule/edit/release')
  expect(screen.queryByText(/引用团队|会议全流程专家团/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '会议安排专家', level: 1 })).toBeVisible()
})

it('publishes an expert for all active C users and preserves old versions when revising', () => {
  const store = prototypeStore()
  const run = (action: CampusAction) => store.campusAction(store.state().campus!.revision, admin, action)
  const config = clone(store.state().campus!.agents.find(a => a.id === 'schedule')!.draft)
  config.name = '独立发布验收专家'
  const id = run({ type: 'create', kind: 'expert', config, publish: true })!
  const published = store.state().campus!.agents.find(a => a.id === id)!
  expect(published).toMatchObject({ live: 1, usageMode: 'public', grants: [] })
  expect(usageDecision(published, 'lin', store.state().campus!.userCenter).allowed).toBe(true)
  expect(usageDecision(published, 'li', store.state().campus!.userCenter).allowed).toBe(false)
  run({ type: 'from-version', id, version: 1 })
  config.description = '保存新的职责说明，保留原版本'
  run({ type: 'save', id, config, credentialChecked: true, publish: true })
  const revised = new PrototypeStore(localStorage).state().campus!.agents.find(a => a.id === id)!
  expect(revised.live).toBe(2)
  expect(revised.versions.find(v => v.number === 1)).toEqual(published.versions[0])
  expect(usageDecision(revised, 'lin', store.state().campus!.userCenter).allowed).toBe(true)
  const copyId = run({ type: 'copy', id, name: '独立专家副本' })!
  expect(store.state().campus!.agents.find(a => a.id === copyId)).toMatchObject({ usageMode: 'public', grants: [], versions: [] })
})
