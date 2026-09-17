import { useId, useState } from 'react'
import { Button, Empty, Facts, Modal, Notice, PageHeader, SearchField, Tag, formatTime } from './components'
import { departments, models, roleLabels, type Actor, type CampusState } from './campus/model'
import { chatCalls, groupUsage, managementAudits, replyLabels, summarizeUsage, usageDimensions, visibleChatSessions, type ChatCall, type ChatSession, type ManagementAudit, type UsageDimension } from './chat-records'
import type { AdminState, AuditRecord } from './shared'
import { CallAttribution, ModelCallsPanel } from './ModelCallsPanel'
import { GatewayUsagePanel } from './ModelAccessPanels'
import { callAccessSnapshots, callCostSummary, callModels, sourceLabels } from './model-access'
import type { ConsumerUser } from './user-center-model'
import './run-center.css'

const number = (value: number | null) => value === null ? '待补报' : value.toLocaleString('zh-CN')
const modelName = (id: string) => models.find(m => m.id === id)?.name ?? id
const fullTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
const callsFor = (sessions: ChatSession[]) => chatCalls.filter(c => sessions.some(s => s.id === c.sessionId))
function readActor(): Actor {
  try {
    const actor = JSON.parse(sessionStorage.getItem('campus-demo-actor') ?? 'null') as Actor | null
    if (actor && Object.hasOwn(roleLabels, actor.role) && departments.includes(actor.department)) return actor
  } catch { /* Use the same local administrator default as the Agent center. */ }
  return { role: 'admin', department: '信息化处' }
}
export function RunCenter({ data, route = '/runs', navigate }: { data: AdminState; route?: string; navigate?: (path: string) => void }) {
  const params = new URLSearchParams(route.split('?')[1]); const userId = params.get('user') ?? undefined
  if (userId && !data.campus?.userCenter?.users.some(u => u.id === userId)) return <Empty title="用户不存在" description="请从用户中心选择已有用户。" action={<Button onClick={() => navigate?.('/users')}>返回用户中心</Button>} />
  return <><PageHeader title="运行中心" description="追溯会话与模型调用，区分平台及个人 Key 的来源、用量和费用。" />{data.campus ? <ChatRecords state={data.campus} actor={readActor()} legacyAudits={data.audits} userId={userId} initialTab={['usage', 'calls', ...(!userId ? ['audit'] : [])].includes(params.get('view') ?? '') ? params.get('view')! : 'sessions'} onClearUser={() => navigate?.('/runs')} /> : <Empty title="记录暂不可用" description="请刷新原型数据后重试。" />}</>
}
export function ChatRecords({ state, actor, agentId, userId, initialTab = 'sessions', onClearUser, legacyAudits = [] }: { state: CampusState; actor: Actor; agentId?: string; userId?: string; initialTab?: string; onClearUser?: () => void; legacyAudits?: AuditRecord[] }) {
  const [tab, setTab] = useState(initialTab); const tabId = useId()
  const sessions = visibleChatSessions(state, actor, agentId).filter(s => !userId || s.user === userId)
  const usage = summarizeUsage(callsFor(sessions))
  return <div className="chat-records">
    <div className="record-context"><span>查看范围：{roleLabels[actor.role]} · {['admin', 'auditor'].includes(actor.role) ? '会话与用量可见' : '会话与用量无查看权限'}</span><span>会话与用量为固定示例 · 2026/09/17</span></div>
    {userId && <Notice>当前用户：{state.userCenter?.users.find(u => u.id === userId)?.displayName ?? userId} · {userId}{onClearUser && <Button onClick={onClearUser}>查看全部用户记录</Button>}</Notice>}
    <div className="record-metrics" aria-label="当前范围统计">
      <div><span>会话数</span><strong>{sessions.length}<small>个</small></strong></div>
      <div><span>使用用户</span><strong>{new Set(sessions.map(s => s.user)).size}<small>人</small></strong></div>
      <div><span>已上报 Token</span><strong>{usage.count ? number(usage.total) : '—'}</strong><small>{!usage.count ? '暂无模型调用' : usage.pending ? '部分用量待补报' : '已汇总输入与输出'}</small></div>
      <div><span>待补报调用</span><strong>{usage.pending}<small>次</small></strong><small>共 {usage.count} 次模型调用</small></div>
    </div>
    <div className="editor-tabs" role="tablist" aria-label="记录类型">{[['sessions', '会话记录'], ['calls', '模型调用'], ['usage', '用量统计'], ...(!userId ? [['audit', '管理审计']] : [])].map(([id, label]) => <button key={id} id={`${tabId}-${id}`} role="tab" aria-selected={tab === id} aria-controls={`${tabId}-panel`} onClick={() => setTab(id)}>{label}</button>)}</div>
    <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`}>
      {tab === 'sessions' && <SessionPanel sessions={sessions} scoped={!!agentId} />}
      {tab === 'calls' && <ModelCallsPanel sessions={sessions} />}
      {tab === 'usage' && <UsagePanel sessions={sessions} scoped={!!agentId} userId={userId} users={['admin', 'auditor'].includes(actor.role) ? (state.userCenter?.users ?? []).filter(u => !userId || u.id === userId) : []} />}
      {tab === 'audit' && <AuditPanel rows={managementAudits(state, actor, agentId, legacyAudits)} />}
    </div>
  </div>
}

function AgentFilter({ sessions, value, onChange }: { sessions: ChatSession[]; value: string; onChange: (value: string) => void }) {
  return <select aria-label="筛选智能体" value={value} onChange={e => onChange(e.target.value)}><option value="">全部智能体</option>{[...new Map(sessions.map(s => [s.agentId, s.agentName]))].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
}
function matches(session: ChatSession, query: string, agent: string) {
  return (!agent || session.agentId === agent) && `${session.id} ${session.agentName} ${session.userName} ${session.user}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}
function ReplyBadge({ status }: { status: ChatSession['status'] }) { return <span className={`record-status record-status--${status}`}><i />{replyLabels[status]}</span> }
function MissingRecords({ filtered, reset }: { filtered: boolean; reset: () => void }) {
  return <Empty title={filtered ? '没有匹配的记录' : '暂无会话记录'} description={filtered ? '调整搜索词或筛选条件后重试。' : '当前范围没有会话示例；配置和调试操作不计入用户会话。'} action={filtered ? <Button onClick={reset}>清除筛选</Button> : undefined} />
}
function SessionPanel({ sessions, scoped }: { sessions: ChatSession[]; scoped: boolean }) {
  const [query, setQuery] = useState(''); const [agent, setAgent] = useState(''); const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<ChatSession>()
  const rows = sessions.filter(s => matches(s, query, agent) && (!status || s.status === status))
  return <>
    <p className="record-note">每行一条会话，按最近活动排序。回复状态仅表示最近一次回复，详情不展示聊天正文。</p>
    <div className="catalog-panel"><div className="table-toolbar record-toolbar"><SearchField label="搜索会话" placeholder="搜索会话编号、用户或智能体" value={query} onChange={setQuery} /><div className="filters">{!scoped && <AgentFilter sessions={sessions} value={agent} onChange={setAgent} />}<select aria-label="筛选回复状态" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部回复状态</option>{Object.entries(replyLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div><span className="muted">{rows.length} 条会话</span></div>
      {rows.length ? <div className="table-scroll"><table className="data-table record-table"><thead><tr><th>会话编号 / 用户</th><th>智能体 / 版本</th><th>对话轮次</th><th>最近回复</th><th>已上报 Token</th><th>最近活动</th><th>操作</th></tr></thead><tbody>{rows.map(s => {
        const usage = summarizeUsage(callsFor([s]))
        return <tr key={s.id}><td><button className="entity-name" onClick={() => setSelected(s)}>{s.id}</button><small>{s.userName} · {s.user}</small></td><td>{s.agentName}<small>v{s.version}</small></td><td>{s.rounds} 轮</td><td><ReplyBadge status={s.status} /></td><td>{number(usage.total)}<small>{usage.pending ? `${usage.pending} 次调用待补报` : '上报完整'}</small></td><td className="time-cell">{formatTime(s.updatedAt)}</td><td><Button variant="ghost" aria-label={`查看会话 ${s.id}`} onClick={() => setSelected(s)}>详情</Button></td></tr>
      })}</tbody></table></div> : <MissingRecords filtered={!!(query || agent || status)} reset={() => { setQuery(''); setAgent(''); setStatus('') }} />}
    </div>
    {selected && <SessionDetail session={selected} onClose={() => setSelected(undefined)} />}
  </>
}
function UsageFacts({ calls }: { calls: ChatCall[] }) {
  const usage = summarizeUsage(calls)
  const costs = callCostSummary(calls)
  return <Facts items={[["输入 Token（已上报）", number(usage.input)], ['输出 Token（已上报）', number(usage.output)], ['Token 合计（已上报）', number(usage.total)], ['上报状态', usage.pending ? `${usage.pending} / ${usage.count} 次调用待补报` : `${usage.count} 次调用均已上报`], ['费用（已上报）', costs.cost], ['实际费用（已上报）', costs.actualCost], ['费用完整性', costs.pending ? `${costs.pending} 次费用未完整上报，合计仅含已上报部分` : '费用已上报']]} />
}
function CallList({ calls, sessions }: { calls: ChatCall[]; sessions: ChatSession[] }) {
  return <div className="record-calls">{[...calls].sort((a, b) => b.at.localeCompare(a.at)).map(c => {
    const s = sessions.find(s => s.id === c.sessionId)!
    return <article key={c.id}><div className="record-call-heading"><strong>{c.id}</strong><ReplyBadge status={c.status} /></div><p>{s.userName} · {s.agentName} v{s.version} · {callAccessSnapshots[c.id]?.model ?? modelName(s.model)} · {callAccessSnapshots[c.id] ? sourceLabels[callAccessSnapshots[c.id].source] : '来源待补报'} · {callAccessSnapshots[c.id]?.masked ?? '—'}<br />{s.id} · {formatTime(c.at)}</p><dl><div><dt>输入 Token</dt><dd>{number(c.inputTokens)}</dd></div><div><dt>输出 Token</dt><dd>{number(c.outputTokens)}</dd></div><div><dt>响应耗时</dt><dd>{c.durationMs === null ? '尚未结束' : `${(c.durationMs / 1000).toLocaleString('zh-CN')} 秒`}</dd></div></dl>{c.error && <p className="record-error">{c.error}</p>}</article>
  })}</div>
}
function SessionDetail({ session: s, onClose }: { session: ChatSession; onClose: () => void }) {
  const calls = callsFor([s]); const latest = [...calls].sort((a, b) => b.at.localeCompare(a.at))[0]
  return <Modal title="会话详情" onClose={onClose}>
    <div className="record-detail-heading"><div><strong>{s.id}</strong><p>{s.userName} 与 {s.agentName} 的会话</p></div><ReplyBadge status={s.status} /></div>
    {latest?.error && <Notice tone="error">{latest.error} 已上报的用量仍计入统计。</Notice>}
    {s.status === 'generating' && <Notice>示例中的最近一条回复仍在生成，用量尚未上报。</Notice>}
    {s.status === 'stopped' && <Notice>用户已停止最近一次回复，停止前已上报的用量仍计入统计。</Notice>}
    <h3 className="record-section-title">会话信息</h3><Facts items={[["用户", `${s.userName}（${s.user}）`], ['智能体', s.agentName], ['会话使用版本', `v${s.version}`], ['模型', callModels([s], chatCalls).join('、') || modelName(s.model)], ['来源', '用户前台 · Web'], ['开始时间', fullTime(s.startedAt)], ['最近活动', fullTime(s.updatedAt)], ['对话轮次', `${s.rounds} 轮`], ['模型调用', `${calls.length} 次`], ['调用来源', [...new Set(calls.map(c => callAccessSnapshots[c.id] ? sourceLabels[callAccessSnapshots[c.id].source] : '来源待补报'))].join('、')]]} />
    <h3 className="record-section-title">会话用量</h3><UsageFacts calls={calls} /><p className="record-note">轮次按用户发送次数统计。Token 来自模型调用上报，包含上下文；缺报不按 0 计。</p>
    <details className="record-call-details"><summary>查看 {calls.length} 次调用明细</summary><CallList calls={calls} sessions={[s]} /></details>{latest && <details className="record-call-details"><summary>最近调用的 Key 与费用</summary><CallAttribution call={latest} /></details>}
    <p className="record-note">此处仅展示会话元信息与用量，不提供聊天正文查看入口。以上为固定示例。</p>
    <footer><Button onClick={onClose}>关闭详情</Button></footer>
  </Modal>
}
type UsageGroup = ReturnType<typeof groupUsage>[number]
function groupName(group: UsageGroup, dimension: UsageDimension) {
  if (dimension === 'agentId') return group.sessions[0].agentName
  if (dimension === 'user') return group.sessions[0].userName
  if (dimension === 'model') return modelName(group.key)
  if (dimension === 'source') return sourceLabels[group.key as keyof typeof sourceLabels] ?? group.key
  return group.key
}
function UsagePanel({ sessions, scoped, users, userId }: { sessions: ChatSession[]; scoped: boolean; users: ConsumerUser[]; userId?: string }) {
  const [scope, setScope] = useState('local'); const [source, setSource] = useState('')
  const [query, setQuery] = useState(''); const [agent, setAgent] = useState(''); const [dimension, setDimension] = useState<UsageDimension>('agentId')
  const [selected, setSelected] = useState<UsageGroup>()
  const rows = sessions.filter(s => matches(s, query, agent))
  const groups = groupUsage(rows, chatCalls.filter(call => !source || callAccessSnapshots[call.id]?.source === source), dimension)
  return <>
    {!scoped && <div className="usage-scope-switch" role="group" aria-label="用量统计范围"><Button aria-pressed={scope === 'local'} variant={scope === 'local' ? 'primary' : 'default'} onClick={() => setScope('local')}>本平台调用</Button><Button aria-pressed={scope === 'gateway'} variant={scope === 'gateway' ? 'primary' : 'default'} onClick={() => setScope('gateway')}>Key 上游统计</Button></div>}
    {scope === 'gateway' && !scoped ? <GatewayUsagePanel users={users} userId={userId} /> : <>
    <p className="record-note">仅汇总本平台记录的模型调用；不代表全账号或 Key 在其他应用的消费。失败、停止与重试均按实际调用计入，缺报单独标记。</p>
    <div className="catalog-panel"><div className="table-toolbar record-toolbar"><SearchField label="搜索用量记录" placeholder="搜索会话编号、用户或智能体" value={query} onChange={setQuery} /><div className="filters">{!scoped && <AgentFilter sessions={sessions} value={agent} onChange={setAgent} />}<select aria-label="用量来源筛选" value={source} onChange={e => setSource(e.target.value)}><option value="">全部调用来源</option>{Object.entries(sourceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label="用量汇总维度" value={dimension} onChange={e => setDimension(e.target.value as UsageDimension)}>{Object.entries(usageDimensions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div><span className="muted">{groups.length} 个汇总对象</span></div>
      {groups.length ? <div className="table-scroll"><table className="data-table record-table"><thead><tr><th>汇总对象</th><th>会话 / 调用数</th><th>输入 Token</th><th>输出 Token</th><th>已上报合计</th><th>费用 / 实际费用</th><th>待补报调用</th><th>操作</th></tr></thead><tbody>{groups.map(g => <tr key={g.key}><td><button className="entity-name" onClick={() => setSelected(g)}>{groupName(g, dimension)}</button></td><td>{g.sessions.length} 个 / {g.count} 次</td><td>{number(g.input)}</td><td>{number(g.output)}</td><td>{number(g.total)}</td><td>{callCostSummary(g.calls).cost}<small>{callCostSummary(g.calls).actualCost} · 实际费用</small>{callCostSummary(g.calls).pending > 0 && <small>部分费用未上报</small>}</td><td>{g.pending ? <Tag>{g.pending} 次待补报</Tag> : '无'}</td><td><Button variant="ghost" aria-label={`查看用量 ${groupName(g, dimension)}`} onClick={() => setSelected(g)}>详情</Button></td></tr>)}</tbody></table></div> : <MissingRecords filtered={!!(query || agent || source)} reset={() => { setQuery(''); setAgent(''); setSource('') }} />}
    </div>
    {selected && <Modal title="用量详情" onClose={() => setSelected(undefined)}><div className="record-detail-heading"><div><strong>{groupName(selected, dimension)}</strong><p>{usageDimensions[dimension]} · {selected.sessions.length} 个会话 · {selected.count} 次模型调用</p></div><Tag>示例用量</Tag></div><UsageFacts calls={selected.calls} />{selected.pending > 0 && <Notice tone="warning">{selected.pending} 次调用尚未完整上报。当前合计仅包含已上报部分，不代表最终用量。</Notice>}<h3 className="record-section-title">调用明细</h3><p className="record-note">每次调用只统计一次，失败或停止不代表零消耗。</p><CallList calls={selected.calls} sessions={selected.sessions} /><footer><Button onClick={() => setSelected(undefined)}>关闭详情</Button></footer></Modal>}
    </>}
  </>
}
function AuditPanel({ rows }: { rows: ManagementAudit[] }) {
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<ManagementAudit>()
  const filtered = rows.filter(a => `${a.id} ${a.objectName} ${a.action} ${a.actor} ${a.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <><p className="record-note">记录专家配置、发布和账号启停操作；历史记录保留追溯。</p><div className="catalog-panel"><div className="table-toolbar record-toolbar"><SearchField label="搜索管理审计" placeholder="搜索对象、操作、操作人或变更说明" value={query} onChange={setQuery} /><span className="muted">{filtered.length} 条记录</span></div>{filtered.length ? <div className="table-scroll"><table className="data-table record-table"><thead><tr><th>操作</th><th>对象</th><th>变更说明</th><th>操作人</th><th>时间</th><th>详情</th></tr></thead><tbody>{filtered.map(a => <tr key={`${a.source}:${a.id}`}><td><Tag>{a.action}</Tag></td><td>{a.objectName}<small>{a.source}</small></td><td><p title={a.detail}>{a.detail || '未记录'}</p></td><td>{a.actor}</td><td className="time-cell">{formatTime(a.at)}</td><td><Button variant="ghost" aria-label={`查看审计 ${a.action} ${a.objectName}`} onClick={() => setSelected(a)}>详情</Button></td></tr>)}</tbody></table></div> : <Empty title={query ? '没有匹配的管理操作' : '暂无管理操作'} description={query ? '尝试其他搜索词。' : '保存专家、发布或调整用户状态后，记录会显示在这里。'} action={query ? <Button onClick={() => setQuery('')}>清除筛选</Button> : undefined} />}</div>
    {selected && <Modal title="管理审计详情" onClose={() => setSelected(undefined)}><div className="record-detail-heading"><div><strong>{selected.action}</strong><p>{selected.objectName}</p></div><Tag>{selected.source}</Tag></div><Facts items={[["记录编号", selected.id], ['对象编号', selected.objectId], ['操作人', selected.actor], ['操作时间', fullTime(selected.at)]]} /><h3 className="record-section-title">变更说明 / 操作依据</h3><p className="body-copy">{selected.detail || '未记录'}</p>{selected.impact && <><h3 className="record-section-title">影响范围</h3><p className="body-copy">{selected.impact}</p></>}{selected.before !== undefined && <><h3 className="record-section-title">{selected.source === '用户中心' ? '权限或状态变更' : '配置指纹'}</h3><Facts items={[["变更前", selected.before || '未记录'], ['变更后', selected.after || '未记录']]} />{selected.source !== '用户中心' && <p className="record-note">指纹用于核对配置是否变化；当前记录不包含逐字段差异。</p>}</>}<p className="record-note">当前为浏览器内的原型操作记录，初始历史数据为示例。</p><footer><Button onClick={() => setSelected(undefined)}>关闭详情</Button></footer></Modal>}
  </>
}
