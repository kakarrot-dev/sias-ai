import { Facts } from '../components'
import { agentAvailable } from './availability'
import { releaseChanges } from './config-summary'
import { nextVersion, people, references, usageDecision, type Agent, type CampusState } from './model'

export function ReleaseSummary({ agent, state }: { agent: Agent; state: CampusState }) {
  const changes = releaseChanges(agent, state)
  const teams = references(state, agent.id).filter(agentAvailable)
  return <section className="release-summary" aria-label="本次发布变化">
    <h3>{agent.live ? `v${agent.live} → v${nextVersion(agent)} · ${changes.length} 项配置变化` : `首次发布 v${nextVersion(agent)}`}</h3>
    <Facts items={[
      ['生效时间', '确认后新发起的对话使用新版本'],
      ['使用范围', state.userCenter ? '正常用户登录即可使用，无需单独授权' : `${people.filter(p => usageDecision(agent, p.id).allowed).length} 位模拟用户获授权；发布不改变使用授权`],
      ...(teams.length ? [['引用团队', `${teams.map(t => t.draft.name).join('、')}；各团队需主动更新固定版本`] as [string, string]] : []),
    ]} />
    {changes.length ? <div className="release-change-list">{changes.map((change, index) => <details open={!!agent.live && index < 2} key={change.label} className="release-change"><summary>{change.label}{change.before === change.after && <small> · 内部规则有变化，请核对对应配置</small>}</summary><div><section><h4>当前生效</h4><p>{change.before}</p></section><section><h4>本次保存</h4><p>{change.after}</p></section></div></details>)}</div> : <p>配置内容与当前发布版本一致。</p>}
  </section>
}
