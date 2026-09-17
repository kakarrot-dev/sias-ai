import { useRef, useState } from 'react'
import { Button, Empty, Facts, Field, Modal, Notice, PageHeader, SearchField, formatTime } from './components'
import { prototypeStore } from './prototype-store'
import { roleLabels, type Actor, type CampusState } from './campus/model'
import { userAccessDecision, type ConsumerUser, type UserCenterAction, type UserCenterState } from './user-center-model'
import { chatCalls, summarizeUsage, visibleChatSessions } from './chat-records'
import type { AdminState } from './shared'
import { accessFor, accessLabels, selectedSource, sourceLabels } from './model-access'
import { UserModelAccess } from './ModelAccessPanels'
import './user-center.css'

type ModalState = { kind: 'user' | 'status'; id: string }
const timestamp = (value: string | null) => value ? formatTime(value) : '尚未登录'
const statusText = (user: ConsumerUser) => user.status === 'active' ? '正常' : '已停用'
const tokens = (value: number | null) => value === null ? '待补报' : value.toLocaleString('zh-CN')
function currentActor(): Actor {
  try { const value = JSON.parse(sessionStorage.getItem('campus-demo-actor') ?? 'null'); if (value && Object.hasOwn(roleLabels, value.role)) return value } catch { /* Local prototype only. */ }
  return { role: 'admin', department: '信息化处' }
}
function AccountStatus({ user }: { user: ConsumerUser }) { return <span className={`badge ${user.status === 'active' ? 'badge--published' : 'badge--disabled'}`}><i />{statusText(user)}</span> }

export function UserCenter({ data, route, reload, navigate, notify }: { data: AdminState; route: string; reload: () => Promise<void>; navigate: (path: string) => void; notify: (message: string) => void }) {
  const state = data.campus; const center = state?.userCenter
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('')
  const [source, setSource] = useState(''); const [connection, setConnection] = useState('')
  const [detailTab, setDetailTab] = useState('profile')
  const [modal, setModal] = useState<ModalState | undefined>(() => { const user = new URLSearchParams(route.split('?')[1]).get('user'); return user ? { kind: 'user', id: user } : undefined })
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [refreshNeeded, setRefreshNeeded] = useState(false); const lock = useRef(false)
  const actor = currentActor(); const canManage = actor.role === 'admin'; const blocked = busy || refreshNeeded
  if (!state || !center) return <Empty title="用户数据暂不可用" description="请刷新原型数据后重试。" />
  const commit = async (action: UserCenterAction) => {
    if (lock.current || refreshNeeded) return
    lock.current = true; setBusy(true); setError(''); let saved = false
    try {
      prototypeStore().userCenterAction(center.revision, actor, action); saved = true; setModal(undefined)
      await reload(); notify('已保存用户中心配置')
    } catch (e) {
      if (saved) { setRefreshNeeded(true); setError('修改已保存，页面读取失败。请重新读取，不会重复提交。') }
      else setError(e instanceof Error ? e.message : '保存失败，填写内容已保留')
    } finally { lock.current = false; setBusy(false) }
  }
  const open = (next: ModalState) => { if (!refreshNeeded) { setError(''); setDetailTab('profile'); setModal(next) } }
  const close = () => { if (!busy) { setModal(undefined); setError('') } }
  const users = center.users.filter(u => `${u.id} ${u.displayName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!status || u.status === status) && (!source || selectedSource(u.id) === source) && (!connection || accessFor(u.id).status === connection))
  const selectedUser = center.users.find(u => u.id === modal?.id)
  const runLink = (userId: string, view = 'sessions') => { setModal(undefined); navigate(`/runs?user=${encodeURIComponent(userId)}&view=${view}`) }
  return <div className="user-center">
    <PageHeader title="用户中心" description="管理 C 端账号，查看登录身份、模型接入与额度用量。" />
    <div className="user-center-context"><span>当前操作身份：{canManage ? '本地管理员（演示）' : roleLabels[actor.role]}</span><span>浏览器原型 · 统一登录尚未接入</span></div>
    <div className="user-metrics user-metrics--access"><div><span>用户总数</span><strong>{center.users.length}</strong></div><div><span>正常账号</span><strong>{center.users.filter(u => u.status === 'active').length}</strong></div><div><span>个人 Key 已连接</span><strong>{center.users.filter(u => accessFor(u.id, 'personal').status === 'ready').length}</strong></div><div><span>当前接入待处理</span><strong>{center.users.filter(u => u.status === 'active' && accessFor(u.id).status !== 'ready').length}</strong></div></div>
    {!canManage && <Notice>当前演示身份只可查看，账号启停由平台管理员操作。</Notice>}
    {error && !modal && <Notice tone="error">{error}{refreshNeeded && <Button disabled={busy} onClick={async () => { setBusy(true); try { await reload(); setError(''); setRefreshNeeded(false); notify('已重新读取保存结果') } catch { setError('读取仍失败，修改已保存，请再次重试。') } finally { setBusy(false) } }}>重新读取</Button>}</Notice>}
    <p className="user-note">正常账号登录后可进入已发布专家；实际对话还需当前 Key、额度及专家模型可用。支持平台与个人两种来源，异常时不自动切换。</p><div className="catalog-panel"><div className="table-toolbar user-toolbar"><SearchField label="搜索用户" value={query} onChange={setQuery} placeholder="搜索用户 ID 或展示名" /><div className="filters"><select aria-label="账号状态筛选" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已停用</option></select><select aria-label="用户调用来源筛选" value={source} onChange={e => setSource(e.target.value)}><option value="">全部调用来源</option>{Object.entries(sourceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label="用户接入状态筛选" value={connection} onChange={e => setConnection(e.target.value)}><option value="">全部接入状态</option>{Object.entries(accessLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div><span className="muted">{users.length} 位用户</span></div>
      {users.length ? <div className="table-scroll"><table className="data-table user-table"><thead><tr><th>用户 / ID</th><th>登录身份</th><th>账号状态</th><th>当前调用来源</th><th>模型接入</th><th>最近登录</th><th>操作</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td><button className="entity-name" disabled={blocked} onClick={() => open({ kind: 'user', id: u.id })}>{u.displayName}</button><small>{u.id}</small></td><td>OIDC 统一登录<small>{u.identity.status === 'linked' ? '已绑定（示例）' : '已撤销'}</small></td><td><AccountStatus user={u} /></td><td>{sourceLabels[selectedSource(u.id)]}<small>{accessFor(u.id).masked ?? '尚未连接'}</small></td><td>{accessLabels[accessFor(u.id).status]}<small>{u.status === 'disabled' ? '本平台账号已停用' : accessFor(u.id).status === 'ready' ? '模型已发现 · 调用仍需校验' : '需处理后再发起调用'}</small></td><td className="time-cell">{timestamp(u.lastLoginAt)}</td><td><div className="user-row-actions"><Button variant="ghost" disabled={blocked} onClick={() => open({ kind: 'user', id: u.id })} aria-label={`查看用户 ${u.displayName}`}>详情</Button></div></td></tr>)}</tbody></table></div> : <Empty title="没有匹配的用户" description="调整搜索词或筛选条件后重试。" action={<Button onClick={() => { setQuery(''); setStatus(''); setSource(''); setConnection('') }}>清除筛选</Button>} />}
    </div>
    {modal?.kind === 'user' && selectedUser && <div className="user-detail-modal"><Modal title="用户详情" onClose={close}><div className="user-detail-title"><div><strong>{selectedUser.displayName}</strong><small>用户 ID · {selectedUser.id}</small></div><AccountStatus user={selectedUser} /></div><div className="editor-tabs" role="tablist" aria-label="用户详情分区">{[['profile', '基本信息'], ['access', '模型接入'], ['usage', '额度与用量']].map(([id, label]) => <button role="tab" aria-selected={detailTab === id} key={id} onClick={() => setDetailTab(id)}>{label}</button>)}</div>
      {detailTab === 'profile' && <><Facts items={[["登录来源", '统一身份登录（演示）'], ['身份绑定', selectedUser.identity.status === 'linked' ? '已绑定（示例）' : '已撤销'], ['注册时间', timestamp(selectedUser.createdAt)], ['最近登录', timestamp(selectedUser.lastLoginAt)], ['平台账号', userAccessDecision(center, selectedUser.id).allowed ? '可登录平台' : userAccessDecision(center, selectedUser.id).reason], ['专家入口', '已发布且未停用的智能体'], ['Token超市业务账号', '未取得账号级委托授权'], ['当前调用来源', sourceLabels[selectedSource(selectedUser.id)]]]} /><p className="user-note">展示名不代表实名；身份资料只读。OIDC 只证明登录身份，不提供业务账号权限或模型额度。</p>
      <UserUsage state={state} actor={actor} user={selectedUser} openRecords={view => runLink(selectedUser.id, view)} />
      <details className="user-foldout"><summary>身份关联信息（只读示例）</summary><Facts items={[["Issuer", selectedUser.identity.issuer], ['Subject', selectedUser.identity.subject], ['绑定时间', timestamp(selectedUser.identity.boundAt)]]} /></details>
      <details className="user-foldout"><summary>账号操作记录 · {center.audits.filter(a => a.targetId === selectedUser.id).length} 条</summary><UserAuditList center={center} targetId={selectedUser.id} /></details>
      </>}
      {detailTab !== 'profile' && (['admin', 'auditor'].includes(actor.role) ? <UserModelAccess key={`${selectedUser.id}-${detailTab}`} user={selectedUser} usage={detailTab === 'usage'} /> : <Notice>当前演示身份无权查看模型接入与额度用量。</Notice>)}
      <footer>{canManage && <Button variant={selectedUser.status === 'active' ? 'danger' : 'default'} disabled={blocked} onClick={() => open({ kind: 'status', id: selectedUser.id })}>{selectedUser.status === 'active' ? '停用账号' : '启用账号'}</Button>}<Button onClick={close}>关闭</Button></footer></Modal></div>}
    {modal?.kind === 'status' && selectedUser && <AccountStatusDialog user={selectedUser} busy={blocked} error={error} onClose={close} save={reason => void commit({ type: 'user-status', id: selectedUser.id, status: selectedUser.status === 'active' ? 'disabled' : 'active', reason })} />}
    {modal && !selectedUser && <Modal title="用户不存在" onClose={close}><p className="body-copy">请刷新后重新选择用户。</p><footer><Button onClick={close}>关闭</Button></footer></Modal>}
  </div>
}

function UserUsage({ state, actor, user, openRecords }: { state: CampusState; actor: Actor; user: ConsumerUser; openRecords: (view: string) => void }) {
  if (!['admin', 'auditor'].includes(actor.role)) return <Notice>当前演示身份无权查看用户会话与用量。</Notice>
  const sessions = visibleChatSessions(state, actor).filter(s => s.user === user.id); const calls = chatCalls.filter(c => sessions.some(s => s.id === c.sessionId)); const usage = summarizeUsage(calls)
  return <section className="user-usage"><h3>本平台会话与用量 <small>固定示例</small></h3><Facts items={[["会话数", `${sessions.length} 个`], ['模型调用', `${usage.count} 次`], ['已上报 Token', calls.length ? tokens(usage.total) : '—'], ['待补报调用', `${usage.pending} 次`]]} /><div className="user-row-actions"><Button onClick={() => openRecords('sessions')}>查看此用户会话</Button><Button onClick={() => openRecords('calls')}>查看此用户调用</Button><Button onClick={() => openRecords('usage')}>查看此用户用量</Button></div></section>
}
function UserAuditList({ center, targetId }: { center: UserCenterState; targetId: string }) {
  const rows = center.audits.filter(a => a.targetId === targetId)
  return rows.length ? <div className="user-audits">{rows.map(a => <article key={a.id}><strong>{a.action}</strong><small>{a.actorName} · {formatTime(a.at)}</small><p>{a.before} → {a.after}</p><p>{a.detail}</p></article>)}</div> : <p className="user-note">暂无账号管理操作。</p>
}
function AccountStatusDialog({ user, busy, error, onClose, save }: { user: ConsumerUser; busy: boolean; error: string; onClose: () => void; save: (reason: string) => void }) {
  const [reason, setReason] = useState(''); const disabling = user.status === 'active'
  return <Modal title={`${disabling ? '停用' : '启用'}账号 · ${user.displayName}`} onClose={onClose}>{error && <Notice tone="error">{error}</Notice>}<Notice tone={disabling ? 'warning' : undefined}>{disabling ? '停用后，此用户不能登录使用。身份绑定和历史会话仍保留；不撤销用户在 Token超市的 Key。' : '启用后恢复平台登录；模型调用仍需所选 Key、额度和专家模型可用。'}</Notice><Field label="操作原因" required><textarea aria-label="操作原因" value={reason} maxLength={200} onChange={e => setReason(e.target.value)} /></Field><footer><Button disabled={busy} onClick={onClose}>取消</Button><Button variant={disabling ? 'danger' : 'primary'} disabled={busy || !reason.trim()} onClick={() => save(reason)}>确认{disabling ? '停用' : '启用'}</Button></footer></Modal>
}
