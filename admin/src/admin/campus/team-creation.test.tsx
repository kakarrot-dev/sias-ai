// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { App } from '../App'
import { resetPrototype } from '../prototype-store'
class MemoryStorage implements Storage {
  data = new Map<string, string>(); get length() { return this.data.size }; clear() { this.data.clear() }; getItem(key: string) { return this.data.get(key) ?? null }; key(i: number) { return [...this.data.keys()][i] ?? null }; removeItem(key: string) { this.data.delete(key) }; setItem(key: string, value: string) { this.data.set(key, value) }
}
beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); resetPrototype(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } }); Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } }) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function open() { window.history.replaceState(null, '', '#/agents/new/team'); render(<App />); await screen.findByLabelText('演示身份') }
function step(name: string) { fireEvent.click(within(screen.getByRole('navigation', { name: '专家团创建步骤' })).getByRole('button', { name })) }
function click(name: string) { fireEvent.click(screen.getByRole('button', { name })); fireEvent(window, new HashChangeEvent('hashchange')) }

it('starts with neutral guidance and focuses the team name when saving from another step', async () => {
  await open(); step('队长与成员')
  expect(screen.queryByText('组团待完善 · 可以保存草稿')).not.toBeInTheDocument()
  expect(screen.queryByText('队长和成员必须有效且不能重复')).not.toBeInTheDocument()
  click('保存草稿')
  expect(screen.getByRole('textbox', { name: '名称*' })).toHaveFocus()
  expect(screen.getByText('请填写团队名称')).toBeVisible()
})

it('lets users select multiple experts without changing the draft until confirmation', async () => {
  await open(); step('队长与成员'); click('添加普通专家')
  const dialog = screen.getByRole('dialog', { name: '添加普通专家' })
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /^会议安排专家/ }))
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /^会议纪要专家/ }))
  expect(within(dialog).getByRole('checkbox', { name: /^会议安排专家/ })).toBeChecked()
  click('取消')
  expect(screen.getByRole('button', { name: '添加普通专家' })).toHaveFocus()
  expect(screen.getByText('已选 0 位')).toBeVisible()
  click('添加普通专家')
  expect(screen.getByRole('checkbox', { name: /^会议安排专家/ })).not.toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: /^会议安排专家/ }))
  fireEvent.change(screen.getByRole('textbox', { name: '搜索组团专家' }), { target: { value: '会议纪要' } })
  expect(screen.queryByRole('checkbox', { name: /^会议安排专家/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: /^会议纪要专家/ }))
  click('添加所选专家（2）')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('已选 2 位')).toBeVisible()
  const cached = JSON.parse(sessionStorage.getItem('campus-create:admin:信息化处:team')!)
  expect(cached.team.members.map((member: { id: string }) => member.id)).toEqual(['schedule', 'minutes'])
  cleanup(); await open()
  expect(screen.getByText('已选 2 位')).toBeVisible()
})

it('keeps team creation to three assembly steps and links missing requirements back to members', async () => {
  await open()
  expect(within(screen.getByRole('navigation', { name: '专家团创建步骤' })).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['基本信息', '队长与成员', '检查团队'])
  step('检查团队'); click('填写团队名称')
  expect(screen.getByRole('textbox', { name: '名称*' })).toHaveFocus()
  fireEvent.change(screen.getByRole('textbox', { name: '名称*' }), { target: { value: '组队验收团' } })
  step('检查团队')
  expect(screen.queryByRole('navigation', { name: '输入输出分区' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '修改用户输入' })).not.toBeInTheDocument()
  click('至少选择两名不同的普通专家')
  expect(screen.getByRole('button', { name: '添加普通专家' })).toBeVisible()
  expect(screen.getByRole('button', { name: '下一步：检查团队' })).toBeVisible()
})
