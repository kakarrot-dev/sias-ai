import { AgentFormPreview } from './AgentFormPreview'
import { useEffect, useState } from 'react'
import { contractIssues, fieldExample, validateContractValue } from './agent-management'
import { ArrowRight, Check, Play, ShieldCheck } from 'iconoir-react'
import { Button, Field, Notice, Section, Tag } from './components'
import { effectivePrompt, formatLabels, instructionIssues, templates } from './guided-config'
import type { AdminState, AgentConfig, Config, GroupConfig, GuidedSetup } from './shared'

export function GuidedControls({ config, patch }: { config: Config; patch: (changes: Partial<Config>) => void }) {
  const s = config.setup!
  const update = (changes: Partial<GuidedSetup>) => patch({ setup: { ...s, ...changes } })
  const problems = instructionIssues(config)
  const changeMode = (manual: boolean) => {
    if (!manual && !window.confirm('切回基础模式后，工作指令会按当前配置重新生成，手写指令将被替换。专业补充说明会保留。')) return
    const text = effectivePrompt(config)
    patch({ setup: { ...s, promptMode: manual ? 'manual' : 'guided' }, ...('systemPrompt' in config ? { systemPrompt: manual ? text : '' } : { instructions: manual ? text : '' }) })
  }
  return <Section title="确认四件事" description="材料、资源、结果和确认方式决定工作边界，随时可以调整。">
    <div className="form-grid">
      <Field label="需要提供什么" required><textarea aria-label="需要提供什么" rows={3} maxLength={2000} value={s.inputDescription} onChange={e => update({ inputDescription: e.target.value })} /></Field>
      <Field label="能用哪些资源" hint="原型只配置范围，不访问真实资料。"><select aria-label="能用哪些资源" value={s.resourceScope} onChange={e => update({ resourceScope: e.target.value as GuidedSetup['resourceScope'] })}><option value="provided">仅本次提供的材料</option><option value="selected">本次材料 + 所选能力的获准资源</option></select><small>所选能力可在详细配置中调整；选择资源不会自动增加权限。</small></Field>
      <Field label="交付什么形式"><select aria-label="交付什么形式" value={s.outputFormat} onChange={e => update({ outputFormat: e.target.value as GuidedSetup['outputFormat'] })}>{Object.entries(formatLabels).filter(([id]) => id !== 'form' || 'systemPrompt' in config).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></Field>
      <Field label="哪些动作需要确认"><select aria-label="哪些动作需要确认" value={s.approval} onChange={e => update({ approval: e.target.value as GuidedSetup['approval'] })}><option value="delivery">交付前由我确认；对外操作另行确认</option><option value="external">结果直接展示；对外操作必须确认</option></select></Field>
    </div>
    <Field label="专业补充说明" hint="补充专业方法、表达风格或判断依据；不要在这里改写资源与确认规则。"><textarea aria-label="专业补充说明" rows={3} maxLength={5000} placeholder="例如：区分事实与推断，优先列出影响决策的问题。" value={s.supplement} disabled={s.promptMode === 'manual'} onChange={e => update({ supplement: e.target.value })} /></Field>
    <details className="prompt-disclosure" open={s.promptMode === 'manual' || undefined}><summary><span>查看最终工作指令</span><Tag>{s.promptMode === 'guided' ? '随配置生成 · 只读' : '手写模式'}</Tag></summary>
      <p className="muted">{s.promptMode === 'guided' ? '修改上面的配置，指令随之更新。权限和执行限制仍由配置约束。' : '手写指令只替代工作指令，资源、输出与确认配置仍然有效。专业补充说明已包含在切换时的指令中。'}</p>
      {s.promptMode === 'guided' ? <pre className="prompt-display" aria-label="最终工作指令">{effectivePrompt(config)}</pre> : <Field label="手写工作指令"><textarea aria-label="手写工作指令" rows={12} maxLength={10000} value={'systemPrompt' in config ? config.systemPrompt : config.instructions ?? ''} onChange={e => patch('systemPrompt' in config ? { systemPrompt: e.target.value } : { instructions: e.target.value })} /></Field>}
      <Button variant="ghost" onClick={() => changeMode(s.promptMode === 'guided')}>{s.promptMode === 'guided' ? '进入专家手写模式' : '切回基础模式'}</Button>
    </details>
    {problems.length > 0 && <Notice tone="error"><strong>有 {problems.length} 项配置需要调整</strong><ul>{problems.map(p => <li key={p.message}>{p.message}</li>)}</ul></Notice>}
    <p className="check-disclaimer"><ShieldCheck width={14} />规则检查可提示常见冲突；未发现问题不代表完整的语义审查。</p>
  </Section>
}

function GroupSamplePreview({ config, data, onRun }: { config: Config; data: AdminState; onRun?: (passed: boolean) => void }) {
  const template = templates.find(t => t.id === config.setup?.templateId) ?? { sample: '示例材料：项目计划下月完成，负责人已明确，验收条件仍需补充。请按约定的工作目标处理。' }
  const inputFields = 'systemPrompt' in config ? config.contract?.inputFields ?? [] : []
  const outputFields = 'systemPrompt' in config ? config.contract?.outputFields ?? [] : []
  const rejectMissing = 'systemPrompt' in config && config.contract?.missingInputPolicy === 'reject'
  const sampleText = inputFields.length ? JSON.stringify(fieldExample(inputFields), null, 2) : template.sample
  const [sample, setSample] = useState<string>(sampleText)
  const [inputErrors, setInputErrors] = useState<string[]>([])
  const [scenario, setScenario] = useState('normal')
  const [result, setResult] = useState<'complete' | 'waiting' | 'blocked' | 'missing'>()
  const [confirmed, setConfirmed] = useState(false)
  const problems = [...instructionIssues(config), ...('systemPrompt' in config ? contractIssues(config) : [])]
  const incomplete = !config.name.trim() || ('steps' in config && (!config.steps.length || config.steps.some(step => !data.agents.some(a => a.id === step.agentId))))
  const signature = JSON.stringify(config)
  useEffect(() => { setResult(undefined); setConfirmed(false); onRun?.(false) }, [signature, onRun])
  const reset = () => { setResult(undefined); setInputErrors([]); setConfirmed(false); onRun?.(false) }
  const run = () => {
    let errors: string[] = []
    if (inputFields.length) {
      try { errors = validateContractValue(inputFields, JSON.parse(sample)) } catch { errors = ['请输入符合字段定义的 JSON 对象'] }
    }
    setInputErrors(errors)
    const next = !sample.trim() || errors.length > 0 ? 'missing' : scenario === 'denied' ? 'blocked' : config.setup?.approval === 'delivery' ? 'waiting' : 'complete'
    setResult(next); setConfirmed(false); onRun?.(next === 'waiting' || next === 'complete')
  }
  const format = config.setup?.outputFormat ?? 'document'
  const steps = 'steps' in config ? config.steps.map(s => ({ name: data.agents.find(a => a.id === s.agentId)?.draft.name ?? '未选择 Agent', task: s.task })) : [{ name: config.name, task: (config as AgentConfig).role }]
  return <Section title="先用一个样例看看" description="本地规则预演：检查输入、展示路径和确认状态。不会调用模型，也不代表真实内容质量。">
    <div className="simulation-layout"><div>
      <Field label="样例输入"><textarea aria-label="样例输入" rows={6} value={sample} maxLength={5000} onChange={e => { setSample(e.target.value); reset() }} /></Field>
      <Field label="预演情形"><select aria-label="预演情形" value={scenario} onChange={e => { setScenario(e.target.value); reset() }}><option value="normal">正常输入与交付</option><option value="denied">模拟请求未授权资源</option></select></Field>
      <div className="row-actions"><Button variant="primary" icon={Play} disabled={problems.length > 0 || incomplete} onClick={run}>运行样例预演</Button><Button onClick={() => { setSample(sampleText); setScenario('normal'); reset() }}>使用模板样例</Button></div>
      {incomplete && <Notice tone="warning">先填写名称并配置有效成员，再预演任务路径。</Notice>}
      {problems.length > 0 && <Notice tone="warning">先处理工作指令与配置的冲突，再运行样例。</Notice>}
    </div><div className="simulation-output" aria-live="polite">
      {!result ? <div className="simulation-empty"><Play width={24} /><h3>从一个具体例子开始</h3><p>运行后查看任务路径、结果形式和需要你确认的环节。</p></div> : <>
        <div className="simulation-status"><Tag>模拟结果</Tag><strong>{result === 'missing' ? (rejectMissing ? '输入不符合要求，已停止预演' : '等待补充输入') : result === 'blocked' ? '访问已阻断' : result === 'waiting' && !confirmed ? '等待你的确认' : '预演已完成'}</strong></div>
        {result === 'missing' ? <Notice tone="warning">{rejectMissing ? '本次预演停止。缺失项：' : '请补充：'}{(config.setup?.inputDescription ?? '本次任务的必要材料').replace(/[。\s]+$/u, '')}。系统不会凭空补齐资料。{inputErrors.length > 0 && <ul>{inputErrors.map(error => <li key={error}>{error}</li>)}</ul>}</Notice> : result === 'blocked' ? <Notice tone="warning">示例请求超出了配置中的资料范围。即使提示词要求继续，也应先解决授权问题。</Notice> : <>
          <ol className="preview-path">{steps.map((step, i) => <li key={i}><span>{i + 1}</span><div><strong>{step.name}</strong><small>{step.task}</small></div><Check width={14} /></li>)}</ol>
          <div className="sample-deliverable"><h3>结果样式 · {formatLabels[format]}</h3><p className="muted">以下为固定样式与输入摘录，未对材料进行 AI 分析。</p>
            {format === 'json' ? <pre>{JSON.stringify(outputFields.length ? fieldExample(outputFields) : { title: config.name, inputExcerpt: sample.slice(0,100), findings: ['示例分析项，待实际执行'], status: 'prototype_only' }, null, 2)}</pre> : format === 'table' ? <table><thead><tr><th>核对项</th><th>示例内容</th></tr></thead><tbody><tr><td>材料摘录</td><td>{sample.slice(0,100)}</td></tr><tr><td>待核对</td><td>事实依据、适用条件、未解决问题</td></tr></tbody></table> : <><strong>{config.name} · 结果示例</strong><p>{sample.slice(0,140)}</p><p>预期交付：{'output' in config ? config.output : config.completion}</p></>}
          </div>
          {result === 'waiting' && <div className="approval-preview"><strong>{confirmed ? '已演示确认交付' : '发起人确认后交付'}</strong><p>仅改变预演状态，不发送结果或执行外部写入。</p><Button disabled={confirmed} icon={Check} onClick={() => setConfirmed(true)}>{confirmed ? '已确认' : '演示确认交付'}</Button></div>}
        </>}
      </>}
    </div></div>
  </Section>
}

export function SamplePreview({ config, data, onRun, previewId }: { config: Config; data: AdminState; onRun?: (passed: boolean) => void; previewId?: string }) {
  return 'systemPrompt' in config ? <AgentFormPreview config={config} previewId={previewId} onRun={onRun} /> : <GroupSamplePreview config={config} data={data} onRun={onRun} />
}
