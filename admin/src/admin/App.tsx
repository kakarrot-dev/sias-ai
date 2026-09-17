import { CapabilityUpload, ImportedCapabilityDetail } from './CapabilityUpload'
import type { Actor } from './campus/model'
import { ModelCenter } from './ModelCenter'
import { capabilityPurposes, capabilityTypeLabel, searchCapabilities, type CapabilityFilter } from './capability-search'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Book, Check, Cube, HomeSimple, Plus, RefreshDouble, Settings, ShieldCheck, Sparks, User, Xmark } from 'iconoir-react'
import { getState, prototypeStore, resetPrototype } from './prototype-store'
import { Button, Empty, Facts, Field, IconButton, Modal, Notice, PageHeader, SearchField, Section, Tag, TextLink, actionLabels, formatTime, type Icon } from './components'
import { CampusCenter, type DirtyHandler } from './campus/CampusCenter'
import { AgentCreation } from './AgentCreation'
import { AgentList } from './AgentCatalog'
import { EntityEditor } from './EntityEditor'
import type { AdminState, Capability } from './shared'
import { chatCalls, managementAudits, summarizeUsage, visibleChatSessions } from './chat-records'
import { userAccessDecision } from './user-center-model'
import { UserCenter } from './UserCenter'
import { RunCenter } from './RunCenter'
import { agentAvailable, chatExpertAvailable, expertMvpEnabled } from './campus/availability'
import { hasChanges, statusOf } from './campus/model'

const navigation: { id: string; name: string; icon: Icon; section: string }[] = [
  { id: 'overview', name: '总览', icon: HomeSimple, section: '工作区' },
  { id: 'agents', name: '智能体中心', icon: Sparks, section: '能力建设' },
  { id: 'capabilities', name: '能力中心', icon: Cube, section: '能力建设' },
  { id: 'runs', name: '运行中心', icon: Book, section: '管理与治理' },
  { id: 'users', name: '用户中心', icon: ShieldCheck, section: '管理与治理' },
  { id: 'settings', name: '系统设置', icon: Settings, section: '管理与治理' }
]
const readRoute = () => window.location.hash.replace(/^#/, '') || '/agents'

export function App() {
  const [data, setData] = useState<AdminState>()
  const [route, setRoute] = useState(readRoute)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const dirtyRef = useRef(false)
  const previousRoute = useRef(route)
  const dirtySave = useRef<(() => Promise<boolean>) | undefined>(undefined)
  const dirtyDiscard = useRef<(() => void) | undefined>(undefined)
  const [leaving, setLeaving] = useState<string>()
  const [savingBeforeLeave, setSavingBeforeLeave] = useState(false)
  const onDirty = useCallback<DirtyHandler>((value, save, discard) => { dirtyRef.current = value; dirtySave.current = save; dirtyDiscard.current = discard }, [])
  const reload = useCallback(async () => { const state = await getState(); setData(state); setLoadError('') }, [])
  useEffect(() => { void reload().catch(() => setLoadError('原型数据读取失败，可重置示例数据后继续。')) }, [reload])
  useEffect(() => {
    const change = () => {
      const next = readRoute()
      if (next === previousRoute.current) return
      const sameEditor = (path: string) => {
        const match = path.split('?')[0].match(/^\/agents\/([^/]+)(?:\/edit\/([^/]+))?$/); if (!match) return undefined
        const [, id, tab] = match; if (id === 'new') return 'new'
        const expertForm = data?.campus?.agents.some(a => a.id === id && a.kind === 'expert') && (!tab || ['basic', 'prompt', 'input', 'output', 'tools', 'skills', 'model', 'io', 'handoff', 'knowledge', 'governance', 'experience', 'review'].includes(tab))
        return `${id}:${expertForm ? 'expert-form' : 'management'}`
      }
      const keepingDraft = sameEditor(next) && sameEditor(next) !== 'new' && sameEditor(next) === sameEditor(previousRoute.current)
      if (dirtyRef.current && !keepingDraft) { window.history.replaceState(null, '', `#${previousRoute.current}`); setLeaving(next); return }
      if (!keepingDraft) dirtyRef.current = false
      previousRoute.current = next; setRoute(next); window.scrollTo(0, 0)
    }
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('hashchange', change); window.addEventListener('beforeunload', unload)
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('beforeunload', unload) }
  }, [data])
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 3500); return () => clearTimeout(timeout) }, [toast])
  const navigate = useCallback((path: string) => { if (readRoute() !== path) window.location.hash = path }, [])
  const refresh = async () => { setRefreshing(true); try { await reload(); setToast('已读取原型数据') } catch { setLoadError('读取失败，当前页面已保留。请重试。') } finally { setRefreshing(false) } }
  const [rawSection, id, view] = route.split('?')[0].split('/').filter(Boolean)
  const legacy = rawSection === 'legacy-agents'
  const section = legacy && !expertMvpEnabled ? 'agents' : rawSection
  const currentNav = navigation.find(n => n.id === section)
  const entity = [...(data?.agents ?? []), ...(data?.deletedAgents ?? [])].find(a => a.id === id)
  const detail = section === 'agents' && id
  return <div className="admin-shell">
    <aside className="sidebar"><a className="brand" href="#/overview" aria-label="西亚斯数字员工平台管理系统" title="西亚斯数字员工平台管理系统"><span className="brand-symbol"><Sparks width={21} height={21} /></span><span>西亚斯数字员工平台<small>管理系统</small></span></a><div className="workspace-label"><span className="workspace-avatar">企</span><div><strong>{data?.workspace.name ?? '企业 AI 工作区'}</strong><small>交互原型 · 演示数据</small></div></div><nav aria-label="主导航">{navigation.map((item, i) => <div key={item.id}>{(i === 0 || item.section !== navigation[i - 1].section) && <p className="nav-section-label">{item.section}</p>}<button className={`nav-item ${section === item.id ? 'is-active' : ''}`} onClick={() => navigate(`/${item.id}`)} aria-current={section === item.id ? 'page' : undefined}><item.icon width={19} height={19} /><span>{item.name}</span></button></div>)}</nav><div className="sidebar-footer"><button onClick={() => setHelpOpen(true)}><Book width={17} />原型使用说明<ArrowRight width={15} /></button><div className="local-identity"><span><User width={16} /></span><div><strong>本地管理员</strong><small>原型操作身份</small></div></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-breadcrumb"><span>工作区</span><span>/</span><strong>{currentNav?.name ?? '页面'}</strong></div><div className="topbar-actions"><span className="connection-state"><i className={loadError ? 'offline' : ''} />{data ? '交互原型' : '载入中'}</span><IconButton icon={RefreshDouble} label="刷新原型数据" disabled={refreshing} onClick={() => void refresh()} /><span className="topbar-divider" /><span className="user-avatar">管</span></div></header>
      <main id="main-content" className={`page ${detail ? 'page--detail' : ''}`}>{loadError && <Notice tone="error">{loadError}<Button onClick={() => void refresh()} disabled={refreshing}>重新读取</Button><Button onClick={() => { if (window.confirm('重置原型示例数据？')) { resetPrototype(); window.location.reload() } }}>重置示例数据</Button></Notice>}{!data ? !loadError && <div className="loading-state" role="status"><div className="loading-line" /><p>正在载入交互原型…</p></div> : section === 'agents' && !legacy ? data.campus ? <CampusCenter state={data.campus} route={route} navigate={navigate} reload={reload} onDirty={onDirty} notify={setToast} /> : <Notice tone="error">智能体示例数据不可用，请重新读取。</Notice> : detail ? (id === 'new' || id === 'manual' ? <AgentCreation key="agent-creation" data={data} navigate={navigate} reload={reload} onDirty={onDirty} notify={setToast} /> : entity ? <EntityEditor key={`${section}/${id}/${view ?? ''}`} initialTab={view === 'edit' ? 'config' : ['sample', 'versions', 'check'].includes(view) ? view : undefined} kind="agent" entity={entity} data={data} navigate={navigate} reload={reload} onDirty={onDirty} notify={setToast} /> : <Empty title="配置不存在" description="该配置可能已被删除，返回列表查看最新内容。" action={<Button onClick={() => navigate(`/${section}`)}>返回列表</Button>} />) : <>
        {section === 'overview' && <Overview data={data} navigate={navigate} />}
        {section === 'agents' && <AgentList data={data} navigate={navigate} reload={reload} notify={setToast} />}
        {section === 'capabilities' && <Capabilities data={data} reload={reload} notify={setToast} />}
        {section === 'runs' && <RunCenter key={route} data={data} route={route} navigate={navigate} />}
        {section === 'users' && <UserCenter key={route} data={data} route={route} reload={reload} navigate={navigate} notify={setToast} />}
        {section === 'settings' && <SettingsPage data={data} route={route} navigate={navigate} reload={reload} notify={setToast} onDirty={onDirty} />}
        {!currentNav && <Empty title="页面不存在" description="从左侧导航选择管理模块。" action={<Button onClick={() => navigate('/overview')}>返回总览</Button>} />}
      </>}</main><footer className="page-footer"><span>西亚斯数字员工平台管理系统</span><span>专家咨询 · 登录即聊</span></footer></div>
    {toast && <div className="toast" role="status"><Check width={17} />{toast}<IconButton icon={Xmark} label="关闭提示" onClick={() => setToast('')} /></div>}
    {leaving && <Modal title="有未保存的修改" onClose={() => !savingBeforeLeave && setLeaving(undefined)}><p>离开前可以保存，或放弃当前修改。</p><footer><Button disabled={savingBeforeLeave} onClick={() => setLeaving(undefined)}>留在当前页</Button><Button disabled={savingBeforeLeave} onClick={() => { dirtyDiscard.current?.(); dirtyRef.current = false; const destination = leaving; setLeaving(undefined); navigate(destination) }}>放弃修改并离开</Button><Button variant="primary" disabled={!dirtySave.current || savingBeforeLeave} onClick={async () => { setSavingBeforeLeave(true); const destination = leaving; try { if (await dirtySave.current?.()) { dirtyRef.current = false; setLeaving(undefined); navigate(destination) } } finally { setSavingBeforeLeave(false) } }}>保存后离开</Button></footer></Modal>}
    {helpOpen && <Modal title="原型使用说明" onClose={() => setHelpOpen(false)}><div className="help-steps"><h3>原型页面</h3><p>系统管理员创建专家，配置模型、Skill／Tool／MCP 以及输入输出格式，保存并发布。C 端用户通过统一认证登录后，选择已发布且启用的专家聊天。用户中心管理账号启停，运行中心查看会话元信息、用量和管理审计。</p></div><Notice>当前为纯前端交互原型。操作仅保存在当前浏览器，可随时重置示例数据；不会调用模型或业务系统。</Notice><footer><Button variant="danger" onClick={() => { if (window.confirm('重置此原型中的全部编辑，恢复初始示例？')) { resetPrototype(); window.location.reload() } }}>重置示例数据</Button><Button variant="primary" onClick={() => setHelpOpen(false)}>知道了</Button></footer></Modal>}
  </div>
}

function Overview({ data, navigate }: { data: AdminState; navigate: (path: string) => void }) {
  const all = (data.campus?.agents ?? []).filter(a => !a.deletedAt && (expertMvpEnabled ? chatExpertAvailable(a) : agentAvailable(a)))
  const published = all.filter(a => a.live && !a.disabled)
  const pending = all.filter(hasChanges)
  const center = data.campus?.userCenter
  const activeUsers = center?.users.filter(u => userAccessDecision(center, u.id).allowed).length ?? 0
  const actor = { role: 'admin', department: '信息化处' } as const
  const sessions = data.campus ? visibleChatSessions(data.campus, actor) : []
  const usage = summarizeUsage(chatCalls.filter(c => sessions.some(s => s.id === c.sessionId)))
  return <>
    <PageHeader eyebrow="工作区总览" title="让用户找到专家，开始对话" description="发布专家、管理用户，了解聊天服务的使用情况。"><Button icon={Plus} variant="primary" onClick={() => navigate('/agents/new/expert')}>创建专家</Button></PageHeader>
    <div className="metrics-strip">{[['可用专家', published.length, 'agents', '位'], ['正常用户', activeUsers, 'users', '人'], ['会话数（示例）', sessions.length, 'runs', '个'], ['已上报 Token（示例）', usage.total?.toLocaleString('zh-CN') ?? '—', 'runs?view=usage', '']].map(([label, value, target, unit]) => <button key={label} onClick={() => navigate(`/${target}`)}><span>{label}<ArrowRight width={15} /></span><strong>{value}<small>{unit}</small></strong></button>)}</div>
    <div className="overview-grid">
      <Section title="待发布草稿" description="已保存的修改，需要发布后才会用于新会话。">{pending.length ? <div className="pending-list">{pending.slice(0, 6).map(agent => <button key={agent.id} onClick={() => navigate(`/agents/${agent.id}/edit/basic`)}><span className="entity-type-icon"><Sparks width={19} /></span><span><strong>{agent.draft.name}</strong><small>{agent.draft.description || '待完善聊天配置'}</small></span><Tag>{statusOf(agent)}</Tag><ArrowRight width={16} /></button>)}</div> : <Empty title="暂无待发布草稿" description="可以创建新专家，或查看用户的聊天用量。" />}</Section>
      <Section title="从发布到聊天" description="管理员配置，C 端用户登录使用。"><ol className="onboarding-list">
        <li><span>01</span><div><strong>创建并发布专家</strong><p>设置模型、执行能力和输入输出，检查后发布。</p><TextLink onClick={() => navigate('/agents')}>管理专家</TextLink></div></li>
        <li><span>02</span><div><strong>用户登录并选择专家</strong><p>正常账号可使用已发布专家，无需逐个授权。</p><TextLink onClick={() => navigate('/users')}>查看用户</TextLink></div></li>
        <li><span>03</span><div><strong>了解聊天使用情况</strong><p>查看会话元信息、模型用量和异常回复。</p><TextLink onClick={() => navigate('/runs')}>查看会话与用量</TextLink></div></li>
      </ol></Section>
    </div>
    <Section title="最近管理操作" action={<TextLink onClick={() => navigate('/runs?view=audit')}>全部记录</TextLink>}><AuditTable data={data} limit={5} navigate={navigate} /></Section>
  </>
}

function Capabilities({ data, reload, notify }: { data: AdminState; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [actor] = useState<Actor>(() => { try { return JSON.parse(sessionStorage.getItem('campus-demo-actor') ?? 'null') ?? { role: 'admin', department: '信息化处' } } catch { return { role: 'auditor', department: '' } } })
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<Capability>(); const [filter, setFilter] = useState<CapabilityFilter>('all')
  const [purpose, setPurpose] = useState('all')
  const purposes = [...new Set(data.capabilities.flatMap(capabilityPurposes))]
  const rows = searchCapabilities(data.capabilities, query, filter, purpose)
  const filtered = !!query || filter !== 'all' || purpose !== 'all'
  const clearFilters = () => { setQuery(''); setFilter('all'); setPurpose('all') }
  return <>
    <PageHeader title="能力中心" description="上传 Skill、Tool 与 MCP，按类型和用途查找，供智能体配置使用。">{actor.role === 'admin' && <Button variant="primary" onClick={() => setUploading(true)}>批量上传</Button>}</PageHeader>
    <Notice>原型能力目录，用于体验资源选择、依赖查看和 Agent 关联。</Notice>
    <div className="catalog-panel">
      <div className="table-toolbar">
        <SearchField value={query} onChange={setQuery} label="搜索能力目录" placeholder="搜索名称、说明或用途" />
        <div className="filters">
          <select aria-label="目录能力类型" value={filter} onChange={e => setFilter(e.target.value as CapabilityFilter)}><option value="all">全部类型</option><option value="skill">Skill</option><option value="builtin">Tool（内置工具）</option><option value="mcp">MCP</option></select>
          <select aria-label="能力用途筛选" value={purpose} onChange={e => setPurpose(e.target.value)}><option value="all">全部用途</option>{purposes.map(value => <option key={value} value={value}>{value}</option>)}</select>
        </div>
        <span className="muted" role="status">{rows.length} 项能力</span>
        {filtered && <Button variant="ghost" onClick={clearFilters}>清除筛选</Button>}
      </div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>能力名称</th><th>版本</th><th>类型</th><th>用途</th><th>状态</th><th>草稿引用</th><th>详情</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}>
        <td><button className="entity-name" onClick={() => setSelected(c)}>{c.name}</button><p>{c.description}</p></td>
        <td>v{c.version}</td><td>{capabilityTypeLabel(c)}</td><td><div className="tag-list">{capabilityPurposes(c).map(value => <Tag key={value}>{value}</Tag>)}</div></td>
        <td>{c.imported?.status === 'pending-tools' ? '待补充工具定义' : c.execution?.active === false ? '已停用' : c.imported ? '已导入' : '可用'}</td>
        <td>{data.agents.filter(a => a.draft.capabilityVersionIds.includes(c.id)).length + (data.campus?.agents.filter(a => a.draft.tools.some(b => b.id === c.id)).length ?? 0)} 个智能体</td>
        <td><Button variant="ghost" onClick={() => setSelected(c)}>查看<ArrowRight width={14} /></Button></td>
      </tr>)}</tbody></table></div>
      {!rows.length && <Empty title="没有匹配的能力" description="调整关键词、类型或用途，或清除筛选查看全部能力。" />}
    </div>
    {selected && <Modal title={selected.name} onClose={() => setSelected(undefined)}>
      <p className="body-copy">{selected.description}</p>
      <Facts items={[["版本", `v${selected.version}`], ['类型', capabilityTypeLabel(selected)], ['用途', capabilityPurposes(selected).join('、')], ['来源', selected.imported ? `文件上传：${selected.imported.source}` : '能力中心统一原型目录']]} />
      {[['Skill', selected.skillVersionIds], ['Tool', selected.toolVersionIds], ['MCP 连接依赖', selected.mcpVersionIds], ['所需权限', selected.permissionRequirements]].map(([label, values]) => <div key={label as string} className="dependency-section"><h3>{label}</h3>{(values as string[]).length ? (values as string[]).map(v => <code key={v}>{v}</code>) : <p className="muted">无</p>}</div>)}
      <ImportedCapabilityDetail capability={selected} />
      <footer><Button onClick={() => setSelected(undefined)}>关闭</Button></footer>
    </Modal>}
    {uploading && data.campus && <CapabilityUpload capabilities={data.capabilities} revision={data.campus.revision} actor={actor} reload={reload} notify={notify} close={() => setUploading(false)} />}
  </>
}

function AuditTable({ data, limit = 100 }: { data: AdminState; navigate: (path: string) => void; limit?: number }) {
  const rows = data.campus ? managementAudits(data.campus, { role: 'admin', department: '信息化处' }, undefined, data.audits) : []
  return rows.length ? <div className="table-scroll"><table className="data-table audit-table"><thead><tr><th>操作</th><th>对象</th><th>变更说明</th><th>操作人</th><th>时间</th></tr></thead><tbody>{rows.slice(0, limit).map(a => <tr key={`${a.source}:${a.id}`}><td><Tag>{a.action}</Tag></td><td>{a.objectName}</td><td>{a.detail}</td><td>{a.actor}</td><td className="time-cell">{formatTime(a.at)}</td></tr>)}</tbody></table></div> : <Empty title="暂无记录" description="保存、发布专家或调整用户状态后，记录会显示在这里。" />
}
function SettingsPage({ data, route, navigate, reload, notify, onDirty }: { data: AdminState; route: string; navigate: (path: string) => void; reload: () => Promise<void>; notify: (text: string) => void; onDirty: (dirty: boolean) => void }) {
  const [name, setName] = useState(data.workspace.name); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const dirty = name !== data.workspace.name
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  const save = async () => { setBusy(true); setError(''); try { prototypeStore().saveWorkspace({ name: name.trim(), owner: data.workspace.owner }); await reload(); notify('平台资料已保存') } catch (e) { setError(e instanceof Error ? e.message : '保存失败') } finally { setBusy(false) } }
  const modelsTab = route.split('?')[0] === '/settings/models'
  return <><PageHeader title="系统设置" description="维护平台资料、身份认证与中转站模型目录。" /><nav className="editor-tabs" aria-label="系统设置分类"><Button aria-current={!modelsTab ? 'page' : undefined} onClick={() => navigate('/settings')}>平台设置</Button><Button aria-current={modelsTab ? 'page' : undefined} onClick={() => navigate('/settings/models')}>模型管理</Button></nav>{error && <Notice tone="error">{error}</Notice>}
    {modelsTab && data.campus ? <ModelCenter state={data.campus} reload={reload} notify={notify} navigate={navigate} /> : <>
    <Section title="平台资料" action={<Button icon={Check} variant="primary" disabled={busy || !name.trim() || !dirty} onClick={() => void save()}>{busy ? '保存中…' : '保存资料'}</Button>}><div className="form-grid"><Field label="平台名称"><input aria-label="平台名称" value={name} maxLength={60} onChange={e => setName(e.target.value)} /></Field><Field label="专家管理方式"><input readOnly value="由系统管理员统一创建和发布" /></Field></div></Section>
    <Section title="统一身份认证" description="用户完成统一认证后，平台建立 C 端账号。"><Facts items={[["接入状态", '未接入 · 当前为用户示例'], ['身份协议', 'OIDC'], ['唯一身份', '认证来源（iss）+ 用户标识（sub）'], ['登录后的使用规则', '账号正常且身份有效，可使用已发布并启用的专家']]} /><p className="record-note">身份资料由认证服务提供；密钥和回调处理在服务端配置。</p></Section>
    <Section title="模型服务" description="从自建中转站同步模型，启用后供管理员创建和配置智能体。"><Button onClick={() => navigate('/settings/models')}>管理模型列表</Button></Section>
    <Section title="当前交付范围"><Facts items={[["管理员后台", '浏览器交互原型，支持保存与模拟发布'], ['C 端登录与聊天页面', '待接入'], ['模型回复与能力执行', '待接入'], ['会话与用量', '固定示例，尚未采集真实数据'], ['配置与操作记录', '保存在当前浏览器']]} /></Section>
    </>}
  </>
}
