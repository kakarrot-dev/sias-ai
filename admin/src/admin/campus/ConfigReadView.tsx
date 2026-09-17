import type { ReactNode } from 'react'
import { Facts, Section } from '../components'
import { completionLabels } from './agent-definition'
import { runtimeSummary } from './config-summary'
import { capabilityCatalog, personName, type Config } from './model'

/** Keep field-level inspection available without making disabled forms the reading surface. */
export function ConfigReadView({ config: c, section, readonly, children, captain = false }: { config: Config; section: string; readonly: boolean; children: ReactNode; captain?: boolean }) {
  if (!readonly || captain && section === 'skills') return <>{children}</>
  return <>
    {section === 'basic' ? <Section title="身份与职责">
      <Facts items={[["名称", c.name], ['简介', c.description || '未填写'], ['归属', `${c.department} · ${personName(c.owner)}`]]} />
      <h3>职责说明</h3><pre className="config-readable-prompt">{c.prompt || '未填写'}</pre>
      {!captain && c.opening && <><h3>开场白</h3><p>{c.opening}</p></>}
    </Section> : section === 'skills' ? <Section title="已配置的工作能力">
      {c.tools.length ? <ul className="config-capability-list">{c.tools.map(binding => <li key={binding.id}><strong>{capabilityCatalog.find(cap => cap.id === binding.id)?.name ?? binding.id}</strong><span>v{binding.version} · {binding.enabled === false ? '未启用' : '已启用'}</span></li>)}</ul> : <p>尚未添加技能或工具。</p>}
    </Section> : section === 'input' ? <Section title="输入与输出摘要"><Facts items={[["用户输入", runtimeSummary(c, 'input')], ['表单标题', c.interaction?.input.formTitle || '填写任务信息'], ['交付成果', runtimeSummary(c, 'io')], ['任务完成条件', completionLabels[c.definition?.task.completion ?? 'validated']], ['完成标准', c.definition?.task.success || '按成果约定校验']]} /></Section> : <Section title={section === 'review' ? '配置摘要' : '运行配置摘要'}><Facts items={[
      ...(captain ? [['业务输入与交付', '沿用各业务专家的配置'] as [string, string]] : [['用户交互', runtimeSummary(c, 'input')], ['交付内容', runtimeSummary(c, 'io')]] as [string, string][]), ['人工兜底', runtimeSummary(c, 'handoff')],
      ['模型与上下文', runtimeSummary(c, 'model')],
      ['运行限制', runtimeSummary(c, 'governance')], ['知识源', runtimeSummary(c, 'knowledge')],
    ]} /></Section>}
    <details className="expert-foldout config-read-details"><summary>查看完整配置字段（只读）</summary>{children}</details>
  </>
}
