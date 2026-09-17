import { useState } from 'react'
import { Plus, Xmark } from 'iconoir-react'
import { CapabilityPicker } from '../CapabilityPicker'
import { Button, Field, IconButton, Modal, Notice } from '../components'
import { MAX_AGENT_CAPABILITIES, type Capability } from '../shared'
import { CapabilityFields } from './CapabilityFields'
import { capabilityCatalog, platformBinding, platformSkillId, selectCapabilities, type Binding, type Config, type ToolAccess } from './model'
import { expertResourceKind, toolDisplayName, toolNeedsConfirmation } from './expert-resources'

const skillDocuments = import.meta.glob(['../../runtime/skill-packages/*/SKILL.md', './skills/*/SKILL.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const contentFor = (id: string) => skillDocuments[`../../runtime/skill-packages/${id.replace(/^skill\./, '').replace(/\.v\d+$/, '')}/SKILL.md`] ?? skillDocuments[`./skills/${id.replace(/^skill\./, '').replace(/\.v\d+$/, '')}/SKILL.md`]
const captainActionNotes: Record<string, string> = {
  'campus.captain.dispatch@v1': '依据任务目标与成员职责，向团队固定成员分派工作。',
  'campus.captain.results@v1': '收集本任务的进度、成果和依据，发现失败或缺口。',
  'campus.captain.aggregate@v1': '按各成员的输出要求核对结果，保留来源和未完成事项，再汇总交付。',
}
const nodeFor = (id: string, name: string) => ({ id: crypto.randomUUID(), name: `${name}前确认`, trigger: `${name}之前`, approver: '发起人', tool: id })

export function ExpertResources({ role = 'expert', kind, config: c, onChange, disabled, navigate }: { role?: 'expert' | 'captain' | 'assistant'; kind: 'builtin' | 'skill'; config: Config; onChange: (patch: Partial<Config>) => void; disabled: boolean; navigate: (path: string) => void }) {
  const captainSkill = role === 'captain' && kind === 'skill'
  const label = kind === 'builtin' ? '工具' : '技能'
  const catalog = capabilityCatalog.filter(cap => expertResourceKind(cap) === kind && (role === 'expert' ? !cap.id.startsWith('capability.campus-') : cap.id === platformSkillId(role)))
  const selected = c.tools.filter(b => catalog.some(cap => cap.id === b.id))
  const [pending, setPending] = useState<string[]>()
  const [detail, setDetail] = useState<Capability>()
  const unavailable = (cap: Capability) => !cap.execution?.active ? '已停用' : cap.execution.departments && !cap.execution.departments.includes(c.department) ? '本部门不可添加' : undefined
  const update = (b: Binding, patch: Partial<Binding>) => onChange({ tools: c.tools.map(item => item.id === b.id ? { ...item, ...patch } : item) })
  const setConfirmation = (b: Binding, value: boolean) => onChange({ tools: c.tools.map(item => item.id === b.id ? { ...item, requiresConfirmation: value } : item), nodes: value ? c.nodes.some(n => n.tool === b.id) ? c.nodes : [...c.nodes, nodeFor(b.id, toolDisplayName(b, catalog.find(cap => cap.id === b.id)!))] : c.nodes.filter(n => n.tool !== b.id) })
  const apply = () => {
    if (!pending || disabled) return
    const ids = [...c.tools.filter(b => !selected.includes(b) || pending.includes(b.id)).map(b => b.id), ...pending.filter(id => !c.tools.some(b => b.id === id))]
    const next = selectCapabilities(c, ids)
    next.tools = next.tools!.map(b => {
      const cap = catalog.find(cap => cap.id === b.id)
      if (role !== 'expert' && cap) return platformBinding(role)
      if (kind !== 'builtin' || !cap || c.tools.some(old => old.id === b.id)) return b
      const write = !!cap.execution?.write
      if (write) next.nodes!.push(nodeFor(b.id, cap.name))
      return { ...b, enabled: true, displayName: cap.name.slice(0, 10), write, retry: write && !cap.execution?.idempotent ? 0 : b.retry, requiresConfirmation: write, confirmationFields: cap.parameters?.map(p => p.key) ?? [] }
    })
    onChange(next); setPending(undefined)
  }
  return <div className={`expert-resources is-${kind}`}>
    <div className={`expert-resource-toolbar${captainSkill ? ' captain-resource-toolbar' : ''}`}>{selected.length > 0 && !captainSkill && <p>已添加 {selected.length} 个{label}</p>}{(role === 'expert' || !selected.length) && <Button icon={Plus} disabled={disabled} onClick={() => setPending(selected.map(b => b.id))}>{role === 'expert' ? `添加${label}` : '补齐内置能力'}</Button>}</div>
    {!selected.length && <div className="expert-resource-empty">{captainSkill ? '尚未绑定内置协作能力，需补齐后再随团队发布。' : kind === 'builtin' ? '尚未添加，可先使用模型回答。' : '尚未添加，需要固定工作流程时再配置。'}</div>}
    {kind === 'builtin' ? selected.map(b => {
      const cap = catalog.find(cap => cap.id === b.id)!
      const invalid = unavailable(cap) || (!cap.execution?.versions.includes(b.version) ? '固定版本不可用' : undefined)
      const locked = disabled || !!invalid || b.enabled === false
      const required = toolNeedsConfirmation(b)
      return <article className={`expert-tool-card ${b.enabled === false ? 'is-off' : ''}`} key={b.id} aria-label={`${cap.name}配置`}>
        <header><div><strong>{cap.name}</strong><small className="expert-resource-version">v{b.version}</small>{cap.execution?.write && <span className="expert-write-mark">会修改数据</span>}<p>{cap.description}</p></div><label className="campus-check"><input type="checkbox" role="switch" aria-label={`启用 ${cap.name}`} checked={b.enabled !== false} disabled={disabled || !!invalid} onChange={e => update(b, { enabled: e.target.checked })} />启用</label><IconButton icon={Xmark} label={`移除 ${cap.name}`} disabled={disabled} onClick={() => onChange(selectCapabilities(c, c.tools.filter(item => item.id !== b.id).map(item => item.id)))} /></header>
        {invalid && <p className="expert-resource-warning">{invalid}，请移除或更换后发布；草稿可以保留。</p>}
        <div className="expert-tool-options"><Field label="显示名称"><input aria-label={`${cap.name}显示名称`} maxLength={10} value={toolDisplayName(b, cap)} disabled={locked} onChange={e => update(b, { displayName: e.target.value })} /></Field><div><span className="expert-option-label">执行前确认</span><label className="campus-check"><input type="checkbox" role="switch" aria-label={`${cap.name}需要确认`} checked={required} disabled={locked || b.write} onChange={e => setConfirmation(b, e.target.checked)} />{b.write ? '修改数据时必须确认' : '先让用户确认'}</label></div></div>
        {cap.execution?.write && <div className="expert-tool-actions"><span>允许操作</span><label className="campus-check"><input type="checkbox" aria-label={`允许读取 ${cap.name}`} checked={b.read} disabled={locked} onChange={e => update(b, { read: e.target.checked })} />读取</label><label className="campus-check"><input type="checkbox" aria-label={`允许写入 ${cap.name}`} checked={b.write} disabled={locked} onChange={e => onChange({ tools: c.tools.map(item => item.id === b.id ? { ...item, write: e.target.checked, requiresConfirmation: e.target.checked, retry: e.target.checked && !cap.execution?.idempotent ? 0 : item.retry } : item), nodes: e.target.checked ? c.nodes.some(n => n.tool === b.id) ? c.nodes : [...c.nodes, nodeFor(b.id, cap.name)] : c.nodes.filter(n => n.tool !== b.id) })} />{cap.execution.action || '修改或发送'}</label></div>}
        {required && <div className="expert-tool-reviewer">{c.nodes.filter(n => n.tool === b.id).map(node => <Field key={node.id} label="由谁确认"><select aria-label={`${cap.name}由谁确认`} disabled={locked} value={node.approver} onChange={e => onChange({ nodes: c.nodes.map(n => n.id === node.id ? { ...n, approver: e.target.value } : n) })}><option value="发起人">发起任务的人</option><option value="发起人指定">由发起人指定</option><option value="指定审核角色">审核人员</option></select></Field>)}{!c.nodes.some(n => n.tool === b.id) && <Button disabled={locked} onClick={() => setConfirmation(b, true)}>补齐前置确认</Button>}</div>}
        {required && <div className="expert-confirm-fields"><span>确认时展示</span>{(cap.parameters ?? []).map(p => <label className="campus-check" key={p.key}><input type="checkbox" disabled={locked} aria-label={`${cap.name}确认展示${p.label}`} checked={b.confirmationFields === undefined || b.confirmationFields.includes(p.key)} onChange={e => update(b, { confirmationFields: e.target.checked ? [...(b.confirmationFields ?? cap.parameters!.map(p => p.key)), p.key] : (b.confirmationFields ?? cap.parameters!.map(p => p.key)).filter(key => key !== p.key) })} />{p.label}</label>)}</div>}
        {!!cap.permissionRequirements.length && <div className="expert-tool-access"><Field label="使用账号"><select aria-label={`${cap.name}使用的账号`} disabled={locked} value={b.auth} onChange={e => update(b, { auth: e.target.value as ToolAccess['auth'] })}><option value="user">使用者账号</option><option value="platform">服务账号</option></select></Field><Field label="资料范围"><select aria-label={`${cap.name}可访问的资料`} disabled={locked} value={b.scope} onChange={e => update(b, { scope: e.target.value as ToolAccess['scope'] })}><option value="user">使用者可见</option><option value="platform">批准的共享资料</option></select></Field>{b.scope === 'platform' && <Field label="共享资料批准依据" required><input aria-label={`${cap.name}批准依据`} disabled={locked} value={b.approval} placeholder="说明批准人和允许访问的资料" onChange={e => update(b, { approval: e.target.value })} /></Field>}</div>}
        {b.timeout !== 10 || b.retry !== (b.write && !cap.execution?.idempotent ? 0 : 2) || b.exception ? <p className="expert-resource-note">已有运行保护：等待 {b.timeout} 秒，重试 {b.retry} 次{b.exception && `；${b.exception}`}。</p> : null}
        {b.enabled === false && <p className="expert-resource-note">已暂停使用，显示名称与权限配置已保留。</p>}
      </article>
    }) : <>
      {!!selected.length && role === 'expert' && <p className="expert-resource-note">按任务选择或组合 Skill，无固定执行顺序。所需工具必须逐项启用，版本更新后重新核对配置。</p>}
      {selected.map(b => <div key={b.id} className="expert-skill-item">{captainSkill ? <section className="captain-workflow" aria-label="队长协作流程">
        <ol>{catalog.find(cap => cap.id === b.id)?.execution?.toolActions?.map(action => <li key={action.id}><strong>{action.name}</strong><p>{captainActionNotes[action.id]}</p></li>)}</ol>
        <div className="captain-workflow-source"><span>平台内置 · 固定 v{b.version}{b.enabled === false ? ' · 未启用' : ''}</span><Button variant="ghost" onClick={() => setDetail(catalog.find(cap => cap.id === b.id))}>查看协作规范</Button></div>
        {(unavailable(catalog.find(cap => cap.id === b.id)!) || !catalog.find(cap => cap.id === b.id)?.execution?.versions.includes(b.version)) && <Notice tone="warning">当前固定版本不可用，请先核对能力目录。</Notice>}
      </section> : role === 'expert' ? <CapabilityFields config={c} onChange={onChange} disabled={disabled} promptOutput onlyIds={[b.id]} cardAction={() => <Button onClick={() => setDetail(catalog.find(cap => cap.id === b.id))}>查看 Skill 原文</Button>} /> : <div className="platform-skill-summary"><div className="campus-row"><strong>{catalog.find(cap => cap.id === b.id)?.name}</strong><span>平台内置 · 固定 v{b.version}</span><Button onClick={() => setDetail(catalog.find(cap => cap.id === b.id))}>查看 Skill 原文</Button></div><p>{catalog.find(cap => cap.id === b.id)?.description}</p><details className="expert-foldout"><summary>查看内置执行规则（只读）</summary><CapabilityFields config={c} onChange={onChange} disabled promptOutput onlyIds={[b.id]} /></details></div>}</div>)}

    </>}
    {kind === 'builtin' && selected.length > 15 && <Notice tone="warning">工具较多，建议只保留当前工作需要的操作。</Notice>}
    {pending && <div className="expert-resource-dialog"><Modal title={`添加${label}`} onClose={() => setPending(undefined)}><p className="expert-resource-note">选择专家需要的{label}，添加后可继续调整。列表可滚动，已选项会保留。</p><CapabilityPicker singleKind capabilities={catalog} selectedIds={pending} selectedVersions={Object.fromEntries(selected.map(b => [b.id, b.version]))} onChange={setPending} disabledReason={cap => unavailable(cap) || (!pending.includes(cap.id) && pending.length + c.tools.length - selected.length >= MAX_AGENT_CAPABILITIES ? '已达能力数量上限' : undefined)} /><footer><Button onClick={() => setPending(undefined)}>取消</Button><Button variant="primary" disabled={disabled} onClick={apply}>确认选择（{pending.length}）</Button></footer></Modal></div>}
    {detail && <div className="expert-skill-detail expert-dialog"><Modal title={detail.name} onClose={() => setDetail(undefined)}><p>{detail.description}</p><p className="expert-resource-note">只读工作规范 · 当前固定 v{c.tools.find(b => b.id === detail.id)?.version} · 来自技能包原文</p>{detail.skillVersionIds.map(id => <section key={id}><h3>{id.replace(/^skill\./, '').replace(/\.v\d+$/, '')}</h3><pre>{c.tools.find(b => b.id === detail.id)?.version === String(detail.version) ? contentFor(id) ?? '当前目录尚未提供此版本的工作规范正文。' : '当前目录尚未提供此固定版本的工作规范正文，请核对版本后再更新引用。'}</pre></section>)}<footer><Button onClick={() => { setDetail(undefined); navigate('/capabilities') }}>前往能力中心</Button><Button onClick={() => setDetail(undefined)}>关闭</Button></footer></Modal></div>}
  </div>
}
