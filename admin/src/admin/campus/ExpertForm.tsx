import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Xmark } from 'iconoir-react'
import { Button, Field, IconButton, Modal, Notice, Section } from '../components'
import { CapabilityFields } from './CapabilityFields'
import { ExpertResources } from './ExpertResources'
import { CaptainCapabilities } from './CaptainCapabilities'
import { fallbackReplies } from './expert-resources'
import { PromptFields } from './Fields'
import { isCaptain, objectLabel, platformBinding, blankConfig, capabilityCatalog, canEdit, clone, configDigest, departments, hasChanges, models, people, validateConfig, type Actor, type Agent, type CampusState, type Config, type Grant } from './model'
import { McpBindings } from './McpBindings'
import { DefinitionFields } from './DefinitionFields'
import { defaultDefinition, definitionIssues } from './agent-definition'
import { defaultInteractionConfig } from './interaction-model'
import { expertColors, expertEditingConfig, expertIssues, expertSections, generatedKey, identityPromptTemplate, legacyResponsibilityText, profileDefaults, type ExpertIssue, type ExpertSection } from './expert-form'
import type { CampusAction } from './actions'
import type { DirtyHandler } from './CampusCenter'
import { ConfigReadView } from './ConfigReadView'
import { AgentNavigation } from './AgentNavigation'
import { InputOutputWorkspace } from './InputOutputWorkspace'
import { runtimeSummary } from './config-summary'
import { multiAgentEnabled } from './availability'
import './expert-form.css'

type Commit = (action: CampusAction, target?: string, persisted?: (id?: string) => void) => Promise<boolean>
type Props = { state: CampusState; actor: Actor; agent?: Agent; route: string; busy: boolean; commit: Commit; navigate: (path: string) => void; onDirty: DirtyHandler }
const configurationSteps: { key: ExpertSection; label: string; sections: ExpertSection[]; hint: string }[] = [
  { key: 'basic', label: '基本信息', sections: ['basic','conversation','experience'], hint: '先说明它是谁、负责什么，以及由谁维护。' },
  { key: 'skills', label: '工作能力', sections: ['skills','tools'], hint: '选择模型，按需添加技能和工具。暂时不需要的可以跳过。' },
  { key: 'input', label: '输入与输出', sections: ['input','io'], hint: '先配置用户需要提供的材料，再定义交付结果与完成条件。' },
  { key: 'model', label: '运行配置', sections: ['handoff','model','knowledge','governance'], hint: '按需调整上下文、运行限制与失败处理' },
  { key: 'review', label: '检查配置', sections: ['review'], hint: '核对关键配置，保存后可继续调试和发布。' },
]
const runtimeSections = configurationSteps[3].sections
const sectionForRoute = (route: string): ExpertSection => ({ basic: 'basic', prompt: 'conversation', input: 'input', handoff: 'handoff', output: 'io', model: 'model', io: 'io', knowledge: 'knowledge', governance: 'governance', experience: 'experience', review: 'review', tools: 'tools', skills: 'skills' })[route.split('?')[0].split('/').pop() ?? ''] as ExpertSection || 'basic'
const fieldForMessage = (message: string): ExpertIssue => ({ message, field: /接管|兜底|转人工/.test(message) ? 'handoffOwner' : /模型|图片|音频|生成参数/.test(message) ? 'model' : /提示词/.test(message) ? 'prompt' : /能力|工具|确认|凭证/.test(message) ? 'tools' : /输入|输出|附件|字段|表单/.test(message) ? 'collection' : 'scope', section: /接管|兜底|转人工/.test(message) ? 'handoff' : /模型|图片|音频|生成参数/.test(message) ? 'model' : /提示词/.test(message) ? 'conversation' : /能力|工具|确认|凭证/.test(message) ? 'tools' : /输入|输出|附件|字段|表单|成果|交付/.test(message) ? 'io' : 'basic' })
const compactConfig = (config: Config, state: CampusState, id?: string) => { const c = expertEditingConfig({ ...config, definition: config.definition ?? defaultDefinition(config) }, state, id); c.schemaVersion = '2.0'; c.expert = { ...profileDefaults(), ...c.expert!, formVersion: 'compact' }; return c }


export function ExpertForm({ state, actor, agent, route, busy, commit, navigate, onDirty }: Props) {
  const captainRole = agent ? isCaptain(agent) : route.includes('/new/captain')
  const captainSection = (section: ExpertSection): ExpertSection => captainRole && ['input', 'io'].includes(section) ? 'skills' : section
  const readOnlyView = route.split('?')[0].split('/').includes('view')
  const cacheKey = `campus-expert-form:${actor.role}:${actor.department}${agent ? `:${agent.id}` : captainRole ? ':captain' : ''}`
  const emptyDraft = useRef<Config | undefined>(undefined)
  if (!emptyDraft.current) { const draft = blankConfig(actor.department); draft.prompt = identityPromptTemplate; draft.schemaVersion = '2.0'; if (captainRole) draft.tools = [platformBinding('captain')]; draft.definition = defaultDefinition(draft); draft.interaction = defaultInteractionConfig(); draft.interaction.input.modalities = ['text']; draft.expert = { ...profileDefaults(), formVersion: 'compact', iconColor: expertColors[Math.floor(Math.random() * expertColors.length)] }; emptyDraft.current = draft }
  const fresh = () => {
    try { const cache = sessionStorage.getItem(cacheKey); if (cache && !readOnlyView) { const parsed = JSON.parse(cache); if (parsed.config?.name !== undefined && (!agent || parsed.base === configDigest(agent.draft))) return compactConfig(parsed.config, state, agent?.id) } } catch { /* Fall back to a clean draft. */ }
    return agent ? compactConfig(agent.draft, state, agent.id) : clone(emptyDraft.current!)
  }
  const [c, setConfig] = useState<Config>(fresh)
  const [grants, setGrants] = useState<Grant[]>(() => {
    try { const cache = sessionStorage.getItem(cacheKey); if (cache && !readOnlyView && !state.userCenter) { const parsed = JSON.parse(cache); if (Array.isArray(parsed.grants) && (!agent || parsed.base === configDigest(agent.draft))) return parsed.grants } } catch { /* Use the permitted initial scope. */ }
    return agent ? clone(agent.grants) : []
  })
  const [active, setActive] = useState<ExpertSection>(() => { try { const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null'); if (cached && !agent && expertSections.some(([key]) => key === cached.step) && !route.includes('/edit/')) return !agent && runtimeSections.includes(cached.step) ? 'basic' : captainSection(cached.step) } catch {} return captainSection(sectionForRoute(route)) })
  const [submitted, setSubmitted] = useState(false); const [touched, setTouched] = useState<string[]>([]); const [issues, setIssues] = useState<ExpertIssue[]>([])
  const [conflictNotice, setConflictNotice] = useState('')
  const ownWrite = useRef(false)
  const editBase = useRef(agent ? JSON.stringify([compactConfig(agent.draft, state, agent.id), agent.grants, agent.credentialChecked]) : '')
  const [dialog, setDialog] = useState<'icon' | 'prompt' | undefined>(); const [imageError, setImageError] = useState(''); const [copyStatus, setCopyStatus] = useState('')
  const [credentialChecked, setCredentialChecked] = useState(agent?.credentialChecked ?? true)
  const host = useRef<HTMLDivElement>(null); const createdId = useRef<string | undefined>(undefined); const previous = useRef(agent?.updated)
  const base = agent ? compactConfig(agent.draft, state, agent.id) : undefined
  const dirty = agent ? configDigest(c) !== configDigest(base!) || JSON.stringify(grants) !== JSON.stringify(agent.grants) || credentialChecked !== agent.credentialChecked : configDigest(c) !== configDigest(emptyDraft.current!) || JSON.stringify(grants) !== JSON.stringify([])
  const readonly = readOnlyView
  const locked = readonly || busy || !canEdit(actor, agent) || !!agent?.pending || !!agent?.live && !hasChanges(agent)
  const p = c.expert!
  const patch = (value: Partial<Config>) => { setIssues([]); setConfig(current => ({ ...current, ...value })) }
  const profile = (value: Partial<typeof p>) => patch({ expert: { ...p, ...value } })
  const changeName = (name: string) => patch({ name, icon: p.iconStyle === 'letter' ? name.trim().slice(0, 1) || '专' : c.icon, ...(!agent && !p.keyManual ? { expert: { ...p, key: name.trim() ? generatedKey(name, state) : '' } } : {}) })
  const liveIssues = [...expertIssues(state, c, agent?.id, true), ...definitionIssues(c, true, captainRole ? 'captain' : 'agent'), ...validateConfig(state, { ...agent, kind: 'expert', dutyType: captainRole ? 'captain' : undefined, draft: c } as Agent).filter(message => !expertIssues(state, c, agent?.id, true).some(i => i.message === message) && !definitionIssues(c, true, captainRole ? 'captain' : 'agent').some(i => i.message === message)).map(fieldForMessage)]
  const allIssues = [...liveIssues, ...issues.filter(i => !liveIssues.some(v => v.message === i.message))]
  const visibleError = (field: string) => (submitted || touched.includes(field)) ? allIssues.find(i => i.field === field)?.message : undefined
  const error = (field: string) => visibleError(field) && <p className="expert-error" role="alert">{visibleError(field)}</p>
  const touch = (field: string) => setTouched(current => [...new Set([...current, field])])
  const focusField = useRef<string | undefined>(undefined)
  const [focusRevision, requestFocus] = useState(0)
  const jump = useCallback((section: ExpertSection, field?: string) => { focusField.current = field; setActive(['replyLanguage','maxRounds','fallback'].includes(field ?? '') ? 'governance' : captainRole && ['input','io'].includes(section) ? 'skills' : section); requestFocus(revision => revision + 1) }, [captainRole])
  useEffect(() => {
    if (!focusRevision) return
    const target = focusField.current ? host.current?.querySelector<HTMLElement>(`[data-expert-field="${focusField.current}"]`) : host.current?.querySelector<HTMLElement>('.expert-step-heading')
    let parent = target?.parentElement
    while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement }
    target?.scrollIntoView?.({ block: 'start' })
    if (focusField.current) target?.querySelector<HTMLElement>('input,textarea,select,button')?.focus({ preventScroll: true })
    focusField.current = undefined
  }, [focusRevision])
  const previousRoute = useRef(route)
  useEffect(() => { if (route !== previousRoute.current) { previousRoute.current = route; if (route.includes('/edit/') || route.includes('/view/')) setActive(captainSection(sectionForRoute(route))) } }, [route, jump])
  useEffect(() => {
    if (!agent || previous.current === agent.updated) return
    previous.current = agent.updated
    const incoming = compactConfig(agent.draft, state, agent.id)
    if (ownWrite.current || readOnlyView || JSON.stringify([c, grants, credentialChecked]) === editBase.current) {
      setConfig(incoming); setGrants(clone(agent.grants)); setCredentialChecked(agent.credentialChecked); setIssues([]); setConflictNotice('')
    } else setConflictNotice('已保存配置发生变化，当前填写内容已保留。请核对后再保存，或放弃修改重新打开。')
    ownWrite.current = false
    editBase.current = JSON.stringify([incoming, agent.grants, agent.credentialChecked])
  }, [agent?.updated])
  useEffect(() => { if (!createdId.current && dirty) { try { if (JSON.stringify(c, (_, value) => { if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('invalid number'); return value }) === undefined) return; sessionStorage.setItem(cacheKey, JSON.stringify({ config: c, grants, step: active, base: agent ? configDigest(agent.draft) : undefined })); setCopyStatus('') } catch { setCopyStatus('部分数字无效或标签页暂存失败，请修正后保存草稿') } } }, [c, grants, dirty, agent, cacheKey, active])
  const save = useCallback(async (publish = false): Promise<boolean> => {
    setSubmitted(true)
    const normalized = { ...c, name: c.name.trim(), description: c.description.trim() }
    const draftAgent: Agent = agent ? { ...agent, draft: normalized, grants } : { id: '', kind: 'expert', dutyType: captainRole ? 'captain' : undefined, draft: normalized, grants, versions: [], tests: [], disabled: false, updated: '', updatedBy: '', credentialChecked, sync: 'synced' }
    const errors = [...expertIssues(state, normalized, agent?.id, publish), ...definitionIssues(normalized, publish, captainRole ? 'captain' : 'agent'), ...(publish ? [...validateConfig(state, draftAgent).filter(message => !expertIssues(state, normalized, agent?.id, true).some(i => i.message === message)).map(fieldForMessage)] : [])]
    if (errors.length) { setIssues(errors); jump(errors[0].section, errors[0].field); return false }
    setIssues([])
    const action: CampusAction = agent ? { type: 'save', id: agent.id, config: normalized, credentialChecked, ...(JSON.stringify(grants) !== JSON.stringify(agent.grants) ? { grants } : {}), publish } : { type: 'create', kind: 'expert', dutyType: captainRole ? 'captain' : undefined, config: normalized, publish }
    const ok = await commit(action, undefined, id => { ownWrite.current = true; if (id) createdId.current = id; try { sessionStorage.removeItem(cacheKey) } catch { /* Persisted data is authoritative. */ } })
    if (ok) { setSubmitted(false); setConflictNotice(''); const back = new URLSearchParams(route.split('?')[1] ?? '').get('returnTo'); if (!agent && createdId.current && back?.startsWith('/agents/')) navigate(`/agents/${createdId.current}/edit/basic?returnTo=${encodeURIComponent(back)}`) }
    return ok
  }, [c, grants, agent, state, credentialChecked, commit, cacheKey, jump, route, navigate, captainRole])
  useEffect(() => { onDirty(dirty, () => save(false), () => { sessionStorage.removeItem(cacheKey); setConfig(agent ? compactConfig(agent.draft, state, agent.id) : fresh()); setGrants(agent ? clone(agent.grants) : []); setCredentialChecked(agent?.credentialChecked ?? true); setSubmitted(false); setTouched([]); setIssues([]) }); return () => onDirty(false) }, [dirty, save, onDirty])
  const uploadIcon = async (file?: File) => {
    setImageError(''); if (!file) return
    if (file.size > 1024 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) { setImageError('请选择不超过 1MB 的 PNG 或 JPG'); return }
    const reader = new FileReader(); reader.onerror = () => setImageError('图标读取失败，请重新选择')
    reader.onload = () => { const src = String(reader.result); const image = new Image(); image.onload = () => setConfig(current => ({ ...current, expert: { ...current.expert!, iconStyle: 'upload', iconImage: src } })); image.onerror = () => setImageError('图片无法读取，请换一张图片'); image.src = src }; reader.readAsDataURL(file)
  }
  const currentAgent = agent ?? ({ id: '', kind: 'expert', credentialChecked: true } as Agent)
  const greeting = `你好，我是${c.name || '{智能体名称}'}，${c.description || '{简介}'}`
  const returnTo = new URLSearchParams(route.split('?')[1] ?? '').get('returnTo')
  const legacyIds = c.tools.filter(b => { const cap = capabilityCatalog.find(cap => cap.id === b.id); return !cap }).map(b => b.id)
  const questionMove = (from: number, to: number) => { const questions = [...p.questions]; questions.splice(to, 0, questions.splice(from, 1)[0]); profile({ questions }) }
  // Retain an error-recovery path for technical values in older unsaved drafts.
  const steps = configurationSteps.filter(step => (!captainRole || step.key !== 'input') && (agent || runtimeSections.includes(active) || step.key !== 'model')).map(step => captainRole && step.key === 'skills' ? { ...step, label: '协作能力' } : step)
  const stepIndex = steps.findIndex(step => step.sections.includes(active))
  const step = steps[stepIndex]
  const showing = (section: ExpertSection) => step.sections.includes(section)
  const legacyResponsibilities = legacyResponsibilityText(c)
  const mergedPrompt = [c.prompt, legacyResponsibilities].filter(Boolean).join('\n\n')
  return <div className={`expert-workspace expert-step-workspace${!agent ? ' expert-creation' : ''}`} data-step={step.key} ref={host}>
    <div className="expert-editor-top"><div className="expert-editor-identity"><Button variant="ghost" onClick={() => navigate('/agents')}>← 智能体中心</Button><div className="expert-editor-title"><h1>{agent ? c.name || objectLabel(agent) : captainRole ? '创建队长智能体' : '创建普通专家'}</h1><span className="expert-state">{agent?.disabled ? '已停用' : agent?.pending ? '待发布确认' : agent?.live ? `已发布 v${agent.live}${hasChanges(agent) ? ' · 有新草稿' : ''}` : '草稿'}</span></div>{!agent && <p className="expert-creation-intro">{captainRole ? '组织专家团协作，分派任务并汇总结果。' : multiAgentEnabled ? '默认在专家团中工作，创建后可开放独立使用。' : '配置专业职责、工作能力与输入输出，独立处理用户任务。'}</p>}</div>{agent && <div className="expert-editor-actions"><span className="expert-save-state">{dirty ? '有未保存修改' : '已保存'}</span><Button disabled={locked || !dirty && !!agent.draft.expert} onClick={() => void save(false)}>保存草稿</Button></div>}</div>
    {readonly && agent && <Notice>查看已保存配置 · 只读{canEdit(actor, agent) && <Button onClick={() => navigate(`/agents/${agent.id}/edit/basic`)}>进入编辑</Button>}</Notice>}
    {conflictNotice && <Notice tone="warning">{conflictNotice}</Notice>}
    {copyStatus && <Notice tone="warning">{copyStatus}</Notice>}
    {agent && <div className="expert-secondary-actions">{multiAgentEnabled && returnTo?.startsWith('/agents/') && <Button onClick={() => navigate(returnTo)}>返回专家团</Button>}{canEdit(actor, agent) && agent.live && !hasChanges(agent) && !agent.pending && <Button disabled={busy} onClick={() => void commit({ type: 'from-version', id: agent.id, version: agent.live! })}>基于此版本创建草稿</Button>}</div>}
    {agent?.pending && <Notice>当前配置等待发布确认，暂时只读。<Button onClick={() => navigate(`/agents/${agent.id}/edit/release`)}>处理发布确认</Button></Notice>}
    {agent?.live && !hasChanges(agent) && <Notice>已发布 v{agent.live} · 配置只读。创建草稿后修改，再发布新版本。</Notice>}
    <div className="expert-form-layout"><div className="expert-form-main">
    {agent ? <AgentNavigation showGrants={!state.userCenter} agent={agent} active={step.key} onSelect={key => { const target = configurationSteps.find(item => item.key === key); if (target) jump(target.key); else navigate(`/agents/${agent.id}/edit/${key}`) }} /> : <nav className="expert-anchors" aria-label="专家表单分区">{steps.map((item,index) => <button key={item.key} aria-label={item.label} aria-current={stepIndex === index ? 'step' : undefined} onClick={() => jump(item.key)}><span className="expert-anchor-number">{index+1}</span>{item.label}{submitted && liveIssues.some(i => item.sections.includes(i.section)) && <i aria-label={`${item.label}待完善`} />}</button>)}</nav>}
    <div className="expert-form-content"><div className="expert-step-heading"><h2>{step.label}</h2><p>{captainRole && step.key === 'skills' ? '确认协作方式，设置协调模型与异常接管。' : step.hint}</p></div>
      <ConfigReadView captain={captainRole} config={c} section={step.key} readonly={locked && !!agent}>
      {(active === 'review' ? liveIssues.length > 0 : submitted && issues.length > 0) && <Notice tone="error"><strong>请先修正以下内容</strong><ul>{(active === 'review' ? liveIssues : issues).map((i,index) => <li key={`${i.field}-${index}`}><button className="campus-issue-link" onClick={() => jump(i.section,i.field)}>{i.message}</button></li>)}</ul></Notice>}
      {showing('basic') && <section data-expert-section="basic"><Section title="名称与归属">
        <div className="expert-identity-row"><div data-expert-field="icon"><Button disabled={locked} className="expert-avatar" style={{ backgroundColor: p.iconColor }} onClick={() => setDialog('icon')} aria-label="选择图标">{p.iconStyle === 'upload' && p.iconImage ? <img src={p.iconImage} alt="专家图标" /> : p.iconStyle === 'letter' ? c.name.trim().slice(0, 1) || '专' : c.icon}</Button><small>更换头像</small>{error('icon')}</div><div data-expert-field="name"><Field className="expert-counted-field" label="智能体名称" required hint={`${c.name.length}/20`}><input aria-label="智能体名称" disabled={locked} aria-invalid={!!visibleError('name')} maxLength={20} value={c.name} placeholder={captainRole ? '例如：会议协作队长' : '例如：差旅报销助手'} onChange={e => changeName(e.target.value)} onBlur={() => { changeName(c.name.trim()); touch('name') }} /></Field>{error('name')}{error('key')}</div></div>
        <div data-expert-field="description"><Field className="expert-counted-field" label="简介" required hint={`${c.description.length}/60`}><textarea aria-label="简介" disabled={locked} aria-invalid={!!visibleError('description')} value={c.description} maxLength={60} rows={2} placeholder={captainRole ? '例如：分派会议筹备任务，协调专家进度，汇总交付结果' : '例如：帮员工了解报销标准、核对材料，少走流程弯路'} onChange={e => patch({ description: e.target.value })} onBlur={() => touch('description')} /></Field>{error('description')}</div>
        {agent && <div className="expert-role-summary"><strong>{captainRole ? '队长智能体' : '普通专家'}</strong><p>{captainRole ? '专门组织专家团协作，不能独立聊天。' : multiAgentEnabled ? '默认仅供专家团内使用，可在使用授权中开放独立使用。' : '独立处理任务，在使用授权中设置可使用的人员与部门。'}</p><small>创建后角色固定</small></div>}
        <div className="form-grid expert-ownership"><Field label="所属部门"><select aria-label="所属部门" value={c.department} disabled={locked || actor.role !== 'admin'} onChange={e => patch({ department: e.target.value, owner: people.find(p => p.department === e.target.value)!.id })}>{departments.map(d => <option key={d}>{d}</option>)}</select></Field><Field label="责任人"><select aria-label="责任人" disabled={locked} value={c.owner} onChange={e => patch({ owner: e.target.value })}>{people.filter(person => person.department === c.department).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field></div>
      </Section></section>}
      {showing('conversation') && <section data-expert-section="conversation"><Section title="职责与提示词" description={captainRole ? "写清队长负责协调什么、协作边界和表达要求。" : "写清身份、职责范围和表达要求，工作步骤在下一步配置。"}>
        <div data-expert-field="prompt" className="expert-prompt-area"><PromptFields actions={<Button variant="ghost" onClick={() => setDialog('prompt')}>全屏编辑提示词</Button>} state={state} actor={actor} agent={{ ...currentAgent, credentialChecked }} config={c} set={patch} credentialChecked={credentialChecked} setCredentialChecked={setCredentialChecked} teamId={returnTo?.split('/')[2]} formMode disabled={locked} />{error('prompt')}</div>
        {legacyResponsibilities && <details className="expert-foldout"><summary>查看原职责说明</summary><pre className="team-prompt-preview">{legacyResponsibilities}</pre><p className="campus-hint">原有内容已保留。合并会追加到提示词，保存草稿后统一在提示词中维护。</p><Button disabled={locked || mergedPrompt.length > 4000} onClick={() => patch({ prompt: mergedPrompt, definition: { ...c.definition!, task: { ...c.definition!.task, audience: '', supported: '', prohibited: '', preconditions: '' } } })}>合并到提示词</Button>{mergedPrompt.length > 4000 && <p className="campus-hint">合并后会超过 4000 字，请先精简提示词。原职责说明仍保留。</p>}</details>}

        {!credentialChecked && <label className="campus-check"><input type="checkbox" checked={credentialChecked} disabled={locked} onChange={e => setCredentialChecked(e.target.checked)} />已确认复制后的模型选择</label>}
      </Section></section>}
      {!agent && !captainRole && showing('skills') && <div className="expert-model-choice"><Field label="模型"><select aria-label="模型" disabled={locked} value={c.model} onChange={e => patch({ model: e.target.value })}>{models.map(m => <option key={m.id} value={m.id} disabled={!m.active}>{m.name}{!m.active ? '（已停用）' : ''}</option>)}</select></Field><p className="campus-hint">已预选默认模型，可按需更换。</p></div>}
      {captainRole && showing('skills') && <CaptainCapabilities state={state} agentId={agent?.id} config={c} patch={patch} disabled={locked} issues={submitted ? allIssues : []} navigate={navigate} />}
      {!captainRole && showing('skills') && <section data-expert-section="skills"><Section title="技能" description="可复用的工作方法与操作规范。"><ExpertResources kind="skill" config={c} onChange={patch} disabled={locked} navigate={navigate} />
        {(legacyIds.length > 0) && <div className="expert-legacy-resources"><h3>原有扩展配置</h3><p>以下旧配置已保留，可核对或移除；资源由原有绑定继续管理。</p><CapabilityFields config={c} onChange={patch} disabled={locked} promptOutput onlyIds={legacyIds} />{error('knowledge')}</div>}
      </Section></section>}
      {showing('tools') && !captainRole && <section data-expert-section="tools" data-expert-field="tools"><Section title="工具" description="查询资料、安排日程或执行其他操作。"><ExpertResources kind="builtin" config={c} onChange={patch} disabled={locked} navigate={navigate} /><McpBindings config={c} patch={patch} disabled={locked} />{error('tools')}</Section></section>}
      {showing('experience') && !captainRole && <details className="expert-foldout" open={active === 'experience'}><summary>开场白与推荐问题（选填）</summary><section data-expert-section="experience"><Section title="对话体验" description="独立使用时展示。留空使用默认开场白。">
        <div data-expert-field="opening"><Field className="expert-counted-field" label="开场白" hint={`${c.opening.length}/200`}><textarea aria-label="开场白" disabled={locked} rows={3} maxLength={200} value={c.opening} placeholder={greeting} onChange={e => patch({ opening: e.target.value })} /></Field><div className="expert-field-actions"><small>留空时，自动用名称和简介打招呼。</small><Button disabled={locked || (c.opening || greeting).length + 5 > 200} onClick={() => patch({ opening: `${c.opening || greeting}{用户名}` })}>插入用户名</Button><Button disabled={locked || !c.opening} onClick={() => patch({ opening: '' })}>恢复默认开场白</Button></div>{error('opening')}</div>
        <div className="expert-field-group" data-expert-field="questions"><div className="expert-group-heading"><div><h3>引导问题</h3><p>用户点击就能提问，最多 4 条。</p></div><Button icon={Plus} disabled={locked || p.questions.length >= 4} onClick={() => profile({ questions: [...p.questions, ''] })}>添加推荐问题</Button></div>{!p.questions.length && <p className="expert-inline-empty">例如：出差住宿标准是多少？</p>}{p.questions.map((q, index) => <div className="expert-list-row" key={index}><span className="expert-question-number" aria-hidden="true">{index + 1}</span><Field className="expert-counted-field expert-question-field" label={`推荐问题 ${index + 1}`} hint={`${q.length}/30`}><input aria-label={`推荐问题 ${index + 1}`} disabled={locked} value={q} maxLength={30} placeholder="例如：出差住宿标准是多少？" onChange={e => profile({ questions: p.questions.map((v, i) => i === index ? e.target.value : v) })} /></Field><div className="expert-row-actions"><IconButton icon={ArrowUp} disabled={locked || !index} label={`上移问题${index + 1}`} onClick={() => questionMove(index,index-1)} /><IconButton icon={ArrowDown} disabled={locked || index === p.questions.length-1} label={`下移问题${index + 1}`} onClick={() => questionMove(index,index+1)} /><IconButton icon={Xmark} disabled={locked} label={`删除问题${index + 1}`} onClick={() => profile({ questions: p.questions.filter((_, i) => i !== index) })} /></div></div>)}{error('questions')}</div>
      </Section></section></details>}
      {!agent && !captainRole && showing('skills') && <details className="expert-foldout"><summary><span>人工兜底（选填）</span><small>{runtimeSummary(c, 'handoff')}</small></summary><section data-expert-section="handoff"><DefinitionFields config={c} section="handoff" patch={patch} disabled={locked} issues={submitted ? allIssues : []} /></section></details>}
      {showing('input') && <InputOutputWorkspace config={c} active={active === 'io' ? 'io' : 'input'} onSelect={jump} patch={patch} disabled={locked} issues={submitted ? allIssues : []} />}
      {(['handoff', 'model', 'knowledge', 'governance', 'review'] as const).filter(section => showing(section)).map(section => section === 'review' ? <section key={section} data-expert-section={section}><DefinitionFields issues={submitted ? allIssues : []} config={c} section={section} patch={patch} disabled={locked} creation={!agent} captain={captainRole} /></section> : <details className="expert-foldout" key={section} open={section === active || submitted && allIssues.some(i => i.section === section)}><summary><span>{expertSections.find(([key]) => key === section)?.[1]}</span><small>{runtimeSummary(c, section)}</small></summary><section data-expert-section={section}><DefinitionFields captain={captainRole} issues={submitted ? allIssues : []} config={c} section={section} patch={patch} disabled={locked} /></section></details>)}

      {showing('governance') && !captainRole && <details className="expert-foldout" open={submitted && allIssues.some(i => ['replyLanguage','maxRounds','fallback'].includes(i.field))}><summary>对话偏好与异常提示（选填）</summary><Section title="对话偏好" description="已有配置继续保留，按需调整。"><div className="form-grid"><Field label="回复语言"><select aria-label="回复语言" disabled={locked} value={p.replyLanguage ?? 'auto'} onChange={e => profile({ replyLanguage: e.target.value as 'auto' | 'zh' | 'en' })}><option value="auto">跟随用户</option><option value="zh">中文</option><option value="en">英文</option></select></Field><Field label="单次对话最多轮次"><input aria-label="单次对话最多轮次" disabled={locked} type="number" min={10} max={200} value={p.maxRounds ?? 50} onChange={e => profile({ maxRounds: Number(e.target.value) })} /></Field></div>        <div className="expert-field-group"><h3>用户看到的处理过程</h3><div className="expert-segmented">{[[true,'显示摘要'],[false,'隐藏']] .map(([value,label]) => <label className="campus-check" key={String(value)}><input type="radio" name="expert-progress" disabled={locked} checked={(p.showProgress ?? true) === value} onChange={() => profile({ showProgress: value as boolean })} />{label}</label>)}</div><p className="campus-hint">摘要展示正在使用的工具或参考的技能。</p></div>
        <div className="expert-field-group" data-expert-field="fallback"><div className="expert-group-heading"><div><h3>遇到问题时怎么说</h3><p>留空会使用默认话术。</p></div></div><div className="form-grid"><Field label="无法回答时"><textarea rows={3} aria-label="无法回答时" value={p.unansweredReply ?? ''} maxLength={200} disabled={locked} placeholder={fallbackReplies.unanswered} onChange={e => profile({ unansweredReply:e.target.value })} /></Field><Field label="系统异常时"><textarea rows={3} aria-label="系统异常时" value={p.errorReply ?? ''} maxLength={200} disabled={locked} placeholder={fallbackReplies.error} onChange={e => profile({ errorReply:e.target.value })} /></Field></div>{error('fallback')}</div>
</Section></details>}
      </ConfigReadView>
    </div>
    <div className="expert-step-footer"><span className="expert-save-state">{agent ? '草稿与发布版本独立保存' : dirty ? '有未保存修改 · 已在本标签页暂存' : '创建后可继续编辑和发布'}</span><div>{!agent && stepIndex < steps.length - 1 && <Button disabled={locked} onClick={() => void save(false)}>保存草稿</Button>}{stepIndex > 0 && <Button variant="ghost" onClick={() => jump(steps[stepIndex-1].key)}>上一步</Button>}{stepIndex < steps.length - 1 ? <Button variant="primary" onClick={() => jump(steps[stepIndex+1].key)}>下一步：{steps[stepIndex+1].label}<span aria-hidden="true">→</span></Button> : <Button variant="primary" disabled={locked} onClick={() => void save(false)}>{agent ? '保存配置' : '创建草稿'}</Button>}</div></div>
    </div></div>
    {dialog && <div className={dialog === 'prompt' ? 'expert-fullscreen expert-dialog' : `expert-dialog expert-${dialog}-dialog`}><Modal title={dialog === 'icon' ? '选择专家图标' : '系统提示词'} onClose={() => setDialog(undefined)}>
      {dialog === 'icon' && <><div className="expert-icon-choices"><Button aria-pressed={p.iconStyle === 'letter'} onClick={() => profile({ iconStyle:'letter', iconImage:'' })}>名称首字</Button>{['✦','✎','✓','◈','☀','♧','✈','⚙','⚑','☂','♟','✉','⌘','◎','❖','♜','✿','☕','⚖','⚒'].map(icon => <Button key={icon} aria-pressed={p.iconStyle === 'preset' && c.icon === icon} onClick={() => patch({ icon, expert:{...p,iconStyle:'preset',iconImage:''} })}>{icon}</Button>)}</div><div className="expert-icon-colors">{expertColors.map(color => <Button aria-label={`图标底色${color}`} aria-pressed={p.iconColor === color} key={color} style={{ background:color }} onClick={() => profile({iconColor:color})}>{p.iconColor === color ? '✓' : ' '}</Button>)}</div><Field label="上传图标" hint="PNG / JPG，最多 1MB，建议 256×256，按正方形显示。"><input type="file" aria-label="上传图标" accept="image/png,image/jpeg" onChange={e => void uploadIcon(e.target.files?.[0])} /></Field>{imageError && <Notice tone="error">{imageError}</Notice>}</>}
      {dialog === 'prompt' && <Field label="系统提示词" required hint={`${c.prompt.length}/4000`}><textarea aria-label="全屏系统提示词" readOnly={locked} rows={18} maxLength={4000} value={c.prompt} onChange={e => patch({prompt:e.target.value})} /></Field>}

      <footer><Button onClick={() => setDialog(undefined)}>完成</Button></footer>
    </Modal></div>}
  </div>
}
