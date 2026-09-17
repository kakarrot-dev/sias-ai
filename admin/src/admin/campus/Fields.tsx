import { useId, useState, type ReactNode } from 'react'
import { Button, Field, Notice, Section } from '../components'
import { isCaptain, canSee, departments, models, people, resolvePromptReferences, type Actor, type Agent, type CampusState, type Config } from './model'
export function SelectField({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: { value: string; label: string; disabled?: boolean }[]; onChange: (v: string) => void; disabled?: boolean }) {
  return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select></Field>
}
export function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) { return <label className="campus-check"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} disabled={disabled} /><span>{label}</span></label> }

export function BasicFields({ config: c, set, actor, kind, creation = false }: { config: Config; set: (patch: Partial<Config>) => void; actor: Actor; kind: Agent['kind']; creation?: boolean }) {
  if (creation && kind === 'team') return <div className="team-basic-fields">
    <Section title="团队介绍"><div data-expert-field="name"><Field label="名称" required><input placeholder="例如：会议筹备专家团" value={c.name} maxLength={100} onChange={e => set({ name: e.target.value })} /></Field></div><Field label="简介" hint="可选，向用户说明这支团队负责什么、能交付什么"><textarea value={c.description} placeholder="例如：协助安排会议、整理纪要，并汇总会后待办。" maxLength={500} rows={3} onChange={e => set({ description: e.target.value })} /></Field><details className="team-scenario" open={c.scenario ? true : undefined}><summary>适用场景 <span>可选</span></summary><Field label="适用场景" hint="用于帮助用户匹配团队；不限定时可留空"><input value={c.scenario ?? ''} maxLength={80} onChange={e => set({ scenario: e.target.value })} /></Field></details></Section>
    <Section title="管理归属"><div className="form-grid"><SelectField label="所属部门" value={c.department} disabled={actor.role !== 'admin'} options={departments.map(value => ({ value, label: value }))} onChange={department => set({ department, owner: people.find(p => p.department === department)!.id })} /><SelectField label="责任人" value={c.owner} options={people.filter(p => p.department === c.department).map(p => ({ value: p.id, label: p.name }))} onChange={owner => set({ owner })} /></div></Section>
  </div>
  return <Section title="基本资料" description={kind === 'team' ? '说明团队的业务范围，以及负责维护配置的部门与人员。' : '名称和简介用于识别，工作方法通过 Skill 维护。'}><div className="form-grid">
    <Field label="名称" required><input value={c.name} maxLength={100} onChange={e => set({ name: e.target.value })} /></Field>
    <Field label="适用场景" hint="可选，不限定具体业务"><input value={c.scenario ?? ''} maxLength={80} onChange={e => set({ scenario: e.target.value })} /></Field>
    <Field label="简介" className="span-2" hint="可选，帮助其他人了解适用范围"><textarea value={c.description} maxLength={500} rows={3} onChange={e => set({ description: e.target.value })} /></Field>
    <SelectField label="所属部门" value={c.department} disabled={actor.role !== 'admin' || kind === 'assistant'} options={departments.map(value => ({ value, label: value }))} onChange={department => set({ department, owner: people.find(p => p.department === department)!.id })} />
    <SelectField label="责任人" value={c.owner} options={people.filter(p => p.department === c.department).map(p => ({ value: p.id, label: p.name }))} onChange={owner => set({ owner })} />
  </div></Section>
}
export function PromptFields({ state, actor, agent, config: c, set, teamId, credentialChecked, setCredentialChecked, formMode = false, disabled = false, actions }: { state: CampusState; actor: Actor; agent: Agent; config: Config; set: (patch: Partial<Config>) => void; teamId?: string; credentialChecked: boolean; setCredentialChecked: (v: boolean) => void; formMode?: boolean; disabled?: boolean; actions?: ReactNode }) {
  const [selectedTeam, setSelectedTeam] = useState('')
  const promptId = useId()
  const teams = state.agents.filter(a => !!agent.id && a.kind === 'team' && a.draft.team.captain.id === agent.id && canSee(actor, a))
  const team = teamId ? teams.find(a => a.id === teamId) : teams.find(a => a.id === selectedTeam) ?? teams[0]
  const members = (team?.draft.team.members ?? []).flatMap(pin => {
    const expert = state.agents.find(a => a.id === pin.id)
    const version = expert?.versions.find(v => v.number === pin.version)
    return expert && version && canSee(actor, expert) ? [{ id: expert.id, name: version.config.name }] : []
  })
  const promptLimit = formMode ? 4000 : 20000
  const unfilled = c.prompt.match(/【填写：[^】]*】/g)?.length ?? 0
  const content = <>
    {formMode ? <div className="expert-prompt-input"><textarea id={promptId} className="campus-prompt" value={c.prompt} maxLength={formMode ? 4000 : 20000} rows={7} onChange={e => set({ prompt: e.target.value })} placeholder="你是谁？负责哪些范围？通用表达要求是什么？" /><small>{c.prompt.length} / 4000 字</small></div> : <Field label="工作说明（提示词）" required hint={`${c.prompt.length} / 20000 字`}> <textarea id={promptId} className="campus-prompt" value={c.prompt} maxLength={formMode ? 4000 : 20000} rows={7} onChange={e => set({ prompt: e.target.value })} placeholder="你是谁？负责哪些范围？通用表达要求是什么？" /></Field>}
    {resolvePromptReferences(state, c).errors.map(e => <Notice key={e} tone="warning">{e}</Notice>)}
    {unfilled > 0 && <Notice tone="warning">还有 {unfilled} 处【填写：…】待替换，请在上方工作说明中补充实际内容。</Notice>}
    <div className={`campus-prompt-help ${formMode ? 'is-inline' : ''}`}>
      {formMode ? <span className="expert-variable-label">插入信息</span> : <><h3>在说明中插入当前信息 <span>可选</span></h3><p>点击下方按钮，在末尾插入占位符，用于带入每次任务的实际信息。例如，让专家按用户所在部门提供办事指引。</p></>}
      <div className="tag-list">{[['{{task.goal}}', '任务目标'], ['{{user.name}}', '用户姓名'], ['{{user.department}}', '用户所在部门'], ['{{current.date}}', '当前日期']].map(([value, label]) => <Button key={value} variant={formMode ? "ghost" : "default"} disabled={c.prompt.length + (c.prompt ? 1 : 0) + value.length > promptLimit} onClick={() => set({ prompt: `${c.prompt}${c.prompt ? ' ' : ''}${value}` })}>插入{label}</Button>)}</div>
    </div>
    {team && c.schemaVersion !== '2.0' && <div className="campus-prompt-help">
      <h3>指定成员分工 <span>可选</span></h3>
      {!teamId && teams.length > 1 ? <SelectField label="参考专家团" value={team.id} options={teams.map(a => ({ value: a.id, label: a.draft.name }))} onChange={setSelectedTeam} /> : <p>当前专家是「{team.draft.name}」的队长。</p>}
      <p>组团时已选好协作成员。需要固定分工时，可在工作说明中点名；也可以只写目标和步骤，让队长安排。</p>
      <div className="tag-list">{members.map(member => <Button key={member.id} disabled={c.prompt.length + (c.prompt ? 1 : 0) + member.name.length + 2 > promptLimit} onClick={() => set({ prompt: `${c.prompt}${c.prompt ? ' ' : ''}@${member.name} `, promptReferences: [...(c.promptReferences ?? []).filter(r => r.id !== member.id), { id: member.id, label: member.name }] })}>插入「{member.name}」</Button>)}</div>
      {!members.length && <p>请先在专家团中选择成员，再按需指定分工。</p>}
    </div>}
  </>
  return <>
  {formMode ? <div className="campus-prompt-editor"><div className="expert-prompt-heading"><label htmlFor={promptId}>系统提示词 <em>*</em></label><div className="expert-prompt-actions">{actions}</div></div><fieldset className="campus-fieldset" disabled={disabled}>{content}</fieldset></div> : <Section title="提示词" description="定义身份、职责范围和通用表达要求。具体工作方法在 Skill 中维护。">{content}</Section>}
  {!formMode && <Section title="模型与运行保护" description="模型决定专家如何理解和处理内容；运行保护用于避免任务反复执行或长时间等待。通常保持现有设置即可。">
    <SelectField label="使用的 AI 模型" value={c.model} options={[{ value: '', label: '稍后选择模型' }, ...models.map(m => ({ value: m.id, label: `${m.name} · ${m.abilities}`, disabled: !m.active }))]} onChange={model => set({ model, ...(agent.kind === 'assistant' ? { assistant: { ...c.assistant, model } } : {}) })} />
    <p className="campus-hint">处理文字可用通用语言模型；需要理解图片或音频时，选择支持这些内容的多模态模型。</p>
    <div className="campus-prompt-limits">{([
      ['steps', '任务步骤上限', 200, '一次任务最多允许多少次内部处理步骤，如分析、调用工具；不是工作说明里的步骤条数。'],
      ['minutes', '任务处理时间上限（分钟）', 60, '一次任务用于主动处理的时间上限。'],
      ['modelSeconds', '单次响应等待上限（秒）', 120, '每次向模型请求回复时，最多等待多久。'],
    ] as const).map(([key, label, max, help]) => <Field label={label} key={key} hint={`${help} 可填 1—${max}。`}><input aria-label={label} type="number" min={1} max={max} value={c.limits[key]} onChange={e => set({ limits: { ...c.limits, [key]: Number(e.target.value) } })} /></Field>)}</div>
    {!agent.credentialChecked && <Toggle label="已确认复制后的模型选择" value={credentialChecked} onChange={setCredentialChecked} />}
  </Section>}
  </>
}
export function MatchingFields({ state, config: c, set }: { state: CampusState; config: Config; set: (patch: Partial<Config>) => void }) {
  return <Section title="匹配与承接" description="默认在当前用户有权使用、已发布且依赖可用的对象中匹配。"><p>最多展示 3 个候选；单一候选模拟转交，多候选由用户选择。</p><Field label="无匹配反馈"><textarea rows={3} value={c.assistant.noMatch} onChange={e => set({ assistant: { ...c.assistant, noMatch: e.target.value } })} /></Field><section className="campus-inset"><h3>排除匹配对象</h3>{state.agents.filter(a => !a.deletedAt && a.kind !== 'assistant' && !isCaptain(a) && a.usageMode !== 'internal').map(a => <Toggle key={a.id} label={a.draft.name} value={c.assistant.exclude.includes(a.id)} onChange={checked => set({ assistant: { ...c.assistant, exclude: checked ? [...c.assistant.exclude, a.id] : c.assistant.exclude.filter(id => id !== a.id) } })} />)}</section><Notice>匹配演示按发布版本名称、简介和场景进行词语匹配，不代表真实意图识别。</Notice></Section>
}
