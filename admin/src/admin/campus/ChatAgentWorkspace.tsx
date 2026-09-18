import { campusAgentCategories } from '../../../../frontend/prototypes/macos-client-v2/src/campus-agent-catalog'
import type { PublicExpertPreview } from '../../../../frontend/src/shared/service-prototype'
import { PrivateExpertOverview } from '../ServiceOutcomes'
import { agentModelName } from '../model-center'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'iconoir-react'
import { Button, Empty, Facts, Field, Modal, Notice, PageHeader, SearchField, Section, Tag, formatTime } from '../components'
import { ChatRecords } from '../RunCenter'
import { chatExpertAvailable } from './availability'
import { blankConfig, capabilitiesOf, expertMvpConfig, expertMvpIssues, clone, configDigest, deletionReason, hasChanges, nextVersion, statusOf, type Actor, type Agent, type CampusState, type Config } from './model'
import { generatedKey, profileDefaults } from './expert-form'
import type { CampusAction } from './actions'
import type { DirtyHandler } from './CampusCenter'
import { CapabilityFields } from './CapabilityFields'
import { ExpertModelSettings, ExpertModelSelect, ExpertInputOutputSettings, ExpertExecutionDetails, executionSummary } from './ExpertExecutionFields'
import { defaultInteractionConfig } from './interaction-model'
import './chat-mvp.css'

type Commit = (action: CampusAction, target?: string, persisted?: (id?: string) => void) => Promise<boolean>
interface Props { state: CampusState; actor: Actor; route: string; navigate: (path: string) => void; commit: Commit; busy: boolean; onDirty: DirtyHandler }
export function ChatAgentWorkspace(props: Props) {
  const { state, actor, route, navigate } = props
  const [, id, view] = route.split('?')[0].split('/').filter(Boolean)
  const agent = state.agents.find(a => a.id === id && !a.deletedAt)
  const creating = ['new', 'manual'].includes(id)
  if (creating && view && view !== 'expert' || agent && !chatExpertAvailable(agent)) return <Empty title="当前仅开放单个智能体" description="请选择普通专家，通过对话使用专家配置的能力。" action={<Button onClick={() => navigate('/agents')}>返回智能体中心</Button>} />
  if (id && !creating && !agent) return <Empty title="专家不存在" description="专家可能已删除，请返回列表查看。" action={<Button onClick={() => navigate('/agents')}>返回智能体中心</Button>} />
  if (creating && actor.role !== 'admin') return <Empty title="仅系统管理员可创建专家" description="C 端用户登录后使用已发布专家聊天。" />
  return id ? <ChatExpertEditor key={agent?.id ?? 'new'} {...props} agent={agent} /> : <ChatExpertCatalog {...props} />
}
function ChatExpertCatalog({ state, actor, navigate }: Props) {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [page, setPage] = useState(0)
  const agents = state.agents.filter(a => !a.deletedAt && chatExpertAvailable(a))
  const rows = agents.filter(a => `${a.draft.name} ${a.draft.description}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || status === 'published' && a.live && !a.disabled || status === 'draft' && !a.live || status === 'disabled' && a.disabled)).sort((a,b) => b.updated.localeCompare(a.updated))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 8) - 1))
  return <><PageHeader title="智能体中心" description="系统管理员创建和发布专家，用户登录后选择专家聊天。">{actor.role === 'admin' && <Button icon={Plus} variant="primary" onClick={() => navigate('/agents/new/expert')}>创建专家</Button>}</PageHeader>
    <div className="catalog-panel"><div className="table-toolbar"><SearchField label="搜索专家" placeholder="搜索专家名称或简介" value={query} onChange={v => { setQuery(v); setPage(0) }} /><div className="filters"><select aria-label="筛选状态" value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="all">全部状态</option><option value="published">已发布</option><option value="draft">未发布</option><option value="disabled">已停用</option></select></div></div>
    {rows.length ? <div className="table-scroll"><table className="data-table chat-expert-table"><thead><tr><th>专家名称 / 简介</th><th>模型</th><th>发布状态</th><th>最近更新</th><th>操作</th></tr></thead><tbody>{rows.slice(currentPage * 8, currentPage * 8 + 8).map(a => <tr key={a.id}><td><button className="entity-name" onClick={() => navigate(`/agents/${a.id}/view`)}>{a.draft.name}</button><small>{a.draft.description || '待填写简介'}</small></td><td>{agentModelName(state, a.draft)}</td><td><Tag>{statusOf(a)}</Tag><small>{a.live ? `当前 v${a.live}${a.disabled ? ' · 用户不可使用' : ' · 登录后可用'}` : '仅后台可见'}</small></td><td>{formatTime(a.updated)}</td><td><Button variant="ghost" onClick={() => navigate(`/agents/${a.id}/edit/basic`)}>{actor.role === 'admin' ? '配置' : '查看'}</Button><Button variant="ghost" onClick={() => navigate(`/agents/${a.id}/view/records`)}>会话记录</Button></td></tr>)}</tbody></table></div> : <Empty title="没有匹配的专家" description="调整搜索条件，或创建第一个聊天专家。" />}
    <div className="table-footer"><span>共 {rows.length} 位专家</span><div><Button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage + 1} / {Math.max(1, Math.ceil(rows.length / 8))}</span><Button disabled={(currentPage + 1) * 8 >= rows.length} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div></div>
    <p className="record-note">草稿仅供管理员编辑。发布并启用后，所有正常登录用户均可使用。人群与用途仅用于目录发现，不作为权限。</p><PrivateExpertOverview /></>
}
function ChatExpertEditor({ agent, state, actor, route, navigate, commit, busy, onDirty }: Props & { agent?: Agent }) {
  const initial = useRef<Config>(expertMvpConfig(agent ? agent.draft : { ...blankConfig(), model: '', prompt: '', discovery: { audience: 'staff', category: 'campus-office' }, interaction: defaultInteractionConfig(), expert: { ...profileDefaults(), formVersion: 'compact' } }))
  const cacheKey = `chat-expert-draft:${agent?.id ?? 'new'}:${actor.role}`
  const [c, setConfig] = useState<Config>(() => {
    try { const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null'); if (cached?.base === configDigest(initial.current) || agent && cached?.base === configDigest(agent.draft)) return expertMvpConfig(cached.config) } catch { /* Read the saved draft when a browser cache is unavailable. */ }
    return clone(initial.current)
  })
  const [error, setError] = useState(''); const [modal, setModal] = useState(''); const [note, setNote] = useState(''); const [selected, setSelected] = useState<number>(); const [saved, setSaved] = useState(false)
  const savedDigest = useRef(configDigest(initial.current))
  const editable = actor.role === 'admin'; const dirty = !saved && configDigest(c) !== savedDigest.current
  const [, , view, sub] = route.split('?')[0].split('/').filter(Boolean)
  const tab = view === 'edit' || view === 'view' ? sub ?? 'basic' : 'basic'
  const section = ['history', 'records'].includes(tab) ? tab : 'basic'
  const sectionFor = (value: string) => ['tools', 'skills', 'capabilities'].includes(value) ? 'capabilities' : ['input', 'output', 'io'].includes(value) ? 'io' : value === 'model' ? 'model' : 'basic'
  const [configSection, setConfigSection] = useState(() => sectionFor(tab))
  useEffect(() => { if (section === 'basic') setConfigSection(sectionFor(tab)) }, [tab, section])
  const set = (patch: Partial<Config>) => { setConfig(current => ({ ...current, ...patch })); setSaved(false); setError('') }
  const save = useCallback(async () => {
    const config = clone(c)
    if (!agent) config.expert = { ...(config.expert ?? profileDefaults()), key: generatedKey(config.name, state), keyManual: true }
    const errors = expertMvpIssues(state, agent?.id ?? '', config, false)
    if (errors.length) { setError(errors.join('；')); return false }
    return commit(agent ? { type: 'save', id: agent.id, config, credentialChecked: true } : { type: 'create', kind: 'expert', config }, undefined, () => { savedDigest.current = configDigest(c); setSaved(true); sessionStorage.removeItem(cacheKey); onDirty(false) })
  }, [c, agent, state, commit, cacheKey, onDirty])
  useEffect(() => {
    if (agent?.draft && !dirty) { initial.current = expertMvpConfig(agent.draft); savedDigest.current = configDigest(initial.current); setConfig(clone(initial.current)); setSaved(false) }
  }, [agent?.draft])
  useEffect(() => {
    onDirty(dirty, save, () => { sessionStorage.removeItem(cacheKey); setConfig(clone(initial.current)); setSaved(false) })
    if (dirty) { try { sessionStorage.setItem(cacheKey, JSON.stringify({ base: configDigest(initial.current), config: c })) } catch { setError('标签页暂存不可用，请及时保存草稿。') } }
    return () => onDirty(false)
  }, [dirty, save, cacheKey, c, onDirty])
  const issues = expertMvpIssues(state, agent?.id ?? '', c, true)
  const preview = () => {
    if (!agent?.live) return
    const config = agent.versions.find(v => v.number === agent.live)!.config
    const data: PublicExpertPreview = { id: agent.id, name: config.name, description: config.description, model: config.model, version: agent.live, disabled: agent.disabled, audience: config.discovery?.audience ?? 'staff', category: config.discovery?.category ?? 'campus-office', inputs: config.input.types, fileMB: config.input.fileMB, count: config.input.count, totalMB: config.input.totalMB, outputs: config.output.types, notice: config.tools.some(t => t.id === 'notice' && t.write && t.enabled !== false) }
    window.open(`http://127.0.0.1:5190/#expert=${encodeURIComponent(JSON.stringify(data))}`, 'sias-frontend-preview')
  }
  const open = (mode: string, version?: number) => { setModal(mode); setSelected(version); setNote('') }
  const perform = async () => {
    if (!agent) return
    const action: CampusAction = modal === 'publish' ? { type: 'publish', id: agent.id, note } : modal === 'disable' ? { type: 'disable', ids: [agent.id], policy: 'finish', note } : modal === 'restore' ? { type: 'restore', id: agent.id, note } : modal === 'rollback' ? { type: 'rollback', id: agent.id, version: selected!, note } : { type: 'delete', id: agent.id }
    await commit(action, modal === 'delete' ? '/agents' : undefined, () => setModal(''))
  }
  return <div className="chat-expert-editor">
    <PageHeader title={agent ? agent.draft.name : '创建专家智能体'} description={agent ? '管理专家配置与发布状态。已发布内容在下一次发布前保持不变。' : '填写资料、配置模型与执行能力，选择输入输出格式。'}>
      <Button disabled={busy} onClick={() => navigate('/agents')}>取消</Button>{agent?.live && <Button onClick={preview}>预览已发布版本</Button>}
      {editable && section === 'basic' && <><Button disabled={busy || !!agent && !dirty} onClick={() => void save()}>{busy ? '保存中…' : '保存草稿'}</Button><Button variant="primary" disabled={busy || !!issues.length || dirty || !agent || !!agent.disabled || !hasChanges(agent)} title={!agent || dirty ? '请先保存草稿' : issues.length ? issues.join('；') : undefined} onClick={() => open('publish')}>发布专家</Button></>}
    </PageHeader>
    <div className="expert-editor-status">{agent && <Tag>{statusOf(agent)}{agent.live ? ` · v${agent.live}` : ''}</Tag>}{section === 'basic' && <span>{dirty ? '有未保存修改' : !agent ? '保存草稿后即可发布' : '草稿已保存'}</span>}
      {editable && agent && <div className="expert-lifecycle-actions">{agent.live && <Button variant="ghost" disabled={busy || dirty} onClick={() => open(agent.disabled ? 'restore' : 'disable')}>{agent.disabled ? '启用专家' : '停用专家'}</Button>}{!deletionReason(state, agent) && <Button variant="ghost" disabled={busy || dirty} onClick={() => open('delete')}>删除草稿</Button>}</div>}
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {section === 'basic' && agent && !dirty && issues.length > 0 && <Notice tone="warning">{issues.join('；')}</Notice>}
    {agent && <nav className="editor-tabs" aria-label="专家管理"><Button onClick={() => navigate(`/agents/${agent.id}/edit/basic`)} aria-current={section === 'basic' ? 'page' : undefined}>专家配置</Button><Button onClick={() => navigate(`/agents/${agent.id}/view/history`)} aria-current={section === 'history' ? 'page' : undefined}>发布记录</Button><Button onClick={() => navigate(`/agents/${agent.id}/view/records`)} aria-current={section === 'records' ? 'page' : undefined}>会话与用量</Button></nav>}
    {section === 'basic' && <><nav className="expert-config-sections" aria-label="专家配置分区">{[["basic", "基础与提示词"], ["model", "模型配置"], ["capabilities", "执行能力"], ["io", "输入输出"]].map(([id, label]) => <Button key={id} aria-current={configSection === id ? 'page' : undefined} onClick={() => setConfigSection(id)}>{label}</Button>)}</nav><div className="chat-config-content"><fieldset className="campus-fieldset" disabled={!editable || busy}>
      {configSection === 'basic' && <><Section title="专家资料" description="用户在专家列表和聊天页面看到的内容。"><div className="form-grid"><Field label="专家名称" required><input aria-label="专家名称" value={c.name} maxLength={20} placeholder="例如：学习规划专家" onChange={e => set({ name: e.target.value })} /></Field><ExpertModelSelect config={c} patch={set} disabled={!editable || busy} state={state} /></div><Field label="专家简介" required hint="说明可以咨询什么，最多 200 字。"><textarea aria-label="专家简介" value={c.description} maxLength={200} rows={3} onChange={e => set({ description: e.target.value })} /></Field></Section>
      <Section title="目录发现" description="随专家版本发布；仅帮助师生寻找专家，不限制使用权限。"><div className="form-grid"><Field label="常用人群"><select aria-label="常用人群" value={c.discovery?.audience ?? 'staff'} onChange={e => { const audience = e.target.value as 'student' | 'staff'; set({ discovery: { audience, category: campusAgentCategories.find(category => category.audience === audience)!.id } }) }}><option value="student">学生常用</option><option value="staff">教职工常用</option></select></Field><Field label="用途分类"><select aria-label="用途分类" value={c.discovery?.category ?? 'campus-office'} onChange={e => set({ discovery: { audience: c.discovery?.audience ?? 'staff', category: e.target.value } })}>{campusAgentCategories.filter(category => category.audience === (c.discovery?.audience ?? 'staff')).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field></div><p className="record-note">来源：学校发布。默认助理为固定系统服务；个人专家仅归属本人，不进入公共发布。</p></Section>
      <Section title="回答规则"><Field label="系统提示词" required hint="写清职责、工作步骤和边界；需要外部操作时调用已配置的工具，并以执行结果为依据。"><textarea aria-label="系统提示词" value={c.prompt} rows={9} maxLength={8000} placeholder="你是一位学习规划专家。通过提问了解用户的目标与时间安排，提供具体建议。信息不足时先追问。仅使用已配置并获准的工具；需要用户确认时先确认，再执行。" onChange={e => set({ prompt: e.target.value })} /></Field></Section>
      <Section title="开始聊天" description="选填，帮助用户开始第一轮对话。"><Field label="开场白"><textarea aria-label="开场白" value={c.opening} maxLength={200} rows={2} placeholder="你好，可以说说你想了解什么。" onChange={e => set({ opening: e.target.value })} /></Field><Field label="推荐问题" hint="每行一条，最多 4 条，每条最多 80 字。"><textarea aria-label="推荐问题" value={c.expert?.questions.join('\n') ?? ''} rows={4} onChange={e => set({ expert: { ...(c.expert ?? profileDefaults()), key: agent?.key ?? c.expert?.key ?? (agent ? generatedKey(c.name, state, agent.id) : ''), questions: e.target.value.split('\n') } })} /></Field></Section>
      </>}
      {configSection === 'model' && <ExpertModelSettings config={c} patch={set} disabled={!editable || busy} state={state} manageModels={() => navigate('/settings/models')} />}
      {configSection === 'capabilities' && <Section title="Skill / Tool / MCP" description="选择工作方法和具体工具，绑定 MCP 服务中的操作；版本、允许动作及执行前确认随专家发布。"><CapabilityFields capabilities={capabilitiesOf(state)} config={c} onChange={set} disabled={!editable || busy} consumer promptOutput /><p className="record-note">当前只保存执行配置，不发起真实服务调用。</p></Section>}
      {configSection === 'io' && <ExpertInputOutputSettings config={c} patch={set} disabled={!editable || busy} />}
      </fieldset></div></>}
    {section === 'history' && agent && <Section title="发布记录" description="每次发布保留独立快照，已有会话按原版本追溯。">{agent.versions.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>版本</th><th>发布说明</th><th>发布人 / 时间</th><th>操作</th></tr></thead><tbody>{agent.versions.map(v => <tr key={v.number}><td>v{v.number}{v.number === agent.live && <Tag>当前版本</Tag>}</td><td>{v.note}</td><td>{v.actor}<small>{formatTime(v.at)}</small></td><td><Button variant="ghost" onClick={() => open('version', v.number)}>详情</Button>{editable && v.number !== agent.live && <Button variant="ghost" disabled={busy || dirty || agent.disabled} onClick={() => open('rollback', v.number)}>回退</Button>}</td></tr>)}</tbody></table></div> : <Empty title="尚未发布" description="保存专家配置并发布后，这里会保留版本记录。" />}</Section>}
    {section === 'records' && agent && <ChatRecords state={state} actor={actor} agentId={agent.id} />}
    {modal === 'version' && agent && <VersionDetail state={state} agent={agent} version={selected!} onClose={() => setModal('')} />}
    {modal && modal !== 'version' && agent && <Modal title={{ publish: `发布 v${nextVersion(agent)}`, disable: '停用专家', restore: '启用专家', rollback: `回退至 v${selected}`, delete: '删除草稿' }[modal]!} onClose={() => !busy && setModal('')}>
      <p>{modal === 'publish' ? '发布已保存的专家配置。所有正常登录用户可以使用，新会话采用此版本。' : modal === 'disable' ? '停用后停止接受新的聊天请求。已有会话记录与用量保留。' : modal === 'restore' ? '恢复当前发布版本，正常登录用户可以继续聊天。' : modal === 'rollback' ? '新会话使用所选版本，已有会话和当前草稿保留。' : `删除「${agent.draft.name}」的未发布草稿，操作记录保留。`}</p>
      {modal === 'publish' && <Facts items={[["专家", agent.draft.name], ['模型', agentModelName(state, agent.draft)], ['发布内容', '资料、提示词、模型参数、执行能力及输入输出格式'], ['输入格式', executionSummary(agent.draft, state).inputs], ['输出格式', executionSummary(agent.draft, state).outputs], ['执行能力', executionSummary(agent.draft, state).capabilities], ['使用范围', '所有正常登录用户']]} />}
      {modal !== 'delete' && <Field label={modal === 'publish' ? '发布说明' : '操作原因'} required><textarea aria-label={modal === 'publish' ? '发布说明' : '操作原因'} value={note} maxLength={200} rows={3} onChange={e => setNote(e.target.value)} /></Field>}
      <footer><Button disabled={busy} onClick={() => setModal('')}>取消</Button><Button variant={['delete', 'disable'].includes(modal) ? 'danger' : 'primary'} disabled={busy || modal !== 'delete' && !note.trim()} onClick={() => void perform()}>确认{modal === 'publish' ? '发布' : modal === 'disable' ? '停用' : modal === 'restore' ? '启用' : modal === 'rollback' ? '回退' : '删除'}</Button></footer></Modal>}
  </div>
}
function VersionDetail({ state, agent, version, onClose }: { state: CampusState; agent: Agent; version: number; onClose: () => void }) {
  const snapshot = agent.versions.find(v => v.number === version)!
  const c = snapshot.config
  return <Modal title={`发布版本 v${version}`} onClose={onClose}><Facts items={[["专家名称", c.name], ['模型', agentModelName(state, c, true)], ['发布人', snapshot.actor], ['发布时间', formatTime(snapshot.at)], ['发布说明', snapshot.note], ['常用人群', c.discovery?.audience === 'student' ? '学生常用' : '教职工常用'], ['用途分类', campusAgentCategories.find(category => category.id === c.discovery?.category)?.name ?? '校务办公']]} /><h3>专家简介</h3><p>{c.description || '未填写'}</p><h3>系统提示词</h3><p className="chat-snapshot-prompt">{c.prompt}</p><h3>开场白与推荐问题</h3><p>{c.opening || '未填写开场白'}</p>{c.expert?.questions.map((q,i) => <p key={i}>{q}</p>)}<ExpertExecutionDetails config={c} state={state} /><footer><Button onClick={onClose}>关闭详情</Button></footer></Modal>
}
