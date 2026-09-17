import { useState, type ReactNode } from 'react'
import { Plus, Xmark } from 'iconoir-react'
import { CAPABILITY_PAGE_SIZE, isBuiltinCapability, searchCapabilities } from '../capability-search'
import { Button, Field, IconButton, Modal, Notice, SearchField } from '../components'
import { knowledgeExamples } from '../agent-experience'
import { MAX_AGENT_CAPABILITIES, type Capability } from '../shared'
import { actionKey, binding, capabilityCatalog, clone, selectCapabilities, skillActions, type ActionBinding, type Binding, type Config, type ToolAccess } from './model'
import './capability-fields.css'

type Execution = NonNullable<Capability['execution']>
type ToolDefinition = NonNullable<Execution['toolActions']>[number] & { required?: boolean; active?: boolean }
type CatalogEntry = Omit<Capability, 'execution'> & { execution?: Omit<Execution, 'toolActions'> & { mcpService?: { id: string; connection: 'available' | 'unavailable' }; toolActions?: ToolDefinition[] } }
type ResourceKind = 'all' | 'knowledge' | 'skill' | 'builtin' | 'mcp'
const isMcp = (cap?: CatalogEntry) => !!cap?.execution?.mcpService
const resourceKind = (cap: CatalogEntry): ResourceKind => isMcp(cap) ? 'mcp' : isBuiltinCapability(cap) ? 'builtin' : 'skill'
const kindLabels = { all: '全部', knowledge: '知识库', skill: '工作技能', builtin: '常用工具', mcp: '业务系统 · MCP' }
const confirmation = (key: string, name: string) => ({ id: crypto.randomUUID(), name: `${name}前确认`, trigger: `${name}之前`, approver: '发起人', tool: key })

function Check({ label, text = label, checked, onChange, disabled }: { label: string; text?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="campus-check"><input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{text}</span></label>
}

/** The catalog stays in the add dialog; saved permissions remain directly editable in the form. */
export function CapabilityFields({ config: c, onChange, disabled = false, promptOutput = false, onlyIds, cardAction, consumer = false, capabilities = capabilityCatalog }: { config: Config; onChange: (partial: Partial<Config>) => void; disabled?: boolean; promptOutput?: boolean; onlyIds?: string[]; cardAction?: (binding: Binding) => ReactNode; consumer?: boolean; capabilities?: Capability[] }) {
  const catalog = capabilities as CatalogEntry[]
  const [selection, setSelection] = useState<Config>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ResourceKind>('all')
  const [page, setPage] = useState(0)
  const knowledgeIds = onlyIds ? [] : c.expert?.knowledgeIds ?? []
  const unavailable = (cap: CatalogEntry) => cap.imported?.status === 'pending-tools' ? '待补充工具定义' : !cap.execution?.active ? '已停用' : !consumer && cap.execution.departments && !cap.execution.departments.includes(c.department) ? '本部门不可添加' : cap.execution.mcpService?.connection === 'unavailable' ? '连接不可用' : !isBuiltinCapability(cap) && !cap.execution.toolActions ? '工具信息待完善' : undefined
  const remove = (id: string) => onChange(selectCapabilities(c, c.tools.filter(b => b.id !== id).map(b => b.id), catalog))
  const update = (id: string, patch: Partial<Binding>) => onChange({ tools: c.tools.map(b => b.id === id ? { ...b, ...patch } : b) })
  const updateAction = (b: Binding, action: ActionBinding, patch: Partial<ActionBinding>) => update(b.id, { actions: skillActions(b, catalog).map(item => item.id === action.id ? { ...item, ...patch } : item) })
  const openPicker = () => { setSelection(clone(c)); setQuery(''); setFilter('all'); setPage(0) }
  const patchSelection = (patch: Partial<Config>) => setSelection(current => current && ({ ...current, ...patch }))
  const toggleAction = (cap: CatalogEntry, definition: ToolDefinition, enabled: boolean, base = c, commit = onChange) => {
    const existing = base.tools.find(b => b.id === cap.id)
    if (enabled && (disabled || unavailable(cap) || definition.active === false || existing && !cap.execution?.versions.includes(existing.version) || !existing && base.tools.length >= MAX_AGENT_CAPABILITIES)) return
    const b = existing ?? { ...binding(cap.id, catalog), read: false, write: false }
    const actions = skillActions(b, catalog).map(action => action.id === definition.id ? { ...action, enabled, retry: definition.write && !definition.idempotent ? 0 : action.retry } : action)
    const keep = !isMcp(cap) || actions.some(action => action.enabled)
    const tools = existing ? base.tools.flatMap(item => item.id === cap.id ? keep ? [{ ...item, actions }] : [] : [item]) : [...base.tools, { ...b, actions }]
    const key = actionKey(cap.id, definition.id)
    const nodes = enabled && definition.write ? base.nodes.some(node => node.tool === key) ? base.nodes : [...base.nodes, confirmation(key, definition.name)] : base.nodes.filter(node => node.tool !== key)
    commit({ tools, nodes })
  }

  const policyRow = ({ name, key, access, write, idempotent, patch, readOnly, control, extra }: { name: string; key: string; access?: ToolAccess; write: boolean; idempotent: boolean; patch: (value: Partial<ToolAccess>) => void; readOnly: boolean; control: ReactNode; extra?: ReactNode }) => {
    const nodes = c.nodes.filter(node => node.tool === key)
    const missingConfirmation = write && !nodes.some(node => node.name.trim() && node.trigger.trim())
    return <div className="capability-policy-row">
      <div className="capability-tool-name">{control}{write && <small>修改或发送前确认</small>}</div>
      {access ? <>
        <label className="capability-policy-cell"><span>使用账号</span><select aria-label={`${name}使用的账号`} disabled={disabled || readOnly} value={access.auth} onChange={event => patch({ auth: event.target.value as ToolAccess['auth'] })}><option value="user">使用者账号</option><option value="platform">服务账号</option></select></label>
        <label className="capability-policy-cell"><span>资料范围</span><select aria-label={`${name}可访问的资料`} disabled={disabled || readOnly} value={access.scope} onChange={event => patch({ scope: event.target.value as ToolAccess['scope'] })}><option value="user">使用者可见</option><option value="platform">批准的共享资料</option></select></label>
        <div className="capability-policy-cell"><span>执行前确认</span>{write ? <>{nodes.map(node => <select key={node.id} aria-label={`${name}由谁确认`} disabled={disabled || readOnly} value={node.approver} onChange={event => onChange({ nodes: c.nodes.map(item => item.id === node.id ? { ...item, approver: event.target.value } : item) })}><option value="发起人">发起任务的人</option>{!consumer && <><option value="发起人指定">由发起人指定</option><option value="指定审核角色">审核人员</option></>}{consumer && node.approver !== '发起人' && <option value={node.approver}>原设置：{node.approver}</option>}</select>)}{missingConfirmation && <Button disabled={disabled || readOnly} onClick={() => onChange({ nodes: [...c.nodes.filter(node => node.tool !== key), confirmation(key, name)] })}>补齐前置确认</Button>}</> : <p>无需确认</p>}</div>
        {access.scope === 'platform' && <Field className="capability-policy-extra" label={`${name}批准依据`} required><input aria-label={`${name}批准依据`} disabled={disabled || readOnly} value={access.approval} onChange={event => patch({ approval: event.target.value })} placeholder="谁批准了哪些共享资料？例如：信息化处批准查询公开会议资料" /></Field>}
        {(access.timeout !== 10 || access.retry !== (write && !idempotent ? 0 : 2) || access.exception) && <p className="capability-policy-extra capability-override">已有运行保护：等待 {access.timeout} 秒，重试 {access.retry} 次{access.exception && `；${access.exception}`}。</p>}
      </> : <p className="capability-policy-inactive">{readOnly ? '当前不可用' : '启用后可设置账号与权限'}</p>}
      {extra && <div className="capability-policy-extra capability-row-note">{extra}</div>}
    </div>
  }

  const matches = searchCapabilities(catalog.filter(cap => (!consumer || !cap.id.startsWith('capability.campus-')) && (filter === 'all' || resourceKind(cap) === filter)), query, 'all') as CatalogEntry[]
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean)
  const knowledgeMatches = c.expert && (filter === 'all' || filter === 'knowledge') ? knowledgeExamples.filter(k => terms.every(term => `${k.name} ${k.description}`.toLowerCase().includes(term))) : []
  const results = [...knowledgeMatches.map(knowledge => ({ knowledge, cap: undefined })), ...matches.map(cap => ({ cap, knowledge: undefined }))]
  const pages = Math.max(1, Math.ceil(results.length / CAPABILITY_PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const pending: { id: string; name: string; remove: () => void }[] = selection ? [
    ...(selection.expert?.knowledgeIds ?? []).filter(id => !knowledgeIds.includes(id)).map(id => ({ id, name: knowledgeExamples.find(k => k.id === id)?.name ?? id, remove: () => patchSelection({ expert: { ...selection.expert!, knowledgeIds: selection.expert!.knowledgeIds.filter(value => value !== id) } }) })),
    ...selection.tools.flatMap(b => {
    const cap = catalog.find(cap => cap.id === b.id)
    const prior = c.tools.find(item => item.id === b.id)
    if (!cap) return []
    if (isMcp(cap)) return (cap.execution?.toolActions ?? []).filter(definition => skillActions(b, catalog).some(action => action.id === definition.id && action.enabled) && !(prior && skillActions(prior, catalog).some(action => action.id === definition.id && action.enabled))).map(definition => ({ id: actionKey(b.id, definition.id), name: `${cap.name}：${definition.name}`, remove: () => toggleAction(cap, definition, false, selection, patchSelection) }))
    return prior ? [] : [{ id: b.id, name: cap.name, remove: () => patchSelection(selectCapabilities(selection, selection.tools.filter(item => item.id !== b.id).map(item => item.id), catalog)) }]
  })] : []
  const pendingCount = pending.length

  return <div className="campus-capability-fields">
    {!onlyIds && <div className="capability-selection-toolbar"><div><strong>{c.tools.length || knowledgeIds.length ? `已添加 ${c.tools.length} 项能力${c.expert ? `、${knowledgeIds.length} 个知识库` : ''}` : '按需添加，稍后也能调整'}</strong><p>查资料、处理材料或连接业务系统，选择专家实际需要的能力。</p></div><Button icon={Plus} variant="primary" disabled={disabled} onClick={openPicker}>添加能力</Button></div>}
    {!c.tools.length && !knowledgeIds.length && <div className="capability-empty">暂未添加。专家可以先根据用户提供的内容回答问题。</div>}
    {c.expert && <div data-expert-field="knowledge" className="capability-knowledge-list">{knowledgeIds.map(id => {
      const k = knowledgeExamples.find(k => k.id === id)
      return <article key={id} className="capability-knowledge-item"><div><strong>{k?.name ?? '不可用知识库'}</strong><span>知识库 · {k ? `${k.count} 篇示例文档` : id}</span></div><IconButton icon={Xmark} label={`移除知识库 ${k?.name ?? id}`} disabled={disabled} onClick={() => onChange({ expert: { ...c.expert!, knowledgeIds: knowledgeIds.filter(value => value !== id) } })} /></article>
    })}</div>}
    {!onlyIds && c.tools.length > 0 && <p className="capability-permission-guide">默认使用使用者自己的账号，仅访问其可见资料。发送或修改内容须先确认；内容改变后重新确认，失败后避免重复提交。</p>}
    {c.tools.filter(b => !onlyIds || onlyIds.includes(b.id)).map(b => {
      const cap = catalog.find(item => item.id === b.id)
      if (!cap) return <Notice key={b.id} tone="warning">能力 {b.id} 已不可用。<Button disabled={disabled} onClick={() => remove(b.id)}>移除 {b.id}</Button></Notice>
      const readOnly = !!unavailable(cap) || !cap.execution?.versions.includes(b.version)
      const definitions = cap.execution?.toolActions ?? []
      const hasAccess = !isBuiltinCapability(cap) || cap.toolVersionIds.length > 0 || cap.permissionRequirements.length > 0
      return <section className="capability-config-card" key={b.id} aria-label={`${cap.name}配置`}>
        <header><div><h3><strong>{cap.name}{!isMcp(cap) && ` · v${b.version}`}</strong><span>{kindLabels[resourceKind(cap)]}</span></h3><p>{cap.description}</p></div><div className="capability-config-actions">{cardAction?.(b)}{cap.execution && cap.execution.versions.length > 1 ? <select aria-label={`${cap.name}版本`} disabled={disabled || readOnly} value={b.version} onChange={event => update(b.id, { version: event.target.value })}>{!cap.execution.versions.includes(b.version) && <option value={b.version}>v{b.version}（不可用）</option>}{cap.execution.versions.map(version => <option key={version} value={version}>v{version}</option>)}</select> : isMcp(cap) && <small>v{b.version}</small>}<IconButton icon={Xmark} label={`移除 ${cap.name}`} disabled={disabled} onClick={() => remove(b.id)} /></div></header>
        {readOnly && <p className="capability-unavailable">{unavailable(cap) || '固定版本不可用'}，已有设置保留，可移除此能力。</p>}
        {hasAccess && <div className="capability-policy-heading" aria-hidden="true"><span>允许使用的工具</span><span>使用账号</span><span>资料范围</span><span>执行前确认</span></div>}
        {isBuiltinCapability(cap) ? hasAccess ? policyRow({ name: cap.name, key: b.id, access: b, write: b.write, idempotent: !!cap.execution?.idempotent, patch: patch => update(b.id, patch), readOnly,
          control: <>{!(cap.imported?.definition?.type === 'tool' && cap.execution?.write) && <Check label={`允许读取 ${cap.name}`} text="读取资料" checked={b.read} disabled={disabled || readOnly} onChange={read => update(b.id, { read })} />}{cap.execution?.write && <Check label={`允许写入 ${cap.name}`} text={cap.execution.action || '修改或发送'} checked={b.write} disabled={disabled || readOnly} onChange={write => onChange({ tools: c.tools.map(item => item.id === b.id ? { ...item, write, retry: write && !cap.execution?.idempotent ? 0 : item.retry } : item), nodes: write ? c.nodes.some(node => node.tool === b.id) ? c.nodes : [...c.nodes, confirmation(b.id, cap.execution?.action || cap.name)] : c.nodes.filter(node => node.tool !== b.id) })} />}</>
        }) : <div className="capability-local-note"><Check label={`允许读取 ${cap.name}`} text="使用此能力" checked={b.read} disabled={disabled || readOnly} onChange={read => update(b.id, { read })} /><span>直接处理用户提供的内容，无需连接外部系统。</span></div> : definitions.map(definition => {
          const action = skillActions(b, catalog).find(item => item.id === definition.id)
          const enabled = !!action?.enabled
          const blocked = readOnly || definition.active === false
          const others = c.tools.filter(other => other.id !== b.id && skillActions(other, catalog).some(item => item.id === definition.id && item.enabled))
          return <article key={definition.id} aria-label={`${cap.name}工具：${definition.name}`}>{policyRow({ name: definition.name, key: actionKey(b.id, definition.id), access: enabled ? action : undefined, write: enabled && definition.write, idempotent: definition.idempotent, patch: patch => action && updateAction(b, action, patch), readOnly: blocked,
            control: <Check label={`启用 ${definition.name}`} text={definition.name} checked={enabled} disabled={disabled || blocked && !enabled} onChange={value => toggleAction(cap, definition, value)} />,
            extra: <>{definition.required && !enabled && !isMcp(cap) && <p className="capability-unavailable">完成这项工作需要「{definition.name}」，请启用此工具。</p>}{definition.active === false && <p>工具已停用，已有设置保留，可取消勾选。</p>}{enabled && others.length > 0 && <p>同一工具还由 {others.map(other => catalog.find(item => item.id === other.id)?.name ?? other.id).join('、')} 使用；这里的权限单独设置。</p>}</>
          })}</article>
        })}
      </section>
    })}
    {!onlyIds && (c.tools.length > 0 || knowledgeIds.length > 0) && <div className="capability-selection-footer"><span>能力 {c.tools.length}/{MAX_AGENT_CAPABILITIES}{c.expert && ` · 知识库 ${knowledgeIds.length}/10`}</span><Button variant="ghost" disabled={disabled} onClick={() => onChange({ ...selectCapabilities(c, [], catalog), ...(c.expert ? { expert: { ...c.expert, knowledgeIds: [] } } : {}) })}>清空全部能力</Button></div>}
    {!promptOutput && <Notice>交付前确认在“输出”分区维护；这里的确认只关联具体工具执行。</Notice>}
    {selection && <div className="capability-library"><Modal title="添加能力" onClose={() => setSelection(undefined)}>
      <p className="capability-library-intro">选择知识、工作方法或工具。确认添加后，在表单中直接调整权限。</p>
      <div className="capability-library-toolbar" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) event.preventDefault() }}><SearchField label="搜索能力" placeholder="搜索要做的事，例如安排会议、查找文档" value={query} onChange={value => { setQuery(value); setPage(0) }} /><div className="capability-library-filters" aria-label="能力类别">{(Object.keys(kindLabels) as ResourceKind[]).filter(kind => kind !== 'knowledge' || !!c.expert).map(kind => <button key={kind} type="button" aria-pressed={kind === filter} onClick={() => { setFilter(kind); setPage(0) }}>{kindLabels[kind]}</button>)}</div></div>
      <div className="capability-library-results" aria-label="可添加能力">
        {results.slice(currentPage * CAPABILITY_PAGE_SIZE, (currentPage + 1) * CAPABILITY_PAGE_SIZE).map(({ cap, knowledge: k }) => {
          if (k) {
            const selected = selection.expert!.knowledgeIds.includes(k.id)
            const existing = knowledgeIds.includes(k.id)
            return <article className="capability-library-item" key={k.id}><Check label={`知识库：${k.name}`} text={k.name} checked={selected} disabled={disabled || existing || !selected && selection.expert!.knowledgeIds.length >= 10} onChange={value => patchSelection({ expert: { ...selection.expert!, knowledgeIds: value ? [...selection.expert!.knowledgeIds, k.id] : selection.expert!.knowledgeIds.filter(id => id !== k.id) } })} /><span>{existing ? '已添加' : '知识库'}</span><p>{k.description} · {k.count} 篇示例文档</p></article>
          }
          const b = selection.tools.find(b => b.id === cap!.id)
          const existing = c.tools.find(b => b.id === cap!.id)
          const blocked = unavailable(cap!) || (existing && !cap!.execution?.versions.includes(existing.version) ? '固定版本不可用' : undefined)
          const limit = !b && selection.tools.length >= MAX_AGENT_CAPABILITIES
          return <article className="capability-library-item" key={cap!.id} aria-label={cap!.name}>
            {isMcp(cap) ? <strong>{cap!.name}</strong> : <Check label={cap!.name} checked={!!b} disabled={disabled || !!existing || !b && (!!blocked || limit)} onChange={value => patchSelection(selectCapabilities(selection, value ? [...selection.tools.map(b => b.id), cap!.id] : selection.tools.filter(b => b.id !== cap!.id).map(b => b.id), catalog))} />}
            <span>{blocked || (existing ? '已添加' : kindLabels[resourceKind(cap!)])}{limit && ' · 已达上限'}</span><p>{cap!.description}</p>
            {isMcp(cap) && <div className="capability-library-tools">{cap!.execution?.toolActions?.map(definition => {
              const enabled = !!b && skillActions(b, catalog).some(action => action.id === definition.id && action.enabled)
              const added = !!existing && skillActions(existing, catalog).some(action => action.id === definition.id && action.enabled)
              return <div key={definition.id}><Check label={`启用 ${definition.name}`} text={definition.name} checked={enabled} disabled={disabled || added || !enabled && (!!blocked || limit || definition.active === false)} onChange={value => toggleAction(cap!, definition, value, selection, patchSelection)} /><small>{definition.write ? '修改前确认' : '只读'}{added && ' · 已添加'}</small></div>
            })}</div>}
          </article>
        })}
        {!results.length && <div className="capability-library-empty"><strong>没有找到匹配的能力</strong><p>试试其他关键词，已勾选的项目会保留。</p><Button onClick={() => { setQuery(''); setFilter('all'); setPage(0) }}>清除搜索与筛选</Button></div>}
      </div>
      {pendingCount > 0 && <div className="capability-library-pending" aria-label="本次选择"><span>本次选择</span><ul>{pending.map(item => <li key={item.id}><span>{item.name}</span><IconButton icon={Xmark} label={`取消选择 ${item.name}`} disabled={disabled} onClick={item.remove} /></li>)}</ul></div>}
      <div className="capability-library-pagination"><span role="status">共 {results.length} 项 · 新选 {pendingCount} 项</span><div><Button aria-label="能力上一页" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage + 1}/{pages}</span><Button aria-label="能力下一页" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div>
      <footer><span>取消不会改变表单，添加后记得保存草稿。</span><Button onClick={() => setSelection(undefined)}>取消</Button><Button variant="primary" disabled={disabled || !pendingCount} onClick={() => { onChange({ tools: selection.tools, nodes: selection.nodes, ...(c.expert ? { expert: { ...c.expert, knowledgeIds: selection.expert!.knowledgeIds } } : {}) }); setSelection(undefined) }}>添加所选（{pendingCount}）</Button></footer>
    </Modal></div>}
  </div>
}
