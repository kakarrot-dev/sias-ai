import { Field, Facts, Notice, Section } from '../components'
import { knowledgeExamples } from '../agent-experience'
import { runtimeSummary } from './config-summary'
import { InputEditor, OutputEditor } from './InteractionConfig'
import { completionLabels, definitionPolicies, handoffEnabled, modelProfiles, setHandoffEnabled, type AgentDefinition } from './agent-definition'
import { models, people, type Config } from './model'
import { legacyResponsibilityText } from './expert-form'
import type { ExpertIssue, ExpertSection } from './expert-form'

interface Props { captain?: boolean; creation?: boolean; issues?: ExpertIssue[]; config: Config; section: ExpertSection; disabled: boolean; patch: (value: Partial<Config>) => void }
export function DefinitionFields({ config: c, section, disabled, patch, issues = [], creation = false, captain = false }: Props) {
  const d = c.definition!
  const message = (field: string) => issues.find(issue => issue.field === field)?.message
  const error = (field: string) => message(field) && <p className="expert-error" role="alert">{message(field)}</p>
  const set = <K extends keyof AgentDefinition>(key: K, value: Partial<AgentDefinition[K]>) => patch({ definition: { ...d, [key]: { ...d[key] as object, ...value } } })
  const text = (label: string, field: string, value: string, onChange: (v: string) => void, required = false, hint?: string) => <div data-expert-field={field}><Field label={label} required={required} hint={hint}><textarea aria-invalid={!!message(field)} aria-label={label} rows={3} maxLength={2000} value={value} onChange={e => onChange(e.target.value)} /></Field>{error(field)}</div>
  const number = (label: string, field: string, value: number, onChange: (v: number) => void, min: number, max: number, hint?: string) => <div data-expert-field={field}><Field label={label} hint={hint}><input aria-invalid={!!message(field)} aria-label={label} type="number" step={field === 'temperature' ? 0.1 : 1} min={min} max={max} value={Number.isNaN(value) ? '' : value} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} /></Field>{error(field)}</div>
  const choices = (label: string, field: string, value: string, options: string[][], onChange: (v: string) => void) => <div data-expert-field={field}><Field label={label}><select aria-invalid={!!message(field)} aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{options.map(([key, name]) => <option key={key} value={key} disabled={key === 'handoff' && !handoffEnabled(d)}>{name}</option>)}</select></Field>{error(field)}</div>
  return <fieldset className="campus-fieldset definition-fields" disabled={section !== 'input' && disabled}>
    {section === 'conversation' && legacyResponsibilityText(c) && <Section title="原职责说明"><pre className="team-prompt-preview">{legacyResponsibilityText(c)}</pre></Section>}
    {section === 'model' && <Section title="模型与上下文" description="选择模型档案，再决定每轮需要带入哪些信息。">
      <div data-expert-field="model"><Field label="模型" required><select aria-label="模型" value={c.model} onChange={e => patch({ model: e.target.value })}>{models.map(m => <option key={m.id} value={m.id} disabled={!m.active}>{m.name} · {m.context} · {m.abilities}{!m.active ? '（已停用）' : ''}</option>)}</select></Field></div>
      <p className="campus-hint">当前为校内示例档案；参数范围只适用于该档案，尚未连接真实模型。凭据在部署环境管理。</p>
      <details className="expert-foldout" open={issues.some(issue => ['maxTokens','temperature','tokenBudget','sources','requiredState','historyTurns'].includes(issue.field))}><summary>上下文与生成参数 <small>{c.maxTokens} Token 输出 · {d.context.tokenBudget} Token 上下文</small></summary>
      <div className="form-grid">{number('单次输出上限（Token）', 'maxTokens', c.maxTokens, maxTokens => patch({ maxTokens }), 1, modelProfiles[c.model]?.output ?? 32768)}{modelProfiles[c.model]?.temperature && number('采样温度', 'temperature', c.temperature, temperature => patch({ temperature }), 0, 1, '0 为严谨，1 为发散。')}{number('上下文预算（Token）', 'tokenBudget', d.context.tokenBudget, tokenBudget => set('context', { tokenBudget }), 1, modelProfiles[c.model]?.context ?? 128000, '与单次输出之和不能超过模型容量。')}</div>
      {!modelProfiles[c.model]?.temperature && <p className="campus-hint">此档案未声明温度支持，保留原值但不作为有效模型参数。</p>}
      <div data-expert-field="sources"><h3>上下文来源</h3><div className="definition-checks">{[['user_input','用户输入'],['task_state','任务状态'],['tool_results','工具结果'],['knowledge','知识检索']].map(([value,label]) => <label className="campus-check" key={value}><input type="checkbox" checked={d.context.sources.includes(value)} onChange={e => set('context', { sources: e.target.checked ? [...d.context.sources, value] : d.context.sources.filter(s => s !== value) })} />{label}</label>)}</div></div>
      {text('每轮必带状态', 'requiredState', d.context.requiredState, requiredState => set('context', { requiredState }), true)}
      <div className="form-grid">{choices('对话历史策略', 'history', d.context.history, [['recent','保留最近对话'],['summary','摘要与原文引用']], history => set('context', { history: history as typeof d.context.history }))}{number('历史轮次', 'historyTurns', d.context.historyTurns, historyTurns => set('context', { historyTurns }), 0, 100, '0 表示不携带历史；与执行调用上限分开。')}</div>
      <Notice>系统规则、授权与关键状态优先保留；外部资料仅作待验证数据，不能覆盖权限。原始证据保留引用。</Notice>
      </details>
    </Section>}
    {section === 'input' && <div className="definition-input-panel">
      <div data-expert-field="collection"><InputEditor value={c.interaction!} onChange={interaction => patch({ interaction })} disabled={disabled} formMode livePreview settingsErrors={issues.filter(issue => ['collection', 'missingInput'].includes(issue.field)).map(issue => issue.field === 'missingInput' ? `missingInput: ${issue.message}` : issue.message)}>
        {choices('用户未提供必填信息时', 'missingInput', d.task.missingInput, [['clarify','请用户补充'],['wait','等待材料，保留任务'],['stop','停止任务，提示缺少的内容'],['handoff','交给人工处理']], missingInput => set('task', { missingInput: missingInput as typeof d.task.missingInput }))}
      </InputEditor>{error('collection')}</div>
    </div>}
    {section === 'io' && <div className="definition-output-panel">
      <div className="io-output-layout"><OutputEditor value={c.interaction!} onChange={interaction => patch({ interaction })} disabled={disabled} formMode />
      <aside className="io-completion-panel"><Section title="怎样才算完成" description="先通过成果校验，再满足所选完成条件。智能体回复“已完成”不作为成功证据。">
      {choices('任务完成条件', 'completion', d.task.completion ?? 'validated', [['validated','成果校验通过即完成'],['receipt','取得外部业务回执才完成'],['accepted','用户验收通过才完成']], completion => set('task', { completion: completion as NonNullable<typeof d.task.completion> }))}
      <div className="completion-contract"><strong>{{ validated: '交付成果 → 校验通过 → 完成', receipt: '交付成果 → 执行业务动作 → 核验回执 → 完成', accepted: '交付成果 → 等待用户验收 → 完成' }[d.task.completion ?? 'validated']}</strong><p>{d.task.completion === 'receipt' ? '例如生成申请文件后，还需取得 OA 提交成功回执。结果未知时保留待核验状态。' : d.task.completion === 'accepted' ? '用户提交输入、执行前确认和交付前确认，都不等于验收通过。' : '文件需确认存在且可读取；结构化成果需通过格式与必需字段校验，章节及事实核对也须通过。'}</p></div>
      {d.task.completion === 'receipt' && <div data-expert-field="receiptSystem"><Field label="回执来源" required hint="具体业务系统与动作，例如：OA · 提交发文申请。"><input aria-label="回执来源" maxLength={100} value={d.task.receiptSystem ?? ''} onChange={e => set('task', { receiptSystem: e.target.value })} /></Field>{error('receiptSystem')}</div>}
      {text('完成标准', 'success', d.task.success, success => set('task', { success }), c.schemaVersion !== '2.0', '写清可以被核对的结果，不只依赖模型声称完成。')}
      {text('完成证据', 'evidence', d.task.evidence, evidence => set('task', { evidence }), c.schemaVersion !== '2.0', '例如：每个结论对应来源；OA 提交需有单号、成功状态与回执时间。')}
      </Section><Notice>输出格式、业务规则、权限与证据需要分别核验；格式错误或证据不足不能标记为完成。</Notice></aside></div>
    </div>}
    {section === 'knowledge' && <Section title="知识与记忆" description="只为需要查阅资料的任务绑定知识源。">
      <div className="definition-knowledge-list">{knowledgeExamples.map(k => <label className="campus-check" key={k.id}><input type="checkbox" checked={c.expert!.knowledgeIds.includes(k.id)} onChange={e => patch({ expert: { ...c.expert!, knowledgeIds: e.target.checked ? [...c.expert!.knowledgeIds,k.id] : c.expert!.knowledgeIds.filter(id => id !== k.id) } })} /><span>{k.name}</span></label>)}</div>
      {c.expert!.knowledgeIds.length > 0 ? <>
        {choices('检索档案', 'knowledge', d.knowledge.retrieval, [['hybrid','混合检索档案 v1'],['keyword','关键词检索档案 v1']], retrieval => set('knowledge', { retrieval: retrieval as typeof d.knowledge.retrieval }))}
        {text('知识业务范围', 'knowledge', d.knowledge.scope, scope => set('knowledge', { scope }), false, '在已有权限内收紧地区、角色、业务或适用日期。')}
        {choices('证据不足时', 'knowledge', d.knowledge.insufficient, [['clarify','说明缺口并询问'],['handoff','转责任人核对']], insufficient => set('knowledge', { insufficient: insufficient as typeof d.knowledge.insufficient }))}
        <Notice>引用需保留原文位置与版本；证据冲突时说明缺口，按已配置方式停止或转人工。知识源为示例资产，尚未连接检索服务。</Notice>
      </> : <p className="expert-inline-empty">未启用知识检索，可直接进入下一步。</p>}
      <div className="definition-policy"><h3>长期记忆 · 未启用</h3><p>当前没有记忆存储及查看、更正、删除能力，因此不开放长期记忆开关。任务状态与历史对话策略独立保留。</p></div>
    </Section>}
    {section === 'governance' && <Section title="运行、安全与恢复" description="限制一次运行的消耗，并明确无法自动完成时如何处理。">
      {choices('执行模式', 'runtime', d.runtime.mode, [['single_call','单次响应'],['bounded_tool_loop','受限工具循环']], mode => set('runtime', { mode: mode as typeof d.runtime.mode }))}
      <div className="form-grid">{number('模型调用上限', 'steps', c.limits.steps, steps => patch({ limits: { ...c.limits, steps } }), 1, 200, '包含重试、规划和汇总调用。')}{number('工具调用上限', 'maxToolCalls', d.runtime.maxToolCalls, maxToolCalls => set('runtime', { maxToolCalls }), 0, 200)}{number('运行 Token 总预算', 'maxTotalTokens', d.runtime.maxTotalTokens, maxTotalTokens => set('runtime', { maxTotalTokens }), 1, 10000000)}{number('活动执行时长（分钟）', 'minutes', c.limits.minutes, minutes => patch({ limits: { ...c.limits, minutes } }), 1, 60)}{number('模型响应超时（秒）', 'modelSeconds', c.limits.modelSeconds, modelSeconds => patch({ limits: { ...c.limits, modelSeconds } }), 1, 120)}{number('连续无进展次数', 'noProgressLimit', d.runtime.noProgressLimit, noProgressLimit => set('runtime', { noProgressLimit }), 1, 20)}</div>
      <p className="campus-hint">无法继续时的处理方式在“人工兜底”中配置；结果未知的业务动作禁止自动重发。</p>
      <details className="expert-policy-details"><summary>查看平台执行规则</summary>{Object.values(definitionPolicies).map(policy => <div className="definition-policy" key={policy.name}><h3>{policy.name}</h3><ul>{policy.rules.map(rule => <li key={rule}>{rule}</li>)}</ul></div>)}</details>
      <p className="campus-hint">工具超时、重试与前置确认在对应工具中配置。费用计价、断点恢复、动态委派与沙箱尚未接入，当前不开放这些选项。</p>
    </Section>}
    {section === 'handoff' && <Section title="人工兜底" description={captain ? "团队协作无法继续时，由队长统一转交指定人员处理。" : "智能体无法继续完成任务时，是否交给指定人员处理。"}>
      <div data-expert-field="handoffOwner"><label className="campus-check"><input type="checkbox" role="switch" checked={handoffEnabled(d)} onChange={e => patch({ definition: setHandoffEnabled(d, e.target.checked) })} />出现问题时转人工</label>
        {handoffEnabled(d) ? <>
          {choices('接管人员', 'handoffOwner', d.governance.handoffOwner, [['','请选择接管人员'], ...people.map(p => [p.id, `${p.name} · ${p.department}`])], handoffOwner => set('governance', { handoffOwner }))}
          <p className="campus-hint">{captain ? "团队无法恢复的失败、超时或无进展，由此人接管；缺少用户材料时的处理方式在专家团中设置。" : "无法自动恢复的失败、超时或无进展，转交此人；缺少信息、知识不足时是否转人工，在对应设置中选择。"}</p>
          {choices(captain ? '成员执行结果未知时' : '写操作结果未知时', 'unknownResult', d.runtime.unknownResult, [['verify_then_handoff','先核验原动作，无法确认则转人工'],['stop_and_handoff','立即停止并转人工核验'],['verify_then_stop','核验后仍不确定则停止并告知用户']], unknownResult => set('runtime', { unknownResult: unknownResult as typeof d.runtime.unknownResult }))}
          <p className="campus-hint">关闭后停止转派，并将已有的转人工处理改为停止或提示信息缺口；保留接管人员，便于再次启用。</p>
        </> : <><p className="campus-hint">无法继续时停止并告知用户，保留已完成内容和原因。业务操作结果未知时先核验，无法确认则保留待核验记录，不重新发送。</p>{error('handoffOwner')}</>}
      </div>
      {captain ? <p className="campus-hint">接管协作不改变成员的业务权限；具体操作仍由成员按各自的确认规则执行。</p> : <Notice>业务审批人由业务系统按具体单据和权限确定。接管人员不因此获得审批权限；操作前确认仍在对应工具中配置。</Notice>}
    </Section>}
    {section === 'review' && <Section title="配置概览">
      <Facts items={captain ? [["名称", c.name || '待填写'], ['责任人', people.find(p => p.id === c.owner)?.name ?? c.owner], ['模型', models.find(m => m.id === c.model)?.name ?? '未选择'], ['协作职责', c.description || '待填写'], ['工作方法', '专家团协作 · 平台内置'], ['业务输入与交付', '沿用各业务专家的配置']] : creation ? [["名称", c.name || '待填写'], ['责任人', people.find(p => p.id === c.owner)?.name ?? c.owner], ['模型', models.find(m => m.id === c.model)?.name ?? '未选择'], ['用途', c.description || '待填写'], ['能力绑定', `${c.tools.length} 项，固定所选版本`], ['用户输入', runtimeSummary(c, 'input')], ['交付成果', runtimeSummary(c, 'io')], ['任务完成条件', completionLabels[d.task.completion ?? 'validated']]] : [["名称", c.name || '待填写'], ['责任人', people.find(p => p.id === c.owner)?.name ?? c.owner], ['模型', models.find(m => m.id === c.model)?.name ?? '未选择'], ['用途', c.description || '待填写'], ['职责范围', '在系统提示词中维护'], ['输入字段', `${c.interaction!.input.fields.length} 项`], ['输出字段', `${c.interaction!.output.fields.length} 项`], ['任务完成条件', completionLabels[d.task.completion ?? 'validated']], ['回执来源', d.task.completion === 'receipt' ? d.task.receiptSystem || '待填写' : '不需要外部回执'], ['完成标准', d.task.success || '使用 Skill 与输出约定'], ['完成证据', d.task.evidence || '按平台执行规则保留'], ['知识源', `${c.expert!.knowledgeIds.length} 项`], ['能力绑定', `${c.tools.length} 项，固定所选版本`], ['运行限制', `${c.limits.steps} 次模型调用 / ${d.runtime.maxToolCalls} 次工具 / ${c.limits.minutes} 分钟`]]} />
      <Notice>保存草稿不会立即发布。发布前可继续调试，使用授权可单独配置。</Notice>
    </Section>}
  </fieldset>
}
