import { useEffect, useRef, useState } from 'react'
import { Check, Play } from 'iconoir-react'
import { Button, Field, Notice, Section, Tag } from './components'
import { contractIssues } from './agent-management'
import { fieldExample, fieldValueError, validateContractValue, type FormValues } from './form-contract'
import { FormFields, displayFormValue } from './FormFields'
import { formatLabels, instructionIssues, templates } from './guided-config'
import type { AgentConfig } from './shared'
import './AgentForms.css'

type Phase = 'idle' | 'waiting_input' | 'waiting_approval' | 'complete' | 'stopped' | 'cancelled' | 'blocked'
type Scenario = 'normal' | 'followup' | 'external' | 'denied'
interface PreviewSession {
  phase: Phase
  scenario: Scenario
  pending: 'entry' | 'followup'
  requestedKeys: string[]
  input: FormValues
  answers: FormValues
  output: FormValues
  material: string
  events: string[]
}
const phases: Record<Phase, string> = { idle: '等待开始', waiting_input: '等待补充输入', waiting_approval: '等待你的确认', complete: '预演已完成', stopped: '预演已停止', cancelled: '本次预演已取消', blocked: '访问已阻断' }
const initialSession = (): PreviewSession => ({ phase: 'idle', scenario: 'normal', pending: 'entry', requestedKeys: [], input: {}, answers: {}, output: {}, material: '', events: [] })
const configurationSignature = (config: AgentConfig) => JSON.stringify(config, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)
const isObject = (value: unknown): value is FormValues => !!value && typeof value === 'object' && !Array.isArray(value)

export function AgentFormPreview({ config, previewId = 'standalone', onRun }: { config: AgentConfig; previewId?: string; onRun?: (passed: boolean) => void }) {
  // A configuration edit invalidates both the rendered interaction and its saved answers.
  return <PreviewSessionView key={configurationSignature(config)} config={config} previewId={previewId} onRun={onRun} />
}
function PreviewSessionView({ config, previewId, onRun }: { config: AgentConfig; previewId: string; onRun?: (passed: boolean) => void }) {
  const signature = configurationSignature(config)
  const storageKey = `ai-employee-os:web-admin:form-preview:${previewId}`
  const inputFields = config.contract?.inputFields ?? []
  const outputFields = config.contract?.outputFields ?? []
  const followUpFields = config.contract?.followUpFields ?? []
  const [initial] = useState(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      if (!raw) return { session: initialSession(), restored: false, warning: '' }
      const saved = JSON.parse(raw)
      if (saved.signature !== signature) return { session: initialSession(), restored: false, warning: '' }
      const s = saved.session
      if (saved.schema !== 1 || !isObject(s) || typeof s.phase !== 'string' || !Object.hasOwn(phases, s.phase) || !['normal', 'followup', 'external', 'denied'].includes(String(s.scenario)) || !['entry', 'followup'].includes(String(s.pending)) || !Array.isArray(s.requestedKeys) || s.requestedKeys.some(k => typeof k !== 'string') || !isObject(s.input) || !isObject(s.answers) || !isObject(s.output) || typeof s.material !== 'string' || !Array.isArray(s.events) || s.events.some(e => typeof e !== 'string')) throw new Error('invalid')
      return { session: s as unknown as PreviewSession, restored: s.phase !== 'idle', warning: '' }
    } catch { return { session: initialSession(), restored: false, warning: '无法恢复上次预演，请重新开始。智能体配置不受影响。' } }
  })
  const [session, setSession] = useState(initial.session)
  const [restored, setRestored] = useState(initial.restored)
  const [warning, setWarning] = useState(initial.warning)
  const [showErrors, setShowErrors] = useState(false)
  const [formError, setFormError] = useState('')
  const interaction = useRef<HTMLDivElement>(null)
  const { phase, scenario } = session
  const format = config.setup?.outputFormat ?? 'document'
  const problems = [...contractIssues(config), ...instructionIssues(config)]
  const rejectMissing = config.contract?.missingInputPolicy === 'reject'
  const terminal = ['complete', 'stopped', 'cancelled', 'blocked'].includes(phase)
  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ schema: 1, signature, session })); if (!initial.warning) setWarning('') }
    catch { setWarning('浏览器暂存不可用，请保持页面打开；刷新会丢失当前预演。') }
  }, [session, signature, storageKey, initial.warning])
  useEffect(() => { onRun?.(phase === 'complete') }, [phase, onRun])
  useEffect(() => { if (showErrors) interaction.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus() }, [showErrors, formError])
  const clearErrors = () => { setShowErrors(false); setFormError(''); setRestored(false) }
  const record = (next: Partial<PreviewSession>, event: string) => {
    clearErrors(); setSession(s => ({ ...s, ...next, events: [...s.events, event].slice(-20) }))
  }
  const produce = (current: PreviewSession): PreviewSession => {
    const output = fieldExample(outputFields)
    const wait = current.scenario === 'external' || config.setup?.approval === 'delivery'
    return { ...current, output, phase: wait ? 'waiting_approval' : 'complete', events: [...current.events, '生成固定示例结果', wait ? current.scenario === 'external' ? '等待对外操作确认' : '等待交付确认' : '按配置直接展示结果'] }
  }
  const afterInput = (current: PreviewSession) => {
    if (scenario === 'denied') return { ...current, phase: 'blocked' as const, events: [...current.events, '模拟资源不在授权范围，停止预演'] }
    if (scenario === 'followup' && followUpFields.length) return { ...current, phase: rejectMissing ? 'stopped' as const : 'waiting_input' as const, pending: 'followup' as const, requestedKeys: followUpFields.map(f => f.key), events: [...current.events, rejectMissing ? '缺失信息策略为停止，不发起追问' : '模拟发现需补充的信息，等待填写'] }
    return produce(current)
  }
  const start = () => {
    if (phase !== 'idle' || problems.length) return
    const errors = inputFields.length ? validateContractValue(inputFields, session.input) : session.material.trim() ? [] : ['请提供任务材料']
    const current = { ...session, events: ['开始一次本地预演'] }
    clearErrors()
    if (errors.length) {
      setSession({ ...current, phase: rejectMissing ? 'stopped' : 'waiting_input', pending: 'entry', requestedKeys: inputFields.filter(f => fieldValueError(f, session.input[f.key])).map(f => f.key), events: [...current.events, rejectMissing ? '输入不符合要求，按配置停止' : '入口信息不足，请补充后继续'] })
      setShowErrors(true); setFormError(errors.join('；')); return
    }
    setSession(afterInput(current))
  }
  const continueInput = () => {
    if (phase !== 'waiting_input') return
    const fields = session.pending === 'entry' ? inputFields : followUpFields
    const value = session.pending === 'entry' ? session.input : session.answers
    const errors = fields.length ? validateContractValue(fields, value) : session.material.trim() ? [] : ['请提供任务材料']
    if (errors.length) { setShowErrors(true); setFormError(errors.join('；')); return }
    clearErrors()
    const next = { ...session, events: [...session.events, '已校验补充信息，继续同一次预演'] }
    setSession(session.pending === 'entry' ? afterInput(next) : produce(next))
  }
  const confirm = () => {
    if (phase !== 'waiting_approval') return
    const errors = outputFields.length ? validateContractValue(outputFields, session.output) : []
    if (errors.length) { setShowErrors(true); setFormError(errors.join('；')); return }
    record({ phase: 'complete' }, scenario === 'external' ? '用户确认了示例操作；原型未执行外部写入' : '用户确认交付内容，预演完成')
  }
  const pendingFields = session.pending === 'entry' ? inputFields.filter(f => session.requestedKeys.includes(f.key)) : followUpFields
  const restart = () => { clearErrors(); setSession({ ...initialSession(), input: session.input, material: session.material, scenario }) }
  const hasResult = phase === 'waiting_approval' || phase === 'complete'
  return <Section title="先用一个样例看看" description="体验用户填写、补充与确认的完整过程。内容为固定示例，不调用模型、不执行外部写入。">
    <div className="agent-form-preview">
      {restored && <Notice>已恢复上次预演，可继续填写或确认。<Button variant="ghost" onClick={() => setRestored(false)}>知道了</Button></Notice>}
      {warning && <Notice tone="warning">{warning}</Notice>}
      <div className="preview-status-strip" aria-label="预演进度">{[['idle', '1 · 提供信息'], ['waiting_input', '2 · 按需补充'], ['waiting_approval', '3 · 查看并确认'], ['complete', '4 · 完成']].map(([id, title]) => <span key={id} className={phase === id ? 'is-active' : ''}>{title}</span>)}</div>
      <div className="preview-columns"><div className="preview-entry">
        <h3>任务信息</h3><p className="muted">{config.setup?.inputDescription || '提供这次任务需要的资料。'}</p>
        {inputFields.length ? <FormFields fields={inputFields} values={session.input} prefix="任务信息 · " readOnly={phase !== 'idle'} onChange={input => { clearErrors(); setSession(s => ({ ...s, input })) }} /> : <Field label="样例输入"><textarea aria-label="样例输入" rows={5} maxLength={5000} readOnly={phase !== 'idle'} value={session.material} onChange={e => { clearErrors(); setSession(s => ({ ...s, material: e.target.value })) }} /></Field>}
        <Field label="预演情形"><select aria-label="预演情形" value={scenario} disabled={phase !== 'idle'} onChange={e => { clearErrors(); setSession(s => ({ ...s, scenario: e.target.value as Scenario })) }}><option value="normal">正常输入与交付</option><option value="followup" disabled={!followUpFields.length}>运行中补充信息{!followUpFields.length ? '（先配置补充字段）' : ''}</option><option value="external">对外操作前确认</option><option value="denied">模拟请求未授权资源</option></select></Field>
        {phase === 'idle' ? <div className="row-actions"><Button variant="primary" icon={Play} disabled={!config.name.trim() || problems.length > 0} onClick={start}>运行样例预演</Button><Button onClick={() => { clearErrors(); setSession(s => ({ ...s, input: fieldExample(inputFields), material: templates.find(t => t.id === config.setup?.templateId)?.sample ?? '项目计划下月完成，请整理关键结论与待核对的信息。' })) }}>使用模板样例</Button></div> : <div className="row-actions"><Button onClick={restart}>重新开始</Button>{!terminal && <Button onClick={() => record({ phase: 'cancelled' }, '用户取消本次预演')}>取消本次预演</Button>}</div>}
        {problems.length > 0 && <Notice tone="warning">先调整字段或指令配置，再运行预演。<ul>{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul></Notice>}
        <details className="preview-events"><summary>查看本次交互记录</summary>{session.events.length ? <ol>{session.events.map((event, i) => <li key={i}>{event}</li>)}</ol> : <p>开始后记录状态变化。</p>}</details>
      </div><div className="preview-interaction" ref={interaction}>
        <div className="simulation-status" role="status"><Tag>交互预演</Tag><strong>{phases[phase]}</strong></div>
        {phase === 'idle' && <div className="simulation-empty"><Play width={25} /><h3>从一个具体任务开始</h3><p>填写左侧信息，或使用模板样例。这里会显示补充问题与结果。</p></div>}
        {formError && <Notice tone="error">{formError}</Notice>}
        {phase === 'waiting_input' && <>
          <h3>{session.pending === 'entry' ? '还需要这些信息' : '继续处理前，请补充'}</h3><p className="muted">{session.pending === 'entry' ? '已填写的内容会保留，补齐后继续这次任务。' : '这里按预设字段模拟一次追问，实际问题需由运行时决定。'}</p>
          {pendingFields.length ? <FormFields fields={pendingFields} values={session.pending === 'entry' ? session.input : session.answers} prefix="补充信息 · " errors={showErrors} onChange={value => { setFormError(''); setSession(s => ({ ...s, [s.pending === 'entry' ? 'input' : 'answers']: value })) }} /> : <Field label="补充任务材料"><textarea aria-label="补充任务材料" value={session.material} rows={5} maxLength={5000} onChange={e => setSession(s => ({ ...s, material: e.target.value }))} /></Field>}
          <div className="row-actions"><Button variant="primary" onClick={continueInput}>提交补充并继续</Button><Button onClick={() => record({ phase: 'stopped' }, '用户拒绝提供必要信息，停止预演')}>拒绝补充</Button></div>
        </>}
        {phase === 'blocked' && <Notice tone="warning">请求的资源不在授权范围内。此次预演已停止，未生成结果。</Notice>}
        {phase === 'stopped' && <Notice tone="warning">必要信息未满足，已停止。可重新开始并完善输入。</Notice>}
        {phase === 'cancelled' && <Notice>已取消，当前结果未交付；可重新开始。</Notice>}
        {hasResult && <>
          {scenario === 'external' && <Notice tone="warning"><strong>操作确认 · 模拟写入业务系统</strong><p>将把下方内容作为一条新记录提交。请核对所有字段；本次原型只演示确认，不连接业务系统。</p></Notice>}
          <div className="sample-deliverable"><h3>结果样式 · {formatLabels[format]}</h3><p className="muted">以下为固定示例，不代表对任务材料的真实分析。{format === 'form' && phase === 'waiting_approval' ? '你可以修改字段，再确认。' : ''}</p>
            {outputFields.length ? format === 'json' ? <pre>{JSON.stringify(session.output, null, 2)}</pre> : format === 'table' ? <div className="table-scroll"><table><thead><tr><th>项目</th><th>结果</th></tr></thead><tbody>{outputFields.map(f => <tr key={f.key}><th>{f.label}</th><td>{displayFormValue(session.output[f.key])}</td></tr>)}</tbody></table></div> : <FormFields fields={outputFields} values={session.output} prefix="结果 · " readOnly={format !== 'form' || phase !== 'waiting_approval'} errors={showErrors} onChange={output => { setFormError(''); setSession(s => ({ ...s, output })) }} />
              : format === 'json' ? <pre>{JSON.stringify({ title: config.name, summary: '待实际执行的示例结果', status: 'prototype_only' }, null, 2)}</pre> : format === 'table' ? <table><thead><tr><th>核对项</th><th>示例内容</th></tr></thead><tbody><tr><td>任务材料</td><td>{session.material.slice(0, 100)}</td></tr><tr><td>待核对</td><td>{config.output}</td></tr></tbody></table> : <><strong>{config.name} · 结果示例</strong><p>{session.material.slice(0, 140)}</p><p>预期交付：{config.output}</p></>}
          </div>
          {phase === 'waiting_approval' && <div className="approval-preview"><div className="row-actions"><Button variant="primary" icon={Check} onClick={confirm}>{scenario === 'external' ? '确认示例操作' : '确认并交付'}</Button><Button onClick={() => record({ phase: 'stopped' }, scenario === 'external' ? '用户拒绝示例操作' : '用户拒绝交付结果')}>{scenario === 'external' ? '拒绝操作' : '拒绝交付'}</Button></div></div>}
          {phase === 'complete' && <Notice tone="success">{scenario === 'external' ? '已完成确认演示，未执行外部写入。' : '已完成交付预演。'}结果已锁定；如需调整，请重新开始。</Notice>}
          <details className="preview-inputs-summary"><summary>查看本次提交的信息</summary>{inputFields.length ? <FormFields fields={inputFields} values={session.input} readOnly /> : <p>{session.material}</p>}{Object.keys(session.answers).length > 0 && <FormFields fields={followUpFields} values={session.answers} readOnly />}</details>
        </>}
      </div></div>
    </div>
  </Section>
}
