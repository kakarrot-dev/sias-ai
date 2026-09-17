import { effectivePrompt } from './guided-config'
import { parseExperience } from './agent-experience'
import { MAX_AGENT_CAPABILITIES, type GuidedSetup } from './shared'
import { normalizeEmployeeDraft } from '../shared/employee-contract'
import type { AgentAsset, AgentConfig, AgentContract, Config, ContractField, EntityKind, GroupConfig, Issue } from './shared'

export class PrototypeError extends Error {
  constructor(public status: number, message: string, public issues: Issue[] = []) { super(message) }
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PrototypeError(400, '配置格式不正确')
  return value as Record<string, unknown>
}
function string(value: unknown, field: string, max = 2000): string {
  if (typeof value !== 'string' || value.length > max) throw new PrototypeError(400, `${field}格式或长度不正确`)
  return value.trim()
}
function choice<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw new PrototypeError(400, `${field}选项不正确`)
  return value as T
}
function integer(value: unknown, field: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) throw new PrototypeError(400, `${field}必须为 1 至 ${max} 的整数`)
  return value
}
function stringArray(value: unknown, field: string, max = 30): string[] {
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== 'string' || v.length > 200)) throw new PrototypeError(400, `${field}格式不正确`)
  return value
}

function parseSetup(raw: unknown): GuidedSetup | undefined {
  if (raw === undefined) return undefined
  const v = record(raw)
  return { templateId: choice(v.templateId, ['knowledge', 'analysis', 'report', 'review', 'custom'], '模板'), inputDescription: string(v.inputDescription, '所需材料'), outputFormat: choice(v.outputFormat, ['document', 'table', 'json', 'form'], '结果形式'), resourceScope: choice(v.resourceScope, ['provided', 'selected'], '资料范围'), approval: choice(v.approval, ['delivery', 'external'], '确认规则'), supplement: string(v.supplement, '补充说明', 5000), promptMode: choice(v.promptMode, ['guided', 'manual'], '指令模式') }
}
export function parseAgentAsset(raw: unknown): AgentAsset {
  const v = record(raw)
  const tags = [...new Set(stringArray(v.tags, '分类标签', 8).map(t => t.trim()).filter(Boolean))]
  if (tags.some(t => [...t].length > 20)) throw new PrototypeError(400, '每个标签最多 20 个字')
  return { name: string(v.name, '展示名称', 60), displayDescription: string(v.displayDescription, '展示说明', 500), owner: string(v.owner, '负责人', 60), tags, workspaceId: string(v.workspaceId, '工作空间', 100), status: choice(v.status, ['active', 'archived'], '资产状态') }
}
function parseContract(raw: unknown): AgentContract | undefined {
  if (raw === undefined) return undefined
  const v = record(raw)
  const fields = (rawFields: unknown, label: string): ContractField[] => {
    if (!Array.isArray(rawFields) || rawFields.length > 20) throw new PrototypeError(400, `${label}最多 20 个字段`)
    return rawFields.map(item => {
      const f = record(item)
      if (typeof f.required !== 'boolean') throw new PrototypeError(400, `${label}必填选项不正确`)
      return { key: string(f.key, `${label}字段名`, 40), label: string(f.label, `${label}业务含义`, 200), type: choice(f.type, ['string', 'number', 'boolean', 'array'], `${label}类型`), required: f.required,
        ...(f.widget !== undefined ? { widget: choice(f.widget, ['textarea', 'date', 'select', 'multiselect'] as const, `${label}控件`) } : {}),
        ...(f.options !== undefined ? { options: stringArray(f.options, `${label}选项`).map(s => s.trim()) } : {}),
        ...(f.help !== undefined ? { help: string(f.help, `${label}提示`, 200) } : {}),
        ...Object.fromEntries(['minimum', 'maximum'].filter(key => f[key] !== undefined).map(key => {
          if (typeof f[key] !== 'number' || !Number.isFinite(f[key])) throw new PrototypeError(400, `${label}数字范围不正确`)
          return [key, f[key]]
        })) }
    })
  }
  return { inputFields: fields(v.inputFields, '输入'), outputFields: fields(v.outputFields, '输出'), ...(v.followUpFields !== undefined ? { followUpFields: fields(v.followUpFields, '补充') } : {}), missingInputPolicy: choice(v.missingInputPolicy, ['ask', 'reject'], '缺失输入策略'), historyRequirement: choice(v.historyRequirement, ['optional', 'required', 'forbidden'], '历史依赖') }
}
function projectPrompt<T extends Config>(config: T): T {
  if (config.setup?.promptMode === 'guided') {
    if ('systemPrompt' in config) config.systemPrompt = effectivePrompt(config)
    else config.instructions = effectivePrompt(config)
  }
  return config
}

export function parseConfig(kind: EntityKind, raw: unknown): Config {
  const v = record(raw)
  const setup = parseSetup(v.setup)
  if (kind === 'agent') {
    const memoryScopes = stringArray(v.memoryScopes, '记忆范围').map(s => choice(s, ['global', 'employee', 'task'] as const, '记忆范围'))
    return projectPrompt({
      setup, ...(v.contract !== undefined ? { contract: parseContract(v.contract) } : {}), ...(v.experience !== undefined ? { experience: parseExperience(v.experience) } : {}),
      ...normalizeEmployeeDraft({ name: string(v.name, '名称', 20), role: string(v.role, '职责', 40), description: string(v.description, '说明', 500), systemPrompt: string(v.systemPrompt, '工作规则', 10000), modelId: choice(v.modelId, ['deepseek-v4-pro', 'claude-sonnet-4.6'], '模型'), capabilityVersionIds: stringArray(v.capabilityVersionIds, '能力', MAX_AGENT_CAPABILITIES), memoryScopes }),
      purpose: choice(v.purpose, ['expert', 'coordinator', 'business'], '用途'), owner: string(v.owner, '责任人', 60), output: string(v.output, '输出要求'), maxSteps: integer(v.maxSteps, '最大步骤', 200), timeoutSeconds: integer(v.timeoutSeconds, '超时', 3600)
    } satisfies AgentConfig)
  }
  if (setup?.outputFormat === 'form') throw new PrototypeError(400, '表单结果目前仅适用于智能体')
  if (!Array.isArray(v.steps) || v.steps.length > 12) throw new PrototypeError(400, '专家组最多支持 12 个业务节点')
  return projectPrompt({
    setup, ...(v.instructions !== undefined ? { instructions: string(v.instructions, '场景指令', 10000) } : {}),
    name: string(v.name, '名称', 60), description: string(v.description, '业务目标'), owner: string(v.owner, '责任人', 60), coordinatorId: string(v.coordinatorId, '协调 Agent', 100),
    strategy: choice(v.strategy, ['sequential'], '协作方式'), contextPolicy: choice(v.contextPolicy, ['previous_output', 'shared_results'], '上下文'), failurePolicy: choice(v.failurePolicy, ['stop', 'human_review'], '失败处理'), maxSteps: integer(v.maxSteps, '组级步骤', 1000), timeoutSeconds: integer(v.timeoutSeconds, '总时限', 14400), completion: string(v.completion, '完成条件'),
    steps: v.steps.map(rawStep => { const s = record(rawStep); return { id: string(s.id, '节点 ID', 100), agentId: string(s.agentId, '成员', 100), task: string(s.task, '节点任务'), input: string(s.input, '输入'), output: string(s.output, '输出') } })
  } satisfies GroupConfig)
}
