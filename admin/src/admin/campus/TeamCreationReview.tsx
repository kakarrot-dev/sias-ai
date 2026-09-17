import { Button, Facts, Notice, Section } from '../components'
import { personName, teamIssues, type CampusState, type Config } from './model'

export const teamCreationSteps = [
  { label: '基本信息', hint: '为团队命名，说明它能帮助用户完成什么工作。' },
  { label: '队长与成员', hint: '选择队长与至少两位普通专家，输入输出沿用各专家的配置。' },
  { label: '检查团队', hint: '核对配置并创建草稿。发布和使用授权可在创建后继续完成。' },
]
export type TeamCreationJump = (step: number, field?: string) => void

export function TeamCreationReview({ state, config: c, jump }: { state: CampusState; config: Config; jump: TeamCreationJump }) {
  const issues = [
    ...(!c.name.trim() ? [{ message: '填写团队名称', step: 0, field: 'name' }] : []),
    ...teamIssues(state, c).map(message => ({ message, step: 1, field: undefined })),
  ]
  const pinnedName = (pin: Config['team']['captain']) => {
    const agent = state.agents.find(a => a.id === pin.id)
    const config = pin.version === 0 ? agent?.draft : agent?.versions.find(v => v.number === pin.version)?.config
    return config ? `${config.name} · ${pin.version ? `v${pin.version}` : '已保存草稿'}` : '尚未选择或引用不可用'
  }
  return <div className="team-creation-review">
    {issues.length ? <div className="team-review-pending"><div><h3>发布前还有 {issues.length} 项待完善</h3><p>点击下方条目修改，未完成的组团配置可以保存后补充。</p></div><ul>{issues.map((issue, index) => <li key={`${issue.step}-${index}`}><button onClick={() => jump(issue.step, issue.field)}>{issue.message}<span aria-hidden="true">→</span></button></li>)}</ul></div> : <Notice tone="success">配置检查通过，可以创建草稿并继续发布。</Notice>}
    <Section title="基本信息" action={<Button variant="ghost" onClick={() => jump(0)}>修改基本信息</Button>}><Facts items={[["团队名称", c.name || '待填写'], ['团队简介', c.description || '未填写'], ['所属部门', c.department], ['责任人', personName(c.owner)]]} /></Section>
    <Section title="队长与成员" action={<Button variant="ghost" onClick={() => jump(1)}>修改队长与成员</Button>}><Facts items={[["专属队长", c.team.captain.id ? pinnedName(c.team.captain) : '待选择'], ['普通专家', c.team.members.length ? <ul className="team-review-members">{c.team.members.map(pin => <li key={pin.id}>{pinnedName(pin)}</li>)}</ul> : '待添加，至少两名']]} /></Section>
  </div>
}
