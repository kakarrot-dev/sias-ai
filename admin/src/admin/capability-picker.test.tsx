// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CapabilityPicker } from './CapabilityPicker'
import { searchCapabilities, CAPABILITY_PAGE_SIZE } from './capability-search'
import { MAX_AGENT_CAPABILITIES, type Capability } from './shared'
import { capabilityCatalog as catalog } from './campus/model'

const largeCatalog: Capability[] = Array.from({ length: 120 }, (_, i) => {
  const number = String(i + 1).padStart(3, '0')
  return { id: `capability.sample.${number}`, name: `业务能力${number}`, description: '用于处理指定业务任务，保留依据和结果。', version: 1, skillVersionIds: i % 3 === 1 ? [`skill.sample.${number}`] : [], toolVersionIds: i % 3 === 2 ? [`tool.sample.${number}`] : [], mcpVersionIds: [], permissionRequirements: [] }
})
function Picker({ initial = [], capabilities = largeCatalog }: { initial?: string[]; capabilities?: Capability[] }) {
  const [selectedIds, onChange] = useState(initial)
  return <CapabilityPicker capabilities={capabilities} selectedIds={selectedIds} onChange={onChange} />
}
afterEach(cleanup)

describe('capability fuzzy search', () => {
  it('matches omitted Chinese words and ranks direct name matches first', () => {
    expect(searchCapabilities(catalog, '飞书读取', 'all')[0].name).toBe('飞书文档读取')
    expect(searchCapabilities(catalog, '文本', 'all')[0].name).toBe('文本分析与结构化表达')
  })
  it('matches case-insensitive IDs and combined terms across names and descriptions', () => {
    expect(searchCapabilities(catalog, 'ＳＫＩＬＬ．ＦＥＩＳＨＵ', 'all')).toHaveLength(2)
    expect(searchCapabilities(catalog, '飞书 只读', 'all').map(c => c.name)).toEqual(['飞书文档读取'])
    expect(searchCapabilities(catalog, 'github.repositories', 'all')[0].name).toBe('受管网络调研')
    expect(searchCapabilities(catalog, 'mcp.feishu-wiki', 'all')[0].name).toBe('飞书文档读取')
    expect(searchCapabilities([{ ...catalog[0], tags: ['政策核验'] }], '政策核验', 'skill')[0].id).toBe(catalog[0].id)
  })
  it('combines type and search filters without mutating the original catalog', () => {
    const before = structuredClone(catalog)
    expect(searchCapabilities(catalog, '', 'builtin').map(c => c.name)).toEqual(['文本分析与结构化表达', '校内日程', '通知下发', '组织与人员查询', '历史会议检索'])
    expect(searchCapabilities(catalog, '飞书', 'builtin')).toEqual([])
    expect(searchCapabilities(catalog, '飞书', 'skill')).toHaveLength(2)
    expect(searchCapabilities(catalog, '飞书', 'tool')).toHaveLength(2)
    expect(catalog).toEqual(before)
  })
  it('intersects usage categories, resource type and keywords without treating Skill dependencies as MCP services', () => {
    const before = structuredClone(catalog)
    expect(searchCapabilities(catalog, '飞书', 'skill', '文档处理').map(c => c.name)).toEqual(['飞书文档读取'])
    expect(searchCapabilities(catalog, '飞书', 'mcp', '文档处理')).toEqual([])
    expect(searchCapabilities(catalog, '创建', 'mcp', '文档处理').map(c => c.name)).toEqual(['校内文档 MCP 服务'])
    expect(searchCapabilities(catalog, '', 'builtin', '会议日程').map(c => c.name)).toEqual(['校内日程'])
    expect(searchCapabilities(catalog, '', 'mcp', '会议日程')).toEqual([])
    expect(searchCapabilities(catalog, '内容分析', 'builtin').map(c => c.name)).toEqual(['文本分析与结构化表达'])
    const uncategorized = [{ ...catalog[0], purposes: undefined }]
    expect(searchCapabilities(uncategorized, '', 'all', '未分类')).toEqual(uncategorized)
    expect(searchCapabilities(uncategorized, '', 'all', '文档处理')).toEqual([])
    expect(catalog).toEqual(before)
  })
})

describe('large capability catalog selection', () => {
  it('renders a bounded page for 120 entries and retains selections across pages and searches', () => {
    render(<Picker />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(CAPABILITY_PAGE_SIZE)
    expect(screen.getByRole('status')).toHaveTextContent('共 120 项能力')
    fireEvent.click(screen.getByRole('checkbox', { name: '业务能力001' }))
    fireEvent.click(screen.getByRole('button', { name: '能力下一页' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '业务能力007' }))
    expect(within(screen.getByRole('list', { name: '已选能力' })).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.change(screen.getByRole('textbox', { name: '搜索能力' }), { target: { value: '能力120' } })
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    fireEvent.click(screen.getByRole('checkbox', { name: '业务能力120' }))
    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }))
    expect(screen.getByRole('checkbox', { name: '业务能力001' })).toBeChecked()
    expect(screen.getByRole('button', { name: '能力上一页' })).toBeDisabled()
    expect(screen.getAllByRole('checkbox')).toHaveLength(CAPABILITY_PAGE_SIZE)
    fireEvent.click(screen.getByRole('button', { name: '移除 业务能力007' }))
    expect(screen.queryByRole('button', { name: '移除 业务能力007' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除 业务能力120' })).toBeVisible()
  })
  it('keeps selected items visible on an empty search and restores results when filters are cleared', () => {
    render(<Picker initial={[largeCatalog[0].id]} />)
    fireEvent.change(screen.getByRole('textbox', { name: '搜索能力' }), { target: { value: '无法匹配的内容' } })
    expect(screen.getByRole('heading', { name: '没有找到匹配的能力' })).toBeVisible()
    expect(screen.getByRole('button', { name: '移除 业务能力001' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '清除搜索与筛选' }))
    expect(screen.getByRole('checkbox', { name: '业务能力001' })).toBeChecked()
    fireEvent.change(screen.getByRole('combobox', { name: '能力类型' }), { target: { value: 'skill' } })
    expect(screen.getByRole('status')).toHaveTextContent('找到 40 项')
    expect(screen.queryByRole('checkbox', { name: '业务能力001' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清空已选' }))
    expect(screen.queryByRole('list', { name: '已选能力' })).not.toBeInTheDocument()
  })
  it('can remove stale selected IDs and handles an empty catalog', () => {
    render(<Picker initial={['missing-capability']} capabilities={[]} />)
    expect(screen.getByText('已不可用')).toBeVisible()
    expect(screen.getByRole('heading', { name: '暂无可选能力' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '移除 missing-capability' }))
    expect(screen.getByText('已选 0 项')).toBeVisible()
  })
  it('preserves unavailable selected capabilities for explicit removal', () => {
    render(<Picker initial={['archive']} capabilities={catalog} />)
    fireEvent.change(screen.getByRole('combobox', { name: '能力类型' }), { target: { value: 'builtin' } })
    expect(screen.getByRole('checkbox', { name: '历史会议检索' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '历史会议检索' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '移除 历史会议检索' }))
    expect(screen.getByRole('checkbox', { name: '历史会议检索' })).toBeDisabled()
  })
  it('respects the existing selection limit and makes room after removing a selected item', () => {
    render(<Picker initial={largeCatalog.slice(0, MAX_AGENT_CAPABILITIES).map(c => c.id)} />)
    fireEvent.change(screen.getByRole('textbox', { name: '搜索能力' }), { target: { value: '能力120' } })
    expect(screen.getByRole('checkbox', { name: '业务能力120' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '移除 业务能力001' }))
    expect(screen.getByRole('checkbox', { name: '业务能力120' })).toBeEnabled()
  })
  it('prevents Enter in the search box from submitting the creation wizard', () => {
    const submit = vi.fn()
    render(<form onSubmit={submit}><Picker /><button type="submit">下一步</button></form>)
    const propagated = fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索能力' }), { key: 'Enter' })
    expect(propagated).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })
})
