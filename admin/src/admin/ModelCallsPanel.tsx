import { useState } from 'react'
import { Button, Empty, Facts, Modal, Notice, SearchField, Tag, formatTime } from './components'
import { chatCalls, type ChatCall, type ChatSession } from './chat-records'
import { callAccessSnapshots, displayCount, displayMoney, scopedCalls, sourceLabels } from './model-access'

const callLabels = { completed: '调用成功', generating: '调用中', failed: '调用失败', stopped: '用户停止' }
export function CallAttribution({ call }: { call: ChatCall }) {
  const snapshot = callAccessSnapshots[call.id]
  return snapshot ? <><Facts items={[["调用来源", sourceLabels[snapshot.source]], ['费用承担', snapshot.source === 'platform' ? '平台额度' : '用户授权 Key 对应额度'], ['Key 标识', snapshot.masked], ['Key ID', snapshot.keyId], ['调用时分组', `${snapshot.groupName} · ID ${snapshot.groupId}`], ['实际模型', snapshot.model], ['调用协议', snapshot.protocol], ['费用', displayMoney(snapshot.cost, snapshot.unit)], ['实际费用', displayMoney(snapshot.actualCost, snapshot.unit)], ['HTTP 状态', snapshot.httpStatus === null ? '尚未返回' : String(snapshot.httpStatus)]]} /><p className="record-note">按本次调用快照追溯，不随当前 Key 或模型设置改变；仅展示脱敏标识。费用不是钱包扣款。</p></> : <Notice>此调用的来源与费用尚未上报。</Notice>
}
export function ModelCallsPanel({ sessions }: { sessions: ChatSession[] }) {
  const [query, setQuery] = useState(''); const [source, setSource] = useState(''); const [model, setModel] = useState(''); const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<ChatCall>()
  const calls = scopedCalls(sessions, chatCalls)
  const models = [...new Set(calls.map(c => callAccessSnapshots[c.id]?.model).filter(Boolean))]
  const rows = calls.filter(call => {
    const snapshot = callAccessSnapshots[call.id]; const session = sessions.find(s => s.id === call.sessionId)!
    return (!source || snapshot?.source === source) && (!model || snapshot?.model === model) && (!status || call.status === status) && `${call.id} ${call.sessionId} ${session.userName} ${session.user} ${session.agentName} ${snapshot?.masked ?? ''} ${snapshot?.keyId ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  const reset = () => { setQuery(''); setSource(''); setModel(''); setStatus('') }
  const session = sessions.find(s => s.id === selected?.sessionId)
  return <><p className="record-note">每行一次模型调用（示例），按时间倒序；同一会话可以有多次调用。调用失败不自动切换 Key 或重复扣费请求。</p><div className="catalog-panel"><div className="table-toolbar record-toolbar"><SearchField label="搜索模型调用" placeholder="搜索调用、会话、用户或 Key 标识" value={query} onChange={setQuery} /><div className="filters"><select aria-label="调用来源筛选" value={source} onChange={e => setSource(e.target.value)}><option value="">全部调用来源</option>{Object.entries(sourceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label="调用模型筛选" value={model} onChange={e => setModel(e.target.value)}><option value="">全部模型</option>{models.map(id => <option key={id} value={id}>{id}</option>)}</select><select aria-label="调用状态筛选" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部调用状态</option>{Object.entries(callLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div><span className="muted">{rows.length} 次调用</span></div>
    {rows.length ? <div className="table-scroll"><table className="data-table record-table"><thead><tr><th>调用 / 用户</th><th>来源 / Key</th><th>模型 / 智能体</th><th>状态 / 耗时</th><th>Token / 实际费用</th><th>调用时间</th><th>操作</th></tr></thead><tbody>{rows.map(call => {
      const snapshot = callAccessSnapshots[call.id]; const s = sessions.find(s => s.id === call.sessionId)!
      return <tr key={call.id}><td><button className="entity-name" onClick={() => setSelected(call)}>{call.id}</button><small>{s.userName} · {s.user}</small></td><td>{snapshot ? sourceLabels[snapshot.source] : '未上报'}<small>{snapshot?.masked ?? '—'}</small></td><td>{snapshot?.model ?? '未上报'}<small>{s.agentName} · v{s.version}</small></td><td><span className={`record-status record-status--${call.status}`}><i />{callLabels[call.status]}</span><small>{call.durationMs === null ? '尚未结束' : `${call.durationMs / 1000} 秒`}</small></td><td>{call.inputTokens === null || call.outputTokens === null ? '待补报' : displayCount(call.inputTokens + call.outputTokens)}<small>{displayMoney(snapshot?.actualCost, snapshot?.unit)}</small></td><td>{formatTime(call.at)}</td><td><Button variant="ghost" aria-label={`查看调用 ${call.id}`} onClick={() => setSelected(call)}>详情</Button></td></tr>
    })}</tbody></table></div> : <Empty title="暂无匹配的模型调用" description="调整筛选条件后重试。" action={query || source || model || status ? <Button onClick={reset}>清除筛选</Button> : undefined} />}</div>
    {selected && session && <Modal title="模型调用详情" onClose={() => setSelected(undefined)}><div className="record-detail-heading"><div><strong>{selected.id}</strong><p>{session.userName} · {session.agentName} v{session.version}</p></div><Tag>{callLabels[selected.status]}</Tag></div><Facts items={[["会话编号", selected.sessionId], ['用户 ID', session.user], ['调用时间', formatTime(selected.at)], ['响应耗时', selected.durationMs === null ? '尚未结束' : `${selected.durationMs / 1000} 秒`], ['输入 Token', displayCount(selected.inputTokens)], ['输出 Token', displayCount(selected.outputTokens)]]} /><h3 className="record-section-title">调用来源与费用</h3><CallAttribution call={selected} />{selected.error && <Notice tone="error">{selected.error} {callAccessSnapshots[selected.id]?.advice}</Notice>}{(selected.inputTokens === null || selected.outputTokens === null) && <Notice tone="warning">用量尚未完整上报，已上报部分仍计入本平台统计；缺报不表示零消费。</Notice>}<p className="record-note">不展示聊天正文、完整 Key 或身份令牌。当前为固定示例，未执行真实模型请求。</p><footer><Button onClick={() => setSelected(undefined)}>关闭详情</Button></footer></Modal>}
  </>
}
