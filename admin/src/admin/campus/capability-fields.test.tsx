// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CapabilityFields } from './CapabilityFields'
import { profileDefaults } from './expert-form'
import { actionKey, binding, blankConfig, selectCapabilities, skillActions, type Config } from './model'

const serviceId = 'capability.mcp.local-document.v1'
const skillId = 'capability.local-document.v2'
const readId = 'document.read@local-document/v1'
const writeId = 'document.create@local-document/v1'
function Harness({ initial = blankConfig(), disabled = false }: { initial?: Config; disabled?: boolean }) {
  const [config, setConfig] = useState(initial)
  return <><CapabilityFields config={config} disabled={disabled} onChange={partial => setConfig(current => ({ ...current, ...partial }))} /><output data-testid="configuration">{JSON.stringify(config)}</output></>
}
const current = (): Config => JSON.parse(screen.getByTestId('configuration').textContent!)
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const search = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: '搜索能力' }), { target: { value } })
const openPicker = () => { click('添加能力'); return screen.getByRole('dialog', { name: '添加能力' }) }
const apply = () => click(/添加所选/)
const service = () => screen.getByRole('region', { name: '校内文档 MCP 服务配置' })
function addTool(name: string) {
  const dialog = openPicker(); search('校内文档')
  fireEvent.click(within(dialog).getByRole('checkbox', { name: `启用 ${name}` })); apply()
}
function addSkill() { openPicker(); search('本机文档编写'); fireEvent.click(screen.getByRole('checkbox', { name: '本机文档编写' })); apply() }
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('compact expert capability configuration', () => {
  it('keeps the full catalog out of the form and discards unconfirmed tool selections', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const initial = blankConfig(); render(<Harness initial={initial} />)
    expect(screen.queryByRole('textbox', { name: '搜索能力' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    const dialog = openPicker(); search('校内文档')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '启用 创建本机文档' }))
    expect(current()).toEqual(initial); expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
    search('不存在')
    expect(within(dialog).getByRole('button', { name: '取消选择 校内文档 MCP 服务：创建本机文档' })).toBeVisible()
    click('取消选择 校内文档 MCP 服务：创建本机文档')
    expect(within(dialog).getByRole('button', { name: '添加所选（0）' })).toBeDisabled()
    search('校内文档'); fireEvent.click(within(dialog).getByRole('checkbox', { name: '启用 创建本机文档' }))
    click('取消'); expect(current()).toEqual(initial)
    openPicker(); expect(screen.getByRole('button', { name: '添加所选（0）' })).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('adds exactly the selected MCP tool, with its settings directly visible', () => {
    render(<Harness />); addTool('读取本机文档')
    expect(current().tools).toHaveLength(1)
    expect(current().tools[0]).toMatchObject({ id: serviceId, version: '1', read: false, write: false })
    expect(current().tools[0].actions?.filter(action => action.enabled).map(action => action.id)).toEqual([readId])
    expect(current().nodes).toEqual([])
    expect(within(service()).getByRole('combobox', { name: '读取本机文档使用的账号' })).toBeVisible()
    expect(within(service()).getByRole('checkbox', { name: '启用 创建本机文档' })).not.toBeChecked()
    expect(within(service()).queryByRole('combobox', { name: '创建本机文档使用的账号' })).not.toBeInTheDocument()
    expect(within(service()).queryByText(/document.read@|mcp.local-document-runner/)).not.toBeInTheDocument()
    expect(document.querySelector('details')).toBeNull()
  })

  it('links writes to individual confirmations and preserves unrelated tools and delivery confirmation', () => {
    const initial = blankConfig()
    initial.tools = [{ ...binding('notice'), write: true, retry: 0 }]
    initial.nodes = [{ id: 'other', name: '通知确认', trigger: '通知前', approver: '发起人', tool: 'notice' }, { id: 'delivery', name: '交付确认', trigger: '交付前', approver: '发起人', tool: '' }]
    render(<Harness initial={initial} />); addTool('创建本机文档')
    expect(current().tools.find(b => b.id === serviceId)?.actions?.filter(action => action.enabled)).toEqual([expect.objectContaining({ id: writeId, retry: 0 })])
    expect(current().nodes[2].tool).toBe(actionKey(serviceId, writeId))
    fireEvent.change(within(service()).getByRole('combobox', { name: '创建本机文档由谁确认' }), { target: { value: '发起人指定' } })
    expect(current().nodes[2].approver).toBe('发起人指定')
    fireEvent.click(within(service()).getByRole('checkbox', { name: '启用 编辑本机文档' }))
    fireEvent.click(within(service()).getByRole('checkbox', { name: '启用 创建本机文档' }))
    expect(current().nodes.map(node => node.tool)).toEqual(['notice', '', actionKey(serviceId, 'document.edit@local-document/v1')])
    fireEvent.click(within(service()).getByRole('checkbox', { name: '启用 编辑本机文档' }))
    expect(current().tools.map(b => b.id)).toEqual(['notice']); expect(current().nodes).toEqual(initial.nodes)
  })

  it('preserves saved access and exceptions when selecting additional tools', () => {
    const b = binding(serviceId)
    const actions = skillActions(b).map(action => action.id === readId ? { ...action, enabled: true, auth: 'platform' as const, scope: 'platform' as const, approval: '批准读取公开文档', timeout: 20, retry: 1, exception: '大文档等待 20 秒' } : { ...action, enabled: false })
    render(<Harness initial={{ ...blankConfig(), tools: [{ ...b, actions }] }} />)
    expect(screen.getByRole('textbox', { name: '读取本机文档批准依据' })).toHaveValue('批准读取公开文档')
    expect(screen.getByText(/已有运行保护：等待 20 秒/)).toBeVisible()
    const dialog = openPicker(); search('校内文档')
    expect(within(dialog).getByRole('checkbox', { name: '启用 读取本机文档' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '启用 创建本机文档' }))
    search('不存在'); expect(within(dialog).getByRole('button', { name: '添加所选（1）' })).toBeEnabled(); apply()
    expect(current().tools[0].actions?.find(action => action.id === readId)).toEqual(actions.find(action => action.id === readId))
    expect(screen.getByRole('combobox', { name: '创建本机文档由谁确认' })).toBeVisible()
  })

  it('defaults a Skill to no tool permissions and explains required disabled tools', () => {
    render(<Harness />); addSkill()
    const skill = screen.getByRole('region', { name: '本机文档编写配置' })
    expect(current().tools[0].actions?.filter(action => action.enabled).map(action => action.id)).toEqual([])
    expect(within(skill).getByText('完成这项工作需要「读取本机文档」，请启用此工具。')).toBeVisible()
    expect(current().tools).toHaveLength(1); expect(current().nodes).toEqual([])
  })

  it('keeps an existing local capability enablement editable without presenting connection settings', () => {
    render(<Harness initial={{ ...blankConfig(), tools: [{ ...binding('capability.text-analysis.v1'), read: false }] }} />)
    const checkbox = screen.getByRole('checkbox', { name: '允许读取 文本分析与结构化表达' })
    expect(checkbox).not.toBeChecked(); expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.click(checkbox); expect(current().tools[0].read).toBe(true)
  })

  it('keeps permissions separate for the same tool through Skill and MCP', () => {
    render(<Harness />); addSkill(); fireEvent.click(screen.getByRole('checkbox', { name: '启用 读取本机文档' })); addTool('读取本机文档')
    expect(within(service()).getByText(/同一工具还由 本机文档编写 使用/)).toBeVisible()
    fireEvent.change(within(service()).getByRole('combobox', { name: '读取本机文档可访问的资料' }), { target: { value: 'platform' } })
    fireEvent.change(within(service()).getByRole('textbox', { name: '读取本机文档批准依据' }), { target: { value: '批准记录 001' } })
    expect(current().tools.find(b => b.id === serviceId)?.actions?.find(action => action.id === readId)).toMatchObject({ scope: 'platform', approval: '批准记录 001' })
    expect(current().tools.find(b => b.id === skillId)?.actions?.find(action => action.id === readId)).toMatchObject({ scope: 'user', approval: '' })
    click('移除 校内文档 MCP 服务'); expect(current().tools.map(b => b.id)).toEqual([skillId])
  })

  it('collects knowledge, Skills and MCP tools across filters, search and pages in one transaction', () => {
    const initial = { ...blankConfig(), expert: profileDefaults(), nodes: [{ id: 'delivery', name: '交付确认', trigger: '交付前', approver: '发起人', tool: '' }] }
    render(<Harness initial={initial} />); const dialog = openPicker()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '知识库：员工制度与办事指南' }))
    click('工作技能'); fireEvent.click(within(dialog).getByRole('checkbox', { name: '受管网络调研' }))
    search('飞书会议'); fireEvent.click(within(dialog).getByRole('checkbox', { name: '飞书会议办理' })); search('')
    click('业务系统 · MCP'); fireEvent.click(within(dialog).getByRole('checkbox', { name: '启用 创建本机文档' }))
    search('不存在'); expect(within(dialog).getByRole('button', { name: '添加所选（4）' })).toBeEnabled()
    expect(current()).toEqual(initial); apply()
    expect(current().tools).toHaveLength(3); expect(current().expert!.knowledgeIds).toEqual(['kb-handbook'])
    expect(screen.queryByRole('textbox', { name: '搜索能力' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除知识库 员工制度与办事指南' })).toBeVisible()
    click('清空全部能力'); expect(current().tools).toEqual([]); expect(current().expert!.knowledgeIds).toEqual([]); expect(current().nodes).toEqual(initial.nodes)
  })

  it('retains unavailable selections for removal and blocks new unavailable references', () => {
    const b = binding('capability.mcp.archive.v1')
    render(<Harness initial={{ ...blankConfig(), tools: [{ ...b, actions: skillActions(b) }] }} />)
    expect(screen.getByRole('combobox', { name: '查询档案索引可访问的资料' })).toBeDisabled()
    click('移除 档案查询 MCP 服务'); expect(current().tools).toEqual([])
    const dialog = openPicker(); click('业务系统 · MCP')
    expect(within(dialog).getByRole('checkbox', { name: '启用 查询档案索引' })).toBeDisabled()
  })

  it('disables all configuration mutations when read only', () => {
    const base = blankConfig('教务处'); const initial = { ...base, tools: [{ ...binding(skillId), actions: skillActions(binding(skillId)) }] }
    render(<Harness initial={initial} disabled />)
    expect(screen.getByRole('button', { name: '添加能力' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '移除 本机文档编写' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '启用 读取本机文档' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '读取本机文档使用的账号' })).toBeDisabled()
    expect(current()).toEqual(initial)
  })

  it('prevents the picker from enabling new tools on an unavailable pinned service version', () => {
    const b = { ...binding(serviceId), version: 'retired' }
    const initial = { ...blankConfig(), tools: [{ ...b, actions: skillActions(b) }] }
    render(<Harness initial={initial} />)
    expect(screen.getByRole('combobox', { name: '读取本机文档使用的账号' })).toBeDisabled()
    const dialog = openPicker(); search('校内文档')
    expect(within(dialog).getByRole('checkbox', { name: '启用 创建本机文档' })).toBeDisabled()
    expect(within(dialog).getByText('固定版本不可用')).toBeVisible()
    click('取消'); expect(current()).toEqual(initial)
    click('移除 校内文档 MCP 服务'); expect(current().tools).toEqual([])
  })

  it('enforces department and capacity limits without disabling removal', () => {
    const initial = { ...blankConfig('教务处'), tools: Array.from({ length: 30 }, (_, i) => ({ ...binding(skillId), id: `old-${i}` })) }
    render(<Harness initial={initial} />); openPicker(); search('通知下发')
    expect(screen.getByRole('checkbox', { name: '通知下发' })).toBeDisabled()
    search('校内文档'); expect(screen.getByRole('checkbox', { name: '启用 创建本机文档' })).toBeDisabled()
    click('取消'); click('移除 old-0'); expect(current().tools).toHaveLength(29)
    openPicker(); search('校内文档'); expect(screen.getByRole('checkbox', { name: '启用 创建本机文档' })).toBeEnabled()
  })
})
