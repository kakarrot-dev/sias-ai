// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Historical editor regression coverage; the current chat MVP is tested separately.
vi.mock('./campus/availability', async original => ({ ...await original<typeof import('./campus/availability')>(), expertMvpEnabled: false }))
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { App } from './App'
import { EntityEditor } from './EntityEditor'
import { AgentActions } from './AgentManagement'
import { prototypeStore, resetPrototype } from './prototype-store'
import { agentAsset } from './agent-management'
import { type AgentConfig, type Entity } from './shared'

class BrowserStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}
beforeEach(() => {
  vi.stubGlobal('Storage', BrowserStorage); vi.stubGlobal('localStorage', new BrowserStorage()); vi.stubGlobal('sessionStorage', new BrowserStorage()); resetPrototype()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function openEditor() {
  const source = prototypeStore().state().agents[0]
  const entity = prototypeStore().duplicate(source.id, source.revision, '页面验收副本', 'published') as Entity<AgentConfig>
  window.history.replaceState(null, '', `#/legacy-agents/${entity.id}/edit`)
  render(<App />)
  await screen.findByRole('textbox', { name: '智能体名称' })
  return entity
}
describe('Agent management field workflows', () => {
  it.each(['/groups', '/groups/new', '/groups/manual', '/groups/{id}', '/groups/{id}/edit'])('removes the business center and its old route %s without deleting history', async route => {
    const before = prototypeStore().state().groups
    window.history.replaceState(null, '', `#${route.replace('{id}', before[0].id)}`); render(<App />)
    expect(await screen.findByRole('heading', { name: '页面不存在' })).toBeVisible()
    expect(within(screen.getByRole('navigation', { name: '主导航' })).getAllByRole('button').map(b => b.textContent)).toEqual(['总览', '智能体中心', '能力中心', '运行中心', '用户中心', '系统设置'])
    expect(screen.queryByRole('button', { name: /快速搭建专家组|使用此模板|保存草稿/ })).not.toBeInTheDocument()
    expect(prototypeStore().state().groups).toEqual(before)
  })
  it('removes business-center shortcuts from the overview and retains read-only historical audits', async () => {
    window.history.replaceState(null, '', '#/overview'); render(<App />)
    const create = await screen.findByRole('button', { name: '创建专家' })
    expect(screen.queryByRole('button', { name: /专家组|专家团|会议统筹/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /可用专家/ })).toBeVisible()
    fireEvent.click(create)
    expect(await screen.findByRole('heading', { name: '创建普通专家' })).toBeVisible()
    cleanup(); window.history.replaceState(null, '', '#/runs'); render(<App />)
    fireEvent.click(await screen.findByRole('tab', { name: '管理审计' }))
    expect(screen.getAllByText('研究与写作专家组').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '研究与写作专家组' })).not.toBeInTheDocument()
  })
  it('removes legacy overview trial actions and opens old sample links as configuration', async () => {
    const entity = await openEditor()
    fireEvent.click(screen.getByRole('tab',{name:'概览'}))
    expect(screen.queryByRole('button',{name:'试用'})).not.toBeInTheDocument()
    expect(screen.queryByRole('tab',{name:'样例预演'})).not.toBeInTheDocument()
    cleanup(); window.history.replaceState(null,'',`#/legacy-agents/${entity.id}/sample`); render(<App />)
    expect(await screen.findByLabelText('智能体名称')).toBeVisible()
    expect(screen.queryByRole('button',{name:'运行样例预演'})).not.toBeInTheDocument()
  })
  it('edits asset fields, keeps runtime identity independent and persists after remount', async () => {
    const entity = await openEditor()
    fireEvent.change(screen.getByLabelText('智能体名称'), { target: { value: '资料整理助理' } })
    fireEvent.change(screen.getByLabelText('分类标签'), { target: { value: '文档，验收' } })
    fireEvent.click(screen.getByRole('button', { name: '工作内容' }))
    expect(screen.getByLabelText('运行名称')).toHaveValue(entity.draft.name)
    fireEvent.click(screen.getAllByRole('button', { name: '保存修改' })[0])
    await waitFor(() => expect(agentAsset(prototypeStore().get(entity.id) as Entity<AgentConfig>).name).toBe('资料整理助理'))
    cleanup(); render(<App />)
    expect(await screen.findByLabelText('智能体名称')).toHaveValue('资料整理助理')
    expect(screen.getByLabelText('分类标签')).toHaveValue('文档，验收')
  })
  it('retries a failed post-save refresh without submitting the edit a second time', async () => {
    const entity = prototypeStore().state().agents[0]
    const reload = vi.fn().mockRejectedValueOnce(new Error('refresh')).mockResolvedValue(undefined)
    const notify = vi.fn()
    render(<EntityEditor kind="agent" entity={entity} initialTab="config" data={prototypeStore().state()} reload={reload} navigate={vi.fn()} onDirty={vi.fn()} notify={notify} />)
    fireEvent.change(screen.getByLabelText('智能体名称'), { target: { value: '重试保存验收' } })
    fireEvent.click(screen.getAllByRole('button', { name: '保存修改' })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('不会重复保存')
    const revision = prototypeStore().get(entity.id).revision
    fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(prototypeStore().get(entity.id).revision).toBe(revision)
  })
  it('adds structured fields, retains values across sections and displays a precise duplicate warning', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: '输入与追问' }))
    fireEvent.click(screen.getByRole('button', { name: '添加输入字段' }))
    fireEvent.change(screen.getByLabelText('输入字段 1 名称'), { target: { value: 'topic' } })
    fireEvent.change(screen.getByLabelText('输入字段 1 含义'), { target: { value: '分析主题' } })
    fireEvent.click(screen.getByRole('button', { name: '输出与验收' }))
    fireEvent.change(screen.getByLabelText('结果形式'), { target: { value: 'json' } })
    fireEvent.click(screen.getByRole('button', { name: '添加输出字段' }))
    fireEvent.change(screen.getByLabelText('输出字段 1 名称'), { target: { value: 'summary' } })
    fireEvent.change(screen.getByLabelText('输出字段 1 含义'), { target: { value: '分析结论' } })
    fireEvent.click(screen.getByRole('button', { name: '输入与追问' }))
    expect(screen.getByLabelText('输入字段 1 名称')).toHaveValue('topic')
    fireEvent.click(screen.getByRole('button', { name: '添加输入字段' }))
    fireEvent.change(screen.getByLabelText('输入字段 2 名称'), { target: { value: 'topic' } })
    expect(screen.getByRole('alert')).toHaveTextContent('输入字段名 topic 重复')
    expect(screen.queryByRole('tab', { name: '样例预演' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '运行样例预演' })).not.toBeInTheDocument()
  })
  it('allows browsing all archived configuration sections without allowing edits', async () => {
    const entity = await openEditor()
    cleanup(); prototypeStore().archive(entity.id, entity.revision, true); render(<App />)
    await screen.findByRole('button', { name: '输出与验收' })
    fireEvent.click(screen.getByRole('button', { name: '输出与验收' }))
    expect(screen.getByLabelText('交付与验收要求')).toBeDisabled()
    expect(screen.getByRole('button', { name: '输入与追问' })).toBeEnabled()
  })
  it('searches by metadata tags and separates archived and deleted assets from normal results', async () => {
    const source = prototypeStore().state().agents[0]
    const agent = prototypeStore().duplicate(source.id, source.revision, '专用搜索对象', 'published') as Entity<AgentConfig>
    const saved = prototypeStore().save(agent.id, agent.revision, agent.draft, { ...agentAsset(agent), tags: ['唯一标签'] })
    prototypeStore().archive(agent.id, saved.revision, true)
    window.history.replaceState(null, '', '#/legacy-agents'); render(<App />)
    await screen.findByRole('tablist', { name: '资产目录' })
    fireEvent.change(screen.getByRole('textbox', { name: '搜索配置' }), { target: { value: '唯一标签' } })
    expect(screen.queryByRole('button', { name: '专用搜索对象' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /已归档/ }))
    expect(screen.getByRole('button', { name: '专用搜索对象' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
  })
  it('shows deletion restrictions and retries post-copy reload without duplicating the asset', async () => {
    const entity = prototypeStore().state().agents[0]
    const reload = vi.fn().mockRejectedValueOnce(new Error('refresh')).mockResolvedValue(undefined)
    const navigate = vi.fn()
    const count = prototypeStore().state().agents.length
    function Host() { const [data] = useState(prototypeStore().state()); return <AgentActions entity={entity} data={data} reload={reload} navigate={navigate} notify={vi.fn()} /> }
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: `管理 ${agentAsset(entity).name}` }))
    expect(screen.getByRole('button', { name: '删除草稿' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '复制为新草稿' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认复制' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('不会重复执行')
    expect(prototypeStore().state().agents.length).toBe(count + 1)
    fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(prototypeStore().state().agents.length).toBe(count + 1)
  })
})


describe('Task-first Agent center experience', () => {
  it('preserves opening, knowledge and sharing settings without a live debugging panel', async () => {
    const entity = await openEditor()
    fireEvent.click(screen.getByRole('button', { name: '工作内容' }))
    fireEvent.change(screen.getByLabelText('开场白'), { target: { value: '你好，请提供需要核对的材料。' } })
    expect(screen.getByLabelText('开场白')).toHaveValue('你好，请提供需要核对的材料。')
    expect(screen.queryByRole('complementary',{name:'使用效果预览'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '知识库' }))
    fireEvent.click(screen.getByLabelText('员工制度与办事指南'))
    fireEvent.click(screen.getByRole('button', { name: '使用权限' }))
    fireEvent.change(screen.getByLabelText('使用范围'), { target: { value: 'specified' } })
    fireEvent.change(screen.getByLabelText('指定成员或部门'), { target: { value: '客户服务部' } })
    fireEvent.click(screen.getByRole('button', { name: '发布渠道' }))
    fireEvent.click(screen.getByLabelText('飞书渠道'))
    fireEvent.click(screen.getAllByRole('button', { name: '保存修改' })[0])
    await waitFor(() => expect((prototypeStore().get(entity.id).draft as AgentConfig).experience?.audience).toBe('客户服务部'))
    cleanup(); render(<App />)
    await screen.findByLabelText('智能体名称')
    fireEvent.click(screen.getByRole('button', { name: '知识库' }))
    expect(screen.getByLabelText('员工制度与办事指南')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '发布渠道' }))
    expect(screen.getByLabelText('飞书渠道')).toBeChecked()
  })
  it('checks before publishing and sends missing sharing settings back to the right section', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: '使用权限' }))
    fireEvent.change(screen.getByLabelText('使用范围'), { target: { value: 'specified' } })
    fireEvent.click(screen.getAllByRole('button', { name: '保存修改' })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: '发布' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '发布' }))
    expect(await screen.findByText('请填写可以使用的成员或部门')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '去修改' }))
    expect(screen.getByLabelText('指定成员或部门')).toBeVisible()
  })
  it('switches catalog views, filters offline agents and restores current releases', async () => {
    const entity = prototypeStore().state().agents[0]
    prototypeStore().toggle(entity.id, entity.revision, true)
    window.history.replaceState(null, '', '#/legacy-agents'); render(<App />)
    await screen.findByRole('button', { name: '表格视图' })
    fireEvent.change(screen.getByLabelText('筛选版本状态'), { target: { value: 'offline' } })
    expect(screen.getByRole('button', { name: agentAsset(entity).name })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '表格视图' }))
    expect(screen.getByRole('table')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: `管理 ${agentAsset(entity).name}` }))
    fireEvent.click(screen.getByRole('button', { name: '重新上线' }))
    fireEvent.click(screen.getByRole('button', { name: '确认上线' }))
    await waitFor(() => expect(prototypeStore().get(entity.id).disabled).toBe(false))
    expect(screen.queryByRole('button', { name: agentAsset(entity).name })).not.toBeInTheDocument()
  })
  it('keeps knowledge selection and the allowed resource scope consistent', async () => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: '知识库' }))
    fireEvent.click(screen.getByLabelText('员工制度与办事指南'))
    fireEvent.click(screen.getByRole('button', { name: '工具与技能' }))
    expect(screen.getByLabelText('资料范围')).toHaveValue('selected')
    fireEvent.change(screen.getByLabelText('资料范围'), { target: { value: 'provided' } })
    fireEvent.click(screen.getByRole('button', { name: '知识库' }))
    expect(screen.getByLabelText('员工制度与办事指南')).not.toBeChecked()
  })

})
