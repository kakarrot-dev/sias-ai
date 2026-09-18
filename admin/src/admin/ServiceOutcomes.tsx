import { useState } from 'react'
import { Button, Empty, Facts, Modal, Notice, SearchField, Tag, formatTime } from './components'
import { examplePlatformBalance, operationLabels, parseServiceRecord, rmb, scenarioLabels, serviceExamples, sourceName, type ServiceRecord } from '../../../frontend/src/shared/service-prototype'

export function PlatformMoneySummary() {
  return <section className="key-balance"><h3>平台使用金额 · 人民币</h3><Facts items={[["可用余额（演示快照）", rmb(examplePlatformBalance)], ['扣款规则', '仅平台 Key 调用扣除；个人 Key 不扣平台余额'], ['待补报处理', '金额暂不计为零，等待完整上报']]} /><p className="record-note">这是本平台使用额度的金额视图，不是上游钱包或 Key 额度。下方上游统计保留原币，不直接折算为人民币。</p></section>
}
export function ServiceOutcomes({ trace, agentId }: { trace?: string | null; agentId?: string }) {
  const incoming = parseServiceRecord(trace ?? null)
  const [query, setQuery] = useState(incoming?.id ?? '')
  const [source, setSource] = useState('')
  const [selected, setSelected] = useState<ServiceRecord>()
  const all = [...(incoming ? [incoming] : []), ...serviceExamples.filter(r => r.id !== incoming?.id)].filter(r => !agentId || r.agentId === agentId)
  const rows = all.filter(r => (!source || r.source === source) && `${r.id} ${r.conversationId} ${r.agentId} ${r.agentName}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <>
    <Notice>服务结果和人民币扣款示例。诊断记录不含对话正文、材料内容、私有提示词或完整 Key。{incoming && '当前记录由前台演示链接带入，不表示服务已接通。'}</Notice>
    {trace && !incoming && <Notice tone="warning">诊断数据格式无效，未载入。请重新从前台结果卡打开。</Notice>}
    <div className="catalog-panel"><div className="table-toolbar"><SearchField label="搜索诊断号" placeholder="输入诊断号、会话号或专家名称" value={query} onChange={setQuery} /><select aria-label="服务结果来源" value={source} onChange={e => setSource(e.target.value)}><option value="">全部来源</option><option value="platform">平台 Key</option><option value="personal">个人 Key</option></select><span>{rows.length} 条</span></div>
      {rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>诊断号 / 专家</th><th>回复 / 交付</th><th>操作结果</th><th>调用来源 / 模型</th><th>平台扣款（人民币）</th><th>操作</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><button className="entity-name" onClick={() => setSelected(r)}>{r.id}</button><small>{r.agentName} · v{r.version}</small></td><td>{scenarioLabels[r.scenario]}</td><td><Tag>{operationLabels[r.operation]}</Tag></td><td>{sourceName(r.source)}<small>{r.model}</small></td><td>{rmb(r.amount)}<small>{r.source === 'personal' ? '个人 Key 不扣平台余额' : r.amount === null ? '待补报，不计为零' : '仅本次模型调用'}</small></td><td><Button variant="ghost" onClick={() => setSelected(r)}>追溯</Button></td></tr>)}</tbody></table></div> : <Empty title="没有匹配的诊断记录" description="可清除搜索，或从前台结果卡打开对应的演示记录。" action={<Button onClick={() => { setQuery(''); setSource('') }}>清除筛选</Button>} />}
    </div>
    <p className="record-note">模型回复、材料读取、成果生成和外部操作分别判定。请求失败不代表零消耗；结果未知不允许直接重发。</p>
    {selected && <Modal title="服务结果追溯" onClose={() => setSelected(undefined)}><Facts items={[["诊断号", selected.id], ['会话编号', selected.conversationId], ['专家标识', selected.agentId], ['发布版本', `v${selected.version}`], ['专家来源', selected.agentId.startsWith('custom.') ? '个人专家 · 仅归属用户可见' : '学校发布'], ['调用来源快照', `${sourceName(selected.source)} · ${selected.model}`], ['时间', formatTime(selected.at)], ['Token 用量', selected.tokens === null ? '待补报' : selected.tokens.toLocaleString()], ['平台扣款（人民币）', rmb(selected.amount)], ['回复样例', scenarioLabels[selected.scenario]], ['材料读取', selected.material === 'failed' ? '读取失败，未提交模型' : selected.material === 'read-demo' ? '内置样例已读取（模拟）' : '不涉及'], ['成果状态', { none: '不涉及', failed: '生成失败', ready: '已生成（演示）', 'download-requested': '已发起下载' }[selected.delivery]], ['外部操作', operationLabels[selected.operation]]]} />{selected.scenario.startsWith('notice') && <><h3>通知服务 · 下发会议摘要 · v1.2</h3><Facts items={[["操作编号", `${selected.id}-notice`], ['执行前确认', ['awaiting', 'unauthorized'].includes(selected.operation) ? '尚未确认' : selected.operation === 'denied' ? '用户已拒绝' : '用户已核对对象与内容'], ['回执', ['succeeded', 'verified'].includes(selected.operation) ? `${selected.id}-receipt（模拟）` : '未取得成功回执'], ['恢复方式', selected.operation === 'unknown' ? '按原操作编号核实，不重复发送' : selected.operation === 'unauthorized' ? '用户取得授权后重新发起并确认' : '查看原操作记录']]} /></>}<p className="record-note">默认不开放聊天正文和私人专家配置。此页不会发起重试或真实通知。</p><footer><Button onClick={() => setSelected(undefined)}>关闭</Button></footer></Modal>}
  </>
}
export function PrivateExpertOverview() {
  return <details className="user-foldout"><summary>个人专家 · 最小治理信息</summary><p className="record-note">个人专家创建后仅本人使用，无需公共发布；这里仅展示归属、状态和用量元信息，不开放私有提示词、编辑或聊天正文。</p><table className="data-table"><thead><tr><th>专家编号</th><th>归属用户</th><th>可见范围</th><th>状态</th><th>已上报用量</th></tr></thead><tbody><tr><td>custom.demo-reader</td><td>周宁 · zhou</td><td>仅自己</td><td>可用（固定示例）</td><td>1,800 Token · ¥0.00（个人 Key）</td></tr></tbody></table></details>
}
