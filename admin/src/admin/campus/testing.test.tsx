// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Testing } from './Testing'
import { applyCampusAction, type CampusAction } from './actions'
import { clone, configDigest, seedCampus, type Actor, type CampusState } from './model'

const actor: Actor = { role: 'admin', department: '信息化处' }
function Harness({ initial = seedCampus(), id = 'assistant', dirty = false, onReport, onCommit, save = vi.fn(async () => {}) }: { initial?: CampusState; id?: string; dirty?: boolean; onReport?: (id: string) => void; onCommit?: (action: CampusAction) => void; save?: () => Promise<unknown> }) {
  const [state, setState] = useState(initial)
  const agent = state.agents.find(item => item.id === id)!
  return <Testing state={state} agent={agent} actor={actor} dirty={dirty} busy={false} config={agent.draft} onTestSetChange={() => {}} saveDraft={save} publish={() => {}} onReport={onReport} commit={async action => { onCommit?.(action); const next = clone(state); applyCampusAction(next, actor, action); setState(next); return true }} />
}
const enterGoal = (goal = '会议') => fireEvent.change(screen.getByRole('textbox', { name: '测试目标' }), { target: { value: goal } })
const runDebug = () => fireEvent.click(screen.getByRole('button', { name: '运行交互模拟' }))
afterEach(cleanup)

describe('optional fixed-sample testing', () => {
  it('runs one set of 5 samples without requiring a reviewer or adding a publish gate', async () => {
    const state = seedCampus(); const expert = state.agents.find(item => item.id === 'schedule')!; expert.tests = []
    const onCommit = vi.fn()
    render(<Harness initial={state} id="schedule" onCommit={onCommit} />)
    expect(screen.getAllByText(/^样例 [1-5]$/)).toHaveLength(5)
    expect(screen.queryByText(/三轮|每轮 100|发布门禁/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '人工复核人' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发布此版本' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '运行 5 个固定样例' }))
    await screen.findByText('5 / 5 项通过（模拟）')
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ type: 'test', id: 'schedule', round: 1, pass: true }))
    expect(screen.getByText('对应当前配置')).toBeVisible()
  })

  it('shows repeatable failure samples and keeps reports distinct from actual evaluation', async () => {
    const state = seedCampus(); state.agents.find(item => item.id === 'schedule')!.tests = []
    render(<Harness initial={state} id="schedule" />)
    fireEvent.click(screen.getByText('演示结果设置'))
    fireEvent.change(screen.getByRole('combobox', { name: '模拟测试结果' }), { target: { value: 'fail' } })
    fireEvent.click(screen.getByRole('button', { name: '运行 5 个固定样例' }))
    await screen.findByText('2 / 5 项通过（模拟）')
    expect(screen.getByText(/邀请内容变更后未重新确认/)).toBeVisible()
    expect(screen.getByText(/不代表真实评估通过/)).toBeVisible()
    expect(screen.getByRole('button', { name: '运行 5 个固定样例' })).toBeEnabled()
  })

  it('marks historical reports when configuration changes and links report IDs without rewriting them', () => {
    const state = seedCampus(); const expert = state.agents.find(item => item.id === 'schedule')!; const original = configDigest(expert.draft)
    expert.tests = []
    expert.testHistory = [{ id: 'historical-report', round: 1, digest: original, passed: 5, total: 5, reviewer: '配置人员（模拟）', at: '2026-09-14T01:00:00.000Z', failures: [] }]
    expert.draft.prompt += ' 新的工作步骤。'
    const onReport = vi.fn()
    render(<Harness initial={state} id="schedule" onReport={onReport} />)
    expect(screen.getByText('配置已变化')).toBeVisible()
    expect(screen.getByText('当前配置尚无模拟报告')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '查看模拟报告' }))
    expect(onReport).toHaveBeenCalledWith('historical-report')
    expect(expert.testHistory[0].digest).toBe(original)
  })

  it('requires saving unsaved inputs before testing and invokes the existing save action', async () => {
    const save = vi.fn(async () => true)
    render(<Harness dirty save={save} />)
    expect(screen.getByRole('button', { name: '运行 5 个固定样例' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '运行交互模拟' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存草稿后测试' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
  })
})

describe('assistant candidate handoff simulation', () => {
  it('automatically hands off the only authorized published candidate and uses its published identity', () => {
    const state = seedCampus()
    state.agents = state.agents.filter(item => ['assistant', 'schedule'].includes(item.id))
    const expert = state.agents.find(item => item.id === 'schedule')!
    expert.draft.name = '尚未发布的新名称'
    render(<Harness initial={state} />)
    enterGoal(); runDebug()
    expect(screen.getByText('只有一个有效候选，已根据其发布版本完成模拟转交。')).toBeVisible()
    expect(screen.getByText('已转交「会议安排专家」v1（模拟）；未创建生产任务。')).toBeVisible()
    expect(screen.queryByText(/尚未发布的新名称/)).not.toBeInTheDocument()
  })

  it('requires an explicit choice among multiple candidates and clears the result when identity changes', () => {
    const state = seedCampus(); state.agents = state.agents.filter(item => ['assistant', 'schedule', 'minutes'].includes(item.id))
    render(<Harness initial={state} />)
    enterGoal(); runDebug()
    expect(screen.getByText('找到多个有权使用的候选，请选择承接对象。')).toBeVisible()
    expect(screen.queryByText(/已转交/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '会议安排专家' }))
    expect(screen.getByText('已转交「会议安排专家」v1（模拟）；未创建生产任务。')).toBeVisible()
    fireEvent.change(screen.getByRole('combobox', { name: '模拟使用人' }), { target: { value: 'zhou' } })
    expect(screen.queryByText(/已转交/)).not.toBeInTheDocument()
    runDebug()
    expect(screen.getByText(state.agents.find(item => item.id === 'assistant')!.draft.assistant.noMatch)).toBeVisible()
    expect(screen.queryByRole('button', { name: '会议安排专家' })).not.toBeInTheDocument()
  })

  it('excludes disabled, unpublished, denied, unsynced and dependency-blocked objects without crashing on missing snapshots', () => {
    const state = seedCampus(); const assistant = state.agents.find(item => item.id === 'assistant')!
    const denied = clone(state.agents.find(item => item.id === 'schedule')!)
    denied.id = 'denied-expert'; denied.grants.push({ id: 'deny-lin', subject: 'user', target: 'lin', children: false, effect: 'deny' }); state.agents.push(denied)
    state.agents.find(item => item.id === 'captain')!.disabled = true
    state.agents.find(item => item.id === 'schedule')!.versions = []
    state.agents.find(item => item.id === 'minutes')!.sync = 'failed'
    const unpublished = state.agents.find(item => item.id === 'meeting-review')!; unpublished.draft.scenario = '会议'
    render(<Harness initial={state} />)
    enterGoal(); runDebug()
    expect(screen.getByText(assistant.draft.assistant.noMatch)).toBeVisible()
    expect(screen.queryByText(/已转交/)).not.toBeInTheDocument()
  })

  it('shows dependency and no-match examples and can reset to a normal handoff', () => {
    const state = seedCampus(); state.agents = state.agents.filter(item => ['assistant', 'schedule'].includes(item.id))
    render(<Harness initial={state} />)
    enterGoal(); fireEvent.click(screen.getByText('异常样例'))
    fireEvent.change(screen.getByRole('combobox', { name: '调试场景' }), { target: { value: 'dependency' } })
    runDebug()
    expect(screen.getByText(/等待依赖：校内模型暂不可用/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重置调试样例' })); runDebug()
    expect(screen.getByText('已转交「会议安排专家」v1（模拟）；未创建生产任务。')).toBeVisible()
    fireEvent.change(screen.getByRole('combobox', { name: '调试场景' }), { target: { value: 'no-match' } }); runDebug()
    expect(screen.getByText(state.agents[0].draft.assistant.noMatch)).toBeVisible()
  })
})
