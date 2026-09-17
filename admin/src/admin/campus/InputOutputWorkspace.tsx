import { DefinitionFields } from './DefinitionFields'
import { runtimeSummary } from './config-summary'
import type { Config } from './model'
import type { ExpertIssue } from './expert-form'

type Section = 'input' | 'io'
type Props = { config: Config; active: Section; onSelect: (section: Section) => void; patch: (value: Partial<Config>) => void; disabled: boolean; issues?: ExpertIssue[] }
export function InputOutputWorkspace({ config, active, onSelect, patch, disabled, issues }: Props) {
  return <div className="io-workspace"><nav className="io-section-nav" aria-label="输入输出分区">{([['input', '输入与用户表单'], ['io', '输出与完成条件']] as const).map(([key, label]) => <button key={key} aria-current={active === key ? 'page' : undefined} onClick={() => onSelect(key)}><strong>{label}</strong><small>{runtimeSummary(config, key)}</small></button>)}</nav><section data-expert-section={active}><DefinitionFields issues={issues} config={config} section={active} patch={patch} disabled={disabled} /></section></div>
}

