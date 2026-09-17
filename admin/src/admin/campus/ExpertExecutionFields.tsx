import { LEGACY_MODEL_PROVIDER, agentModelName, modelAvailable, modelCenterOf, modelKey, resolveAgentModel } from '../model-center'
import { Button, Facts, Field, Section } from '../components'
import { capabilitiesOf, expertMvpConfig, skillActions, type CampusState, type Config } from './model'
import { inputMethodChoices, outputFormatChoices, outputFormats } from './interaction-model'
import { isMcpService } from './expert-resources'
import { isBuiltinCapability } from '../capability-search'

type Props = { config: Config; patch: (value: Partial<Config>) => void; disabled: boolean }
type ModelProps = Props & { state: CampusState; manageModels: () => void }
export function ExpertModelSelect({ config: c, patch, disabled, state }: Omit<ModelProps, 'manageModels'>) {
  const center = modelCenterOf(state); const selected = resolveAgentModel(state, c)
  const options = center.models.filter(model => modelAvailable(center, model))
  const value = selected ? modelKey(selected) : c.model ? modelKey({ providerId: c.modelProviderId ?? LEGACY_MODEL_PROVIDER, modelId: c.model }) : ''
  return <Field label="运行模型" required><select aria-label="运行模型" disabled={disabled} value={value} onChange={e => { const model = options.find(m => modelKey(m) === e.target.value); if (model) patch({ model: model.modelId, modelProviderId: model.providerId, modelDisplayName: model.displayName, modelProviderName: center.service.name }) }}><option value="" disabled>请选择模型</option>{c.model && !modelAvailable(center, selected) && <option value={value} disabled>{agentModelName(state, c)}（当前不可用，请重新选择）</option>}{options.map(model => <option value={modelKey(model)} key={modelKey(model)}>{model.displayName === model.modelId ? model.modelId : `${model.displayName} · ${model.modelId}`}</option>)}</select>{!options.length && <small>暂无可用模型，请先到系统设置的模型管理中同步并启用。</small>}</Field>
}
export function ExpertModelSettings({ config: c, patch, disabled, state, manageModels }: ModelProps) {
  return <Section title="模型配置" description="选择中转站模型，设置回复长度与生成方式。"><fieldset className="campus-fieldset" disabled={disabled}>
    <ExpertModelSelect config={c} patch={patch} disabled={disabled} state={state} />
    <div className="expert-model-source"><p className="record-note">模型来自“系统设置 → 模型管理”。图片、音频和工具调用须与模型能力匹配。</p><Button variant="ghost" onClick={manageModels}>管理模型</Button></div>
    <div className="form-grid"><Field label="最大输出 Token" hint="1–32768，限制单次模型输出长度。"><input aria-label="最大输出 Token" type="number" min={1} max={32768} value={c.maxTokens} onChange={e => patch({ maxTokens: Number(e.target.value) })} /></Field><Field label="响应超时（秒）" hint="1–120，单次模型请求的等待上限。"><input aria-label="响应超时（秒）" type="number" min={1} max={120} value={c.limits.modelSeconds} onChange={e => patch({ limits: { ...c.limits, modelSeconds: Number(e.target.value) } })} /></Field></div>
    <label className="campus-check"><input type="checkbox" aria-label="流式回复" checked={c.streaming} onChange={e => patch({ streaming: e.target.checked })} />流式回复</label>
    <details className="expert-foldout"><summary>生成参数</summary><div className="form-grid"><Field label="温度" hint="0–1，较低值更稳定。"><input aria-label="温度" type="number" min={0} max={1} step={0.1} value={c.temperature} onChange={e => patch({ temperature: Number(e.target.value) })} /></Field><Field label="Top P" hint="大于 0 且不超过 1。"><input aria-label="Top P" type="number" min={0.01} max={1} step={0.05} value={c.topP} onChange={e => patch({ topP: Number(e.target.value) })} /></Field></div></details>
  </fieldset></Section>
}
const outputLabels: Record<string, string> = { text: '纯文本', markdown: 'Markdown', document: 'Word 文档', pdf: 'PDF', json: 'JSON', table: '表格（CSV）' }
export function ExpertInputOutputSettings({ config, patch, disabled }: Props) {
  const io = expertMvpConfig(config).interaction!
  const selected = outputFormats(io.output)
  const toggleOutput = (format: Exclude<typeof io.output.format, 'recipient'>, checked: boolean) => {
    const formats = (checked ? [...selected.filter(f => f !== 'recipient'), format] : selected.filter(f => f !== format)).filter(f => f !== 'recipient')
    if (formats.length) patch({ interaction: { ...io, output: { ...io.output, format: formats[0], additionalFormats: formats.slice(1) } } })
  }
  return <div className="expert-format-settings">
    <Section title="输入格式" description="允许用户提供的内容，可多选。"><fieldset className="expert-format-options" aria-label="输入格式" disabled={disabled}>{inputMethodChoices.map(choice => <label key={choice.value} className="expert-format-option"><input type="checkbox" aria-label={choice.label} checked={io.input.modalities.includes(choice.value)} onChange={e => patch({ interaction: { ...io, input: { ...io.input, modalities: e.target.checked ? [...io.input.modalities, choice.value] : io.input.modalities.filter(value => value !== choice.value) } } })} /><span><strong>{choice.label}</strong><small>{choice.example}</small></span></label>)}</fieldset></Section>
    <Section title="输出格式" description="专家返回结果的格式，可多选。"><fieldset className="expert-format-options" aria-label="输出格式" disabled={disabled}>{outputFormatChoices.filter(choice => choice.value !== 'recipient').map(choice => <label key={choice.value} className="expert-format-option"><input type="checkbox" aria-label={outputLabels[choice.value]} checked={selected.includes(choice.value)} disabled={selected.length === 1 && selected.includes(choice.value)} onChange={e => toggleOutput(choice.value as Exclude<typeof io.output.format, 'recipient'>, e.target.checked)} /><span><strong>{outputLabels[choice.value]}</strong></span></label>)}</fieldset></Section>
  </div>
}
export function executionSummary(config: Config, state: Pick<CampusState, 'modelCenter' | 'importedCapabilities'> = {}, snapshot = false) {
  const io = config.interaction ?? expertMvpConfig(config).interaction!
  return {
    model: agentModelName(state, config, snapshot),
    inputs: io.input.modalities.map(value => inputMethodChoices.find(m => m.value === value)?.label ?? value).join('、') || '待选择',
    outputs: outputFormats(io.output).map(value => outputLabels[value] ?? outputFormatChoices.find(m => m.value === value)?.label ?? value).join('、'),
    capabilities: config.tools.map(b => capabilitiesOf(state).find(c => c.id === b.id)?.name ?? b.id).join('、') || '未添加，使用模型回答',
  }
}
export function ExpertExecutionDetails({ config: c, state }: { config: Config; state: CampusState }) {
  const summary = executionSummary(c, state, true)
  return <div className="expert-execution-details"><h3>模型与输入输出</h3><Facts items={[["运行模型", summary.model], ['中转站', c.modelProviderName ?? '原示例中转站'], ['模型 ID', resolveAgentModel(state, c)?.modelId ?? c.model], ['生成参数', `温度 ${c.temperature} · Top P ${c.topP}`], ['最大输出', `${c.maxTokens} Token`], ['响应方式', `${c.streaming ? '流式' : '完整'}回复 · 超时 ${c.limits.modelSeconds} 秒`], ['输入格式', summary.inputs], ['输出格式', summary.outputs]]} />
    <h3>Skill / Tool / MCP</h3>{c.tools.length ? c.tools.map(b => {
      const cap = capabilitiesOf(state).find(cap => cap.id === b.id)
      const actions = cap && !isBuiltinCapability(cap) ? skillActions(b, capabilitiesOf(state)).filter(a => a.enabled).map(a => ({ name: cap.execution?.toolActions?.find(t => t.id === a.id)?.name ?? a.id, ...a })) : [{ name: [b.read && '读取', b.write && '写入'].filter(Boolean).join('、') || '未启用操作', ...b }]
      return <article key={b.id}><strong>{cap?.name ?? b.id} · v{b.version}</strong><p>{cap && isMcpService(cap) ? 'MCP' : cap && isBuiltinCapability(cap) ? 'Tool' : 'Skill'} · {b.enabled === false ? '已停用' : '已配置'}</p>{actions.length ? actions.map((a,i) => <p key={i}>{a.name} · {a.auth === 'user' ? '使用者账号' : '服务账号'} · {a.scope === 'user' ? '使用者可见资料' : `共享资料：${a.approval}`} · 超时 {a.timeout} 秒 / 重试 {a.retry} 次</p>) : <p>尚未启用具体工具</p>}{c.nodes.filter(n => n.tool === b.id || n.tool.startsWith(`${b.id}::`)).map(n => <p key={n.id}>确认：{n.name} · {n.approver}</p>)}</article>
    }) : <p>未添加能力，使用模型回答。</p>}

  </div>
}
