import { multiAgentEnabled } from './availability'
import { useState } from 'react'
import { Button, Empty, Notice, Section, Tag, formatTime } from '../components'
import { SelectField, Toggle } from './Fields'
import { canEdit, canPublish, departments, people, usageDecision, type Actor, type Agent, type Grant } from './model'

export function AssistantAccess({ agent, grants, setGrants, actor, busy, dirty, save, retrySync }: {
  agent: Agent; grants: Grant[]; setGrants: (grants: Grant[]) => void; actor: Actor; busy: boolean; dirty: boolean;
  save: () => Promise<boolean>; retrySync: () => void;
}) {
  const [person, setPerson] = useState('lin')
  const changed = JSON.stringify(grants) !== JSON.stringify(agent.grants)
  const decision = usageDecision({ ...agent, grants }, person)
  const add = (subject: Grant['subject'], effect: Grant['effect']) => setGrants([...grants, {
    id: crypto.randomUUID(), subject, effect, target: subject === 'user' ? 'lin' : agent.draft.department, children: false,
  }])
  const group = (effect: Grant['effect']) => <section className="assistant-access-group" aria-label={effect === 'allow' ? '可使用名单' : '不可使用名单'}>
    <h3>{effect === 'allow' ? '可以使用的部门和人员' : '例外：这些部门和人员不能使用'}</h3>
    <p className="campus-hint">{effect === 'allow' ? '按部门开放，也可以单独添加某位老师。未添加的人员不能使用。' : '即使已向所在部门开放，列在这里的人也不能使用。'}</p>
    <fieldset disabled={actor.role !== 'admin' || busy} className="campus-fieldset">
      {grants.filter(g => g.effect === effect).map(g => <div className="assistant-access-row" key={g.id}>
        <SelectField label={g.subject === 'department' ? '部门' : '人员'} value={g.target}
          options={g.subject === 'department' ? departments.map(d => ({ value: d, label: d })) : people.map(p => ({ value: p.id, label: `${p.name} · ${p.department}` }))}
          onChange={target => setGrants(grants.map(item => item.id === g.id ? { ...item, target } : item))} />
        {g.subject === 'department' && <Toggle label="也包含下级部门" value={g.children} onChange={children => setGrants(grants.map(item => item.id === g.id ? { ...item, children } : item))} />}
        <Button variant="ghost" onClick={() => setGrants(grants.filter(item => item.id !== g.id))}>移除{g.subject === 'department' ? g.target : people.find(p => p.id === g.target)?.name ?? g.target}</Button>
      </div>)}
      {!grants.some(g => g.effect === effect) && <p>{effect === 'allow' ? '尚未向任何人开放。' : '暂无例外。'}</p>}
      {actor.role === 'admin' && <div className="campus-inline campus-wrap"><Button onClick={() => add('department', effect)}>{effect === 'allow' ? '添加部门' : '排除部门'}</Button><Button onClick={() => add('user', effect)}>{effect === 'allow' ? '添加人员' : '排除人员'}</Button></div>}
    </fieldset>
  </section>
  return <Section title="谁能打开校园数字助理？" description="设置师生的使用范围。保存后按新范围判断后续访问，无需重新启用助理设置。">
    {actor.role !== 'admin' && <Notice>当前身份只能查看使用范围。</Notice>}
    <p className="access-scope-summary">{changed ? '保存后' : '当前'}允许 {people.filter(p => usageDecision({ ...agent, grants }, p.id).allowed).length} 位模拟用户使用 · {grants.filter(g => g.effect === 'deny').length} 条排除规则</p>
    {group('allow')}
    <details className="assistant-details" open={grants.some(g => g.effect === 'deny')}><summary>单独排除部分人员或部门{grants.some(g => g.effect === 'deny') ? `（${grants.filter(g => g.effect === 'deny').length} 项）` : ''}</summary>{group('deny')}</details>
    <div className="assistant-access-preview" role="status">
      <SelectField label="查一位老师能不能用" value={person} options={people.map(p => ({ value: p.id, label: `${p.name} · ${p.department}` }))} onChange={setPerson} />
      <strong>{people.find(p => p.id === person)?.name}：{decision.allowed ? '可以使用' : '不能使用'}</strong><p>{decision.reason}</p>
      <small>{changed ? '这是修改后的预览，保存后才生效。' : '按已保存的使用范围判断。'}人员与部门来自学校目录，此处不修改人员信息。</small>
    </div>
    <p className="campus-hint">{multiAgentEnabled ? "能打开助理，并不代表能使用所有专家；助理会继续按该用户已有的权限推荐专家或专家团。" : "能打开助理，并不代表能使用所有专家；助理会继续按该用户已有的权限推荐普通专家。"}</p>
    {agent.sync !== 'synced' && <Notice tone="error">使用范围尚未同步成功。请重试，成功前不能正常使用。<Button disabled={actor.role !== 'admin' || busy || dirty} onClick={retrySync}>重试同步</Button></Notice>}
    <div className="campus-savebar"><span>{changed ? '使用范围有未保存修改' : '使用范围已保存'}</span>{actor.role === 'admin' && <Button variant="primary" disabled={!changed || busy} onClick={() => void save()}>保存使用范围</Button>}</div>
  </Section>
}

export function AssistantHistory({ agent, actor, busy, dirty, view, restore, simpleAccess = false }: {
  simpleAccess?: boolean; agent: Agent; actor: Actor; busy: boolean; dirty: boolean; view: (number: number) => void; restore: (number: number) => void;
}) {
  return <Section title="以前用过的设置" description="查看每次生效的设置。调整后效果不好时，可以重新使用以前的一版。">
    {dirty && <Notice tone="warning">请先保存或放弃当前未保存修改，再切换到以前的设置。</Notice>}
    {agent.versions.length ? [...agent.versions].sort((left, right) => right.number - left.number).map(v => <article className={`campus-version ${agent.live === v.number ? 'is-current' : ''}`} key={v.number}>
      <div className="campus-version-number">{v.number}</div><div>
        <div className="campus-row"><h3>{v.note}</h3><Tag>{agent.live === v.number ? '正在使用' : '以前用过'}</Tag></div>
        <p>{formatTime(v.at)} · {v.actor}</p>
        <div className="campus-inline campus-wrap"><Button onClick={() => view(v.number)}>查看这版设置</Button>{agent.live !== v.number && canPublish(actor, agent) && <Button disabled={busy || dirty || agent.disabled || (!simpleAccess && agent.sync !== 'synced')} onClick={() => restore(v.number)}>重新使用这版</Button>}</div>
      </div>
    </article>) : <Empty title="还没有生效过的设置" description="确认设置生效后，这里会保留记录。" />}
    <p className="campus-hint">切换后，新发起的对话使用所选设置。待生效的修改和账号启停状态仍保留。</p>
    {!canEdit(actor, agent) && <p className="campus-hint">当前身份只可查看记录。</p>}
  </Section>
}
