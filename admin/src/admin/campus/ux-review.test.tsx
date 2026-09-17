// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CampusCenter } from './CampusCenter'
import { clone, liveVersion, seedCampus } from './model'
import { releaseChanges } from './config-summary'
import { defaultDefinition } from './agent-definition'
import { useState } from 'react'
import { OutputEditor } from './InteractionConfig'
import { defaultInteractionConfig } from './interaction-model'

afterEach(() => { cleanup(); sessionStorage.clear() })
const show = (route: string, state = seedCampus()) => render(<CampusCenter state={state} route={route} navigate={vi.fn()} reload={vi.fn()} onDirty={vi.fn()} notify={vi.fn()} />)

it('does not treat a published team as a competing owner of its own captain', () => {
  show('/agents?kind=team')
  const row = screen.getByRole('button', { name: '会议全流程专家团' }).closest('tr')!
  expect(within(row).queryByText('依赖不可用')).not.toBeInTheDocument()
  expect(within(row).getByText('已发布')).toBeVisible()
})

it('marks a real unavailable member as an error instead of a published success', () => {
  const state = seedCampus()
  state.agents.find(a => a.id === 'minutes')!.disabled = true
  show('/agents?kind=team', state)
  const row = screen.getByRole('button', { name: '会议全流程专家团' }).closest('tr')!
  expect(within(row).getByText('依赖不可用')).toHaveClass('is-error')
})

it('keeps the same management navigation when moving from configuration to release and records', () => {
  let labels: string[] = []
  for (const path of ['basic', 'release', 'grants', 'history', 'records']) {
    show(`/agents/schedule/edit/${path}`)
    const buttons = within(screen.getByRole('navigation', { name: '专家表单分区' })).getAllByRole('button')
    const currentLabels = buttons.map(button => button.textContent!)
    if (!labels.length) labels = currentLabels
    expect(currentLabels).toEqual(labels)
    expect(buttons.filter(button => button.textContent === '运行配置')).toHaveLength(1)
    expect(buttons.find(button => button.getAttribute('aria-current'))).toHaveTextContent(({ basic: '基本信息', release: '发布管理', grants: '使用授权', history: '版本记录', records: '运行记录' })[path]!)
    cleanup()
  }
})

it('does not scroll away from object identity and management navigation on first entry', () => {
  const original = HTMLElement.prototype.scrollIntoView
  const scroll = vi.fn()
  HTMLElement.prototype.scrollIntoView = scroll
  try { show('/agents/schedule/edit/basic'); expect(scroll).not.toHaveBeenCalled() }
  finally { HTMLElement.prototype.scrollIntoView = original }
})

it('shows selected members without the candidate picker in a published team', () => {
  show('/agents/meeting-team/view/team')
  expect(screen.getByRole('heading', { name: /普通专家 · 已选 2 位/ })).toBeVisible()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '队长智能体' })).not.toBeInTheDocument()
  expect(screen.getByText('会议安排专家', { selector: 'strong' })).toBeVisible()
  expect(screen.queryByText(/已归属其他专家团/)).not.toBeInTheDocument()
})

it('compares saved configuration against the active version without changing that version', () => {
  const state = seedCampus()
  const agent = state.agents.find(a => a.id === 'schedule')!
  agent.draft = clone(liveVersion(agent)!.config)
  expect(releaseChanges(agent, state)).toEqual([])
  const snapshot = clone(liveVersion(agent))
  agent.draft.opening = '新增的欢迎语'
  agent.draft.temperature = 0.8
  agent.draft.definition = defaultDefinition(agent.draft)
  agent.draft.definition.governance.handoffEnabled = true
  agent.draft.definition.governance.handoffOwner = 'chen'
  const changes = releaseChanges(agent, state)
  expect(changes.find(c => c.label === '开场白与推荐问题')?.after).toContain('新增的欢迎语')
  expect(changes.find(c => c.label === '模型与上下文')?.after).toContain('温度 0.8')
  expect(changes.find(c => c.label === '运行限制与人工兜底')?.after).toContain('陈明')
  expect(liveVersion(agent)).toEqual(snapshot)
})

it('separates per-person delivery from file formats while preserving existing recipients and content', () => {
  const initial = defaultInteractionConfig()
  initial.output.format = 'recipient'; initial.output.recipients = ['lin']; initial.output.requirements = '保留我的交付要求'
  function Host() { const [value, setValue] = useState(initial); return <><OutputEditor value={value} onChange={setValue} /><output data-testid="saved-output">{JSON.stringify(value.output)}</output></> }
  render(<Host />)
  expect(screen.getByRole('radio', { name: '分别交付给多人' })).toBeChecked()
  expect(screen.queryByRole('radiogroup', { name: '成果形式' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: '统一交付成果' }))
  fireEvent.click(screen.getByRole('radio', { name: 'PDF 文件' }))
  fireEvent.click(screen.getByRole('radio', { name: '分别交付给多人' }))
  expect(JSON.parse(screen.getByTestId('saved-output').textContent!)).toMatchObject({ format: 'recipient', recipients: ['lin'], requirements: '保留我的交付要求' })
  fireEvent.click(screen.getByRole('radio', { name: '统一交付成果' }))
  expect(screen.getByRole('radio', { name: 'PDF 文件' })).toBeChecked()
})
