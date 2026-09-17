// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { wizardRole, wizardStep } from './wizard-test-helpers'
import { App } from '../App'
import { prototypeStore, resetPrototype } from '../prototype-store'
class MemoryStorage implements Storage {
  data = new Map<string,string>(); get length(){return this.data.size}; clear(){this.data.clear()}; getItem(key:string){return this.data.get(key)??null}; key(i:number){return [...this.data.keys()][i]??null}; removeItem(key:string){this.data.delete(key)}; setItem(key:string,value:string){this.data.set(key,value)}
}
beforeEach(()=>{vi.stubGlobal('localStorage',new MemoryStorage());vi.stubGlobal('sessionStorage',new MemoryStorage());resetPrototype();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','')}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open')}})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function open(path='/agents/new/expert'){window.history.replaceState(null,'',`#${path}`);render(<App/>);await screen.findByLabelText('演示身份')}
function click(name:string){fireEvent.click(screen.getByRole('button',{name}));fireEvent(window,new HashChangeEvent('hashchange'))}
const step = wizardStep
function fill(name:string,value:string){fireEvent.change(wizardRole('textbox',{name}),{target:{value}})}
const saved=()=>prototypeStore().state().campus!.agents.find(a=>!a.deletedAt && a.draft.name==='分步验收专家')!
describe('public definition wizard and CRUD',()=>{
  it('creates in four steps with valid defaults and restores unsaved model selection', async () => {
    await open(); expect(within(screen.getByRole('navigation',{name:'专家表单分区'})).getAllByRole('button')).toHaveLength(4)
    fill('智能体名称','分步验收专家'); fill('简介','逐项核对材料与原文依据'); step('工作能力')
    fireEvent.change(screen.getByRole('combobox',{name:'模型'}),{target:{value:'campus-vision'}})
    expect(screen.queryByRole('button',{name:'运行配置'})).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton',{name:'工具调用上限'})).not.toBeInTheDocument()
    cleanup(); await open(); expect(screen.getByRole('button',{name:'工作能力'})).toHaveAttribute('aria-current','step')
    expect(screen.getByRole('combobox',{name:'模型'})).toHaveValue('campus-vision')
    step('基础信息'); expect(screen.getByRole('textbox',{name:'智能体名称'})).toHaveValue('分步验收专家')
    fireEvent.change(screen.getByRole('combobox',{name:'所属部门'}),{target:{value:'教务处'}})
    step('检查配置'); expect(screen.queryByRole('combobox',{name:'固定评测集'})).not.toBeInTheDocument()
    click('创建草稿'); await screen.findByRole('heading',{name:'分步验收专家',level:1})
    expect(saved().draft.definition!.governance).toMatchObject({handoffEnabled:false,handoffOwner:''})
    expect(saved().draft.definition!.runtime).toMatchObject({maxToolCalls:20,unknownResult:'verify_then_stop'})
    step('运行与安全'); expect(screen.getByRole('spinbutton',{name:'工具调用上限'})).toHaveValue(20)
  })
  it('creates, reads, edits, searches and deletes a persisted draft through public controls',async()=>{
    await open();fill('智能体名称','分步验收专家');fill('简介','材料核对测试');click('保存草稿');await screen.findByRole('heading',{name:'分步验收专家',level:1});step('输出与验收');fireEvent.click(screen.getByRole('radio',{name:'表格清单'}));fill('完成标准','逐项有结论');fill('完成证据','可访问的原文出处');click('添加事项');click('保存草稿');await waitFor(()=>expect(saved().draft.definition!.task.evidence).toBe('可访问的原文出处'))
    await screen.findByRole('heading',{name:'分步验收专家',level:1});const id=saved().id
    cleanup();await open(`/agents/${id}/view`);expect(screen.getByRole('textbox',{name:'智能体名称'})).toBeDisabled();step('输出与验收');expect(screen.getByRole('radio',{name:'表格清单'})).toBeChecked();expect(screen.getByRole('textbox',{name:'完成证据'})).toHaveValue('可访问的原文出处')
    click('进入编辑');fill('简介','保存后的新简介');click('保存草稿');await waitFor(()=>expect(saved().draft.description).toBe('保存后的新简介'))
    click('← 智能体中心');fill('搜索智能体','分步验收专家');const row=screen.getByRole('button',{name:'分步验收专家'}).closest('tr')!;expect(row).toHaveTextContent('保存后的新简介');fireEvent.click(within(row).getByRole('button',{name:'删除'}));click('取消');expect(saved()).toBeDefined();fireEvent.click(within(row).getByRole('button',{name:'删除'}));click('确认删除');await waitFor(()=>expect(saved()).toBeUndefined());expect(screen.getByText('没有匹配的智能体')).toBeVisible()
    cleanup();await open(`/agents/${id}/view`);expect(screen.getByText('对象不存在或当前身份无权查看')).toBeVisible()
  })
  it('keeps the last valid cache when numeric input is empty and blocks persistence',async()=>{
    await open();fill('智能体名称','分步验收专家');click('保存草稿');await screen.findByRole('heading',{name:'分步验收专家',level:1});step('运行与安全');const input=screen.getByRole('spinbutton',{name:'工具调用上限'});fireEvent.change(input,{target:{value:'9'}});const key=`campus-expert-form:admin:信息化处:${saved().id}`;const cache=sessionStorage.getItem(key);fireEvent.change(input,{target:{value:''}});expect(sessionStorage.getItem(key)).toBe(cache);click('保存草稿');expect(saved().draft.definition!.runtime.maxToolCalls).toBe(20);expect(screen.getByRole('spinbutton',{name:'工具调用上限'})).toHaveFocus()
  })
  it('preserves editable cache separately from the read-only saved detail',async()=>{
    await open();fill('智能体名称','分步验收专家');fill('简介','已保存简介');click('保存草稿');await screen.findByRole('heading',{name:'分步验收专家',level:1});const id=saved().id;fill('简介','未保存的修改');step('运行与安全');cleanup();await open(`/agents/${id}`);step('基础信息');expect(screen.getByRole('textbox',{name:'简介'})).toHaveValue('未保存的修改');cleanup();await open(`/agents/${id}/view`);expect(screen.getByRole('textbox',{name:'简介'})).toHaveValue('已保存简介');expect(screen.getByRole('textbox',{name:'简介'})).toBeDisabled()
  })
  it('binds MCP actions through the existing governed capability catalog',async()=>{
    await open();fill('智能体名称','分步验收专家');step('工具');fireEvent.click(screen.getByRole('checkbox',{name:'绑定 校内文档 MCP 服务'}));click('保存草稿');await screen.findByRole('heading',{name:'分步验收专家',level:1});expect(saved().draft.tools).toHaveLength(1);expect(saved().draft.tools[0].actions!.filter(a=>a.enabled)).toHaveLength(0);expect(saved().draft.tools[0].actions!.find(a=>a.id.includes('create'))!.enabled).toBe(false)
  })
  it.each([9, -1])('preserves older unsaved runtime settings (%s) and allows invalid values to be corrected', async maxToolCalls => {
    await open(); fill('智能体名称','分步验收专家'); fill('简介','旧草稿继续填写')
    const key = 'campus-expert-form:admin:信息化处'
    const cached = JSON.parse(sessionStorage.getItem(key)!)
    cached.step = 'governance'; cached.config.definition.runtime.maxToolCalls = maxToolCalls
    cached.config.definition.task.evidence = '保留原始回执'
    sessionStorage.setItem(key, JSON.stringify(cached))
    cleanup(); await open(); expect(within(screen.getByRole('navigation',{name:'专家表单分区'})).getAllByRole('button')).toHaveLength(4)
    click('保存草稿')
    if (maxToolCalls < 0) {
      expect(saved()).toBeUndefined()
      const field = screen.getByRole('spinbutton',{name:'工具调用上限'}); expect(field).toHaveFocus()
      fireEvent.change(field,{target:{value:'9'}}); click('保存草稿')
    }
    await screen.findByRole('heading',{name:'分步验收专家',level:1})
    expect(saved().draft.definition!.runtime.maxToolCalls).toBe(9)
    expect(saved().draft.definition!.task.evidence).toBe('保留原始回执')
  })
  it('creates captains in three steps without user input/output or standalone conversation fields', async () => {
    await open('/agents/new/captain')
    expect(within(screen.getByRole('navigation',{name:'专家表单分区'})).getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByText('开场白与推荐问题（选填）')).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'输入与输出'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'预览交互'})).not.toBeInTheDocument()
    step('协作能力'); expect(screen.getByRole('combobox',{name:'协调模型'})).toBeEnabled()
    expect(screen.queryByRole('button',{name:'添加工具'})).not.toBeInTheDocument()
  })
  it('configures fallback only when enabled, preserves a separate recipient and keeps viewing read-only', async () => {
    await open(); fill('智能体名称','分步验收专家'); step('工作能力')
    fireEvent.click(screen.getByText('人工兜底（选填）'))
    const toggle = screen.getByRole('switch',{name:'出现问题时转人工'})
    expect(toggle).not.toBeChecked(); expect(screen.queryByRole('combobox',{name:'接管人员'})).not.toBeInTheDocument()
    fireEvent.click(toggle); expect(screen.getByRole('combobox',{name:'接管人员'})).toHaveValue('')
    click('保存草稿'); await screen.findByRole('heading',{name:'分步验收专家',level:1})
    expect(saved().draft.definition!.governance).toMatchObject({handoffEnabled:true,handoffOwner:''})
    click('发布管理'); click('启用人工兜底后，请选择接管人员'); expect(window.location.hash).toContain('/edit/handoff'); fireEvent.change(screen.getByRole('combobox',{name:'接管人员'}),{target:{value:'lin'}})
    step('基础信息'); fireEvent.change(screen.getByRole('combobox',{name:'所属部门'}),{target:{value:'教务处'}})
    click('保存草稿'); await waitFor(()=>expect(saved().draft.owner).toBe('zhou'))
    expect(saved().draft.definition!.governance.handoffOwner).toBe('lin')
    const id=saved().id; cleanup(); await open(`/agents/${id}/view`); step('人工兜底')
    expect(screen.getByRole('switch',{name:'出现问题时转人工'})).toBeDisabled()
    expect(screen.getByRole('combobox',{name:'接管人员'})).toBeDisabled()
  })
  it('keeps the current scroll position while editing and only scrolls for navigation or validation', async () => {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    try {
      await open(); step('输入与输出'); scroll.mockClear()
      fireEvent.click(screen.getByRole('checkbox', { name: '表格' }))
      expect(scroll).not.toHaveBeenCalled()
      fireEvent.change(screen.getByRole('combobox', { name: '填写方式' }), { target: { value: 'form' } })
      click('添加办事主题'); expect(scroll).not.toHaveBeenCalled()
      click('保存草稿'); expect(scroll).toHaveBeenCalled()
      expect(screen.getByRole('textbox', { name: '智能体名称' })).toHaveFocus()
      scroll.mockClear(); fill('智能体名称', '分步验收专家'); expect(scroll).not.toHaveBeenCalled()
      step('工作能力'); expect(scroll).toHaveBeenCalled()
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })
  it('offers explicit forms during creation and preserves their fields, timing and mode on reopen', async () => {
    await open(); fill('智能体名称','分步验收专家'); step('输入与输出')
    fireEvent.change(screen.getByRole('combobox',{name:'填写方式'}),{target:{value:'form'}})
    click('添加办事主题'); click('添加截止时间')
    fireEvent.change(screen.getByLabelText('收集截止时间的时机'),{target:{value:'missing'}})
    click('保存草稿'); await screen.findByRole('heading',{name:'分步验收专家',level:1})
    const interaction=saved().draft.interaction!, id=saved().id
    expect(interaction.input.followUp).toBe('form'); expect(interaction.input.fields).toHaveLength(2)
    expect(interaction.input.entryFields).toEqual([interaction.input.fields[0].key])
    cleanup(); await open(`/agents/${id}/edit/input`)
    expect(screen.getByRole('combobox',{name:'填写方式'})).toHaveValue('form')
    expect(screen.getByLabelText('收集截止时间的时机')).toHaveValue('missing')
    expect(screen.queryByRole('button',{name:/调试|预览交互/})).not.toBeInTheDocument()
  })
  it('saves the user form and completion contract, then restores them after reopening', async () => {
    await open(); fill('智能体名称', '分步验收专家'); step('输入与输出')
    fireEvent.click(screen.getByRole('radio', { name: '先填写表单' })); fill('表单标题', '填写公文需求'); fill('提交按钮文字', '提交需求')
    click('添加办事主题'); click('编辑办事主题'); fireEvent.change(screen.getByLabelText('默认值'), { target: { value: '会议通知' } }); click('保存填写项')
    step('输出与验收'); fireEvent.click(screen.getByRole('radio', { name: '可编辑文档' })); fireEvent.click(screen.getByRole('checkbox', { name: '同时交付PDF 文件' }))
    fill('模板引用（选填）', '通知模板 v2'); fireEvent.change(screen.getByLabelText('任务完成条件'), { target: { value: 'receipt' } }); fill('回执来源', 'OA · 提交发文'); fill('完成证据', '业务单号、提交成功状态和时间')
    click('保存草稿'); await screen.findByRole('heading', { name: '分步验收专家', level: 1 })
    const agent = saved(); expect(agent.draft.interaction!.input).toMatchObject({ entryMode: 'form', formTitle: '填写公文需求', submitLabel: '提交需求' })
    expect(agent.draft.definition!.task).toMatchObject({ completion: 'receipt', receiptSystem: 'OA · 提交发文' })
    cleanup(); await open(`/agents/${agent.id}/edit/input`)
    expect(screen.getByLabelText('表单标题')).toHaveValue('填写公文需求')
    expect(within(screen.getByRole('region', { name: '用户填写效果' })).getByLabelText('办事主题')).toHaveValue('会议通知')
    step('输出与验收'); expect(screen.getByLabelText('任务完成条件')).toHaveValue('receipt'); expect(screen.getByRole('checkbox', { name: '同时交付PDF 文件' })).toBeChecked()
    expect(screen.getByLabelText('模板引用（选填）')).toHaveValue('通知模板 v2')
  })

  it('creates teams as member assemblies and routes old input links to their member list', async () => {
    await open('/agents/new/team')
    expect(within(screen.getByRole('navigation', { name: '专家团创建步骤' })).getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: '输入与交付' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '名称*' }), { target: { value: '纯组队验收' } })
    click('保存草稿'); await screen.findByRole('heading', { name: '纯组队验收', level: 1 })
    const team = prototypeStore().state().campus!.agents.find(a => a.draft.name === '纯组队验收')!
    expect(team.draft.interaction).toBeUndefined(); expect(team.draft.definition).toBeUndefined()
    for (const route of ['edit/input', 'edit/output', 'view/io']) {
      cleanup(); await open(`/agents/${team.id}/${route}`)
      expect(screen.queryByRole('navigation', { name: '输入输出分区' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '用户输入与交付' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '队长与成员' })).toHaveAttribute('aria-current', 'page')
      expect(screen.queryByLabelText('任务完成条件')).not.toBeInTheDocument()
    }
  })
  it('redirects old captain input links to collaboration and points to the owning team', async () => {
    await open('/agents/captain/edit/input')
    expect(screen.queryByLabelText('表单标题')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '输入输出分区' })).not.toBeInTheDocument()
    click('查看队长与成员')
    expect(window.location.hash).toBe('#/agents/meeting-team/edit/team')
    expect(screen.queryByRole('navigation', { name: '输入输出分区' })).not.toBeInTheDocument()
  })

  it('explains captain collaboration without a disabled business tool form', async () => {
    await open('/agents/new/captain'); step('协作能力')
    const workflow = screen.getByRole('region', { name: '队长协作流程' })
    expect(within(workflow).getAllByRole('listitem')).toHaveLength(3)
    expect(workflow).toHaveTextContent('分派固定成员')
    expect(workflow).toHaveTextContent('获取成员状态与结果')
    expect(workflow).toHaveTextContent('汇总本任务结果')
    expect(screen.queryByText('已添加 1 个技能')).not.toBeInTheDocument()
    expect(screen.queryByText('查看内置执行规则（只读）')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /使用的账号|可访问的资料/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /移除|添加技能/ })).not.toBeInTheDocument()
    click('查看协作规范')
    expect(screen.getByRole('dialog')).toHaveTextContent('各成员智能体配置为准')
    click('关闭')
  })

  it('persists captain coordination settings and reads them without editable business controls', async () => {
    await open('/agents/new/captain'); fill('智能体名称', '队长协作验收'); step('协作能力')
    fireEvent.change(screen.getByRole('combobox', { name: '协调模型' }), { target: { value: 'campus-vision' } })
    fireEvent.click(screen.getByText('人工兜底（选填）'))
    fireEvent.click(screen.getByRole('switch', { name: '出现问题时转人工' }))
    fireEvent.change(screen.getByLabelText('接管人员'), { target: { value: 'lin' } })
    fireEvent.change(screen.getByLabelText('成员执行结果未知时'), { target: { value: 'stop_and_handoff' } })
    click('保存草稿'); await screen.findByRole('heading', { name: '队长协作验收', level: 1 })
    const captain = prototypeStore().state().campus!.agents.find(a => a.draft.name === '队长协作验收')!
    expect(captain.draft.model).toBe('campus-vision')
    expect(captain.draft.definition!.governance).toMatchObject({ handoffEnabled: true, handoffOwner: 'lin' })
    expect(captain.draft.definition!.runtime.unknownResult).toBe('stop_and_handoff')
    cleanup(); await open(`/agents/${captain.id}/edit/skills`)
    expect(screen.getByLabelText('协调模型')).toHaveValue('campus-vision')
    fireEvent.click(screen.getByText('人工兜底（选填）'))
    expect(screen.getByLabelText('接管人员')).toHaveValue('lin')
    expect(screen.getByLabelText('成员执行结果未知时')).toHaveValue('stop_and_handoff')
    cleanup(); await open(`/agents/${captain.id}/view/skills`)
    expect(screen.getByRole('region', { name: '队长协作流程' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: '协调模型' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('人工兜底（选填）'))
    expect(screen.getByRole('switch', { name: '出现问题时转人工' })).toBeDisabled()
    expect(screen.getByLabelText('接管人员')).toBeDisabled()
  })

})
