import { applyModelCenterAction, type ModelCenterAction } from './model-center'
import { validateImportedCapabilities } from './capability-import'
import { instructionIssues } from './guided-config'
import { capabilityCatalog, capabilitiesOf, seedCampus, upgradeCampus, type Actor, type CampusState } from './campus/model'
import { applyCampusAction, type CampusAction } from './campus/actions'
import { applyUserCenterAction, seedUserCenter, type UserCenterAction } from './user-center-model'
import { validateEmployeeDraft } from '../shared/employee-contract'
import { MODEL_ALLOWLIST } from '../provider/models'
import { parseAgentAsset, parseConfig, PrototypeError } from './config-validation'
import { agentAsset, contractIssues, deleteAgentReason, entityName } from './agent-management'
import { activeVersion, blankAgent, blankGroup, type AdminState, type AgentConfig, type AuditRecord, type Capability, type Config, type DependencyPin, type Entity, type EntityKind, type GroupConfig, type Issue, type Validation, type Version, type Workspace } from './shared'
export { PrototypeError } from './config-validation'
const now = () => new Date().toISOString()
const randomUUID = () => crypto.randomUUID()
const digest = (value: unknown) => JSON.stringify(value)
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PrototypeError(400, '配置格式不正确'); return value as Record<string, unknown> }
const string = (value: unknown, label: string, max: number) => { if (typeof value !== 'string' || value.length > max) throw new PrototypeError(400, `${label}格式或长度不正确`); return value.trim() }
const capabilities: Capability[] = capabilityCatalog
const models = MODEL_ALLOWLIST.filter(m => m.modality === 'text').map(({ modelId, provider }) => ({ modelId, provider }))
export const STORAGE_KEY = 'ai-employee-os:web-admin:prototype:v1'
interface PrototypeData { schema: 1; entities: Entity[]; audits: AuditRecord[]; workspace: Workspace; campus?: CampusState }

/** Browser-only interaction state. No HTTP, database, runtime execution or credentials. */
export class PrototypeStore {
  private data: PrototypeData = { schema: 1, entities: [], audits: [], workspace: { name: '企业 AI 工作区', owner: '本地管理员' } }
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, seed = true) {
    const saved = storage?.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const value = JSON.parse(saved)
        if (value.schema !== 1 || !Array.isArray(value.entities) || !Array.isArray(value.audits) || !value.workspace?.name) throw new Error()
        for (const entity of value.entities) { if (!['agent', 'group'].includes(entity.kind) || !entity.id || !Array.isArray(entity.versions)) throw new Error(); parseConfig(entity.kind, entity.draft); if (entity.asset) parseAgentAsset(entity.asset) }
        this.data = value
      } catch { throw new PrototypeError(422, '本地原型数据格式已失效，可重置示例数据后继续') }
    } else if (seed) this.seed()
  }
  private transaction<T>(fn: () => T): T {
    const previous = structuredClone(this.data)
    try { const result = fn(); this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data)); return result } catch (error) { this.data = previous; throw error }
  }
  private list(): Entity[] { return structuredClone(this.data.entities).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  get(id: string): Entity {
    const entity = this.data.entities.find(e => e.id === id)
    if (!entity) throw new PrototypeError(404, '配置不存在，可能已被删除')
    return structuredClone(entity)
  }
  private persist(entity: Entity): void {
    const index = this.data.entities.findIndex(e => e.id === entity.id)
    if (index < 0) this.data.entities.push(structuredClone(entity))
    else this.data.entities[index] = structuredClone(entity)
  }
  private audit(entity: Pick<Entity, 'id' | 'kind' | 'draft'>, action: string, detail: string): void {
    this.data.audits.push({ id: randomUUID(), entityId: entity.id, entityName: entityName(entity as Entity) || '未命名配置', kind: entity.kind, action, at: now(), detail, actor: '本地管理员' })
  }
  private assertRevision(entity: Entity, revision: unknown): void {
    if (revision !== entity.revision) throw new PrototypeError(409, '此配置已被其他操作更新，请重新加载后再修改')
  }
  state(): AdminState {
    this.data.campus ??= seedCampus(); upgradeCampus(this.data.campus)
    this.data.campus.userCenter ??= seedUserCenter()
    const entities = this.list()
    for (const entity of entities) entity.blockingReasons = this.releaseProblems(entity)
    return { campus: structuredClone(this.data.campus), agents: entities.filter(e => e.kind === 'agent' && !e.deletedAt) as Entity<AgentConfig>[], deletedAgents: entities.filter(e => e.kind === 'agent' && e.deletedAt) as Entity<AgentConfig>[], groups: entities.filter(e => e.kind === 'group') as Entity<GroupConfig>[], capabilities: capabilitiesOf(this.data.campus), models, audits: structuredClone(this.data.audits).reverse().slice(0, 500), workspace: structuredClone(this.data.workspace), executionConnected: false }
  }
  campusAction(revision: number, actor: Actor, action: CampusAction): string | undefined {
    return this.transaction(() => {
      this.data.campus ??= seedCampus(); upgradeCampus(this.data.campus)
      this.data.campus.userCenter ??= seedUserCenter()
      if (revision !== this.data.campus.revision) throw new PrototypeError(409, '原型数据已更新，请刷新后重试')
      return applyCampusAction(this.data.campus, actor, action)
    })
  }
  userCenterAction(revision: number, actor: Actor, action: UserCenterAction): void {
    return this.transaction(() => {
      this.data.campus ??= seedCampus()
      this.data.campus.userCenter ??= seedUserCenter()
      return applyUserCenterAction(this.data.campus, actor, revision, action)
    })
  }
  modelCenterAction(revision: number, actor: Actor, action: ModelCenterAction): void {
    this.transaction(() => {
      this.data.campus ??= seedCampus(); upgradeCampus(this.data.campus)
      if (revision !== this.data.campus.revision) throw new PrototypeError(409, '原型数据已更新，请刷新后重试')
      const detail = applyModelCenterAction(this.data.campus, actor, action)
      this.data.audits.push({ id: randomUUID(), entityId: this.data.campus.modelCenter!.service.id, entityName: '模型管理', kind: 'workspace', action: 'saved', at: now(), detail, actor: '本地管理员' })
    })
  }
  importCapabilities(revision: number, actor: Actor, values: Capability[]): number {
    return this.transaction(() => {
      if (actor.role !== 'admin') throw new PrototypeError(403, '仅系统管理员可上传能力')
      this.data.campus ??= seedCampus(); upgradeCampus(this.data.campus)
      if (revision !== this.data.campus.revision) throw new PrototypeError(409, '目录已更新，请重新读取并核对导入结果')
      validateImportedCapabilities(values)
      const existing = capabilitiesOf(this.data.campus)
      if (values.some(value => existing.some(cap => cap.id === value.id))) throw new PrototypeError(409, '目录已有同标识和版本，请重新核对；已有能力不会覆盖')
      const at = now()
      const imported = structuredClone(values).map(cap => ({ ...cap, imported: { ...cap.imported!, importedAt: at } }))
      this.data.campus.importedCapabilities = [...(this.data.campus.importedCapabilities ?? []), ...imported]
      this.data.campus.revision++
      this.data.audits.push({ id: randomUUID(), entityId: 'capabilities', entityName: '能力中心', kind: 'workspace', action: 'saved', at, detail: `批量上传 ${values.length} 项能力：${values.map(v => v.name).join('、')}；仅导入配置，未执行或连接服务`, actor: '本地管理员' })
      return imported.length
    })
  }
  private releaseProblems(entity: Entity, version = activeVersion(entity)): string[] {
    if (!version || entity.kind === 'agent') return []
    return version.pins.flatMap(pin => {
      try {
        const agent = this.get(pin.agentId)
        if (agent.disabled) return [`${pin.name} 已停用`]
        if (!agent.versions.some(v => v.id === pin.versionId)) return [`${pin.name} 的引用版本不存在`]
        return []
      } catch { return [`${pin.name} 已不可用`] }
    })
  }
  create(kind: EntityKind, raw: unknown, example = false): Entity {
    const draft = parseConfig(kind, raw)
    return this.transaction(() => {
      const entity: Entity = { id: randomUUID(), kind, revision: 1, createdAt: now(), updatedAt: now(), draft, disabled: false, example, versions: [], blockingReasons: [] }
      if (kind === 'agent') entity.asset = agentAsset(entity as Entity<AgentConfig>)
      this.persist(entity); this.audit(entity, 'created', example ? '创建预置示例草稿，尚未发布或执行' : '创建配置草稿'); return entity
    })
  }
  importAgent(raw: unknown, name: string): Entity<AgentConfig> {
    const value = record(raw)
    if (value.kind !== 'agent') throw new PrototypeError(422, '请选择本原型导出的智能体配置（kind: agent）')
    const config = parseConfig('agent', value.config) as AgentConfig
    const displayName = string(name, '导入名称', 60)
    if (displayName.length < 2) throw new PrototypeError(422, '名称至少 2 个字')
    if (config.capabilityVersionIds.some(id => !capabilities.some(cap => cap.id === id))) throw new PrototypeError(422, '配置引用了当前目录中不存在的能力，请先替换对应引用')
    const asset = value.asset ? parseAgentAsset(value.asset) : undefined
    if (config.experience) config.experience = { ...config.experience, channelIds: [], visibility: 'private', audience: '' }
    return this.transaction(() => {
      const entity: Entity<AgentConfig> = { id: randomUUID(), kind: 'agent', revision: 1, createdAt: now(), updatedAt: now(), draft: config, disabled: false, example: false, versions: [], blockingReasons: [] }
      entity.asset = { ...agentAsset(entity), ...(asset ? { displayDescription: asset.displayDescription, tags: asset.tags } : {}), name: displayName, owner: this.data.workspace.owner }
      this.persist(entity); this.audit(entity, 'imported', '导入独立草稿，清除渠道配置与原有使用授权，不继承版本和运行记录'); return entity
    })
  }
  save(id: string, revision: unknown, raw: unknown, assetRaw?: unknown): Entity {
    return this.transaction(() => {
      const entity = this.get(id); this.assertRevision(entity, revision)
      if (entity.deletedAt) throw new PrototypeError(422, '请先从回收站恢复此草稿')
      const next = digest(raw) === digest(entity.draft) ? entity.draft : parseConfig(entity.kind, raw)
      const configChanged = digest(next) !== digest(entity.draft)
      if (entity.kind === 'agent') {
        const previous = agentAsset(entity as Entity<AgentConfig>)
        if (previous.status === 'archived') throw new PrototypeError(422, '请先取消归档再编辑')
        const asset = assetRaw === undefined ? previous : parseAgentAsset(assetRaw)
        if (asset.workspaceId !== previous.workspaceId || asset.status !== previous.status) throw new PrototypeError(422, '工作空间与资产状态不能通过普通编辑修改')
        if ([...asset.name].length < 2 || !asset.owner) throw new PrototypeError(422, '请填写至少 2 个字的展示名称及负责人')
        entity.asset = asset
      }
      entity.draft = next; if (configChanged) entity.validation = undefined; entity.revision++; entity.updatedAt = now()
      this.persist(entity); this.audit(entity, configChanged ? 'saved' : 'metadata_updated', configChanged ? '保存行为草稿，原配置预检已失效；发布版本保持不变' : '更新展示资料与负责人；行为草稿、预检和发布快照保持不变'); return entity
    })
  }
  private validate(entity: Entity): Validation {
    const issues: Issue[] = instructionIssues(entity.draft)
    const pins: DependencyPin[] = []
    const required = (value: string, field: string, label: string) => { if (!value.trim()) issues.push({ field, message: `请填写${label}` }) }
    required(entity.draft.name, 'name', '名称'); required(entity.draft.owner, 'owner', '责任人')
    if (entity.kind === 'agent') {
      const c = entity.draft as AgentConfig
      if (c.experience?.visibility === 'specified' && !c.experience.audience.trim()) issues.push({ field: 'experience.audience', message: '请填写可以使用的成员或部门' })
      if (c.experience && !c.experience.channelIds.length) issues.push({ field: 'experience.channelIds', message: '请至少选择一个发布渠道' })
      if (c.setup?.resourceScope === 'provided' && c.experience?.knowledgeIds.length) issues.push({ field: 'experience.knowledgeIds', message: '仅使用用户材料与知识库选择冲突，请调整资料范围' })
      if (c.experience?.fallbackModel === c.modelId) issues.push({ field: 'modelId', message: '备用模型不能与主模型相同' })
      if (c.experience?.longTermMemory && c.contract?.historyRequirement === 'forbidden') issues.push({ field: 'memoryScopes', message: '已禁止读取历史，请关闭跨会话记忆或调整历史依赖' })
      issues.push(...contractIssues(c))
      issues.push(...validateEmployeeDraft(c).map(({ field, message }) => ({ field, message })))
      required(c.output, 'output', '输出与验收要求')
      if (c.setup?.resourceScope === 'provided' && c.capabilityVersionIds.some(id => capabilities.some(cap => cap.id === id && (cap.toolVersionIds.length || cap.mcpVersionIds.length || cap.permissionRequirements.length)))) issues.push({ field: 'capabilityVersionIds', message: '仅用户提供的材料与额外能力绑定冲突，请修改资料范围或移除额外能力' })
      for (const id of c.capabilityVersionIds) if (!capabilities.some(cap => cap.id === id)) issues.push({ field: 'capabilityVersionIds', message: `所选能力 ${id} 不存在` })
    } else {
      const c = entity.draft as GroupConfig
      required(c.description, 'description', '业务目标'); required(c.completion, 'completion', '整组完成条件')
      const attach = (id: string, purpose: AgentConfig['purpose'], field: string, label: string) => {
        let member: Entity<AgentConfig>
        try { member = this.get(id) as Entity<AgentConfig> } catch { issues.push({ field, message: `请选择有效的${label}` }); return }
        if (member.kind !== 'agent') { issues.push({ field, message: `${label}必须引用 Agent` }); return }
        if (member.deletedAt || agentAsset(member).status === 'archived') { issues.push({ field, message: `${entityName(member)} 已删除或归档，不能用于新的发布` }); return }
        const version = activeVersion(member)
        if (!version) { issues.push({ field, message: `${member.draft.name} 尚未发布配置` }); return }
        if (version.config.purpose !== purpose) issues.push({ field, message: `${version.config.name} 的已发布用途不是${label}` })
        if (member.disabled) issues.push({ field, message: `${version.config.name} 已停用` })
        if (!pins.some(p => p.agentId === member.id)) pins.push({ agentId: member.id, versionId: version.id, name: version.config.name, purpose: version.config.purpose, config: version.config })
      }
      if (c.coordinatorId) attach(c.coordinatorId, 'coordinator', 'coordinatorId', '协调 Agent')
      if (!c.steps.length) issues.push({ field: 'steps', message: '至少添加一个业务节点' })
      if (new Set(c.steps.map(s => s.id)).size !== c.steps.length || c.steps.some(s => !s.id)) issues.push({ field: 'steps', message: '节点标识必须唯一且非空' })
      const ids = c.steps.map(s => s.agentId)
      if (ids.includes(c.coordinatorId)) issues.push({ field: 'steps', message: '协调 Agent 不能同时作为业务成员' })
      c.steps.forEach((step, i) => {
        attach(step.agentId, 'business', `steps.${i}.agentId`, '业务 Agent')
        required(step.task, `steps.${i}.task`, `节点 ${i + 1} 的任务`); required(step.input, `steps.${i}.input`, `节点 ${i + 1} 的输入`); required(step.output, `steps.${i}.output`, `节点 ${i + 1} 的输出`)
      })
    }
    return { digest: digest({ config: entity.draft, pins }), checkedAt: now(), pins, issues, warnings: ['此预检仅验证配置结构和协作关系。模型执行、工具连接与正式身份未在原型中执行。'] }
  }
  check(id: string, revision: unknown): Entity {
    return this.transaction(() => {
      const entity = this.get(id); this.assertRevision(entity, revision)
      if (entity.deletedAt || (entity.kind === 'agent' && agentAsset(entity as Entity<AgentConfig>).status === 'archived')) throw new PrototypeError(422, '请先恢复或取消归档再预检')
      entity.validation = this.validate(entity); entity.revision++; this.persist(entity)
      this.audit(entity, 'checked', entity.validation.issues.length ? `配置预检发现 ${entity.validation.issues.length} 个问题` : '配置预检通过，未执行模型或业务工具'); return entity
    })
  }
  publish(id: string, revision: unknown, note: unknown): Entity {
    return this.transaction(() => {
      const entity = this.get(id); this.assertRevision(entity, revision)
      if (entity.deletedAt || (entity.kind === 'agent' && agentAsset(entity as Entity<AgentConfig>).status === 'archived')) throw new PrototypeError(422, '请先恢复或取消归档再发布')
      if (entity.disabled) throw new PrototypeError(422, '配置已停用，请先启用')
      const check = this.validate(entity)
      if (check.issues.length) throw new PrototypeError(422, '配置不满足发布条件', check.issues)
      if (!entity.validation || entity.validation.digest !== check.digest || entity.validation.issues.length) throw new PrototypeError(422, '配置或成员版本已变化，请重新预检后发布')
      const noteText = string(note, '发布说明', 500)
      if (!noteText) throw new PrototypeError(422, '请填写发布说明')
      const version: Version = { id: randomUUID(), number: entity.versions.length + 1, createdAt: now(), note: noteText, config: structuredClone(entity.draft), pins: check.pins }
      entity.activeVersionId = version.id; entity.revision++; entity.updatedAt = now(); entity.versions.unshift(version); this.persist(entity)
      this.audit(entity, 'published', `发布配置 v${version.number}：${noteText}`); return entity
    })
  }
  rollback(id: string, revision: unknown, versionId: unknown): Entity {
    return this.transaction(() => {
      const entity = this.get(id); this.assertRevision(entity, revision)
      if (entity.deletedAt || (entity.kind === 'agent' && agentAsset(entity as Entity<AgentConfig>).status === 'archived')) throw new PrototypeError(422, '请先恢复或取消归档再切换版本')
      const version = entity.versions.find(v => v.id === versionId)
      if (!version) throw new PrototypeError(404, '发布版本不存在')
      const problems = this.releaseProblems(entity, version)
      if (problems.length) throw new PrototypeError(422, '历史版本依赖当前不可用', problems.map(message => ({ field: 'dependencies', message })))
      entity.activeVersionId = version.id; entity.revision++; entity.updatedAt = now(); this.persist(entity)
      this.audit(entity, 'rolled_back', `发布指向回退到 v${version.number}，现有草稿保留`); return entity
    })
  }
  toggle(id: string, revision: unknown, disabled: unknown): Entity {
    if (typeof disabled !== 'boolean') throw new PrototypeError(400, '启停参数不正确')
    return this.transaction(() => {
      const entity = this.get(id); this.assertRevision(entity, revision)
      if (entity.kind === 'agent' && (entity.deletedAt || agentAsset(entity as Entity<AgentConfig>).status === 'archived')) throw new PrototypeError(422, '请先恢复或取消归档再调整上下线状态')
      if (!disabled && this.releaseProblems(entity).length) throw new PrototypeError(422, '请先恢复被停用的成员')
      entity.disabled = disabled; entity.revision++; entity.updatedAt = now(); this.persist(entity)
      this.audit(entity, disabled ? 'disabled' : 'enabled', disabled ? '停止配置目录提供此配置；历史版本保留' : '恢复配置目录访问'); return entity
    })
  }
  delete(id: string, revision: unknown): void {
    this.transaction(() => {
      const entity = this.get(id); this.assertRevision(entity, revision)
      if (entity.kind === 'agent') {
        if (entity.deletedAt) throw new PrototypeError(422, '此草稿已在回收站')
        const reason = deleteAgentReason(entity as Entity<AgentConfig>, this.state())
        if (reason) throw new PrototypeError(422, reason)
        entity.deletedAt = now(); entity.revision++; entity.updatedAt = now(); this.persist(entity)
        this.audit(entity, 'deleted', '将无发布历史且无引用的草稿移入回收站，可恢复'); return
      }
      if (entity.versions.length) throw new PrototypeError(422, '有发布历史的配置不能删除，请使用停用')
      const referenced = this.list().some(e => e.kind === 'group' && ((e.draft as GroupConfig).coordinatorId === id || (e.draft as GroupConfig).steps.some(s => s.agentId === id) || e.versions.some(v => v.pins.some(p => p.agentId === id))))
      if (referenced) throw new PrototypeError(422, '此 Agent 被专家组引用，请先移除引用')
      this.audit(entity, 'deleted', '删除无发布历史且无引用的草稿'); this.data.entities = this.data.entities.filter(e => e.id !== id)
    })
  }
  archive(id: string, revision: unknown, archived: boolean): Entity {
    return this.transaction(() => {
      const entity = this.get(id) as Entity<AgentConfig>; this.assertRevision(entity, revision)
      if (entity.kind !== 'agent' || entity.deletedAt) throw new PrototypeError(422, '仅可归档正常目录中的 Agent')
      entity.asset = { ...agentAsset(entity), status: archived ? 'archived' : 'active' }; entity.revision++; entity.updatedAt = now()
      this.persist(entity); this.audit(entity, archived ? 'archived' : 'unarchived', archived ? '移出常用目录并停止新的选择；已发布的专家组快照及历史记录保留' : '恢复到常用目录；不会自动发布或启用部署'); return entity
    })
  }
  restore(id: string, revision: unknown): Entity {
    return this.transaction(() => {
      const entity = this.get(id); this.assertRevision(entity, revision)
      if (entity.kind !== 'agent' || !entity.deletedAt) throw new PrototypeError(422, '此 Agent 不在回收站')
      delete entity.deletedAt; entity.revision++; entity.updatedAt = now(); this.persist(entity)
      this.audit(entity, 'restored', '从回收站恢复原草稿及标识，保留原资产状态与历史记录'); return entity
    })
  }
  duplicate(id: string, revision: unknown, name: unknown, source: 'draft' | 'published'): Entity {
    return this.transaction(() => {
      const entity = this.get(id) as Entity<AgentConfig>; this.assertRevision(entity, revision)
      if (entity.kind !== 'agent' || entity.deletedAt) throw new PrototypeError(422, '当前 Agent 无法复制')
      const config = source === 'published' ? activeVersion(entity)?.config : source === 'draft' ? entity.draft : undefined
      if (!config) throw new PrototypeError(422, '所选复制来源不存在')
      const displayName = string(name, '副本名称', 60)
      if ([...displayName].length < 2) throw new PrototypeError(422, '副本名称至少 2 个字')
      const copy: Entity<AgentConfig> = { id: randomUUID(), kind: 'agent', revision: 1, createdAt: now(), updatedAt: now(), draft: structuredClone(config), disabled: false, example: false, versions: [], blockingReasons: [] }
      if (copy.draft.experience) copy.draft.experience = { ...copy.draft.experience, channelIds: [], visibility: 'private', audience: '' }
      copy.asset = { ...agentAsset(entity), name: displayName, status: 'active' }
      this.persist(copy); this.audit(copy, 'copied', `从 ${entityName(entity)} 的${source === 'published' ? '当前发布版本' : '已保存草稿'}复制；保留运行名称和指令，使用新的资产标识，不继承发布、预检或引用关系`); return copy
    })
  }
  saveWorkspace(raw: unknown): Workspace {
    const v = record(raw); const workspace = { name: string(v.name, '工作区名称', 60), owner: string(v.owner, '责任人', 60) }
    if (!workspace.name || !workspace.owner) throw new PrototypeError(422, '请填写工作区名称和责任人')
    return this.transaction(() => {
      this.data.workspace = workspace
      const audit: AuditRecord = { id: randomUUID(), entityId: 'workspace', entityName: workspace.name, kind: 'workspace', action: 'saved', at: now(), detail: '更新工作区资料', actor: '本地管理员' }
      this.data.audits.push(audit); return workspace
    })
  }
  private seed(): void {
    const make = (name: string, role: string, purpose: AgentConfig['purpose'], output: string) => { const agent = this.create('agent', { ...blankAgent(), name, role, purpose, description: `${role}，仅根据获准输入完成任务并标注无法确认的信息。`, systemPrompt: `你是${name}。${role}。遵守输入范围和业务分工，依据来源完成工作。缺少信息时明确说明，不虚构执行结果。`, output, capabilityVersionIds: ['capability.text-analysis.v1'] }, true); const checked = this.check(agent.id, agent.revision); return this.publish(checked.id, checked.revision, '预置示例版本，供原型交互演示') }
    const coordinator = make('协作协调员', '分解目标、组织协作并汇总结果', 'coordinator', '汇总各节点结果，逐项核对完成条件与未解决问题。')
    const researcher = make('资料研究员', '整理输入资料并提取证据', 'business', '附来源定位的事实清单、限制和不确定项。')
    const writer = make('内容撰写员', '依据事实清单撰写结构化文档', 'business', '符合用户要求的文档草稿，事实与推断明确区分。')
    const reviewer = make('质量审阅员', '审查事实依据与交付完整性', 'business', '逐项验收结论、缺失证据和修改建议。')
    const team = this.create('group', { ...blankGroup(), name: '研究与写作专家组', description: '从资料整理到文档交付，组织研究、撰写和审阅三个环节，形成有依据的完整结果。', coordinatorId: coordinator.id, completion: '覆盖用户目标；关键事实有来源；审阅通过；未解决问题明确列出。', steps: [
      { id: randomUUID(), agentId: researcher.id, task: '提取事实与来源，整理研究结论', input: '用户目标和获准资料', output: '事实清单与来源引用' },
      { id: randomUUID(), agentId: writer.id, task: '依据事实清单撰写文档', input: '上一节点的事实清单与来源', output: '结构化文档草稿' },
      { id: randomUUID(), agentId: reviewer.id, task: '核验文档中的事实和目标覆盖', input: '上一节点文档草稿及其来源引用', output: '审阅结论与修订建议' }
    ] }, true)
    const checked = this.check(team.id, team.revision)
    this.publish(checked.id, checked.revision, '预置协作流程，供原型交互演示')
    this.create('group', { ...structuredClone(team.draft), name: '企业材料评审组', description: '协同梳理企业材料、形成评审文档，并逐项检查完整性和依据。' }, true)
    this.create('group', { ...structuredClone(team.draft), name: '专题报告专家组', description: '围绕指定专题完成资料分析、报告撰写与质量复核。' }, true)
    make('政策解读专家', '分析政策适用条件并解释条款依据', 'expert', '条款解释、适用边界与原文出处。')
  }
}

let current: PrototypeStore | undefined
export function prototypeStore(): PrototypeStore { return current ??= new PrototypeStore(window.localStorage) }
export async function getState(): Promise<AdminState> { return prototypeStore().state() }
export function resetPrototype(): void { window.localStorage.removeItem(STORAGE_KEY); current = undefined }
