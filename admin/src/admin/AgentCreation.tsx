import { ContractFields } from './ContractFields'
import { defaultContract } from './agent-management'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Sparks } from 'iconoir-react'
import { Button, Field, Notice, Tag } from './components'
import { CapabilityPicker } from './CapabilityPicker'
import { CREATION_STORAGE_KEY, creationIssues, creationSteps, newCreationSession, prepareAgentDraft, readCreationSession, type CreationIssue } from './agent-creation'
import { parseConfig } from './config-validation'
import { effectivePrompt, formatLabels, templates } from './guided-config'
import { prototypeStore } from './prototype-store'
import { purposeLabels, type AdminState, type AgentConfig, type GuidedSetup } from './shared'
import './AgentCreation.css'

const stepDescriptions = [
  ['你希望它帮你做什么？', '从一件具体的工作开始，用平常说话的方式描述就好。'],
  ['它需要哪些信息才能开始？', '说明用户每次要提供什么，再决定它可以使用哪些资源。'],
  ['你希望收到怎样的结果？', '选一个方便使用的形式，再说清楚结果必须包含什么。'],
  ['哪些事情需要先由你确认？', '默认在交付前请你确认。其他设置可以先使用推荐值。'],
  ['检查一下，就可以创建了', '下面是你约定的工作方式。需要调整时，可以直接返回对应步骤。']
] as const
const stepTips = [
  '可以这样写：收到什么材料 → 帮我完成什么 → 交付什么结果。先聚焦一项工作，之后还可以调整。',
  '这里只约定所需资料，不需要现在上传。每次使用时，再提供对应的材料。',
  '写得具体，才容易验收。例如：列出 3 项主要风险，每项附上材料出处和建议。',
  '资料不足时先补问；没有依据时说明不确定。对外发送或写入始终需要单独确认。',
  '创建后会保存为草稿。你可以继续测试、调整，再决定什么时候发布。'
] as const

export function AgentCreation({ data, navigate, reload, onDirty, notify }: { data: AdminState; navigate: (path: string) => void; reload: () => Promise<void>; onDirty: (dirty: boolean) => void; notify: (message: string) => void }) {
  const [initial] = useState(() => {
    try {
      const raw = window.sessionStorage.getItem(CREATION_STORAGE_KEY)
      return { session: raw ? readCreationSession(raw, data) : newCreationSession(data), restored: !!raw, warning: '' }
    } catch {
      return { session: newCreationSession(data), restored: false, warning: '上次填写的内容暂时无法恢复。你可以重新填写，已创建的智能体不受影响。' }
    }
  })
  const [session, setSession] = useState(initial.session)
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const [restored, setRestored] = useState(initial.restored)
  const [errors, setErrors] = useState<CreationIssue[]>([])
  const [saveError, setSaveError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdId, setCreatedId] = useState<string>()
  const saving = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const { draft, step, reached, started } = session
  const setup = draft.setup!
  const contract = draft.contract ?? defaultContract()

  useEffect(() => {
    if (!started || createdId) { onDirty(false); return }
    try {
      // Keep the last valid snapshot when a numeric setting is temporarily invalid.
      parseConfig('agent', draft)
    } catch {
      setStorageWarning('部分设置需要调整，当前修改尚未暂存。请完成填写后再离开。'); onDirty(true); return
    }
    try {
      window.sessionStorage.setItem(CREATION_STORAGE_KEY, JSON.stringify({ schema: 1, ...session }))
      setStorageWarning(''); onDirty(false)
    } catch {
      setStorageWarning('浏览器暂存不可用。请保持页面打开，填写完成后创建草稿。'); onDirty(true)
    }
  }, [session, createdId, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [step])
  useEffect(() => { if (errors.length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus() }, [errors])

  const patch = (changes: Partial<AgentConfig>) => {
    onDirty(true); setRestored(false); setErrors([]); setSaveError('')
    setSession(current => ({ ...current, started: true, draft: prepareAgentDraft({ ...current.draft, ...changes }) }))
  }
  const updateSetup = (changes: Partial<GuidedSetup>) => patch({
    setup: { ...setup, ...changes },
    ...(changes.resourceScope === 'provided' ? { capabilityVersionIds: data.capabilities.filter(c => c.id === 'capability.text-analysis.v1').map(c => c.id) } : {})
  })
  const errorFor = (field: string) => errors.find(issue => issue.field === field)
  const errorText = (field: string) => errorFor(field) && <span className="creation-field-error" id={`creation-error-${field}`}>{errorFor(field)!.message}</span>
  const fieldProps = (field: string) => ({ 'aria-invalid': !!errorFor(field), 'aria-describedby': errorFor(field) ? `creation-error-${field}` : undefined })
  const moveTo = (next: number) => {
    if (busy || createdId) return
    const blockers = next > step ? creationIssues(draft, data).filter(issue => issue.step < next) : []
    if (blockers.length) {
      setErrors(blockers); setSession(current => ({ ...current, step: blockers[0].step })); return
    }
    setErrors([]); setSession(current => ({ ...current, step: next, reached: Math.max(current.reached, next) }))
  }
  const submit = async () => {
    if (saving.current) return
    if (step < 4) { moveTo(step + 1); return }
    const blockers = creationIssues(draft, data)
    if (blockers.length) { setErrors(blockers); setSession(current => ({ ...current, step: blockers[0].step })); return }
    saving.current = true; setBusy(true); setSaveError('')
    try {
      const id = createdId ?? prototypeStore().create('agent', prepareAgentDraft(draft)).id
      setCreatedId(id)
      try { window.sessionStorage.removeItem(CREATION_STORAGE_KEY) } catch { /* Creation itself is already persisted in the prototype store. */ }
      onDirty(false)
      await reload()
      notify('智能体已创建并保存为草稿，可以继续测试和发布')
      navigate(`/agents/${id}`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '暂时无法创建，填写内容已保留，请重试。')
    } finally { saving.current = false; setBusy(false) }
  }
  const useExample = (id: typeof templates[number]['id']) => {
    const example = templates.find(t => t.id === id)!
    // Examples help with wording; they never overwrite materials, output or permissions already entered.
    patch({ description: example.goal })
  }
  const selection = (value: string, checked: boolean, label: string, description: string, onChange: () => void, name: string) => <label className={`creation-choice ${checked ? 'is-selected' : ''}`} key={value}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
    <span><strong>{label}</strong><small>{description}</small></span>
  </label>
  const reviewSection = (index: number, title: string, content: React.ReactNode) => <section className="creation-review-section">
    <div><h3>{title}</h3><Button variant="ghost" aria-label={`修改${title}`} onClick={() => moveTo(index)}>修改<ArrowRight width={14} /></Button></div>{content}
  </section>

  return <div className="agent-creation">
    <div className="creation-topline"><button className="creation-back" onClick={() => navigate('/agents')}><ArrowLeft width={16} />返回智能体中心</button><span className="creation-save-state" role="status">{createdId ? '草稿已创建' : started ? storageWarning ? '当前填写尚未暂存' : '填写内容已暂存 · 刷新可继续' : '填写后自动暂存'}</span></div>
    <header className="creation-heading"><div><span className="eyebrow">从一项具体工作开始</span><h1>创建智能体</h1><p>一步一步说清工作方式，专业配置可以稍后调整。</p></div><span className="creation-step-count">第 <strong>{step + 1}</strong> / 5 步</span></header>
    <nav aria-label="创建步骤"><ol className="creation-steps">{creationSteps.map((label, index) => <li key={label} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''}>
      <button type="button" aria-current={index === step ? 'step' : undefined} disabled={index > reached || busy || !!createdId} onClick={() => moveTo(index)}><span>{index < step ? <Check width={14} /> : index + 1}</span><strong>{label}</strong></button>
    </li>)}</ol></nav>
    {restored && <Notice>已恢复上次填写的内容，可以接着完成。<Button variant="ghost" onClick={() => setRestored(false)}>知道了</Button></Notice>}
    {storageWarning && <Notice tone="warning">{storageWarning}</Notice>}
    {saveError && <Notice tone="error">{createdId ? '草稿已创建，但页面暂时无法刷新。请点击下方按钮重新打开，不会重复创建。' : saveError}</Notice>}
    <div className="creation-layout">
      <form className="creation-form" ref={form} noValidate onSubmit={event => { event.preventDefault(); void submit() }}>
        <div className="creation-form-heading"><h2 ref={heading} tabIndex={-1}>{stepDescriptions[step][0]}</h2><p>{stepDescriptions[step][1]}</p></div>
        <fieldset className="creation-fields" disabled={busy || !!createdId}>
          {step === 0 && <>
            <Field label="给它起个名字" required hint="2–20 个字，方便你和同事找到它。"><input autoComplete="off" aria-label="智能体名称" placeholder="例如：项目材料分析助手" maxLength={20} value={draft.name} onChange={e => patch({ name: e.target.value })} {...fieldProps('name')} />{errorText('name')}</Field>
            <Field label="它主要帮你完成什么工作" required hint="说明要处理什么、做到什么程度。10–500 个字。"><textarea aria-label="工作目标" rows={5} maxLength={500} placeholder="例如：收到项目方案后，帮我梳理关键事实、主要风险和缺失信息，整理成一份便于评审的清单。" value={draft.description} onChange={e => patch({ description: e.target.value })} {...fieldProps('description')} />{errorText('description')}</Field>
            <div className="creation-examples"><span>没有思路？填入一个例子</span><div>{templates.map(t => <button key={t.id} type="button" onClick={() => useExample(t.id)}>{t.name}<ArrowRight width={13} /></button>)}</div></div>
          </>}
          {step === 1 && <>
            <Field label="每次需要用户提供什么" required hint="列出必要信息。缺少这些内容时，先向用户补问。"><textarea aria-label="所需资料" rows={4} maxLength={2000} placeholder="例如：项目背景、待分析的方案、这次最关心的问题。" value={setup.inputDescription} onChange={e => updateSetup({ inputDescription: e.target.value })} {...fieldProps('inputDescription')} />{errorText('inputDescription')}</Field>
            <details className="creation-advanced" open={errors.some(i => i.field === 'contract.inputFields' || i.field === 'contract.followUpFields') || undefined}><summary>把所需资料做成表单 <span>选填，适合固定收集的信息</span></summary><div>
              <ContractFields label="输入" fields={contract.inputFields} onChange={inputFields => patch({ contract: { ...contract, inputFields } })} />
              <Field label="缺少必要输入时"><select aria-label="缺少必要输入时" value={contract.missingInputPolicy} onChange={e => patch({ contract: { ...contract, missingInputPolicy: e.target.value as 'ask' | 'reject' } })}><option value="ask">请用户补充后继续</option><option value="reject">停止并说明缺失项</option></select></Field>
              <details className="prompt-disclosure"><summary>运行中可能需要补充什么</summary><ContractFields label="补充" fields={contract.followUpFields ?? []} onChange={followUpFields => patch({ contract: { ...contract, followUpFields } })} /></details>
            </div></details>
            <fieldset className="creation-options"><legend>可以使用哪些资源</legend>
              {selection('provided', setup.resourceScope === 'provided', '仅使用用户提供的材料', '适合从文档分析、问答和写作开始。', () => updateSetup({ resourceScope: 'provided' }), 'resourceScope')}
              {selection('selected', setup.resourceScope === 'selected', '还需要其他能力与资源', '按需要选择；使用时仍须取得相应授权。', () => updateSetup({ resourceScope: 'selected' }), 'resourceScope')}
            </fieldset>
            {setup.resourceScope === 'selected' && <CapabilityPicker capabilities={data.capabilities} selectedIds={draft.capabilityVersionIds} onChange={capabilityVersionIds => patch({ capabilityVersionIds })} error={errorFor('capabilityVersionIds')?.message} />}
            {setup.resourceScope !== 'selected' && errorText('capabilityVersionIds')}
          </>}
          {step === 2 && <>
            <fieldset className="creation-options"><legend>希望收到什么形式</legend><div className="creation-format-options">
              {selection('document', setup.outputFormat === 'document', '文档', '报告、解答、建议', () => updateSetup({ outputFormat: 'document' }), 'outputFormat')}
              {selection('table', setup.outputFormat === 'table', '表格', '清单、对比、核对', () => updateSetup({ outputFormat: 'table' }), 'outputFormat')}
              {selection('form', setup.outputFormat === 'form', '表单', '字段化展示，可修改后确认', () => updateSetup({ outputFormat: 'form' }), 'outputFormat')}
              {selection('json', setup.outputFormat === 'json', '结构化数据', 'JSON，便于系统读取', () => updateSetup({ outputFormat: 'json' }), 'outputFormat')}
            </div></fieldset>
            <Field label="结果里必须包含什么" required hint="写成可以逐项核对的要求，方便判断工作是否完成。"><textarea aria-label="交付要求" rows={5} maxLength={2000} placeholder="例如：关键事实清单、3 项主要风险、每项风险对应的材料出处，以及需要继续确认的问题。" value={draft.output} onChange={e => patch({ output: e.target.value })} {...fieldProps('output')} />{errorText('output')}</Field>
            {(setup.outputFormat !== 'document' || contract.outputFields.length > 0) && <ContractFields label="输出" fields={contract.outputFields} onChange={outputFields => patch({ contract: { ...contract, outputFields } })} />}
            <Field label="还有什么专业或表达要求" hint="选填，例如用简洁中文、先给结论、区分事实与推测。"><textarea aria-label="补充要求" rows={2} maxLength={2000} placeholder="按你的习惯补充，也可以先留空。" value={setup.supplement} onChange={e => updateSetup({ supplement: e.target.value })} /></Field>
          </>}
          {step === 3 && <>
            <fieldset className="creation-options"><legend>结果什么时候交付</legend>
              {selection('delivery', setup.approval === 'delivery', '先由我确认，再交付', '推荐从这里开始，保留一次人工核对。', () => updateSetup({ approval: 'delivery' }), 'approval')}
              {selection('external', setup.approval === 'external', '完成后直接展示结果', '适合你可以自行判断和使用的分析、问答。', () => updateSetup({ approval: 'external' }), 'approval')}
            </fieldset>
            <div className="creation-boundary"><ShieldCheck width={20} /><div><strong>对外操作始终单独确认</strong><p>发送消息、覆盖文件或写入业务系统时，需要核对具体内容和影响。上面的选择只决定结果如何交付。</p></div></div>
            {errors.some(i => i.field === 'instructions') && <Notice tone="error"><strong>工作要求与所选规则存在冲突</strong>{errors.filter(i => i.field === 'instructions').map((issue, i) => <p key={i}>{issue.message}</p>)}<div className="row-actions"><Button onClick={() => moveTo(0)}>修改工作目标</Button><Button onClick={() => moveTo(2)}>修改交付要求</Button></div></Notice>}
            <details className="creation-advanced" open={errors.some(i => i.step === 3 && i.field !== 'instructions') || undefined}><summary>高级设置 <span>已有默认值，可以直接继续</span></summary><div>
              <div className="form-grid"><Field label="责任人" required><input aria-label="责任人" maxLength={60} value={draft.owner} onChange={e => patch({ owner: e.target.value })} {...fieldProps('owner')} />{errorText('owner')}</Field><Field label="使用方式"><select aria-label="使用方式" value={draft.purpose} onChange={e => patch({ purpose: e.target.value as AgentConfig['purpose'] })}><option value="expert">独立使用</option><option value="business">作为专家组成员</option><option value="coordinator">协调专家组工作</option></select></Field></div>
              <Field label="运行模型"><select aria-label="运行模型" value={draft.modelId} onChange={e => patch({ modelId: e.target.value as AgentConfig['modelId'] })} {...fieldProps('modelId')}>{data.models.map(m => <option key={m.modelId} value={m.modelId}>{m.modelId} · {m.provider}</option>)}</select>{errorText('modelId')}</Field>
              <div className="form-grid"><Field label="最多执行多少步"><input type="number" aria-label="最大执行步骤" min={1} max={200} value={draft.maxSteps} onChange={e => patch({ maxSteps: Number(e.target.value) })} {...fieldProps('maxSteps')} />{errorText('maxSteps')}</Field><Field label="每次最多运行多少秒"><input type="number" aria-label="执行时限" min={1} max={3600} value={draft.timeoutSeconds} onChange={e => patch({ timeoutSeconds: Number(e.target.value) })} {...fieldProps('timeoutSeconds')} />{errorText('timeoutSeconds')}</Field></div>
              <fieldset className="creation-options"><legend>允许使用的记忆范围</legend><div className="check-options">{([['task', '本次任务'], ['employee', '此智能体'], ['global', '工作区共享']] as const).map(([id, label]) => <label key={id}><input type="checkbox" checked={draft.memoryScopes.includes(id)} onChange={e => patch({ memoryScopes: e.target.checked ? [...draft.memoryScopes, id] : draft.memoryScopes.filter(s => s !== id) })} />{label}</label>)}</div><p className="muted">默认只使用本次任务的信息；这里只保存范围设置。</p></fieldset>
            </div></details>
          </>}
          {step === 4 && <div className="creation-review">
            <div className="creation-review-identity"><span><Sparks width={22} /></span><div><h3>{draft.name}</h3><p>{purposeLabels[draft.purpose]} · 责任人：{draft.owner}</p></div><Tag>将保存为草稿</Tag></div>
            {reviewSection(0, '工作目标', <p>{draft.description}</p>)}
            {reviewSection(1, '资料与资源', <><p>{setup.inputDescription}</p>{contract.inputFields.length > 0 && <small>入口字段：{contract.inputFields.map(f => f.label).join("、")}</small>}{!!contract.followUpFields?.length && <small>补充问题：{contract.followUpFields.map(f => f.label).join("、")}</small>}<small>{setup.resourceScope === 'provided' ? '仅使用用户提供的材料' : `可选能力：${data.capabilities.filter(c => draft.capabilityVersionIds.includes(c.id)).map(c => c.name).join('、')}；执行时仍需授权`}</small></>)}
            {reviewSection(2, '交付要求', <><Tag>{formatLabels[setup.outputFormat]}</Tag><p>{draft.output}</p>{contract.outputFields.length > 0 && <small>结果字段：{contract.outputFields.map(f => f.label).join('、')}</small>}{setup.supplement && <small>补充要求：{setup.supplement}</small>}</>)}
            {reviewSection(3, '工作边界', <><p>{setup.approval === 'delivery' ? '先由我确认，再交付。' : '完成后直接展示结果。'}对外操作单独确认。</p><small>最多 {draft.maxSteps} 步 · {draft.timeoutSeconds} 秒 · {draft.modelId}</small></>)}
            <details className="creation-prompt"><summary>查看根据以上内容整理的工作指令</summary><pre>{effectivePrompt(draft)}</pre></details>
          </div>}
          {errors.some(i => i.field.startsWith('contract.')) && <div tabIndex={-1} aria-invalid="true"><Notice tone="error"><ul>{errors.filter(i => i.field.startsWith('contract.')).map((i, n) => <li key={n}>{i.message}</li>)}</ul></Notice></div>}
        </fieldset>
        <footer className="creation-actions"><div>{step > 0 && <Button icon={ArrowLeft} disabled={busy || !!createdId} onClick={() => moveTo(step - 1)}>上一步</Button>}</div><span>{step === 4 ? '创建后可继续测试和发布' : '按你的实际工作填写即可'}</span><Button type="submit" variant="primary" disabled={busy}>{busy ? '正在保存…' : createdId ? '打开已创建的智能体' : step === 4 ? '创建智能体' : `下一步：${creationSteps[step + 1]}`}{step === 4 ? <Check width={16} /> : <ArrowRight width={16} />}</Button></footer>
      </form>
      <aside className="creation-aside"><div className="creation-tip"><span>填写提示</span><p>{stepTips[step]}</p></div><div className="creation-outline"><span>正在创建</span><h3>{draft.name.trim() || '你的智能体'}</h3><dl>{[['工作目标', draft.description], ['所需资料', setup.inputDescription], ['结果形式', formatLabels[setup.outputFormat]], ['确认方式', setup.approval === 'delivery' ? '交付前由我确认' : '结果直接展示']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={!value.trim() ? 'is-empty' : ''}>{value.trim() || '等待填写'}</dd></div>)}</dl></div><p className="creation-prototype-note">当前为交互原型。配置保存在浏览器中，暂不执行真实任务。</p></aside>
    </div>
  </div>
}
