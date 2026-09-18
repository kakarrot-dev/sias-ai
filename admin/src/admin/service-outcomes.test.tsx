// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { ServiceOutcomes, PlatformMoneySummary } from './ServiceOutcomes'
import { clone, expertMvpIssues, seedCampus, upgradeCampus } from './campus/model'
import { serviceExamples } from '../../../frontend/src/shared/service-prototype'

afterEach(cleanup)
it('finds a frontend diagnostic without revealing content and separates unknown delivery from reply', () => {
  const record = { ...serviceExamples[2], id: 'SIAS-cross-view' }
  render(<ServiceOutcomes trace={JSON.stringify({ ...record, prompt: 'private', key: 'do-not-display' })} />)
  expect(screen.getByLabelText('搜索诊断号')).toHaveValue('SIAS-cross-view')
  expect(screen.getByRole('table')).toHaveTextContent('结果未知 · 请勿重发')
  expect(screen.getByRole('table')).toHaveTextContent('¥0.12')
  expect(screen.queryByText('private')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /重发|发送/ })).not.toBeInTheDocument()
})
it('keeps personal calls free of platform charges and missing cost distinct from zero', () => {
  render(<ServiceOutcomes />)
  fireEvent.change(screen.getByLabelText('服务结果来源'), { target: { value: 'personal' } })
  expect(screen.getByRole('table')).toHaveTextContent('¥0.00')
  expect(screen.getByRole('table')).toHaveTextContent('个人 Key 不扣平台余额')
  fireEvent.change(screen.getByLabelText('服务结果来源'), { target: { value: 'platform' } })
  expect(screen.getByRole('table')).toHaveTextContent('待补报，不计为零')
})
it('adds representative catalog fixtures once, validates discovery tags, and preserves edited versions', () => {
  const state = seedCampus(), agent = state.agents.find(a => a.id === 'staff.literature-reader')!
  const published = clone(agent.versions)
  agent.draft.description = '管理员已编辑的草稿'
  upgradeCampus(state); upgradeCampus(state)
  expect(state.agents.filter(a => a.id === agent.id)).toHaveLength(1)
  expect(agent.draft.description).toBe('管理员已编辑的草稿')
  expect(agent.versions).toEqual(published)
  expect(expertMvpIssues(state, agent.id, { ...agent.draft, discovery: { audience: 'student', category: 'research-support' } }, false)).toContain('请选择与常用人群匹配的用途分类')
})
it('labels the platform balance as RMB without relabeling upstream currency', () => {
  render(<PlatformMoneySummary />)
  expect(screen.getByText('¥28.60')).toBeInTheDocument()
  expect(screen.getByText(/保留原币，不直接折算/)).toBeInTheDocument()
})
