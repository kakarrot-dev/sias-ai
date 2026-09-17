import { isBuiltinCapability } from '../capability-search'
import type { Capability } from '../shared'
import { actionKey, capabilityCatalog, skillActions, type Binding, type Config } from './model'

export const isMcpService = (cap: Capability) => !!(cap.execution as { mcpService?: unknown })?.mcpService
export const expertResourceKind = (cap: Capability) => isMcpService(cap) ? 'legacy' : isBuiltinCapability(cap) ? 'builtin' : 'skill'
export const toolNeedsConfirmation = (b: Binding) => b.write || !!b.requiresConfirmation
export const toolDisplayName = (b: Binding, cap: Capability) => b.displayName ?? cap.name.slice(0, 10)
export const fallbackReplies = { unanswered: '暂时没有足够的信息回答这个问题，请补充材料或联系相关负责人。', error: '暂时无法完成，请稍后重试。你的输入会保留。' }
export function previewActions(c: Config) {
  return c.tools.flatMap(b => {
    const cap = capabilityCatalog.find(cap => cap.id === b.id)
    if (!cap || isMcpService(cap) || b.enabled === false || !cap.execution?.active || !cap.execution.versions.includes(b.version) || cap.execution.departments && !cap.execution.departments.includes(c.department)) return []
    if (isBuiltinCapability(cap)) return b.read || b.write ? [{ key: b.id, name: toolDisplayName(b, cap), needsConfirmation: toolNeedsConfirmation(b), fields: (cap.parameters ?? []).filter(p => b.confirmationFields === undefined || b.confirmationFields.includes(p.key)) }] : []
    return skillActions(b).filter(a => a.enabled).flatMap(a => {
      const definition = cap.execution?.toolActions?.find(d => d.id === a.id)
      return definition ? [{ key: actionKey(b.id, a.id), name: definition.name, needsConfirmation: definition.write, fields: [{ key: 'goal', label: '本次任务', example: '按用户的要求处理当前材料' }] }] : []
    })
  })
}
export function resourceNames(c: Config, kind: 'builtin' | 'skill') {
  return c.tools.flatMap(b => { const cap = capabilityCatalog.find(cap => cap.id === b.id); return cap && expertResourceKind(cap) === kind ? [cap.name] : [] })
}
