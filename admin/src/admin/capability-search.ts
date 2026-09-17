import type { Capability } from './shared'

export type CapabilityFilter = 'all' | 'builtin' | 'skill' | 'tool' | 'mcp'
export const CAPABILITY_PAGE_SIZE = 6
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim()
export const isBuiltinCapability = (cap: Capability) => cap.kind ? cap.kind === 'builtin' : !cap.skillVersionIds.length && !cap.toolVersionIds.length && !cap.mcpVersionIds.length
export const isMcpCapability = (cap: Capability) => !!(cap.execution as { mcpService?: unknown })?.mcpService
export const capabilityTypeLabel = (cap: Capability) => isMcpCapability(cap) ? 'MCP' : isBuiltinCapability(cap) ? 'Tool（内置工具）' : 'Skill'
export const capabilityPurposes = (cap: Capability): string[] => cap.purposes?.length ? cap.purposes : ['未分类']

// Partial words match all searchable fields; omitted characters also match names.
// This covers queries like “飞书读取” → “飞书文档读取” without adding a search service.
function nameMatch(name: string, query: string): boolean {
  let cursor = 0
  for (const character of query) {
    cursor = name.indexOf(character, cursor)
    if (cursor === -1) return false
    cursor++
  }
  return true
}
export function searchCapabilities(capabilities: Capability[], query: string, filter: CapabilityFilter, purpose = 'all'): Capability[] {
  const terms = normalize(query).split(/\s+/u).filter(Boolean)
  return capabilities.flatMap((cap, index) => {
    if (purpose !== 'all' && !capabilityPurposes(cap).includes(purpose)) return []
    if (filter === 'mcp' && !isMcpCapability(cap)) return []
    if (filter === 'builtin' && !isBuiltinCapability(cap)) return []
    if (filter === 'skill' && (isMcpCapability(cap) || (cap.kind ? cap.kind !== 'skill' : !cap.skillVersionIds.length))) return []
    if (filter === 'tool' && !cap.toolVersionIds.length && !cap.mcpVersionIds.length) return []
    const name = normalize(cap.name)
    const text = normalize([cap.description, cap.id, ...capabilityPurposes(cap), ...(cap.tags ?? []), ...cap.skillVersionIds, ...cap.toolVersionIds, ...cap.mcpVersionIds, ...(cap.execution?.toolActions ?? []).flatMap(action => [action.name, action.id])].join(' '))
    let score = 0
    for (const term of terms) {
      if (name === term) continue
      if (name.startsWith(term)) score += 1
      else if (name.includes(term)) score += 2
      else if (text.includes(term)) score += 3
      else if (nameMatch(name, term)) score += 4
      else return []
    }
    return [{ cap, score, index }]
  }).sort((a, b) => a.score - b.score || a.index - b.index).map(item => item.cap)
}
