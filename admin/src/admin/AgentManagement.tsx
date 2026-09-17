import { useRef, useState } from 'react'
import { Button, Empty, Facts, Field, Modal, Notice, Section, Tag } from './components'
import { agentAsset, agentReferences, deleteAgentReason, fieldsSchema } from './agent-management'
import { prototypeStore } from './prototype-store'
import { activeVersion, purposeLabels, type AdminState, type AgentConfig, type Entity } from './shared'
import { experienceOf, channelLabels, knowledgeExamples } from './agent-experience'
import { effectivePrompt, formatLabels } from './guided-config'
import './AgentManagement.css'

type AgentEntity = Entity<AgentConfig>
interface ActionsProps { entity: AgentEntity; data: AdminState; reload: () => Promise<void>; navigate: (path: string) => void; notify: (message: string) => void; disabled?: boolean; detail?: boolean }
export function AgentActions({ entity, data, reload, navigate, notify, disabled, detail }: ActionsProps) {
  const [mode, setMode] = useState('')
  const [name, setName] = useState('')
  const [source, setSource] = useState<'draft' | 'published'>('draft')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const completed = useRef<{ target?: string; message: string } | undefined>(undefined)
  const asset = agentAsset(entity)
  const reason = deleteAgentReason(entity, data)
  const refs = agentReferences(data, entity.id)
  const open = (next: string) => { setMode(next); setError(''); if (next === 'copy') { setName(`${asset.name.slice(0, 55)} 副本`); setSource('draft') } }
  const run = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (!completed.current) {
        const store = prototypeStore()
        if (mode === 'copy') { const copy = store.duplicate(entity.id, entity.revision, name, source); completed.current = { target: `/agents/${copy.id}/edit`, message: '已复制为独立草稿，请核对配置后发布' } }
        if (mode === 'archive') { store.archive(entity.id, entity.revision, asset.status !== 'archived'); completed.current = { message: asset.status === 'archived' ? '已取消归档' : '已归档，历史版本与引用保留' } }
        if (mode === 'delete') { store.delete(entity.id, entity.revision); completed.current = { target: detail ? '/agents' : undefined, message: '草稿已移入回收站，可随时恢复' } }
        if (mode === 'restore') { store.restore(entity.id, entity.revision); completed.current = { target: `/agents/${entity.id}`, message: '草稿已恢复' } }
        if (mode === 'offline' || mode === 'online') { store.toggle(entity.id, entity.revision, mode === 'offline'); completed.current = { message: mode === 'offline' ? '已下线，草稿和发布版本保留' : '已重新上线当前发布版本' } }
        if (mode === 'enable') { store.toggle(entity.id, entity.revision, false); completed.current = { message: '已恢复旧配置的目录访问' } }
      }
      await reload()
      if (completed.current) { notify(completed.current.message); if (completed.current.target) navigate(completed.current.target) }
      completed.current = undefined; setMode('')
    } catch (e) { setError(completed.current ? '操作已保存，刷新列表失败。请重试读取，不会重复执行。' : e instanceof Error ? e.message : '操作失败，当前数据已保留') }
    finally { pending.current = false; setBusy(false) }
  }
  return <><Button variant="ghost" disabled={disabled} aria-label={`管理 ${asset.name}`} onClick={() => open(entity.deletedAt ? 'restore' : 'menu')}>{entity.deletedAt ? '恢复' : '更多'}</Button>{mode && <Modal title={mode === 'menu' ? `管理 ${asset.name}` : mode === 'copy' ? '复制智能体' : mode === 'offline' ? '下线智能体' : mode === 'online' ? '重新上线' : mode === 'archive' ? (asset.status === 'archived' ? '取消归档' : '归档智能体') : mode === 'delete' ? '删除草稿' : mode === 'enable' ? '恢复目录访问' : '恢复草稿'} onClose={() => { if (!busy && !completed.current) setMode('') }}>
    {mode === 'menu' ? <div className="agent-action-choices"><Button onClick={() => open('copy')}>复制为新草稿</Button><p>选择已保存草稿或当前发布版本，生成新的 Agent 标识。</p><Button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'agent', asset, config: entity.draft }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `${asset.name}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMode(''); notify('已导出智能体配置') }}>导出配置</Button><p>导出已保存的草稿，可重新导入为独立智能体。</p>{entity.activeVersionId && asset.status === 'active' && <><Button onClick={() => open(entity.disabled ? 'online' : 'offline')}>{entity.disabled ? '重新上线' : '下线智能体'}</Button><p>下线后暂停提供，已发布版本和草稿保留。</p></>}<Button onClick={() => open('archive')}>{asset.status === 'archived' ? '取消归档' : '归档智能体'}</Button><p>归档后不再出现在常用目录和新的成员选择中，历史引用继续保留。</p>{entity.disabled && !entity.activeVersionId && asset.status === 'active' && <Button onClick={() => open('enable')}>恢复旧配置的目录访问</Button>}<Button variant="danger" disabled={!!reason} onClick={() => open('delete')}>删除草稿</Button><p>{reason || '移入回收站，可恢复。只允许删除无发布历史且未被引用的草稿。'}</p></div> : <>
      {mode === 'copy' && <><Field label="副本展示名称" required><input autoFocus aria-label="副本展示名称" value={name} maxLength={60} onChange={e => setName(e.target.value)} /></Field><Field label="复制来源"><select aria-label="复制来源" value={source} onChange={e => setSource(e.target.value as 'draft' | 'published')}><option value="draft">已保存的行为草稿</option><option value="published" disabled={!activeVersion(entity)}>当前发布版本{activeVersion(entity) ? ` v${activeVersion(entity)!.number}` : '（暂无）'}</option></select></Field><Notice>副本保留运行名称与指令；不继承发布历史和被引用关系；渠道需重新选择，使用范围重置为仅自己。</Notice></>}
      {mode === 'archive' && <><p className="body-copy">{asset.status === 'archived' ? `将“${asset.name}”放回常用目录。` : `将“${asset.name}”归档。已有发布快照和历史记录保留，这不会停止部署或取消运行。`}</p><p className="muted">当前被 {refs.length} 个专家组引用。{asset.status === 'archived' ? '取消归档后可重新参与新的配置选择。' : '归档后新的专家组发布将提示更换此成员。'}</p></>}
      {(mode === 'offline' || mode === 'online') && <><p className="body-copy">{mode === 'offline' ? `下线“${asset.name}”后，原型目录将暂停提供当前发布版本。配置和历史记录都会保留。` : `重新提供“${asset.name}”的当前发布版本，未发布的草稿修改仍不会生效。`}</p>{!!refs.length && <Notice tone="warning">被 {refs.length} 个专家组引用。下线后，相关专家组会显示成员不可用。</Notice>}<p className="muted">此操作仅演示上下线，不连接真实渠道。</p></>}
      {mode === 'delete' && <Notice tone="warning">将“{asset.name}”移入回收站。可恢复原标识、全部配置与操作记录。</Notice>}
      {mode === 'restore' && <p className="body-copy">恢复“{asset.name}”及其原始标识，保持原资产状态，不自动发布。</p>}
      {mode === 'enable' && <p className="body-copy">恢复旧版“停用配置”操作关闭的目录访问。此操作不启用真实部署。</p>}
    </>}
    {error && <Notice tone="error">{error}</Notice>}
    <footer><Button disabled={busy || !!completed.current} onClick={() => setMode('')}>取消</Button>{mode !== 'menu' && <Button variant={mode === 'delete' ? 'danger' : 'primary'} disabled={busy || (mode === 'copy' && name.trim().length < 2)} onClick={() => void run()}>{busy ? '处理中…' : completed.current ? '重试读取' : mode === 'copy' ? '确认复制' : mode === 'archive' ? (asset.status === 'archived' ? '确认取消归档' : '确认归档') : mode === 'delete' ? '移入回收站' : mode === 'offline' ? '确认下线' : mode === 'online' ? '确认上线' : '确认恢复'}</Button>}</footer>
  </Modal>}</>
}

export function AgentReferences({ entity, data }: { entity: AgentEntity; data: AdminState }) {
  const refs = agentReferences(data, entity.id)
  return <Section title="被引用关系" description="仅供查看保留的草稿引用和发布快照；业务中心已移除。">{refs.length ? refs.map(({ group, draft, versions }) => <article className="agent-reference" key={group.id}><div><strong>{group.draft.name}</strong>{draft && <p>历史草稿引用</p>}{versions.map(v => <p key={v.id}>专家组 v{v.number}{v.id === group.activeVersionId ? '（当前发布）' : '（历史）'} · 锁定 Agent {v.pins.filter(p => p.agentId === entity.id).map(p => entity.versions.find(av => av.id === p.versionId)?.number ? `v${entity.versions.find(av => av.id === p.versionId)!.number}` : p.versionId).join('、')}</p>)}</div></article>) : <Empty title="暂无专家组引用" description="没有保留的历史专家组引用。" />}</Section>
}

export function AgentConfigSummary({ config: c, data, frozen }: { config: AgentConfig; data: AdminState; frozen?: boolean }) {
  return <><Facts items={[["运行名称", c.name], ['使用方式', purposeLabels[c.purpose]], ['工作目标 / 能力说明', c.description], ['模型引用', c.modelId], ['所需资料', c.setup?.inputDescription || '按指令提供'], ['缺失输入', !c.contract && !c.setup ? '按旧指令约定，未单独配置' : c.contract?.missingInputPolicy === 'reject' ? '停止并返回缺失项' : '请求补充；入口不支持时返回缺失项'], ['输出格式', c.setup ? formatLabels[c.setup.outputFormat] : '按旧指令约定，未单独配置'], ['交付与验收', c.output], ['执行上限', `${c.maxSteps} 步 / ${c.timeoutSeconds} 秒（配置要求）`], ['确认规则', !c.setup ? '未声明（旧配置）' : c.setup.approval === 'external' ? '结果直接展示；对外操作必须确认' : '交付前确认；对外操作单独确认'], ['历史依赖', !c.contract ? '未声明' : ({ optional: '可选', required: '必需', forbidden: '禁止' })[c.contract?.historyRequirement ?? 'optional']], ['上下文读取', c.memoryScopes.map(v => ({ task: '本次任务', employee: '此 Agent', global: '工作区共享' })[v]).join('、') || '无']]} />{c.experience && <Facts items={[["开场白", c.experience.opening || '使用默认开场白'], ['推荐问题', c.experience.questions.filter(Boolean).join('；') || '未设置'], ['知识库', c.experience.knowledgeIds.map(id => knowledgeExamples.find(k => k.id === id)?.name ?? id).join('、') || '未关联'], ['回答风格', ({ precise: '严谨准确', balanced: '均衡通用', creative: '灵活创意' })[c.experience.responseStyle]], ['使用范围', ({ private: '仅自己', workspace: '整个工作区', specified: c.experience.audience })[c.experience.visibility]], ['发布渠道', experienceOf(c).channelIds.map(id => channelLabels[id]).join('、') || '尚未选择']]} />}{(['inputFields', 'outputFields', 'followUpFields'] as const).map(key => !!c.contract?.[key]?.length && <details className="prompt-disclosure" key={key}><summary>{key === 'inputFields' ? '输入' : key === 'followUpFields' ? '补充' : '输出'}结构 · {c.contract[key]!.length} 个字段</summary><pre className="prompt-display">{JSON.stringify(fieldsSchema(c.contract[key]!), null, 2)}</pre></details>)}<div className="tag-list">{c.capabilityVersionIds.length ? c.capabilityVersionIds.map(id => <Tag key={id}>{data.capabilities.find(cap => cap.id === id)?.name ?? id}</Tag>) : <span className="muted">未绑定能力包</span>}</div><details className="prompt-disclosure"><summary>最终工作指令</summary><pre className="prompt-display">{frozen ? c.systemPrompt : effectivePrompt(c)}</pre></details></>
}
