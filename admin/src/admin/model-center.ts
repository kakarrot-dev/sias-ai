import type { Actor, CampusState, Config } from './campus/model'

export const LEGACY_MODEL_PROVIDER = 'prototype-relay'
export const legacyModels = [{ id: 'campus-text', name: 'deepseek-v4', context: '128K', abilities: '文本', active: true }, { id: 'campus-vision', name: 'glm-5.2', context: '64K', abilities: '文本 / 视觉 / 音频', active: true }, { id: 'campus-retired', name: 'deepseek-v3', context: '32K', abilities: '文本', active: false }]
// Compatibility aliases apply only to the old browser demo catalog, never to upstream IDs.
const demoModelIds: Record<string, string> = { 'campus-text': 'deepseek-v4', 'campus-vision': 'glm-5.2', 'campus-retired': 'deepseek-v3', 'relay-chat-demo': 'deepseek-v4', 'relay-vision-demo': 'glm-5.2', 'relay-reasoning-demo': 'deepseek-v3' }
const demoModelNames: Record<string, string> = { ...demoModelIds, '校内通用语言模型': 'deepseek-v4', '校内多模态模型': 'glm-5.2', '校内历史模型': 'deepseek-v3', '中转站通用模型（示例）': 'deepseek-v4' }
export interface RelayService { id: string; name: string; baseUrl: string; credentialRef: string; enabled: boolean }
export interface RelayModel { providerId: string; modelId: string; displayName: string; enabled: boolean; upstreamAvailable: boolean; inputTypes: ('text' | 'image' | 'audio')[]; supportsTools: boolean; source: 'demo'; syncedAt: string | null }
export interface ModelCenterState { service: RelayService; models: RelayModel[]; lastSyncAt: string | null }
export function seedModelCenter(): ModelCenterState {
  return { service: { id: LEGACY_MODEL_PROVIDER, name: '自建中转站（示例）', baseUrl: '', credentialRef: '', enabled: true }, lastSyncAt: null,
    models: legacyModels.map(m => ({ providerId: LEGACY_MODEL_PROVIDER, modelId: demoModelIds[m.id], displayName: m.name, enabled: m.active, upstreamAvailable: true, inputTypes: m.id === 'campus-vision' ? ['text', 'image', 'audio'] : ['text'], supportsTools: true, source: 'demo', syncedAt: null })) }
}
export const modelCenterOf = (state: Pick<CampusState, 'modelCenter'>): ModelCenterState => state.modelCenter ?? seedModelCenter()
export const modelKey = (model: Pick<RelayModel, 'providerId' | 'modelId'>) => JSON.stringify([model.providerId, model.modelId])
export function resolveAgentModel(state: Pick<CampusState, 'modelCenter'>, config: Pick<Config, 'model' | 'modelProviderId'>): RelayModel | undefined {
  const models = modelCenterOf(state).models; const providerId = config.modelProviderId ?? LEGACY_MODEL_PROVIDER
  return models.find(m => m.providerId === providerId && m.modelId === config.model) ?? models.find(m => m.source === 'demo' && m.providerId === providerId && m.modelId === demoModelIds[config.model])
}
export function modelAvailable(center: ModelCenterState, model?: RelayModel): boolean { return !!model && center.service.enabled && model.providerId === center.service.id && model.enabled && model.upstreamAvailable }
export function agentModelName(state: Pick<CampusState, 'modelCenter'>, config: Pick<Config, 'model' | 'modelProviderId' | 'modelDisplayName'>, snapshot = false): string {
  const model = resolveAgentModel(state, config)
  const savedName = model?.source === 'demo' ? demoModelNames[config.modelDisplayName ?? ''] ?? config.modelDisplayName : config.modelDisplayName
  return (snapshot && savedName || model?.displayName || savedName || config.model) || '待选择模型'
}
export function pinAgentModel(state: CampusState, config: Config): Config {
  const model = resolveAgentModel(state, config)
  if (!model) return config
  return { ...config, modelProviderId: model.providerId, modelDisplayName: model.displayName, modelProviderName: modelCenterOf(state).service.name }
}
export function modelReferences(state: CampusState, model: RelayModel) {
  return state.agents.filter(a => !a.deletedAt && a.kind === 'expert' && !a.dutyType && [a.draft, ...a.versions.map(v => v.config)].some(c => { const selected = resolveAgentModel(state, c); return selected?.providerId === model.providerId && selected.modelId === model.modelId }))
}
/** OpenAI-compatible list contract; never infer modalities or tool support from an ID. */
export function parseRelayModels(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data) || payload.data.length > 2000) throw new Error('模型列表须为包含 data 数组的响应，最多 2000 项')
  const ids = payload.data.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id.trim() || item.id !== item.id.trim() || item.id.length > 200 || /[\u0000-\u001f\u007f]/.test(item.id)) throw new Error('模型列表包含无效的模型 ID')
    return item.id
  })
  if (new Set(ids).size !== ids.length) throw new Error('模型列表包含重复 ID')
  return ids
}
export const demoRelayResponse = { object: 'list', data: [{ id: 'deepseek-v4', object: 'model' }, { id: 'glm-5.2', object: 'model' }, { id: 'deepseek-v3', object: 'model' }] }
/** Rename demo catalog entries while preserving saved Agent configs and version digests. */
export function upgradeDemoModelNames(center: ModelCenterState) {
  for (const model of center.models) {
    const id = demoModelIds[model.modelId]
    if (model.source !== 'demo' || !id || center.models.some(m => m !== model && m.providerId === model.providerId && m.modelId === id)) continue
    model.modelId = id
    model.displayName = demoModelNames[model.displayName] ?? model.displayName
  }
}
export type ModelCenterAction =
  | { type: 'service-save'; name: string; baseUrl: string; credentialRef: string }
  | { type: 'service-status'; enabled: boolean }
  | { type: 'sync-demo'; response: unknown }
  | { type: 'model-status'; providerId: string; modelId: string; enabled: boolean }
  | { type: 'model-edit'; providerId: string; modelId: string; displayName: string; inputTypes: RelayModel['inputTypes']; supportsTools: boolean }
export function applyModelCenterAction(state: CampusState, actor: Actor, action: ModelCenterAction): string {
  if (actor.role !== 'admin') throw new Error('仅系统管理员可管理中转站和模型')
  const center = structuredClone(modelCenterOf(state)); let detail = ''
  if (action.type === 'service-save') {
    const name = action.name.trim(); const raw = action.baseUrl.trim(); const credentialRef = action.credentialRef.trim()
    if (!name || name.length > 60) throw new Error('请填写不超过 60 字的中转站名称')
    let base: URL
    try { base = new URL(raw) } catch { throw new Error('请填写有效的中转站 Base URL') }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || raw.length > 500) throw new Error('Base URL 仅支持 HTTP/HTTPS，不能包含账号、密钥、查询参数或片段')
    if (!/^[a-zA-Z][a-zA-Z0-9_.:/-]{0,99}$/.test(credentialRef) || /^(sk-|Bearer\s)/i.test(credentialRef)) throw new Error('请填写服务端凭证引用名称，例如 RELAY_API_KEY，不要输入真实密钥')
    const baseUrl = base.toString().replace(/\/+$/, '')
    if (baseUrl !== center.service.baseUrl) {
      center.service.id = crypto.randomUUID(); center.lastSyncAt = null
      center.models.forEach(model => { model.upstreamAvailable = false })
    }
    center.service = { ...center.service, name, baseUrl, credentialRef }; detail = '保存中转站配置；真实连接待服务端接入'
  } else if (action.type === 'service-status') {
    center.service.enabled = action.enabled; detail = action.enabled ? '启用中转站目录' : '停用中转站目录；关联专家不能使用此服务发布新版本'
  } else if (action.type === 'sync-demo') {
    if (!center.service.enabled) throw new Error('请先启用中转站')
    if (!center.service.baseUrl || !center.service.credentialRef) throw new Error('请先配置中转站地址和服务端凭证引用')
    const ids = parseRelayModels(action.response); const at = new Date().toISOString()
    center.models.filter(m => m.providerId === center.service.id).forEach(m => { m.upstreamAvailable = ids.includes(m.modelId) })
    for (const id of ids) {
      const existing = center.models.find(m => m.providerId === center.service.id && m.modelId === id)
      if (existing) { existing.upstreamAvailable = true; existing.syncedAt = at }
      else center.models.push({ providerId: center.service.id, modelId: id, displayName: id, enabled: false, upstreamAvailable: true, inputTypes: ['text'], supportsTools: false, source: 'demo', syncedAt: at })
    }
    center.lastSyncAt = at; detail = `演示同步 ${ids.length} 个模型；新增模型默认未启用，未请求真实 API`
  } else {
    const model = center.models.find(m => m.providerId === action.providerId && m.modelId === action.modelId)
    if (!model) throw new Error('模型不存在，请刷新后重试')
    if (action.type === 'model-status') {
      if (action.enabled && (!center.service.enabled || model.providerId !== center.service.id || !model.upstreamAvailable)) throw new Error('中转站停用或模型已下线，不能启用')
      model.enabled = action.enabled; detail = `${action.enabled ? '启用' : '停用'}模型 ${model.displayName}`
    } else {
      if (!action.displayName.trim() || action.displayName.length > 100) throw new Error('模型展示名称须为 1–100 字')
      if (!Array.isArray(action.inputTypes) || !action.inputTypes.includes('text') || action.inputTypes.some(t => !['text', 'image', 'audio'].includes(t)) || new Set(action.inputTypes).size !== action.inputTypes.length || typeof action.supportsTools !== 'boolean') throw new Error('模型能力配置无效')
      model.displayName = action.displayName.trim(); model.inputTypes = [...action.inputTypes]; model.supportsTools = action.supportsTools; detail = `更新模型 ${model.displayName} 的展示与能力配置`
    }
  }
  state.modelCenter = center; state.revision++; return detail
}
