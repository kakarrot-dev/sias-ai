import { multiAgentEnabled } from './availability'
import { Button, Empty, Facts, Tag, formatTime } from '../components'
import { canEdit, canPublish, canSee, releaseIssues, hasChanges, liveVersion, models, personName, statusOf, type Actor, type CampusState } from './model'

export function AssistantSettings({ state, actor, navigate }: { state: CampusState; actor: Actor; navigate: (path: string) => void }) {
  const assistant = state.agents.find(a => a.kind === 'assistant' && !a.deletedAt)
  if (!assistant) return <Empty title="数字助理尚未初始化" description="请由平台实施人员完成学校初始化，预置统一数字助理。" />
  if (!canSee(actor, assistant)) return <Empty title="当前身份无权查看数字助理配置" description="数字助理由平台管理员维护，审计人员可查看。" />
  const published = liveVersion(assistant)
  return <section className="campus-assistant-settings" aria-label="数字助理设置">
    <header className="campus-assistant-heading">
      <span className="campus-avatar is-assistant">{assistant.draft.icon}</span>
      <div><h2>{assistant.draft.name}</h2><p>全校统一入口 · 系统预置</p></div>
      <Tag>{statusOf(assistant)}</Tag>
    </header>
    <p>{multiAgentEnabled ? "负责日常问答、理解用户意图，匹配用户有权使用的专家或专家团。" : "负责日常问答、理解用户意图，匹配用户有权使用的普通专家。"}</p>
    <Facts items={[
      ['当前发布版本', published ? `v${published.number}` : '尚未发布'],
      ['草稿状态', hasChanges(assistant) ? '有待发布的草稿' : '与发布版本一致'],
      ['当前运行模型', published ? models.find(m => m.id === published.config.model)?.name ?? published.config.model : '发布后生效'],
      ['配置责任人', personName(assistant.draft.owner)],
      ['最近更新', `${formatTime(assistant.updated)} · ${assistant.updatedBy}`],
    ]} />
    <div className="campus-inline">
      <Button onClick={() => navigate(`/agents/${assistant.id}/view/basic`)}>查看配置</Button>
      {canEdit(actor, assistant) && <Button variant={!hasChanges(assistant) || releaseIssues(state, assistant).length ? "primary" : "default"} onClick={() => navigate(`/agents/${assistant.id}/edit/basic`)}>{hasChanges(assistant) && releaseIssues(state, assistant).length ? '完善配置' : '编辑配置'}</Button>}
      <Button variant={canPublish(actor, assistant) && hasChanges(assistant) && !releaseIssues(state, assistant).length ? "primary" : "default"} onClick={() => navigate(`/agents/${assistant.id}/edit/release`)}>{hasChanges(assistant) ? '核对并生效' : '让修改生效'}</Button>
      <Button onClick={() => navigate(`/agents/${assistant.id}/edit/history`)}>修改记录</Button>
    </div>
    <p className="campus-hint">每所学校保留一个数字助理。保存修改后，到“让修改生效”确认；也可从“修改记录”找回以前的设置。</p>
  </section>
}
