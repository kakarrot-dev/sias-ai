import { pinAgentModel } from '../model-center'
import { expertEditingConfig, generatedKey } from './expert-form'
import { agentAvailable, expertMvpEnabled, chatExpertAvailable, multiAgentEnabled, singleAgentOnlyMessage } from './availability'
import { isCaptain, captainOwner, teamIssues, canEdit, canPublish, canSee, clone, configDigest, currentConfig, evaluationSetFor, deletionReason, hasChanges, nextVersion, people, publishIssues, releaseIssues, managedConfig, validateDraft, references, roleLabels, summaryDigest, timestamp, validateConfig, type Actor, type Agent, type CampusState, type Config, type Grant, type Kind } from './model'

export type CampusAction =
  | { type: 'expert-categories'; categories: string[] }
  | { type: 'create'; kind: Kind; dutyType?: 'captain'; config: Config; grants?: Grant[]; publish?: boolean }
  | { type: 'save'; id: string; config: Config; credentialChecked: boolean; grants?: Grant[]; usageMode?: 'public' | 'internal'; failSync?: boolean; publish?: boolean }
  | { type: 'test'; id: string; round: number; pass: boolean; reviewer: string }
  | { type: 'publish'; id: string; note: string; fail?: boolean }
  | { type: 'request'; id: string; note: string }
  | { type: 'reject'; id: string; note: string }
  | { type: 'disable'; ids: string[]; policy: 'pause' | 'finish'; note: string }
  | { type: 'rollback'; id: string; version: number; note: string }
  | { type: 'copy'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'from-version'; id: string; version: number }
  | { type: 'grants'; id: string; grants: Grant[]; usageMode?: 'public' | 'internal'; fail: boolean }
  | { type: 'sync'; id: string }
  | { type: 'usage-mode'; id: string; mode: 'public' | 'internal' }
  | { type: 'restore'; id: string; note: string }
  | { type: 'owners'; ids: string[]; owner: string }

/** Called only inside the existing browser store's rollback-on-write-failure transaction. */
export function applyCampusAction(state: CampusState, actor: Actor, action: CampusAction): string | undefined {
  const require = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
  if (expertMvpEnabled) require(actor.role === 'admin', '仅系统管理员可创建和管理专家智能体')
  if (state.userCenter && (['grants', 'sync', 'usage-mode'].includes(action.type) || (action.type === 'save' && (action.grants !== undefined || action.usageMode !== undefined)) || (action.type === 'create' && !!action.grants?.length))) throw new Error('当前 MVP 登录即可使用，不开放单独授权设置')
  const find = (id: string) => { const a = state.agents.find(a => a.id === id); require(a && canSee(actor, a), '当前身份无权查看此对象'); require(agentAvailable(a!), singleAgentOnlyMessage); if (expertMvpEnabled) require(chatExpertAvailable(a!), '当前仅开放单个普通专家'); return a! }
  const record = (a: Agent, label: string, before: unknown, basis: string, impact = '仅浏览器原型') => {
    a.updated = timestamp(); a.updatedBy = roleLabels[actor.role]
    state.audits.unshift({ id: crypto.randomUUID(), agentId: a.id, actor: roleLabels[actor.role], action: label, at: a.updated, before: summaryDigest(before), after: summaryDigest(a), basis, impact })
  }
  if (action.type === 'expert-categories') {
    require(actor.role === 'admin', '分类由平台管理员维护')
    require(action.categories.length > 0 && action.categories.length <= 20 && action.categories.every(c => c.trim() === c && c.length > 0 && c.length <= 20) && new Set(action.categories).size === action.categories.length, '分类须为 1–20 个不重复名称，每项不超过 20 字')
    require(state.agents.every(a => !a.draft.expert?.category || action.categories.includes(a.draft.expert.category)), '已被专家使用的分类不能删除')
    state.expertCategories = [...action.categories]; state.revision++; return
  }
  if (action.type === 'create') {
    require(agentAvailable(action), singleAgentOnlyMessage)
    if (expertMvpEnabled) require(chatExpertAvailable(action), '当前仅开放单个普通专家')
    require(canEdit(actor), '当前身份没有创建权限')
    require(actor.role === 'admin' || action.config.department === actor.department, '只能创建本部门智能体')
    require(action.kind !== 'assistant' || (actor.role === 'admin' && !state.agents.some(a => a.kind === 'assistant')), '每所学校只允许一个数字助理')
    const a: Agent = { id: crypto.randomUUID(), key: action.config.expert?.key, kind: action.kind, dutyType: action.dutyType, usageMode: multiAgentEnabled && action.kind === 'expert' ? 'internal' : 'public', draft: managedConfig(action.config, action.kind), versions: [], tests: [], grants: [], sync: 'synced', disabled: false, updated: timestamp(), updatedBy: roleLabels[actor.role], credentialChecked: true }
    require(!action.dutyType || action.kind === 'expert', '只有智能体可设为队长')
    if (action.kind === 'team' && action.config.team.captain.id) require(!captainOwner(state, action.config.team.captain.id), '队长已归属其他专家团')
    // New teams may save an initial identity before picking published members.
    const errors = validateDraft(state, a)
    if (!expertMvpEnabled && action.kind !== 'team' && !action.config.expert && !action.config.prompt.trim()) errors.push('请填写工作说明（提示词）')
    require(!errors.length, errors.join('；'));
    if (action.grants) { require(action.grants.every(g => g.effect === 'allow' && (g.subject === 'department' ? people.some(p => p.department === g.target) : people.some(p => p.id === g.target))), '请选择有效可见范围'); require(actor.role === 'admin' || action.grants.every(g => g.subject === 'department' && g.target === actor.department), '仅管理员可设置跨部门可见范围'); a.grants = clone(action.grants) }
    state.agents.unshift(a); record(a, '创建草稿', null, '创建权限');
    if (action.publish) applyCampusAction(state, actor, { type: 'publish', id: a.id, note: '从专家创建表单发布' })
    state.revision++; return a.id
  }
  if (action.type === 'disable' || action.type === 'owners') {
    require(action.ids.length, '请选择至少一个智能体')
    const agents = action.ids.map(find)
    if (action.type === 'owners') {
      require(agents.every(a => canEdit(actor, a)), '当前身份没有配置权限')
      require(agents.every(a => a.draft.department === agents[0].draft.department), '批量责任人变更仅限同部门')
      require(people.some(p => p.id === action.owner && p.department === agents[0].draft.department), '责任人必须属于同部门')
    } else { require(agents.every(a => a.kind !== 'assistant' && a.live), '数字助理不能停用，未发布对象请管理草稿'); require(action.note.trim(), '请填写停用原因'); require(agents.every(a => canPublish(actor, a) && !a.disabled), '当前身份无停用权限，或对象已经停用') }
    agents.forEach(a => {
      const before = clone(a)
      if (action.type === 'owners') { a.draft.owner = action.owner; a.testHistory = [...(a.testHistory ?? []), ...a.tests]; a.tests = []; record(a, '变更责任人', before, '同部门配置权限；原报告保留为历史记录') }
      else {
        a.disabled = true
        if (!expertMvpEnabled && action.policy === 'pause') state.runs.filter(r => (r.agentId === a.id || r.members.some(p => p.id === a.id) || references(state, a.id).some(t => t.id === r.agentId)) && ['排队', '运行', '等待人工', '等待依赖'].includes(r.status)).forEach(r => { r.status = '暂停'; r.result = '依赖停用，受影响步骤已暂停（演示），待处理人确认' })
        record(a, '停用', before, action.note, expertMvpEnabled ? '停止接受新的聊天请求；历史会话与用量保留' : action.policy === 'pause' ? '阻止新运行；暂停受影响步骤；通知处理人（模拟）' : '阻止新运行；低风险在途任务允许完成')
      }
    }); state.revision++; return
  }
  const a = find(action.id); const before = clone(a)
  if (['save', 'test', 'copy', 'delete', 'from-version', 'request'].includes(action.type)) require(canEdit(actor, a), '当前身份没有配置权限')
  if (['publish', 'rollback', 'reject', 'restore'].includes(action.type)) require(canPublish(actor, a), '当前身份没有独立发布权限')
  if (['grants', 'sync', 'usage-mode'].includes(action.type)) require(actor.role === 'admin', '使用授权由平台管理员独立管理')
  if (!expertMvpEnabled && ['save', 'from-version'].includes(action.type)) require(!a.pending, '请先撤回或驳回待发布申请，再编辑草稿')
  if ((action.type === 'save' || action.type === 'grants') && action.usageMode !== undefined) {
    require(actor.role === 'admin', '使用授权由平台管理员独立管理')
    require(a.kind === 'expert' && !isCaptain(a) && ['public', 'internal'].includes(action.usageMode), '仅普通专家可调整使用方式')
  }
  if (action.type === 'save') {
    require(actor.role === 'admin' || action.config.department === actor.department, '不能把配置移到其他部门')
    if (a.kind === 'team' && action.config.team.captain.id) require(!captainOwner(state, action.config.team.captain.id, a.id), '队长已归属其他专家团')
    const config = managedConfig(action.config, a.kind)
    require(!(a.key ?? a.draft.expert?.key) || config.expert?.key === (a.key ?? a.draft.expert?.key), '智能体标识创建后不可修改')
    const errors = validateDraft(state, a, config); require(!errors.length, errors.join('；'))
    if (configDigest(config) !== configDigest(a.draft)) { a.testHistory = [...(a.testHistory ?? []), ...a.tests]; a.tests = [] }
    if (action.grants) { require(actor.role === 'admin', '使用授权由平台管理员独立管理'); require(action.grants.every(g => ['allow', 'deny'].includes(g.effect) && (g.subject === 'department' ? ['信息化处', '教务处', '校办公室', '教学运行科'].includes(g.target) : g.subject === 'user' && people.some(p => p.id === g.target))), '授权对象须来自组织目录'); a.grants = clone(action.grants); a.sync = action.failSync ? 'failed' : 'synced' }
    if (action.usageMode !== undefined) a.usageMode = action.usageMode
    if (expertMvpEnabled) a.pending = undefined
    a.key ??= config.expert?.key; a.draft = config; a.rejection = undefined; a.credentialChecked = action.credentialChecked
    record(a, '保存草稿', before, '配置权限；已发布版本保持不变')
    if (action.publish) applyCampusAction(state, actor, { type: 'publish', id: a.id, note: '从专家配置表单发布' })
  } else if (action.type === 'test') {
    require(!isCaptain(a), '队长须在所属专家团中测试')
    require([1, 2, 3].includes(action.round), '测试轮次无效'); require(action.reviewer.trim(), '请指定人工复核人')
    const errors = validateConfig(state, a); require(!errors.length, errors.join('；'))
    a.testHistory = [...(a.testHistory ?? []), ...a.tests.filter(t => t.round === action.round)]
    a.tests = a.tests.filter(t => t.round !== action.round)
    a.tests.push({ id: crypto.randomUUID(), round: action.round, digest: configDigest(a.draft), passed: action.pass ? 5 : 2, total: 5, reviewer: action.reviewer, at: timestamp(), failures: action.pass ? [] : clone(evaluationSetFor(a).failures) })
    record(a, '模拟测试', before, `第 ${action.round} 轮；${action.reviewer}；${action.pass ? '全部通过' : '3 项失败'}`)
  } else if (action.type === 'request') {
    require(!a.pending, '当前草稿已有待确认申请')
    require(action.note.trim(), '请填写发布说明')
    const errors = releaseIssues(state, a); require(!errors.length, errors.join('；'))
    a.pending = { digest: configDigest(a.draft), note: action.note, actor: roleLabels[actor.role], at: timestamp() }
    record(a, '申请模拟发布', before, action.note)
  } else if (action.type === 'reject') {
    require(a.pending, '当前没有待确认的发布申请'); require(action.note.trim(), '请填写驳回意见')
    a.rejection = action.note; a.pending = undefined
    record(a, '驳回发布申请', before, action.note)
  } else if (action.type === 'publish') {
    require(action.note.trim(), '请填写发布说明')
    const errors = publishIssues(state, a, actor); require(!errors.length, errors.join('；'))
    require(!a.pending || a.pending.digest === configDigest(a.draft), '申请版本已变化，请重新核对')
    if (action.fail) {
      a.pending = { digest: configDigest(a.draft), note: action.note, actor: roleLabels[actor.role], at: timestamp(), failed: true }
      record(a, '模拟发布失败', before, action.note, '同步失败，当前发布版本保持不变；可重试'); state.revision++; return
    }
    if (a.kind === 'team' || expertMvpEnabled) a.draft = managedConfig(a.draft, a.kind)
    if (a.kind === 'team' && a.draft.team.captain.version === 0) {
      const leader = find(a.draft.team.captain.id)
      const number = nextVersion(leader)
      leader.versions.unshift({ number, config: clone(leader.draft), tests: clone(a.tests), grants: [], actor: roleLabels[actor.role], at: timestamp(), note: `随专家团「${a.draft.name}」发布`, baseId: `demo-base-${leader.id}-v${number}` })
      leader.live = number; leader.draftPending = false
      a.draft.team.captain = { id: leader.id, version: number }
      // The team report covers the same captain content, now pinned to an immutable version.
      a.tests = a.tests.map(t => ({ ...t, digest: configDigest(a.draft) }))
      record(leader, '随专家团模拟发布', null, a.id)
    }
    if (expertMvpEnabled && a.kind === 'expert') a.draft = pinAgentModel(state, a.draft)
    const number = nextVersion(a)
    a.versions.unshift({ number, config: clone(a.draft), tests: clone(a.tests), grants: clone(a.grants), actor: roleLabels[actor.role], at: timestamp(), note: action.note, baseId: `demo-base-${a.id}-v${number}` })
    a.live = number; a.draftPending = false; a.pending = undefined; a.rejection = undefined
    record(a, '模拟发布', before, action.note, expertMvpEnabled ? '后续新会话采用此版本；已停用专家仍保持停用' : '后续任务采用此版本；使用授权和停用状态独立保留')
  } else if (action.type === 'restore') {
    require(a.disabled && a.live, '仅已停用的发布对象可恢复')
    require(action.note.trim(), '请填写恢复原因')
    const c = a.versions.find(v => v.number === a.live)!.config
    const errors = validateConfig(state, a, c)
    require(!errors.length, errors.join('；'))
    a.disabled = false; record(a, '恢复可用', before, action.note, expertMvpEnabled ? '恢复接受聊天请求；历史会话与用量保留' : '仅恢复后续请求；旧任务由发起人确认继续')
  } else if (action.type === 'rollback' || action.type === 'from-version') {
    const version = a.versions.find(v => v.number === action.version); require(version, '历史发布版本不存在')
    if (action.type === 'rollback') {
      require(action.note.trim(), '请填写回退原因')
      require(!a.disabled, '已停用对象须先恢复发布')
      require(!isCaptain(a), '队长版本随专家团管理'); require(state.userCenter || a.sync === 'synced', '请核对当前权限同步状态')
      const errors = validateConfig(state, a, version!.config); require(!errors.length, errors.join('；'))
      a.live = version!.number; record(a, '回退生产版本', before, action.note, expertMvpEnabled ? '新会话使用所选版本；已有会话固定原版本；当前草稿保留' : '仅后续任务生效；运行中任务固定原版本；当前草稿保留')
    } else { a.draft = a.kind === 'team' ? managedConfig(version!.config, 'team') : currentConfig(version!.config); if (a.key) { a.draft = expertEditingConfig(a.draft, state, a.id); a.draft.expert = { ...a.draft.expert!, key: a.key, keyManual: true } }; a.draftPending = true; a.testHistory = [...(a.testHistory ?? []), ...a.tests]; a.tests = []; record(a, '基于历史版本创建草稿', before, `来源 v${version!.number}；旧报告仅供历史参考`) }
  } else if (action.type === 'copy') {
    require(a.kind !== 'assistant', '全校唯一数字助理不可复制')
    const copied = clone(a); copied.draft = a.kind === 'team' ? managedConfig(copied.draft, 'team') : currentConfig(copied.draft); copied.id = crypto.randomUUID(); copied.draft.name = action.name.trim(); if (copied.draft.expert) { copied.draft.expert.key = generatedKey(copied.draft.name, state); copied.draft.expert.demoToken = ''; copied.key = copied.draft.expert.key };  if (copied.kind === 'team') copied.draft.team.captain = { id: '', version: 0 }; copied.deletedAt = undefined; copied.usageMode = multiAgentEnabled && copied.kind === 'expert' ? 'internal' : 'public'; copied.versions = []; copied.tests = []; copied.grants = []; copied.live = undefined; copied.disabled = false; copied.credentialChecked = false; copied.sync = 'synced'; copied.pending = undefined; copied.rejection = undefined; copied.testHistory = []
    if (copied.draft.expert) { const errors = validateDraft(state, copied); require(!errors.length, errors.join('；')) }
    require(copied.draft.name.length >= 2, '副本名称至少两字'); require(!state.agents.some(other => other.draft.department === copied.draft.department && other.draft.name === copied.draft.name), '名称在所属部门内必须唯一')
    state.agents.unshift(copied); record(copied, '复制草稿', null, `复制自 ${a.draft.name}；不复制版本、授权、测试、业务记录；凭证引用待核对`); state.revision++; return copied.id
  } else if (action.type === 'delete') {
    require(!deletionReason(state, a), deletionReason(state, a)); record(a, '删除无引用草稿', before, '无发布、运行或引用记录'); a.deletedAt = timestamp()
  } else if (action.type === 'grants') {
    require(action.grants.every(g => g.subject === 'department' ? ['信息化处', '教务处', '校办公室', '教学运行科'].includes(g.target) : people.some(p => p.id === g.target)), '授权对象须来自组织目录')
    require(!isCaptain(a), '队长不配置独立使用授权')
    if (action.usageMode !== undefined) a.usageMode = action.usageMode
    a.grants = clone(action.grants); a.sync = action.fail ? 'failed' : 'synced'; record(a, '变更使用授权', before, '使用方式与范围一起保存；允许合并、明确禁止优先', action.fail ? '模拟同步失败，禁止新请求；可重试' : '模拟已生效；后续请求使用当前授权')
  } else if (action.type === 'usage-mode') {
    require(a.kind === 'expert' && !isCaptain(a), '仅普通专家可调整使用方式')
    a.usageMode = action.mode; record(a, '变更使用方式', before, action.mode, '立即影响新请求与旧会话后续请求；专家团内部授权独立')
  } else if (action.type === 'sync') { a.sync = 'synced'; record(a, '重试授权同步', before, '模拟同步成功') }
  state.revision++
}
