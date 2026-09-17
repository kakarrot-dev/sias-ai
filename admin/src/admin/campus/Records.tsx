import { Section } from '../components'
import { ChatRecords } from '../RunCenter'
import type { Actor, Agent, CampusState } from './model'

export function AgentRecords({ state, actor, agent }: { state: CampusState; actor: Actor; agent: Agent }) {
  return <Section title="运行记录" description="查看此智能体的会话、用量及管理操作。"><ChatRecords key={`${agent.id}:${actor.role}:${actor.department}`} state={state} actor={actor} agentId={agent.id} /></Section>
}
