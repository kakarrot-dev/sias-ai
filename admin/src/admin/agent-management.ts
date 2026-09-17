import { fieldDefinitionIssues } from './form-contract'
import { type AdminState, type AgentAsset, type AgentConfig, type AgentContract, type Entity, type Issue } from './shared'

export const defaultContract = (): AgentContract => ({ inputFields: [], outputFields: [], missingInputPolicy: 'ask', historyRequirement: 'optional' })
export function agentAsset(entity: Entity<AgentConfig>): AgentAsset {
  return entity.asset ?? { name: entity.draft.name, displayDescription: entity.draft.description, owner: entity.draft.owner, tags: [], workspaceId: 'local-workspace', status: 'active' }
}
export function entityName(entity: Entity): string { return entity.kind === 'agent' ? agentAsset(entity as Entity<AgentConfig>).name : entity.draft.name }
export function agentReferences(data: Pick<AdminState, 'groups'>, id: string) {
  return data.groups.flatMap(group => {
    const draft = group.draft.coordinatorId === id || group.draft.steps.some(step => step.agentId === id)
    const versions = group.versions.filter(v => v.pins.some(pin => pin.agentId === id))
    return draft || versions.length ? [{ group, draft, versions }] : []
  })
}
export function deleteAgentReason(entity: Entity<AgentConfig>, data: Pick<AdminState, 'groups'>): string {
  if (entity.versions.length) return '已有发布历史，请使用归档以保留版本与追溯记录。'
  if (agentReferences(data, entity.id).length) return '仍被专家组引用，请先移除草稿及历史版本中的引用。'
  return ''
}
export { fieldsSchema, fieldExample, validateContractValue } from './form-contract'
export function contractIssues(config: AgentConfig): Issue[] {
  const contract = config.contract
  if (!contract) return config.setup?.outputFormat === 'form' ? [{ field: 'contract.outputFields', message: '表单结果需要至少一个输出字段' }] : []
  const issues = [
    ...fieldDefinitionIssues(contract.inputFields, '输入', 'contract.inputFields', true),
    ...fieldDefinitionIssues(contract.outputFields, '输出', 'contract.outputFields'),
    ...fieldDefinitionIssues(contract.followUpFields ?? [], '补充', 'contract.followUpFields', true)
  ]
  if (contract.followUpFields?.some(f => contract.inputFields.some(i => i.key === f.key))) issues.push({ field: 'contract.followUpFields', message: '补充字段不能与入口字段重名，已有信息无需重复填写' })
  if (contract.outputFields.length && !['json', 'table', 'form'].includes(config.setup?.outputFormat ?? 'document')) issues.push({ field: 'contract.outputFields', message: '已定义输出字段，请选择 JSON、表格或表单格式，或移除结构化字段' })
  if (!contract.outputFields.length && config.setup?.outputFormat === 'form') issues.push({ field: 'contract.outputFields', message: '表单结果需要至少一个输出字段' })
  return issues
}
