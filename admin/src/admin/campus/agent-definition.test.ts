import { describe, expect, it, vi } from 'vitest'

// Retain coverage for the dormant multi-agent workflows. Current default scope is
// verified without this override in single-agent-scope.test.tsx.
vi.mock('./availability', async original => ({ ...await original<typeof import('./availability')>(), multiAgentEnabled: true, expertMvpEnabled: false, agentAvailable: () => true }))
import { PrototypeStore } from '../prototype-store'
import { defaultDefinition, definitionIssues, handoffEnabled, setHandoffEnabled } from './agent-definition'
import { expertEditingConfig, profileDefaults } from './expert-form'
import { blankConfig, configDigest, managedConfig, seedCampus, validateConfig, type Config } from './model'
import { defaultInteractionConfig, newInputField } from './interaction-model'
const actor = { role: 'admin', department: '信息化处' } as const
function definition(): Config {
  const c = blankConfig(); c.name = '定义验收专家'; c.description = '依据材料提供可核对的结果'; c.expert = { ...profileDefaults(), formVersion:'compact', key:'definition-test' }; c.interaction = defaultInteractionConfig(); c.definition = defaultDefinition(c)
  c.definition.task = { audience:'教职工', supported:'材料核对', prohibited:'不代替审批', preconditions:'资料齐全', success:'每项问题有结论', evidence:'原文或回执', missingInput:'clarify' }
  return c
}
function setup() {
  let data = ''; const storage = { getItem: () => data || null, setItem: (_: string, value: string) => { data = value }, removeItem: () => { data = '' } }; const store = new PrototypeStore(storage)
  const action = (value: Parameters<PrototypeStore['campusAction']>[2]) => store.campusAction(store.state().campus!.revision, actor, value)
  return { store, storage, action }
}
describe('book-derived Agent definition contract', () => {
  it('publishes without fallback, requires an enabled recipient only for publication, and preserves old versions', () => {
    const {store,action,storage}=setup(); const c=definition()
    const id=action({type:'create',kind:'expert',config:c,publish:true})!
    const published=structuredClone(store.state().campus!.agents.find(a=>a.id===id)!.versions)
    action({type:'from-version',id,version:1})
    c.definition=setHandoffEnabled(c.definition!,true)
    action({type:'save',id,config:c,credentialChecked:true})
    expect(()=>action({type:'publish',id,note:'缺少人员'})).toThrow('请选择接管人员')
    c.definition.governance.handoffOwner='lin'
    action({type:'save',id,config:c,credentialChecked:true}); action({type:'publish',id,note:'人工兜底已配置'})
    const restored=new PrototypeStore(storage).state().campus!.agents.find(a=>a.id===id)!
    expect(restored.versions.slice(1)).toEqual(published); expect(restored.versions[0].config.definition!.governance).toMatchObject({handoffEnabled:true,handoffOwner:'lin'})
    expect(published[0].config.definition!.governance).toMatchObject({handoffEnabled:false,handoffOwner:''})
  })
  it('disabling fallback clears dependent routing but preserves recipient and independent action confirmation', () => {
    const c=definition(); c.nodes=[{id:'confirm',name:'操作确认',trigger:'提交前',approver:'发起人',tool:'notice'}]
    c.definition=setHandoffEnabled(c.definition!,true); c.definition.governance.handoffOwner='lin'
    c.definition.task.missingInput='handoff'; c.definition.knowledge.insufficient='handoff'
    c.definition=setHandoffEnabled(c.definition,false)
    expect(c.definition.governance).toMatchObject({handoffEnabled:false,handoffOwner:'lin'})
    expect(c.definition.task.missingInput).toBe('stop'); expect(c.definition.knowledge.insufficient).toBe('clarify'); expect(c.definition.runtime.unknownResult).toBe('verify_then_stop')
    expect(c.nodes[0].approver).toBe('发起人')
    c.definition.task.missingInput='handoff'; expect(definitionIssues(c).some(i=>i.field==='handoffOwner')).toBe(true)
    c.definition=setHandoffEnabled(c.definition,true); c.definition.governance.handoffOwner='missing-person'
    const state=seedCampus(); expect(validateConfig(state,state.agents.find(a=>a.id==='minutes')!,c)).toContain('请选择有效的人工接管人员')
  })
  it('interprets legacy recipients as enabled without mutating stored definitions', () => {
    const c=definition(); delete c.definition!.governance.handoffEnabled; c.definition!.governance.handoffOwner='chen'; c.definition!.runtime.unknownResult='stop_and_handoff'
    const original=structuredClone(c); expect(handoffEnabled(c.definition!)).toBe(true)
    expect(definitionIssues(c)).toEqual([]); expect(c).toEqual(original)
    expect(expertEditingConfig(c,seedCampus()).definition).toEqual(original.definition)
  })
  it('separates incomplete draft checks from publication completeness', () => {
    const c = definition(); expect(definitionIssues(c)).toEqual([])
    c.definition!.task.success = ''; c.definition!.task.evidence = ''
    expect(definitionIssues(c,false)).toEqual([])
    expect(definitionIssues(c).map(i=>i.field)).toEqual(['success','evidence'])
  })
  it('preserves structured output, follow-up and confirmation rules through projection and explicit save', () => {
    const c = definition(); c.interaction!.output.format='table'; c.interaction!.output.requirements='每条结论列出原文出处'; c.interaction!.output.fields=[{...newInputField(), label:'核对结论'}]; c.interaction!.input.followUp='form'; c.nodes=[{id:'delivery',name:'交付确认',trigger:'交付前',approver:'发起人',tool:''}]
    const before = structuredClone(c); const projected = expertEditingConfig(c, seedCampus())
    expect(projected.interaction).toEqual(before.interaction); expect(projected.nodes).toEqual(before.nodes)
    expect(managedConfig(projected,'expert').interaction).toEqual(before.interaction); expect(c).toEqual(before)
  })
  it('requires a field contract for JSON output', () => {
    const c=definition(); c.interaction!.output.format='json'; expect(definitionIssues(c).map(i=>i.message)).toContain('结构化输出至少需要一个成果字段'); c.interaction!.output.fields=[{...newInputField(),label:'结论'}]; expect(definitionIssues(c)).toEqual([])
  })
  it('rejects incompatible budgets, missing knowledge and single-call tools', () => {
    const c = definition(); c.model='campus-vision'; c.maxTokens=20000; c.definition!.context.tokenBudget=63000; c.definition!.runtime.maxTotalTokens=10; c.definition!.context.sources.push('knowledge')
    expect(definitionIssues(c).map(i=>i.field)).toEqual(expect.arrayContaining(['maxTokens','tokenBudget','maxTotalTokens','knowledge']))
    c.tools=[{id:'notice',version:'1',read:true,write:false,auth:'user',scope:'user',approval:'',timeout:10,retry:0,exception:''}]; c.definition!.runtime.mode='single_call'; c.definition!.runtime.maxToolCalls=0
    expect(definitionIssues(c).map(i=>i.field)).toEqual(expect.arrayContaining(['runtime','maxToolCalls']))
    c.definition!.runtime.maxToolCalls=NaN; expect(definitionIssues(c,false).some(i=>i.field==='maxToolCalls')).toBe(true)
  })
  it('ignores historical test results for release and preserves snapshots after editing', () => {
    const {store,action,storage}=setup(); const id=action({type:'create',kind:'expert',config:definition()})!
    action({type:'test',id,round:1,pass:false,reviewer:'历史模拟结果'}); action({type:'publish',id,note:'按当前配置完整性发布'})
    const published=store.state().campus!.agents.find(a=>a.id===id)!.versions[0]
    action({type:'from-version',id,version:1}); const edited=store.state().campus!.agents.find(a=>a.id===id)!.draft; edited.definition!.task.success='更新的完成标准'
    action({type:'save',id,config:edited,credentialChecked:true})
    const restored=new PrototypeStore(storage).state().campus!.agents.find(a=>a.id===id)!
    expect(restored.versions[0]).toEqual(published); expect(restored.draft.definition!.task.success).toBe('更新的完成标准'); expect(configDigest(restored.draft)).not.toBe(configDigest(published.config))
    action({type:'publish',id,note:'无需后台调试的修改'}); expect(store.state().campus!.agents.find(a=>a.id===id)!.live).toBe(2)
  })
  it('deletes an unused draft, retains audit and blocks referenced or published objects', () => {
    const {store,action}=setup(); const id=action({type:'create',kind:'expert',config:definition()})!
    action({type:'delete',id}); expect(store.state().campus!.agents.some(a=>a.id===id && !a.deletedAt)).toBe(false); expect(store.state().campus!.audits.some(a=>a.agentId===id && a.action.includes('删除'))).toBe(true)
    const original=store.state().campus; expect(()=>action({type:'delete',id:'minutes'})).toThrow('仅可删除'); expect(store.state().campus).toEqual(original)
    const id2=action({type:'create',kind:'expert',config:definition()})!; const team=blankConfig(); team.name='引用草稿测试团'; team.team.members=[{id:id2,version:1}]; action({type:'create',kind:'team',config:team})
    expect(()=>action({type:'delete',id:id2})).toThrow('引用')
  })
})
