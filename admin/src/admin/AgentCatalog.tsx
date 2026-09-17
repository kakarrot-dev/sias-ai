import { useRef, useState } from 'react'
import { ArrowRight, Check, List, Plus, Sparks, Upload } from 'iconoir-react'
import { AgentActions } from './AgentManagement'
import { agentAsset } from './agent-management'
import { agentLifecycle, channelLabels } from './agent-experience'
import { Button, Empty, Field, Modal, Notice, PageHeader, SearchField, Tag, formatTime } from './components'
import { prototypeStore } from './prototype-store'
import { activeVersion, hasDraftChanges, purposeLabels, type AdminState, type AgentConfig, type Entity } from './shared'
import './AgentManagement.css'

type Props = { data: AdminState; navigate: (path: string) => void; reload: () => Promise<void>; notify: (message: string) => void }
export function AgentStateBadge({ entity }: { entity: Entity<AgentConfig> }) {
  const state = agentLifecycle(entity)
  return <span className={`badge badge--${state.tone}`}><i />{state.label}</span>
}

export function AgentList({ data, navigate, reload, notify }: Props) {
  const [bucket, setBucket] = useState('active')
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState('all')
  const [purpose, setPurpose] = useState('all')
  const [model, setModel] = useState('all')
  const [owner, setOwner] = useState('all')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState<'cards' | 'table'>(() => { try { return localStorage.getItem('admin-agent-view') === 'table' ? 'table' : 'cards' } catch { return 'cards' } })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const imported = useRef<string | undefined>(undefined)
  const active = data.agents.filter(e => agentAsset(e).status === 'active')
  const counts = { active: active.length, archived: data.agents.length - active.length, deleted: data.deletedAgents?.length ?? 0 }
  const stats = [
    { id: 'all', label: '全部智能体', value: active.length, hint: '常用目录中的智能体' },
    { id: 'published', label: '已发布', value: active.filter(e => e.activeVersionId && !e.disabled).length, hint: '有可使用的发布版本' },
    { id: 'draft', label: '待发布草稿', value: active.filter(e => !e.activeVersionId && !e.disabled).length, hint: '继续配置，准备发布' },
    { id: 'changes', label: '有未发布修改', value: active.filter(e => e.activeVersionId && !e.disabled && hasDraftChanges(e)).length, hint: '更新后记得重新发布' }
  ]
  const filtered = (bucket === 'deleted' ? data.deletedAgents ?? [] : data.agents.filter(e => agentAsset(e).status === bucket)).filter(e => {
    const a = agentAsset(e)
    return `${a.name} ${a.displayDescription} ${purposeLabels[e.draft.purpose]} ${a.tags.join(' ')} ${a.owner} ${e.id}`.toLowerCase().includes(query.trim().toLowerCase()) && (purpose === 'all' || e.draft.purpose === purpose) && (model === 'all' || e.draft.modelId === model) && (owner === 'all' || a.owner === owner) && (version === 'all' || (version === 'published' ? !!e.activeVersionId && !e.disabled : version === 'checked' ? !!e.validation && !e.validation.issues.length : agentLifecycle(e).key === version))
  }).sort((a, b) => sort === 'name' ? agentAsset(a).name.localeCompare(agentAsset(b).name, 'zh-CN') : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt))
  const size = view === 'cards' ? 6 : 8
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / size) - 1))
  const rows = filtered.slice(currentPage * size, (currentPage + 1) * size)
  const hasFilter = !!query || version !== 'all' || purpose !== 'all' || model !== 'all' || owner !== 'all'
  const clear = () => { setQuery(''); setVersion('all'); setPurpose('all'); setModel('all'); setOwner('all'); setPage(0) }
  const switchView = (value: 'cards' | 'table') => { setView(value); setPage(0); try { localStorage.setItem('admin-agent-view', value) } catch { /* Cosmetic preference only. */ } }
  const doImport = async () => {
    setBusy(true); setError('')
    try {
      if (!imported.current) {
        const value = JSON.parse(importText)
        const result = prototypeStore().importAgent(value, importName)
        imported.current = result.id
      }
      await reload(); setImportOpen(false); notify('已导入为新草稿，请检查资源与使用范围'); navigate(`/agents/${imported.current}/edit`)
    } catch (e) { setError(imported.current ? '导入已保存，页面读取失败；重试不会重复创建。' : e instanceof SyntaxError ? 'JSON 格式不正确，请检查括号、引号和逗号。' : e instanceof Error ? e.message : '导入失败，请检查配置内容') }
    finally { setBusy(false) }
  }
  const actions = (e: Entity<AgentConfig>) => <div className="agent-row-actions">{!e.deletedAt && agentAsset(e).status === 'active' ? <><Button variant="ghost" onClick={() => navigate(`/agents/${e.id}/edit`)}>编辑<ArrowRight width={13} /></Button></> : <Button variant="ghost" onClick={() => navigate(`/agents/${e.id}`)}>查看</Button>}<AgentActions entity={e} data={data} navigate={navigate} reload={reload} notify={notify} /></div>
  return <div className="agent-center"><PageHeader eyebrow="把重复的工作，交给可靠的助手" title="智能体中心" description="定义工作、准备知识与工具，让智能体按你的方式提供帮助。"><Button icon={Upload} onClick={() => { setImportOpen(true); setError(''); setImportText(''); setImportName(''); imported.current = undefined }}>导入配置</Button><Button variant="primary" icon={Plus} onClick={() => navigate('/agents/new')}>创建智能体</Button></PageHeader>
    <div className="agent-overview-strip" aria-label="智能体概览">{stats.map(s => <button key={s.id} aria-pressed={bucket === 'active' && version === s.id} onClick={() => { clear(); setBucket('active'); setVersion(s.id) }}><span>{s.label}<ArrowRight width={14} /></span><strong>{s.value.toString().padStart(2, '0')}</strong><small>{s.hint}</small></button>)}</div>
    <div className="agent-catalog catalog-panel"><div className="catalog-tabs" role="tablist" aria-label="资产目录">{[['active', '常用目录'], ['archived', '已归档'], ['deleted', '回收站']].map(([id, label]) => <button key={id} role="tab" aria-selected={bucket === id} className={bucket === id ? 'is-active' : ''} onClick={() => { setBucket(id); setVersion('all'); setPage(0) }}>{label}<span>{counts[id as keyof typeof counts]}</span></button>)}</div>
      <div className="table-toolbar"><SearchField value={query} onChange={v => { setQuery(v); setPage(0) }} placeholder="搜索智能体、用途、标签或负责人" /><div className="filters"><select aria-label="筛选版本状态" value={version} onChange={e => { setVersion(e.target.value); setPage(0) }}><option value="all">全部状态</option><option value="published">已发布</option><option value="draft">待发布草稿</option><option value="changes">有未发布修改</option><option value="offline">已下线</option><option value="checked">检查已通过</option></select><Button aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>更多筛选{[purpose, model, owner].filter(v => v !== 'all').length > 0 && <span> · {[purpose, model, owner].filter(v => v !== 'all').length}</span>}</Button><select aria-label="排序方式" value={sort} onChange={e => { setSort(e.target.value); setPage(0) }}><option value="updated">最近修改</option><option value="created">最近创建</option><option value="name">名称排序</option></select><div className="agent-view-switch" aria-label="显示方式"><button aria-label="卡片视图" aria-pressed={view === 'cards'} onClick={() => switchView('cards')}><span className="agent-grid-icon"><i /><i /><i /><i /></span></button><button aria-label="表格视图" aria-pressed={view === 'table'} onClick={() => switchView('table')}><List width={18} /></button></div></div></div>
      {filtersOpen && <div className="agent-expanded-filters"><Field label="使用方式"><select aria-label="筛选用途" value={purpose} onChange={e => { setPurpose(e.target.value); setPage(0) }}><option value="all">全部用途</option>{Object.entries(purposeLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="模型"><select aria-label="筛选模型" value={model} onChange={e => { setModel(e.target.value); setPage(0) }}><option value="all">全部模型</option>{data.models.map(m => <option key={m.modelId}>{m.modelId}</option>)}</select></Field><Field label="负责人"><select aria-label="筛选负责人" value={owner} onChange={e => { setOwner(e.target.value); setPage(0) }}><option value="all">所有负责人</option>{[...new Set(data.agents.map(e => agentAsset(e).owner))].map(o => <option key={o}>{o}</option>)}</select></Field></div>}
      {hasFilter && <div className="agent-filter-result"><span>找到 {filtered.length} 个智能体</span><Button variant="ghost" onClick={clear}>清除筛选</Button></div>}
      {rows.length ? view === 'cards' ? <div className="agent-card-grid">{rows.map(e => { const a = agentAsset(e); const current = activeVersion(e); return <article className="agent-card" key={e.id}><div className="agent-card-top"><span className={`agent-card-avatar agent-card-avatar--${e.draft.purpose}`}><Sparks width={23} /></span><AgentStateBadge entity={e} /></div><button className="agent-card-name" onClick={() => navigate(`/agents/${e.id}`)}>{a.name}</button><p className="agent-card-description" title={a.displayDescription}>{a.displayDescription || '添加说明，让同事了解它能完成什么工作。'}</p><div className="agent-card-tags"><Tag>{purposeLabels[e.draft.purpose]}</Tag>{a.tags.slice(0, 2).map(t => <Tag key={t}>{t}</Tag>)}{a.tags.length > 2 && <Tag>+{a.tags.length - 2}</Tag>}</div><div className="agent-card-config"><span>{e.draft.modelId}</span><span>{e.draft.capabilityVersionIds.length} 项能力</span></div><div className="agent-card-meta"><span title={a.owner}><span className="agent-owner-avatar">{a.owner.slice(0, 1)}</span>{a.owner}</span><span title={current ? `发布于 ${formatTime(current.createdAt)}` : ''}>{current ? `v${current.number}` : '未发布'} · {formatTime(e.updatedAt)}</span></div><footer><span>{e.draft.experience?.channelIds.map(id => channelLabels[id]).join(' / ') || (e.example ? '示例智能体' : '我的智能体')}</span>{actions(e)}</footer></article> })}</div> : <div className="table-scroll"><table className="data-table agent-table"><thead><tr><th>智能体</th><th>状态</th><th>发布版本</th><th>模型 / 能力</th><th>负责人</th><th>最近修改</th><th>操作</th></tr></thead><tbody>{rows.map(e => { const a = agentAsset(e); return <tr key={e.id}><td><button className="entity-name" onClick={() => navigate(`/agents/${e.id}`)}>{a.name}</button><p>{a.displayDescription}</p><small>{purposeLabels[e.draft.purpose]}</small></td><td><AgentStateBadge entity={e} /></td><td>{activeVersion(e) ? `v${activeVersion(e)!.number}` : '尚未发布'}</td><td><span className="model-name">{e.draft.modelId}</span><small>{e.draft.capabilityVersionIds.length} 项能力</small></td><td>{a.owner}</td><td className="time-cell">{formatTime(e.updatedAt)}</td><td>{actions(e)}</td></tr> })}</tbody></table></div> : <Empty title={hasFilter ? '没有匹配的智能体' : bucket === 'deleted' ? '回收站为空' : bucket === 'archived' ? '暂无归档智能体' : '创建你的第一个智能体'} description={hasFilter ? '尝试缩短关键词，或清除筛选条件。' : bucket === 'active' ? '先说清楚一项具体工作，其余设置可以稍后完善。' : '移入这里的智能体可以恢复，原有配置会保留。'} action={hasFilter ? <Button onClick={clear}>清除筛选</Button> : bucket === 'active' ? <Button variant="primary" onClick={() => navigate('/agents/new')}>创建智能体</Button> : undefined} />}
      <div className="table-footer"><span>共 {filtered.length} 个智能体</span><div><Button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / size))}</span><Button disabled={(currentPage + 1) * size >= filtered.length} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div></div>
    <div className="agent-center-note"><Check width={16} /><span>修改先保存为草稿，发布后再供使用。已发布版本和历史记录会保留。</span></div>
    {importOpen && <Modal title="导入智能体配置" onClose={() => { if (!busy && !imported.current) setImportOpen(false) }}><p className="body-copy">将此原型导出的 JSON 粘贴到下方，导入后生成独立草稿。</p><Field label="导入后的名称" required><input aria-label="导入后的名称" value={importName} maxLength={60} disabled={busy || !!imported.current} onChange={e => setImportName(e.target.value)} /></Field><Field label="JSON 配置" required><textarea aria-label="JSON 配置" className="prompt-input" rows={9} value={importText} disabled={busy || !!imported.current} onChange={e => setImportText(e.target.value)} /></Field>{error && <Notice tone="error">{error}</Notice>}<p className="muted">会检查格式与资源引用。发布历史和渠道配置不会复制，使用范围重置为仅自己。</p><footer><Button disabled={busy || !!imported.current} onClick={() => setImportOpen(false)}>取消</Button><Button variant="primary" disabled={busy || importName.trim().length < 2 || !importText.trim()} onClick={() => void doImport()}>{busy ? '导入中…' : imported.current ? '重试读取' : '检查并导入'}</Button></footer></Modal>}
  </div>
}
