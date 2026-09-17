import { useEffect, useRef, useState } from 'react'
import { Button, Empty, Field, Modal, Notice, SearchField, Section, Tag } from '../components'
import { canSee, capabilityCatalog, captainOwner, configDigest, isCaptain, teamIssues, type Actor, type Agent, type CampusState, type Config } from './model'

export function TeamComposer({ state, actor, config: c, onChange, openExpert, createCaptain, disabled = false, teamId, creation = false }: { state: CampusState; actor: Actor; config: Config; onChange: (value: Partial<Config>) => void; openExpert: (id: string) => void; createCaptain?: () => void; disabled?: boolean; teamId?: string; creation?: boolean }) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const pickerTrigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (!adding && pickerTrigger.current) { pickerTrigger.current.focus({ preventScroll: true }); pickerTrigger.current = null } }, [adding])
  const currentId = teamId ?? state.agents.find(t => t.kind === 'team' && configDigest(t.draft) === configDigest(c))?.id
  const experts = state.agents.filter(a => a.kind === 'expert' && canSee(actor, a))
  const leaders = experts.filter(isCaptain)
  const availableLeaders = leaders.filter(a => !a.disabled && !captainOwner(state, a.id, currentId))
  const captain = leaders.find(a => a.id === c.team.captain.id)
  const leaderConfig = c.team.captain.version === 0 ? captain?.draft : captain?.versions.find(v => v.number === c.team.captain.version)?.config
  const patch = (team: Partial<Config['team']>) => onChange({ team: { ...c.team, ...team } })
  const pinDraft = () => captain && patch({ captain: { id: captain.id, version: 0, draftDigest: configDigest(captain.draft) } })
  const errors = teamIssues(state, c, undefined, currentId).filter(error => !creation || !['请选择一名队长智能体', '至少选择两名不同的普通专家'].includes(error))
  const candidates = experts.filter(a => { const config = a.versions.find(v => v.number === a.live)?.config ?? a.draft; return !isCaptain(a) && !c.team.members.some(p => p.id === a.id) && `${config.name} ${config.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) })
  const available = candidates.filter(a => a.live && !a.disabled)
  const unavailable = candidates.filter(a => !a.live || a.disabled)
  const candidate = (a: Agent) => { const published = a.versions.find(v => v.number === a.live)?.config; return <label key={a.id} className={`team-expert-option ${selected.includes(a.id) ? 'is-selected' : ''}`}><input type="checkbox" checked={selected.includes(a.id)} disabled={!a.live || a.disabled} onChange={e => setSelected(current => e.target.checked ? [...current, a.id] : current.filter(id => id !== a.id))} /><span><strong>{published?.name ?? a.draft.name}</strong><small>{published?.description || a.draft.description || '暂无简介'}</small><small>{a.disabled ? '已停用，需先恢复' : a.live ? `v${a.live} · 当前发布` : '尚未发布，需先发布'}</small></span></label> }
  const addSelected = () => { patch({ members: [...c.team.members, ...experts.filter(a => selected.includes(a.id) && a.live && !a.disabled && !c.team.members.some(p => p.id === a.id)).map(a => ({ id: a.id, version: a.live! }))] }); setAdding(false) }
  return <div className="team-composer-v2">
    {errors.length > 0 && <Notice tone="warning"><strong>{disabled ? '团队依赖待处理' : '组团待完善 · 可以保存草稿'}</strong><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></Notice>}
    <Section title={disabled || creation ? "专属队长" : "1. 选择队长"} description="负责拆解任务、分派工作和汇总结果。一个队长只属于一个团队。">
      {!disabled && <Field label="队长智能体" required><select aria-label="队长智能体" value={c.team.captain.id} onChange={e => { const a = leaders.find(a => a.id === e.target.value); patch({ captain: a ? { id: a.id, version: 0, draftDigest: configDigest(a.draft) } : { id: '', version: 0 } }) }}><option value="">请选择可担任队长的智能体</option>{leaders.map(a => { const owner = captainOwner(state, a.id, currentId); return <option key={a.id} value={a.id} disabled={a.disabled || !!owner}>{a.draft.name}{owner ? ` · 已归属${owner.draft.name}` : a.disabled ? ' · 已停用' : ' · 可选'}</option> })}</select></Field>}
      {!captain && (!availableLeaders.length || disabled) && <Empty title={leaders.length ? '暂无可用队长' : '还没有队长智能体'} description={leaders.length ? '现有队长已归属其他团队或已停用。创建一位专属队长后，再返回这里继续组团。' : '先保存专家团草稿，再创建一位负责协调工作的队长。'} action={!disabled && createCaptain && <Button onClick={createCaptain}>保存草稿并创建队长</Button>} />}
      {captain && <div className="team-captain-card"><div className="campus-row"><strong>{leaderConfig?.name ?? captain.draft.name}</strong><Tag>{captain.disabled ? '已停用' : !leaderConfig ? '引用版本不可用' : c.team.captain.version ? `队长 · 固定 v${c.team.captain.version}` : '队长 · 已保存草稿'}</Tag></div><p>{leaderConfig?.description || '尚未填写简介'}</p><Button variant="ghost" onClick={() => openExpert(captain.id)}>打开队长配置</Button>{!disabled && (c.team.captain.version !== 0 || c.team.captain.draftDigest !== configDigest(captain.draft)) && <Button onClick={pinDraft}>选用当前队长草稿</Button>}<p className="campus-hint">工作方法：{leaderConfig?.tools.map(b => `${capabilityCatalog.find(cap => cap.id === b.id)?.name ?? b.id} v${b.version}`).join('、') || '尚未选择 Skill'}</p></div>}
    </Section>
    <Section title={creation ? '普通专家' : `2. 普通专家 · 已选 ${c.team.members.length} 位`} description="至少添加两名，分别承担具体业务。每位成员使用固定的发布版本。" action={creation ? <Tag>已选 {c.team.members.length} 位</Tag> : undefined}>
      {!c.team.members.length && <p className="campus-hint">尚未添加成员。添加能够共同完成这项工作的专家。</p>}
      {c.team.members.map(pin => { const a = experts.find(a => a.id === pin.id); const version = a?.versions.find(v => v.number === pin.version); return <div className="team-member-row" key={pin.id}><div><strong>{version?.config.name ?? a?.draft.name ?? '成员不可见'}</strong><small>{version?.config.description || '暂无简介'}</small></div>{(disabled || a?.disabled || !version) && <Tag>{a?.disabled ? '已停用' : !version ? '引用版本不可用' : `固定 v${pin.version}`}</Tag>}{!disabled && <select aria-label={`${a?.draft.name ?? pin.id}引用版本`} value={pin.version} onChange={e => patch({ members: c.team.members.map(p => p.id === pin.id ? { ...p, version: Number(e.target.value) } : p) })}>{a?.versions.map(v => <option key={v.number} value={v.number}>v{v.number}{a.live === v.number ? ' · 当前发布' : ''}</option>)}</select>}<Button variant="ghost" onClick={() => openExpert(pin.id)}>打开专家</Button>{!disabled && <Button variant="ghost" onClick={() => patch({ members: c.team.members.filter(p => p.id !== pin.id) })}>移除</Button>}{a?.live && a.live !== pin.version && <small>可更新至 v{a.live}</small>}</div> })}
      {!disabled && <Button aria-haspopup="dialog" onClick={e => { pickerTrigger.current = e.currentTarget; setQuery(''); setSelected([]); setAdding(true) }}>添加普通专家</Button>}
      <p className="campus-hint">团队获授权后，成员参与本任务无需重复单独授权。</p>
    </Section>
    {adding && <Modal title="添加普通专家" onClose={() => setAdding(false)}><p>选择需要的业务能力，可一次添加多位专家。</p><SearchField value={query} onChange={setQuery} label="搜索组团专家" placeholder="搜索普通专家名称或简介" /><div className="team-picker-results"><div className="team-picker-grid">{available.map(candidate)}</div>{!available.length && <p className="campus-hint">没有可添加的匹配专家，请调整搜索条件。</p>}{unavailable.length > 0 && <details className="expert-foldout"><summary>暂不可添加 · {unavailable.length} 位</summary><div className="team-picker-grid">{unavailable.map(candidate)}</div></details>}</div><footer><span className="campus-hint">已勾选 {selected.length} 位</span><Button onClick={() => setAdding(false)}>取消</Button><Button variant="primary" disabled={!selected.length} onClick={addSelected}>添加所选专家（{selected.length}）</Button></footer></Modal>}
  </div>
}
