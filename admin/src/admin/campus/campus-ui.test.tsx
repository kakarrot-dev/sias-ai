// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { wizardRole, wizardStep } from './wizard-test-helpers'
import { App } from '../App'
import { PrototypeStore, prototypeStore, resetPrototype, STORAGE_KEY } from '../prototype-store'
import { identityPromptTemplate } from './expert-form'

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
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
// Acceptance runs through the public App, including hash routing and its unsaved-change guard.
async function open(path = '/agents', edit = true) {
  window.history.replaceState(null, '', `#${path}`); render(<App />); await screen.findByLabelText('演示身份')
  const createDraft = edit ? screen.queryAllByRole('button', { name: /^(基于此版本创建草稿|修改当前设置)$/ })[0] : undefined
  if (edit && createDraft) { await act(async () => { fireEvent.click(createDraft) }); await waitFor(() => expect(screen.queryByRole('button', { name: /^(基于此版本创建草稿|修改当前设置)$/ })).not.toBeInTheDocument()) }
  if (edit && !path.includes('/new/') && screen.queryByRole('combobox', { name: '分类' })) fireEvent.change(wizardRole('combobox', { name: '分类' }), { target: { value: '通用' } })
}
const click = (name: string) => { if (name === '发布' && screen.queryByRole('button', {name:'保存并发布'})) name = '保存并发布'; if (name === '保存草稿' && screen.queryByRole('button', { name: '保存' })) name = '保存'; if (name === '创建草稿' && screen.queryByRole('navigation', { name: '专家表单分区' })) name = '保存草稿'; fireEvent.click(wizardRole('button', { name })); fireEvent(window, new HashChangeEvent('hashchange')) }
const tab = (name: string) => {
  const nav = screen.queryByRole('navigation', { name: '专家表单分区' })
  const anchor: Record<string,string> = { 概览: '基础信息', 提示词: '职责与提示词', 输入: '输入契约', 技能与工具: '工具', 技能: '技能', 输出与验收: '输出与验收' }
  if (nav && anchor[name]) wizardStep(anchor[name])
  else fireEvent.click((screen.queryByRole('navigation', { name: '智能体配置分区' }) ? within(wizardRole('navigation', { name: '智能体配置分区' })) : screen).getByRole('button', { name }))
  fireEvent(window, new HashChangeEvent('hashchange'))
}
const saveButton = () => wizardRole('button', { name: screen.queryByRole('navigation', { name: '专家表单分区' }) && screen.queryByRole('button', { name: '保存' }) ? '保存' : '保存草稿' })
const save = async () => { await act(async () => { click('保存草稿') }); await waitFor(() => expect(document.querySelector('.expert-save-state') ?? document.querySelector('.campus-savebar')).toHaveTextContent(/已保存/)) }
describe('高校智能体中心交互', () => {
  it.each(['/agents/new/expert','/agents/new/captain','/agents/assistant/edit/release','/agents/schedule/edit/release','/agents/captain/edit/release','/agents/meeting-team/edit/release','/agents/assistant/edit/release?maintenance=1'])('has no backend debugging entry at %s', async path => {
    await open(path,false)
    expect(screen.queryByRole('button',{name:/调试|预览交互|试用|运行.*样例|运行交互模拟/})).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox',{name:/调试消息|测试目标|输入想对助理说的话/})).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox',{name:/测试集|模拟测试结果|演示检查结果/})).not.toBeInTheDocument()
  })
  it('activates valid assistant settings without backend debugging or a test report', async () => {
    await open('/agents/assistant/edit/basic')
    fireEvent.change(screen.getByRole('textbox', {name:'开场白'}), {target:{value:'新的接待开场白'}}); await save()
    tab('让修改生效')
    expect(screen.queryByRole('textbox',{name:'输入想对助理说的话'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:/检查这次修改|发送（模拟）/})).not.toBeInTheDocument()
    expect(prototypeStore().state().campus!.agents.find(a=>a.id==='assistant')!.tests).toEqual([])
    expect(screen.getByRole('button',{name:'确认生效'})).toBeEnabled()
    click('确认生效')
    const dialog = screen.getByRole('dialog',{name:'让这次修改生效？'})
    expect(dialog).toHaveTextContent('正常用户登录即可使用')
    expect(within(dialog).getByRole('button',{name:'确认生效（模拟）'})).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox',{name:/这次改了什么/}),{target:{value:'更新接待开场白'}})
    click('确认生效（模拟）'); await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const saved = prototypeStore().state().campus!.agents.find(a=>a.id==='assistant')!
    expect(saved.live).toBe(2); expect(saved.versions.find(v=>v.number===2)!.config.opening).toBe('新的接待开场白')
    expect(saved.versions.find(v=>v.number===1)!.config.opening).not.toBe('新的接待开场白')
    expect(saved.versions.find(v=>v.number===2)!.tests).toEqual([])
    expect(screen.getByRole('button',{name:'确认生效'})).toBeDisabled()
  })
  it('opens the MVP release page from the old access link and restores an earlier setting without changing legacy data', async () => {
    const store=prototypeStore(); const actor={role:'admin',department:'信息化处'} as const
    const act=(action: Parameters<typeof store.campusAction>[2])=>store.campusAction(store.state().campus!.revision,actor,action)
    act({type:'from-version',id:'assistant',version:1})
    act({type:'test',id:'assistant',round:1,pass:true,reviewer:'测试管理员'})
    act({type:'publish',id:'assistant',note:'第二版接待设置'})
    act({type:'from-version',id:'assistant',version:2})
    const draft={...store.state().campus!.agents.find(a=>a.id==='assistant')!.draft,opening:'保留这份待生效修改'}
    act({type:'save',id:'assistant',config:draft,credentialChecked:true})
    await open('/agents/assistant/edit/grants',false)
    expect(screen.queryByRole('combobox', {name:'林晓的个人授权'})).not.toBeInTheDocument()
    expect(screen.getByText('正常用户登录即可使用，无需单独授权')).toBeVisible()
    const savedGrants=store.state().campus!.agents.find(a=>a.id==='assistant')!.grants
    click('修改记录'); expect(await screen.findByRole('heading',{name:'以前用过的设置'})).toBeVisible()
    expect(screen.queryByRole('button',{name:'Token 用量'})).not.toBeInTheDocument()
    click('重新使用这版')
    const dialog=screen.getByRole('dialog',{name:'重新使用第 1 版设置？'})
    expect(dialog).toHaveTextContent('账号启停状态仍保留')
    fireEvent.change(within(dialog).getByRole('textbox',{name:/为什么重新使用这版/}),{target:{value:'恢复原接待方式'}})
    click('确认重新使用（模拟）'); await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const restored=store.state().campus!.agents.find(a=>a.id==='assistant')!
    expect(restored.live).toBe(1); expect(restored.grants).toEqual(savedGrants); expect(restored.draft.opening).toBe('保留这份待生效修改')
    cleanup(); await open('/agents/assistant/edit/grants',false)
    expect(screen.getByText('正常用户登录即可使用，无需单独授权')).toBeVisible()
  })
  it('keeps the assistant operation pages read-only for auditors', async () => {
    sessionStorage.setItem('campus-demo-actor',JSON.stringify({role:'auditor',department:'信息化处'}))
    await open('/agents/assistant/edit/grants',false)
    expect(screen.queryByRole('button',{name:'保存使用授权'})).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox',{name:'林晓的个人授权'})).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox',{name:'部门'})).not.toBeInTheDocument()
    tab('让修改生效'); expect(screen.queryByRole('button',{name:'确认生效'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:/^(检查这次修改|重新检查)（模拟）$/})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'修改当前设置'})).not.toBeInTheDocument()
    click('修改记录'); expect(screen.queryByRole('button',{name:'重新使用这版'})).not.toBeInTheDocument()
  })
  it('manages the singleton assistant from a dedicated card and separates viewing from editing', async () => {
    await open('/agents?kind=assistant', false)
    const card = screen.getByRole('region', { name:'数字助理设置' })
    expect(within(card).getByRole('heading', {name:'校园数字助理'})).toBeVisible()
    expect(screen.queryByRole('button', {name:'创建'})).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', {name:'搜索智能体'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name:'删除'})).not.toBeInTheDocument()
    click('查看配置'); expect(await screen.findByRole('textbox', {name:/^名称/})).toBeDisabled()
    click('查看工作规则'); expect(screen.getByRole('dialog',{name:'内置接待规则'})).toHaveTextContent('不得执行业务工具')
    click('关闭'); expect(screen.queryByRole('button',{name:'添加技能'})).not.toBeInTheDocument()
    click('修改当前设置'); await waitFor(() => expect(window.location.hash).toContain('/edit/basic'))
    fireEvent.change(screen.getByRole('textbox', {name:/^名称/}), {target:{value:'校务数字助理'}}); await save()
    const assistant = prototypeStore().state().campus!.agents.find(a => a.kind === 'assistant')!
    expect(assistant.draft.name).toBe('校务数字助理'); expect(assistant.versions[0].config.name).toBe('校园数字助理')
    expect(prototypeStore().state().campus!.agents.filter(a => a.kind === 'assistant')).toHaveLength(1)
    cleanup(); await open('/agents/assistant/view/basic', false)
    expect(screen.getByRole('textbox', {name:/^名称/})).toBeDisabled()
    expect(screen.queryByRole('button',{name:'保存草稿'})).not.toBeInTheDocument()
    expect(screen.getByRole('textbox',{name:'身份提示词'})).toBeDisabled()
    expect(screen.getByRole('textbox',{name:'无匹配反馈'})).toBeDisabled()
    click('编辑配置'); expect(await screen.findByRole('textbox', {name:/^名称/})).toBeEnabled()
    fireEvent.click(within(screen.getByRole('main')).getByRole('button',{name:'智能体中心'})); fireEvent(window,new HashChangeEvent('hashchange'))
    expect(await screen.findByRole('region',{name:'数字助理设置'})).toHaveTextContent('校务数字助理')
  })
  it('shows assistant configuration to auditors without edit controls and prevents department administration', async () => {
    sessionStorage.setItem('campus-demo-actor', JSON.stringify({role:'auditor',department:'信息化处'}))
    await open('/agents?kind=assistant', false)
    expect(screen.getByRole('button',{name:'查看配置'})).toBeEnabled()
    expect(screen.queryByRole('button',{name:'编辑配置'})).not.toBeInTheDocument()
    click('查看配置'); expect(await screen.findByRole('textbox',{name:/^名称/})).toBeDisabled()
    expect(screen.queryByRole('button',{name:'基于此版本创建草稿'})).not.toBeInTheDocument()
    cleanup(); sessionStorage.setItem('campus-demo-actor', JSON.stringify({role:'configurer',department:'信息化处'}))
    await open('/agents?kind=assistant', false)
    expect(screen.getByRole('heading',{name:'当前身份无权查看数字助理配置'})).toBeVisible()
    expect(screen.queryByRole('button',{name:'查看配置'})).not.toBeInTheDocument()
  })
  it.each(['input','output','skills','matching'])('opens the concise assistant settings from the older %s link', async section => {
    await open(`/agents/assistant/view/${section}`, false)
    expect(within(screen.getByRole('navigation',{name:'智能体配置分区'})).getAllByRole('button').map(b => b.textContent)).toEqual(['基础设置','让修改生效'])
    expect(screen.getAllByRole('textbox')).toHaveLength(5)
    expect(screen.getAllByRole('combobox')).toHaveLength(3) // Model, owner and the prototype identity selector.
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'添加技能'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'维护已有配置'})).not.toBeInTheDocument()
    expect(screen.getByRole('textbox',{name:'身份提示词'})).toBeDisabled()
  })
  it('preserves existing assistant overrides and keeps a separate maintenance path', async () => {
    const store = prototypeStore(); const actor = {role:'admin', department:'信息化处'} as const
    store.campusAction(store.state().campus!.revision, actor, {type:'from-version',id:'assistant',version:1})
    const original = store.state().campus!.agents.find(a => a.id === 'assistant')!.draft
    const config = {...original, limits:{...original.limits,steps:12}, assistant:{...original.assistant,exclude:['minutes']}}
    store.campusAction(store.state().campus!.revision, actor, {type:'save',id:'assistant',config,credentialChecked:true})
    await open('/agents/assistant/edit/basic', false)
    expect(screen.getAllByRole('textbox')).toHaveLength(5)
    fireEvent.change(screen.getByRole('textbox',{name:'开场白'}),{target:{value:'你好，请说明需要帮助的事项。'}}); await save()
    const saved = store.state().campus!.agents.find(a => a.id === 'assistant')!
    expect(saved.draft.limits.steps).toBe(12); expect(saved.draft.assistant.exclude).toEqual(['minutes'])
    expect(saved.draft.opening).toBe('你好，请说明需要帮助的事项。'); expect(saved.versions[0].config.opening).toBe(original.opening)
    click('维护已有配置'); await waitFor(()=>expect(window.location.hash).toContain('maintenance=1'))
    tab('提示词'); expect(screen.getByRole('spinbutton',{name:'任务步骤上限'})).toHaveValue(12)
    tab('匹配与承接'); expect(screen.getByRole('checkbox',{name:'会议纪要专家'})).toBeChecked()
    click('返回精简设置'); expect(await screen.findByRole('textbox',{name:'开场白'})).toHaveValue('你好，请说明需要帮助的事项。')
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })
  it.each([
    '/agents/new/expert', '/agents/new/team', '/agents/minutes/edit/prompt',
    '/agents/minutes/edit/input', '/agents/minutes/edit/output', '/agents/schedule/edit/tools',
    '/agents/meeting-team/edit/team', '/agents/assistant/edit/matching',
    '/agents/minutes/edit/release', '/agents/minutes/edit/grants', '/agents/minutes/edit/history',
  ])('shows configuration directly without hidden settings or demo entrances at %s', async path => {
    await open(path, false)
    expect(screen.getByRole('main')).toBeVisible()
    expect(screen.queryByText('原型演示场景')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '交互预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /详细设置|高级设置/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '更多规则' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('模拟授权同步失败')).not.toBeInTheDocument()
  })
  it('configures a Skill through its individual tools instead of granting the whole Skill write access', async () => {
    await open('/agents/minutes/edit/tools')
    click('添加技能'); fireEvent.change(wizardRole('textbox', { name: '搜索能力' }), { target: { value: '飞书会议' } })
    fireEvent.click(wizardRole('checkbox', { name: '飞书会议办理' })); fireEvent.click(wizardRole('button', { name: /确认选择/ }))
    fireEvent.click(screen.getByText('飞书会议办理 · v2', { exact: true }))
    expect(screen.queryByRole('checkbox', { name: '允许写入 飞书会议办理' })).not.toBeInTheDocument()
    expect(wizardRole('checkbox', { name: '启用 搜索联系人' })).not.toBeChecked()
    expect(wizardRole('checkbox', { name: '启用 创建会议' })).not.toBeChecked()
    expect(wizardRole('checkbox', { name: '启用 发送会议邀请' })).not.toBeChecked()
    fireEvent.click(wizardRole('checkbox', { name: '启用 发送会议邀请' }))
    expect(wizardRole('combobox', { name: '发送会议邀请由谁确认' })).toHaveValue('发起人')
    click('保存草稿')
    await waitFor(() => expect(saveButton()).toBeDisabled())
    const saved = new PrototypeStore(window.localStorage).state().campus!.agents.find(a => a.id === 'minutes')!
    expect(saved.draft.tools[0].actions?.find(action => action.id.includes('send_invitation'))).toMatchObject({ enabled: true, retry: 0 })
    expect(saved.draft.tools[0].actions?.find(action => action.id.includes('meetings.create'))?.enabled).toBe(false)
    expect(saved.draft.nodes).toHaveLength(1)
    expect(saved.versions[0].config.tools).toEqual([])
    cleanup(); await open('/agents/minutes/edit/tools')
    tab('技能')
    fireEvent.click(screen.getByText('飞书会议办理 · v2', { exact: true }))
    expect(wizardRole('checkbox', { name: '启用 发送会议邀请' })).toBeChecked()
    click('移除 飞书会议办理'); await save()
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!.draft.nodes).toEqual([])
  })
  it('selects Skill and builtin capabilities from the capability center with fuzzy search and persists both', async () => {
    await open('/agents/minutes/edit/tools')
    click('添加技能'); fireEvent.change(wizardRole('textbox', { name: '搜索能力' }), { target: { value: '飞书读取' } })
    fireEvent.click(wizardRole('checkbox', { name: '飞书文档读取' }))
    fireEvent.click(wizardRole('button', {name:/确认选择/})); click('添加工具'); fireEvent.change(wizardRole('textbox', { name: '搜索能力' }), { target: { value: '文本' } })
    fireEvent.click(wizardRole('checkbox', { name: '文本分析与结构化表达' }))
    fireEvent.click(wizardRole('button', { name: /确认选择/ })); expect(document.querySelectorAll('.capability-config-card,.expert-tool-card')).toHaveLength(2)
    click('保存草稿')
    await waitFor(() => expect(saveButton()).toBeDisabled())
    const a = new PrototypeStore(window.localStorage).state().campus!.agents.find(a => a.id === 'minutes')!
    expect(a.draft.tools.map(b => b.id)).toEqual(['capability.feishu-documents.v2', 'capability.text-analysis.v1'])
    expect(a.tests).toEqual([]); expect(a.versions[0].config.tools).toEqual([])
    tab('技能'); await waitFor(() => expect(wizardRole('button', { name: '移除 飞书文档读取' })).toBeEnabled())
    click('添加技能'); fireEvent.change(wizardRole('textbox', { name: '搜索能力' }), { target: { value: '完全不存在' } })
    expect(screen.getByText('没有找到匹配的能力')).toBeVisible(); click('取消')
    expect(wizardRole('button', { name: '移除 飞书文档读取' })).toBeVisible()
    cleanup(); window.history.replaceState(null, '', '#/capabilities'); render(<App />)
    await screen.findByRole('textbox', { name: '搜索能力目录' })
    fireEvent.change(wizardRole('textbox', { name: '搜索能力目录' }), { target: { value: '飞书读取' } })
    const row = wizardRole('button', { name: '飞书文档读取' }).closest('tr')!
    expect(row).toHaveTextContent('1 个智能体'); expect(row).toHaveTextContent('Skill')
  })
  it('keeps confirmations independent when two Skill tools are enabled and one is disabled', async () => {
    await open('/agents/minutes/edit/tools')
    click('添加技能'); fireEvent.change(wizardRole('textbox', { name: '搜索能力' }), { target: { value: '飞书会议' } })
    fireEvent.click(wizardRole('checkbox', { name: '飞书会议办理' })); fireEvent.click(wizardRole('button', { name: /确认选择/ }))
    fireEvent.click(screen.getByText('飞书会议办理 · v2', { exact: true }))
    fireEvent.click(wizardRole('checkbox', { name: '启用 创建会议' }))
    fireEvent.click(wizardRole('checkbox', { name: '启用 发送会议邀请' }))
    fireEvent.change(wizardRole('combobox', { name: '发送会议邀请由谁确认' }), { target: { value: '发起人指定' } })
    fireEvent.click(wizardRole('checkbox', { name: '启用 创建会议' }))
    expect(screen.queryByRole('combobox', { name: '创建会议由谁确认' })).not.toBeInTheDocument()
    expect(wizardRole('combobox', { name: '发送会议邀请由谁确认' })).toHaveValue('发起人指定')
    click('保存草稿')
    await waitFor(() => expect(wizardRole('button', { name: '移除 飞书会议办理' })).toBeEnabled())
    const saved = prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!
    expect(saved.draft.tools[0]).toMatchObject({ id: 'capability.feishu-meetings.v2', version: '2', write: false })
    expect(saved.draft.nodes).toHaveLength(1)
    expect(saved.draft.nodes[0]).toMatchObject({ tool: 'capability.feishu-meetings.v2::feishu.meetings.send_invitation@feishu-meetings/v1', approver: '发起人指定' })
    click('移除 飞书会议办理'); await save()
    const removed = prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!
    expect(removed.draft.tools).toEqual([]); expect(removed.draft.nodes).toEqual([])
  })
  it('shows disabled and department-restricted capabilities without allowing new bindings', async () => {
    await open('/agents/policy/edit/tools')
    click('添加工具')
    expect(wizardRole('checkbox', { name: '历史会议检索' })).toBeDisabled()
    expect(wizardRole('checkbox', { name: '通知下发' })).toBeDisabled()
    expect(screen.getByText('本部门不可添加')).toBeVisible()
    expect(wizardRole('checkbox', { name: '校内日程' })).toBeEnabled()
  })
  it('separates definition steps and preserves published model versions', async () => {
    await open('/agents/minutes')
    const nav = wizardRole('navigation', { name: '专家表单分区' })
    for (const label of ['基本信息','工作能力','运行配置','检查配置']) expect(within(nav).getByRole('button', { name: new RegExp(label) })).toBeVisible()
    expect(screen.queryByRole('radio', { name: '表格清单' })).not.toBeInTheDocument()
    fireEvent.change(wizardRole('combobox', { name:'模型' }), {target:{value:'campus-vision'}}); fireEvent.click(wizardRole('checkbox', { name:'图片' })); fireEvent.change(wizardRole('combobox', { name:'模型' }), {target:{value:'campus-text'}}); await save()
    tab('发布管理'); expect(wizardRole('button', { name: '模拟发布' })).toBeDisabled()
    tab('提示词'); fireEvent.change(wizardRole('combobox', { name: '模型' }), { target: { value: 'campus-vision' } }); await save()
    const saved = prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!
    expect(saved.draft.model).toBe('campus-vision'); expect(saved.versions[0].config.model).toBe('campus-text')
  })

  it('shows plain prompt settings without expert selection or accordions and persists optional information', async () => {
    await open('/agents/minutes/edit/prompt')
    const before = new PrototypeStore(window.localStorage).state().campus!.agents.find(a => a.id === 'minutes')!
    expect(document.querySelector('.campus-editor-content details')).toBeNull()
    expect(screen.queryByRole('combobox', { name: '引用专家' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /指定成员分工/ })).not.toBeInTheDocument()
    expect(wizardRole('combobox', { name: /^(模型|使用的 AI 模型)$/ })).toBeVisible()
    expect(wizardRole('spinbutton', { name: '采样温度' })).toBeVisible()
    expect(wizardRole('spinbutton', { name: '单次对话最多轮次' })).toBeVisible()
    click('插入用户所在部门'); await save()
    const saved = new PrototypeStore(window.localStorage).state().campus!.agents.find(a => a.id === 'minutes')!
    expect(saved.draft.prompt).toBe(`${before.draft.prompt} {{user.department}}`)
    expect(saved.draft.limits).toEqual(before.draft.limits)
    expect(saved.versions).toEqual(before.versions)
    cleanup(); await open('/agents/minutes/edit/prompt')
    expect(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ })).toHaveValue(saved.draft.prompt)
  })
  it('keeps captain identity separate from member dispatch and prevents independent chat', async () => {
    await open('/agents/captain/edit/prompt?returnTo=%2Fagents%2Fmeeting-team%2Fedit%2Fteam')
    expect(screen.queryByRole('heading', { name: /指定成员分工/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览交互' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '使用授权' })).not.toBeInTheDocument()
    fireEvent.change(wizardRole('textbox', { name: /^系统提示词/ }), { target: { value: '你是会议专家团的协调负责人。' } }); await save()
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'captain')!.draft.prompt).toBe('你是会议专家团的协调负责人。')
    expect(wizardRole('button', { name: '返回专家团' })).toBeEnabled()
  })
  it('saves upload types and independently preserves delivery instructions', async () => {
    await open('/agents/minutes/edit/input')
    const before = prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!
    fireEvent.click(wizardRole('checkbox', {name:'表格'}))
    fireEvent.change(wizardRole('textbox',{name:/^系统提示词/}),{target:{value:'整理会议记录，交付事项、负责人和截止时间三列。'}}); await save()
    const saved=prototypeStore().state().campus!.agents.find(a=>a.id==='minutes')!
    expect(saved.draft.interaction!.input.modalities).toContain('spreadsheet'); expect(saved.versions).toEqual(before.versions)
    cleanup(); await open('/agents/minutes/edit/output')
    expect(wizardRole('textbox',{name:/^系统提示词/})).toHaveValue(saved.draft.prompt)
    tab('输出与验收'); expect(wizardRole('radio',{name:'表格清单'})).toBeVisible()
  })

  it('persists greeting and fallback copy alongside prompt configuration', async () => {
    await open('/agents/minutes/edit/input')
    fireEvent.change(wizardRole('textbox',{name:'开场白'}),{target:{value:'请提供会议记录，并说明会议主题。'}})
    fireEvent.change(wizardRole('textbox',{name:'无法回答时'}),{target:{value:'请补充会议原文。'}}); await save()
    cleanup(); await open('/agents/minutes/edit/input')
    expect(wizardRole('textbox',{name:'开场白'})).toHaveValue('请提供会议记录，并说明会议主题。')
    expect(wizardRole('textbox',{name:'无法回答时'})).toHaveValue('请补充会议原文。')
  })

  it('keeps published fields read only without a debug entry', async () => {
    await open('/agents/minutes/edit/input',false)
    expect(wizardRole('textbox',{name:'开场白'})).toBeDisabled()
    expect(wizardRole('button',{name:'添加工具'})).toBeDisabled()
    expect(wizardRole('button',{name:'添加技能'})).toBeDisabled()
    expect(wizardRole('textbox',{name:/^系统提示词/})).toBeDisabled()
    expect(screen.queryByRole('button',{name:/调试|预览交互/})).not.toBeInTheDocument()
    expect(wizardRole('button',{name:'基于此版本创建草稿'})).toBeEnabled()
  })

  it('creates a compact profile without exposing internal keys or old categories', async () => {
    await open('/agents/new/expert')
    fireEvent.change(wizardRole('textbox',{name:'智能体名称'}),{target:{value:'报销材料专家'}})
    expect(screen.queryByRole('textbox',{name:'智能体标识'})).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox',{name:'分类'})).not.toBeInTheDocument()
    click('保存草稿'); await screen.findByRole('heading',{name:'报销材料专家',level:1})
    const saved=prototypeStore().state().campus!.agents.find(a=>a.draft.name==='报销材料专家')!
    expect(saved.draft.expert?.formVersion).toBe('compact'); expect(saved.key).toBeTruthy(); expect(saved.draft.testSet).toBe('qa')
  })

  it('shows all three objects and filters departments when changing the simulated role', async () => {
    await open(); expect(screen.getByRole('button', { name: /^数字助理/ })).toBeVisible()
    fireEvent.change(screen.getByLabelText('演示身份'), { target: { value: 'configurer' } })
    expect(screen.queryByRole('button', { name: '校园数字助理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '教务政策解读专家' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('演示所属部门'), { target: { value: '教务处' } })
    expect(wizardRole('button', { name: '教务政策解读专家' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '会议安排专家' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('演示身份'), { target: { value: 'auditor' } })
    expect(wizardRole('button', { name: '创建' })).toBeDisabled()
  })
  it('creates an expert from a name and prompt with default visibility and without generating test reports', async () => {
    await open('/agents/new/expert'); click('创建草稿'); expect(screen.getAllByRole('alert').some(el => el.textContent?.includes('名称'))).toBe(true)
    fireEvent.change(wizardRole('textbox', { name: /^(智能体)?名称/ }), { target: { value: '验收资料专家' } })
    tab('提示词'); expect(wizardRole('textbox', { name: /^系统提示词/ })).toBeEnabled()
    fireEvent.change(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ }), { target: { value: '核对校内资料中的事实与来源' } })
    click('创建草稿'); await screen.findByRole('heading', { name: '验收资料专家', level: 1 })
    const a = prototypeStore().state().campus!.agents.find(a => a.draft.name === '验收资料专家')!
    expect(a.kind).toBe('expert'); expect(a.grants).toHaveLength(0); expect(a.usageMode).toBe('internal'); expect(a.versions).toEqual([]); expect(a.tests).toEqual([]); expect(a.draft.prompt).toBe('核对校内资料中的事实与来源')
    tab('发布管理'); expect(wizardRole('button', { name: '模拟发布' })).toBeDisabled()
  })
  it('creates mandatory confirmation with a write action and persists its fixed version', async () => {
    await open('/agents/schedule'); tab('技能与工具')
    click('添加工具'); fireEvent.change(wizardRole('textbox', { name: '搜索能力' }), { target: { value: '校内日程' } })
    fireEvent.click(wizardRole('checkbox', { name: '校内日程' })); fireEvent.click(wizardRole('button', { name: /确认选择/ }))
    expect(wizardRole('checkbox', {name:'允许写入 校内日程'})).toBeChecked()
    expect(wizardRole('combobox', { name: '校内日程由谁确认' })).toHaveValue('发起人')
    fireEvent.change(wizardRole('combobox', { name: '校内日程由谁确认' }), { target: { value: '发起人指定' } })
    click('保存草稿')
    await waitFor(() => expect(saveButton()).toBeDisabled())
    const a = new PrototypeStore(window.localStorage).state().campus!.agents.find(a => a.id === 'schedule')!
    expect(a.draft.tools[0].version).toBe('2.1'); expect(a.draft.nodes).toHaveLength(1); expect(a.draft.nodes[0].approver).toBe('发起人指定'); expect(a.tests).toHaveLength(0); expect(a.versions[0].config.tools).toEqual([])
    tab('发布管理'); expect(wizardRole('button', { name: '模拟发布' })).toBeEnabled()
  })
  it('publishes without mandatory testing and freezes the version and authorized scope', async () => {
    await open('/agents/policy/edit/release')
    expect(screen.queryByRole('combobox', { name: '人工复核人' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '运行 5 个固定样例' })).not.toBeInTheDocument()
    expect(wizardRole('button', { name: '模拟发布' })).toBeEnabled(); click('模拟发布'); const dialog = wizardRole('dialog')
    expect(dialog).toHaveTextContent('发布版本'); expect(dialog).toHaveTextContent('允许使用'); expect(dialog).not.toHaveTextContent('模拟测试')
    fireEvent.change(within(dialog).getByRole('textbox', { name: /发布说明/ }), { target: { value: '验收发布' } }); fireEvent.click(within(dialog).getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const a = prototypeStore().state().campus!.agents.find(a => a.id === 'policy')!
    expect(a.live).toBe(1); expect(a.versions[0].tests).toHaveLength(0); expect(a.versions[0].config).toEqual(a.draft)
  })
  it('preserves no-retry and platform approval requirements while allowing incomplete drafts', async () => {
    await open('/agents/minutes/edit/tools')
    click('添加工具'); fireEvent.change(wizardRole('textbox', { name: '搜索能力' }), { target: { value: '通知下发' } }); fireEvent.click(wizardRole('checkbox', { name: '通知下发' })); fireEvent.click(wizardRole('button', { name: /确认选择/ }))
    expect(wizardRole('switch', {name:'通知下发需要确认'})).toBeChecked()
    fireEvent.change(wizardRole('combobox', { name: '通知下发可访问的资料' }), { target: { value: 'platform' } }); await save()
    tab('发布管理'); expect(wizardRole('button', { name: '模拟发布' })).toBeDisabled(); expect(wizardRole('button', { name: /管理员批准依据/ })).toBeVisible()
    tab('技能与工具')
    fireEvent.change(wizardRole('textbox', { name: /通知下发批准依据/ }), { target: { value: '校内演示授权，限会议摘要下发' } }); await save()
    const saved = prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!
    expect(saved.draft.tools[0].retry).toBe(0); expect(saved.draft.nodes[0]).toMatchObject({ tool: 'notice', approver: '发起人' })
    fireEvent.click(wizardRole('checkbox', { name: '允许写入 通知下发' })); expect(screen.queryByRole('combobox', { name: '通知下发由谁确认' })).not.toBeInTheDocument(); await save()
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!.draft.nodes).toEqual([])
  })
  it('uses one assistant model and preserves no-match configuration without backend debugging', async () => {
    await open('/agents/assistant/edit/prompt')
    fireEvent.change(wizardRole('combobox', { name: /^(模型|使用的 AI 模型)$/ }), { target: { value: 'campus-vision' } }); await save()
    const saved = prototypeStore().state().campus!.agents.find(a => a.id === 'assistant')!
    expect(saved.draft.model).toBe('campus-vision'); expect(saved.draft.assistant.model).toBe('campus-vision')
    tab('基础设置'); expect(screen.queryByRole('combobox', { name: '普通问答模型' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox',{name:'无匹配反馈'})).toHaveValue(saved.draft.assistant.noMatch)
    tab('让修改生效'); expect(screen.queryByRole('textbox',{name:'输入想对助理说的话'})).not.toBeInTheDocument()

  })
  it.each(['/agents/schedule/edit/grants', '/agents/assistant/edit/grants'])('keeps old access links read-only and preserves settings at %s', async path => {
    const before = structuredClone(prototypeStore().state().campus!)
    await open(path, false)
    expect(screen.queryByRole('combobox', { name: '使用方式' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存使用授权' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(使用授权|谁能使用)$/ })).not.toBeInTheDocument()
    expect(screen.getByText('正常用户登录即可使用，无需单独授权')).toBeVisible()
    expect(prototypeStore().state().campus!).toEqual(before)
  })

  it('saves an incomplete team before creating a missing captain and keeps the return path', async () => {
    await open('/agents/new/team', false)
    fireEvent.change(wizardRole('textbox', { name: /^名称/ }), { target: { value: '新队长返回验收团' } })
    click('下一步：队长与成员')
    expect(screen.getByRole('heading', { name: '暂无可用队长' })).toBeVisible()
    click('保存草稿并创建队长')
    await screen.findByRole('heading', { name: '创建队长智能体', level: 1 })
    const team = prototypeStore().state().campus!.agents.find(a => a.draft.name === '新队长返回验收团')!
    expect(team.draft.team.captain.id).toBe('')
    fireEvent.change(wizardRole('textbox', { name: '智能体名称' }), { target: { value: '返回验收专属队长' } })
    click('保存草稿')
    await screen.findByRole('heading', { name: '返回验收专属队长', level: 1 })
    click('返回专家团')
    await screen.findByRole('heading', { name: '新队长返回验收团', level: 1 })
    expect(window.location.hash).toBe(`#/agents/${team.id}/edit/team`)
    expect(screen.getByRole('option', { name: '返回验收专属队长 · 可选' })).toBeEnabled()
  })

  it('packages experts with a captain and preserves incomplete team drafts without adding team prompts', async () => {
    await open('/agents/meeting-team/edit/team')
    expect(screen.getByRole('heading', { name: /普通专家 · 已选 2 位/ })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /分派说明|团队提示词/ })).not.toBeInTheDocument()
    expect(wizardRole('combobox', { name: '队长智能体' })).toHaveValue('captain')
    fireEvent.click(within(screen.getByText('会议纪要专家', { selector: 'strong' }).closest('.team-member-row') as HTMLElement).getByRole('button', { name: '移除' })); await save()
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'meeting-team')!.draft.team.members).toHaveLength(1)
    expect(screen.getAllByText(/至少选择两名不同的普通专家/)[0]).toBeVisible()
    tab('发布管理'); expect(wizardRole('button', { name: '模拟发布' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /知识库 V2|长期记忆 V2|发布渠道/ })).not.toBeInTheDocument()
  })

  it('saves an empty team and resumes it from the persisted draft without inventing team instructions', async () => {
    await open('/agents/new/team')
    fireEvent.change(wizardRole('textbox', { name: /^(智能体)?名称/ }), { target: { value: '新生服务专家团' } }); click('创建草稿')
    await screen.findByRole('heading', { name: '新生服务专家团', level: 1 })
    const created = new PrototypeStore(window.localStorage).state().campus!.agents.find(a => a.draft.name === '新生服务专家团')!
    expect(created.kind).toBe('team'); expect(created.draft.team.captain.id).toBe(''); expect(created.draft.team.members).toEqual([]); expect(created.draft.team.dispatch).toBe(''); expect(created.draft.tools).toEqual([])
    cleanup(); await open(`/agents/${created.id}/edit/team`)
    expect(wizardRole('heading', { name: '1. 选择队长' })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /工作说明|团队提示词|分派说明/ })).not.toBeInTheDocument()
    tab('发布管理'); expect(wizardRole('button', { name: '模拟发布' })).toBeDisabled()
  })

  it('keeps published configuration read only until a new draft is explicitly created', async () => {
    await open('/agents/minutes/edit/prompt', false)
    expect(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ })).toBeDisabled()
    click('基于此版本创建草稿')
    await waitFor(() => expect(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ })).toBeEnabled())
    const original = prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!.versions[0].config.prompt
    fireEvent.change(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ }), { target: { value: '新的纪要处理步骤，保留出处。' } }); await save()
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'minutes')!.versions[0].config.prompt).toBe(original)
    cleanup(); await open('/agents/minutes/versions/1', false)
    expect(wizardRole('heading', { name: '历史版本 v1 · 只读' })).toBeVisible()
    expect(screen.getByText(original, { exact: true })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /^(系统提示词|工作说明)/ })).not.toBeInTheDocument()
  })

  it('opens persisted test-report deep links and handles missing reports and versions', async () => {
    const store = prototypeStore(); store.campusAction(store.state().campus!.revision, {role:'admin',department:'信息化处'}, {type:'test',id:'policy',round:1,pass:true,reviewer:'历史模拟报告'})
    const report = store.state().campus!.agents.find(a => a.id === 'policy')!.tests[0]
    await open(`/agents/policy/test-runs/${report.id}`,false)
    expect(wizardRole('heading', { name: '模拟测试报告' })).toBeVisible()
    cleanup(); await open(`/agents/policy/test-runs/${report.id}`, false)
    expect(screen.getByText(/报告对应当前保存配置/)).toBeVisible()
    cleanup(); await open('/agents/policy/test-runs/missing', false)
    expect(wizardRole('heading', { name: '模拟报告不存在' })).toBeVisible()
    cleanup(); await open('/agents/policy/versions/999', false)
    expect(wizardRole('heading', { name: '历史版本不存在' })).toBeVisible()
  })

  it('offers stay, discard and save-before-leaving through the real App navigation guard', async () => {
    await open('/agents/policy/edit/basic')
    const original = prototypeStore().state().campus!.agents.find(a => a.id === 'policy')!.draft.description
    fireEvent.change(wizardRole('textbox', { name: /^简介/ }), { target: { value: '暂不保存的描述' } }); click('能力中心')
    expect(await screen.findByRole('dialog', { name: '有未保存的修改' })).toBeVisible()
    for (const label of ['留在当前页', '放弃修改并离开', '保存后离开']) expect(wizardRole('button', { name: label })).toBeEnabled()
    click('留在当前页'); expect(wizardRole('textbox', { name: /^简介/ })).toHaveValue('暂不保存的描述')
    click('能力中心'); await screen.findByRole('dialog'); click('放弃修改并离开')
    await screen.findByRole('textbox', { name: '搜索能力目录' }); expect(prototypeStore().state().campus!.agents.find(a => a.id === 'policy')!.draft.description).toBe(original)
    cleanup(); await open('/agents/policy/edit/basic')
    fireEvent.change(wizardRole('textbox', { name: /^简介/ }), { target: { value: '保存后离开的完整专家简介描述' } }); click('能力中心'); await screen.findByRole('dialog'); click('保存后离开')
    await screen.findByRole('textbox', { name: '搜索能力目录' })
    expect(new PrototypeStore(window.localStorage).state().campus!.agents.find(a => a.id === 'policy')!.draft.description).toBe('保存后离开的完整专家简介描述')
  })

  it('preserves creation inputs when localStorage fails and creates only one expert on retry', async () => {
    await open('/agents/new/expert')
    const count = prototypeStore().state().campus!.agents.length
    fireEvent.change(wizardRole('textbox', { name: /^(智能体)?名称/ }), { target: { value: '失败恢复专家' } })
    fireEvent.change(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ }), { target: { value: '整理材料，标注待核对事项。' } })
    vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('浏览器存储空间不足') })
    click('创建草稿'); await screen.findByText('浏览器存储空间不足')
    expect(wizardRole('textbox', { name: /^(智能体)?名称/ })).toHaveValue('失败恢复专家'); expect(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ })).toHaveValue('整理材料，标注待核对事项。')
    expect(prototypeStore().state().campus!.agents).toHaveLength(count)
    click('创建草稿'); await screen.findByRole('heading', { name: '失败恢复专家', level: 1 })
    expect(new PrototypeStore(window.localStorage).state().campus!.agents.filter(a => a.draft.name === '失败恢复专家')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).campus.agents).toHaveLength(count + 1)
  })

  it('keeps the page and unsaved text when save-before-leaving fails, then permits a safe retry', async () => {
    await open('/agents/policy/edit/basic')
    const original = prototypeStore().state().campus!.agents.find(a => a.id === 'policy')!.draft.description
    fireEvent.change(wizardRole('textbox', { name: /^简介/ }), { target: { value: '保存失败后必须保留的文本' } })
    vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('模拟底层存储失败') })
    click('能力中心'); await screen.findByRole('dialog'); click('保存后离开'); await screen.findByText('模拟底层存储失败')
    expect(window.location.hash).toBe('#/agents/policy/edit/basic'); expect(wizardRole('dialog')).toBeVisible()
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'policy')!.draft.description).toBe(original)
    click('留在当前页'); expect(wizardRole('textbox', { name: /^简介/ })).toHaveValue('保存失败后必须保留的文本')
    await save(); expect(prototypeStore().state().campus!.agents.find(a => a.id === 'policy')!.draft.description).toBe('保存失败后必须保留的文本')
  })

  it('discards unsaved configuration and grants when opening a version of the same agent', async () => {
    await open('/agents/schedule/edit/basic')
    const saved = prototypeStore().state().campus!.agents.find(a => a.id === 'schedule')!
    await waitFor(() => expect(wizardRole('textbox', { name: '简介' })).toBeEnabled())
    fireEvent.change(wizardRole('textbox', { name: '简介' }), { target: { value: '必须被放弃的编辑内容' } })
    tab('版本记录'); await screen.findByRole('dialog', { name: '有未保存的修改' }); click('放弃修改并离开')
    await screen.findByRole('button', { name: '查看完整配置' }); click('查看完整配置'); await screen.findByRole('heading', { name: '历史版本 v1 · 只读' })
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'schedule')!.grants).toEqual(saved.grants)
    expect(prototypeStore().state().campus!.agents.find(a => a.id === 'schedule')!.draft.description).toEqual(saved.draft.description)
  })

  it('clears creation cache after a successful write even if reading the result fails', async () => {
    await open('/agents/new/expert')
    const count = prototypeStore().state().campus!.agents.length
    fireEvent.change(wizardRole('textbox', { name: /^(智能体)?名称/ }), { target: { value: '读回恢复专家' } })
    fireEvent.change(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ }), { target: { value: '按照用户目标整理材料。' } })
    expect(window.sessionStorage.getItem('campus-expert-form:admin:信息化处')).toContain('读回恢复专家')
    vi.spyOn(prototypeStore(), 'state').mockImplementationOnce(() => { throw new Error('模拟读回失败') })
    click('创建草稿'); await screen.findByText(/变更已保存，但页面读取失败/)
    expect(new PrototypeStore(window.localStorage).state().campus!.agents).toHaveLength(count + 1)
    expect(window.sessionStorage.getItem('campus-expert-form:admin:信息化处')).toBeNull()
    expect(saveButton()).toBeDisabled()
    click('重试读取'); await screen.findByRole('heading', { name: '读回恢复专家', level: 1 })
    expect(prototypeStore().state().campus!.agents.filter(a => a.draft.name === '读回恢复专家')).toHaveLength(1)
    fireEvent.click(within(wizardRole('navigation', { name: '主导航' })).getByRole('button', { name: '智能体中心' })); fireEvent(window, new HashChangeEvent('hashchange'))
    await screen.findByRole('button', { name: '创建' }); click('创建'); click('普通专家')
    expect(wizardRole('textbox', { name: /^(智能体)?名称/ })).toHaveValue(''); expect(wizardRole('textbox', { name: /^(系统提示词|工作说明)/ })).toHaveValue(identityPromptTemplate)
  })

  it('protects and caches selected team members even before a team name has been entered', async () => {
    await open('/agents/new/team')
    const count = prototypeStore().state().campus!.agents.length
    click('添加普通专家')
    fireEvent.click(wizardRole('checkbox', { name: /^会议安排专家/ })); click('添加所选专家（1）')
    const cached = JSON.parse(window.sessionStorage.getItem('campus-create:admin:信息化处:team')!)
    expect(cached.name).toBe(''); expect(cached.team.members).toEqual([{ id: 'schedule', version: 1 }])
    click('能力中心'); await screen.findByRole('dialog', { name: '有未保存的修改' })
    for (const label of ['留在当前页', '放弃修改并离开', '保存后离开']) expect(wizardRole('button', { name: label })).toBeEnabled()
    click('保存后离开'); await screen.findByText('请填写团队名称')
    expect(window.location.hash).toBe('#/agents/new/team'); expect(prototypeStore().state().campus!.agents).toHaveLength(count)
    click('留在当前页'); click('队长与成员'); expect(screen.getByText('会议安排专家', { selector: 'strong' })).toBeVisible()
    cleanup(); await open('/agents/new/team')
    expect(wizardRole('textbox', { name: /^(智能体)?名称/ })).toHaveValue('')
    click('队长与成员'); expect(screen.getByText('会议安排专家', { selector: 'strong' })).toBeVisible()
  })

  it('creates a dedicated captain, then saves the team before opening that captain and returning', async () => {
    await open('/agents/new/captain')
    fireEvent.change(wizardRole('textbox', { name: '智能体名称' }), { target: { value: '验收专属队长' } }); click('保存草稿')
    await screen.findByRole('heading', { name: '验收专属队长', level: 1 })
    const captain = prototypeStore().state().campus!.agents.find(a => a.draft.name === '验收专属队长')!
    expect(captain.dutyType).toBe('captain'); expect(captain.draft.tools).toHaveLength(1)
    cleanup(); await open('/agents/new/team')
    fireEvent.change(wizardRole('textbox', { name: /^名称/ }), { target: { value: '跨专家返回验收团' } })
    fireEvent.change(wizardRole('combobox', { name: '队长智能体' }), { target: { value: captain.id } })
    click('添加普通专家')
    for (const name of [/^会议安排专家/, /^会议纪要专家/]) fireEvent.click(wizardRole('checkbox', { name }))
    click('添加所选专家（2）')
    click('打开队长配置'); await screen.findByRole('dialog', { name: '保存团队后打开专家' }); click('保存团队并打开')
    await screen.findByRole('heading', { name: '验收专属队长', level: 1 })
    const team = prototypeStore().state().campus!.agents.find(a => a.draft.name === '跨专家返回验收团')!
    expect(team.draft.team.captain.id).toBe(captain.id); expect(team.draft.team.members).toHaveLength(2)
    click('返回专家团'); await screen.findByRole('heading', { name: '跨专家返回验收团', level: 1 })
    expect(screen.getByRole('combobox', { name: '队长智能体' })).toHaveValue(captain.id)
  })
})
