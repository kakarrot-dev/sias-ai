import { isCaptain, type Agent } from './model'

export const expertConfigTabs = [['basic', '基本信息'], ['skills', '工作能力'], ['input', '输入与输出'], ['model', '运行配置'], ['review', '检查配置']]
export function AgentNavigation({ agent, active, onSelect, showGrants = true }: { showGrants?: boolean; agent: Agent; active: string; onSelect: (key: string) => void }) {
  const tabs = [...(agent.kind === 'team' ? [['basic', '基本信息'], ['team', '队长与成员']] : expertConfigTabs.filter(([key]) => !isCaptain(agent) || key !== 'input').map(([key, label]) => [key, isCaptain(agent) && key === 'skills' ? '协作能力' : label])), ['release', '发布管理'], ...(showGrants && !isCaptain(agent) ? [['grants', '使用授权']] : []), ['history', '版本记录'], ['records', '运行记录']]
  return <nav className="agent-management-nav" aria-label={agent.kind === 'expert' ? '专家表单分区' : '智能体配置分区'}>{tabs.map(([key, label]) => <button key={key} aria-current={active === key ? 'page' : undefined} onClick={() => onSelect(key)}>{label}</button>)}</nav>
}
