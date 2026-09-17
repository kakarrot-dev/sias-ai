import { CapabilityFields } from './CapabilityFields'
import { isMcpService } from './expert-resources'
import { capabilityCatalog, selectCapabilities, type Config } from './model'
import { MAX_AGENT_CAPABILITIES } from '../shared'

/** Choose governed capabilities, never copy connection details or credentials into an Agent. */
export function McpBindings({ config: c, patch, disabled }: { config: Config; patch: (value: Partial<Config>) => void; disabled: boolean }) {
  const catalog = capabilityCatalog.filter(isMcpService)
  const selected = c.tools.filter(b => catalog.some(cap => cap.id === b.id)).map(b => b.id)
  return <div className="definition-policy expert-mcp-bindings"><h3>外部服务 <span>可选 · MCP</span></h3><p>选择已接入的服务，再设置允许使用的操作。</p>
    <div className="definition-knowledge-list">{catalog.map(cap => {
      const available = cap.execution?.active && (!cap.execution.departments || cap.execution.departments.includes(c.department))
      return <label className="campus-check" key={cap.id}><input type="checkbox" aria-label={`绑定 ${cap.name}`} checked={selected.includes(cap.id)} disabled={disabled || !selected.includes(cap.id) && (!available || c.tools.length >= MAX_AGENT_CAPABILITIES)} onChange={e => patch(selectCapabilities(c, e.target.checked ? [...c.tools.map(b => b.id), cap.id] : c.tools.filter(b => b.id !== cap.id).map(b => b.id)))} />{cap.name} · v{cap.version}{!available ? ' · 当前不可添加' : ''}</label>
    })}</div>
    {selected.length > 0 && <CapabilityFields config={c} onChange={patch} disabled={disabled} onlyIds={selected} />}
  </div>
}
