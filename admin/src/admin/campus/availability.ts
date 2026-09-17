import type { Agent } from './model'

// Current product scope: keep multi-agent data intact, but close its UI and actions.
// Current release supports administrator-managed single experts with configured capabilities. Historical UI is retained for regression coverage.
export const expertMvpEnabled: boolean = true
export const multiAgentEnabled: boolean = false
export const singleAgentOnlyMessage = '当前仅开放单个智能体'
export function agentAvailable(agent: Pick<Agent, 'kind' | 'dutyType'>): boolean {
  return multiAgentEnabled || (agent.kind !== 'team' && agent.dutyType !== 'captain')
}

export const chatExpertAvailable = (agent: Pick<Agent, 'kind' | 'dutyType'>) => agent.kind === 'expert' && agent.dutyType !== 'captain'
