import { Button, Field, Section } from '../components'
import { DefinitionFields } from './DefinitionFields'
import { ExpertResources } from './ExpertResources'
import { CapabilityFields } from './CapabilityFields'
import { runtimeSummary } from './config-summary'
import { captainOwner, models, platformSkillId, type CampusState, type Config } from './model'
import type { ExpertIssue } from './expert-form'

type Props = { state: CampusState; agentId?: string; config: Config; patch: (value: Partial<Config>) => void; disabled: boolean; issues: ExpertIssue[]; navigate: (path: string) => void }

export function CaptainCapabilities({ state, agentId, config, patch, disabled, issues, navigate }: Props) {
  const team = agentId ? captainOwner(state, agentId) : undefined
  const legacyIds = config.tools.filter(binding => binding.id !== platformSkillId('captain')).map(binding => binding.id)
  return <div className="captain-capabilities">
    <section data-expert-section="skills"><Section title="队长如何协作" description="使用平台内置协作能力，组织团队成员完成任务。">
      <ExpertResources role="captain" kind="skill" config={config} onChange={patch} disabled={disabled} navigate={navigate} />
    </Section></section>
    {!!legacyIds.length && <details className="expert-foldout"><summary>原有扩展配置 · 需要核对</summary><p className="campus-hint">旧配置已保留。队长仅使用内置协作能力，请核对并移除其他绑定后再发布。</p><CapabilityFields config={config} onChange={patch} disabled={disabled} promptOutput onlyIds={legacyIds} /></details>}
    <Section title="协调设置" description="选择用于理解任务、分派工作和汇总结果的模型。">
      <div data-expert-field="model"><Field label="协调模型">{disabled ? <p className="captain-model-value">{models.find(model => model.id === config.model)?.name ?? '模型不可用'}</p> : <select aria-label="协调模型" value={config.model} onChange={event => patch({ model: event.target.value })}>{models.map(model => <option key={model.id} value={model.id} disabled={!model.active}>{model.name}{!model.active ? '（已停用）' : ''}</option>)}</select>}</Field></div>
      <p className="campus-hint">成员使用各自的模型与业务工具；队长需要直接理解图片或音频时，选择多模态模型。</p>
      <details className="expert-foldout" open={issues.some(issue => issue.section === 'handoff')}>
        <summary><span>人工兜底（选填）</span><small>{runtimeSummary(config, 'handoff')}</small></summary>
        <section data-expert-section="handoff"><DefinitionFields captain config={config} section="handoff" patch={patch} disabled={disabled} issues={issues} /></section>
      </details>
    </Section>
    <div className="captain-team-note"><div><strong>{team ? `所属专家团 · ${team.draft.name}` : '创建后，在专家团中选用这位队长'}</strong><p>专家团维护成员名单与固定版本；输入表单、交付要求和完成条件由各业务专家维护。</p></div>{team && <Button variant="ghost" onClick={() => navigate(`/agents/${team.id}/edit/team`)}>查看队长与成员</Button>}</div>
  </div>
}
