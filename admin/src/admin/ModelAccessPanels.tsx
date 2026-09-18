import { PlatformMoneySummary } from './ServiceOutcomes'
import { useState } from 'react'
import { Button, Empty, Facts, Notice, Tag, formatTime } from './components'
import { accessFor, accessHelp, accessLabels, dailySnapshot, DEMO_USAGE_DATE, displayCount, displayMoney, platformAccess, selectedSource, sourceLabels, type KeyAccess, type KeySource, type UsageSnapshot } from './model-access'
import type { ConsumerUser } from './user-center-model'
import './model-access.css'

function SourceSwitch({ source, change }: { source: KeySource; change: (value: KeySource) => void }) {
  return <div className="key-source-switch" role="group" aria-label="查看接入方式">{Object.entries(sourceLabels).map(([id, label]) => <Button key={id} aria-pressed={source === id} variant={source === id ? 'primary' : 'default'} onClick={() => change(id as KeySource)}>{label}</Button>)}</div>
}
export function UserModelAccess({ user, usage = false }: { user: ConsumerUser; usage?: boolean }) {
  const [source, setSource] = useState<KeySource>(selectedSource(user.id)); const access = accessFor(user.id, source)
  return <div className="model-access-panel"><SourceSwitch source={source} change={setSource} /><p className="record-note">当前调用来源：{sourceLabels[selectedSource(user.id)]}（示例）。此处仅切换查看，不修改调用来源。</p>
    {user.status === 'disabled' && <Notice tone="warning">本平台账号已停用，不能继续使用专家；上游 Key 不会因此被撤销。</Notice>}
    {usage ? <><PlatformMoneySummary /><details className="user-foldout"><summary>上游额度与费用（原币）</summary><KeyBalance access={access} /><KeyUsage access={access} /></details><Notice>全账号用量：未授权。OIDC 登录与专属 Key 均不代表已取得账号业务统计权限。</Notice></> : <>
      <div className="key-status-heading"><h3>{sourceLabels[source]}</h3><Tag>{accessLabels[access.status]}</Tag></div>
      <Notice tone={access.status === 'ready' ? undefined : 'warning'}>{accessHelp[access.status]}</Notice>
      <Facts items={[["费用承担", source === 'platform' ? '平台额度' : '用户授权的 Key 对应额度'], ['授权方式', source === 'platform' ? '管理员配置平台中转站' : access.consentAt ? '用户主动提供并授权专属 Key（示例）' : '等待用户在前台「个人中心 → 模型接入」主动连接'], ['Key 标识', access.masked ?? '尚未连接'], ['Key 名称', access.keyName ?? '—'], ['Key ID', access.keyId ?? '—'], ['分组', access.group ? `${access.group.name} · ID ${access.group.id}` : '未提供'], ['协议', access.group?.protocol ?? '待确认'], ['有效期', access.expiresAt === null ? '未设置到期时间（示例）' : access.expiresAt ? formatTime(access.expiresAt) : '未提供'], ['最近模型查询', access.checkedAt ? formatTime(access.checkedAt) : '尚未查询'], ['用户授权时间', access.consentAt ? formatTime(access.consentAt) : source === 'platform' ? '不适用' : '尚未授权']]} />
      <h3 className="record-section-title">该 Key 返回的模型</h3>{access.models.length ? <div className="tag-list">{access.models.map(model => <Tag key={model}>{model}</Tag>)}</div> : <p className="record-note">{access.status === 'missing' ? '连接专属 Key 后获取模型。' : access.status === 'error' ? '查询失败，暂不能展示模型。' : '当前 Key 没有返回可用模型。'}</p>}
      <p className="record-note key-model-note">仅为此 Key / 分组的模型列表，不代表账号所有模型；列表可见不保证可推理。专家仍使用管理员配置的模型，失败时不自动切换。</p>
      {source === 'personal' && <details className="user-foldout"><summary>用户专属 Key 接入流程</summary><ol className="key-connection-steps"><li>用户在 Token超市选取或创建专属 Key。</li><li>用户主动授权本平台使用；正式接入时由后端安全保管。</li><li>获取该 Key 的模型和可见用量，核对专家配置。</li></ol><p className="record-note">当前第三方委托接口尚未开放。管理员不能凭用户的 OIDC 身份代建 Key，也不能查看完整 Key。用户未连接不代表账号没有 Key。</p></details>}
    </>}
  </div>
}
export function KeyBalance({ access }: { access: KeyAccess }) {
  const money = (value?: number) => displayMoney(value, access.unit)
  return <section className="key-balance"><div className="key-status-heading"><h3>余额与额度</h3><Tag>{accessLabels[access.status]}</Tag></div><p className="record-note">{access.source === 'platform' ? '平台共享 Key；额度属于平台，不是当前用户的钱包或个人可用余额。' : '仅展示该 Key 响应允许提供的信息。余额、额度与历史费用分别计算。'}</p>
    {access.mode === 'wallet' ? <><Facts items={[["账号钱包余额（Key 返回）", money(access.balance)], ['币种 / 单位', access.unit ?? '未提供']]} /><p className="record-note">钱包可能覆盖整个账号，下面的用量仍只属于当前 Key。</p></> : access.mode === 'quota' ? <><Facts items={[["Key 总额度", money(access.quota)], ['Key 已用额度', money(access.used)], ['Key 剩余额度', money(access.remaining)], ['钱包余额', '未提供'], ['限额窗口', access.rateWindow ?? '未提供']]} /><p className="record-note">Key 剩余额度不是账号钱包余额；限额窗口也不等同于自然日用量。</p></> : access.mode === 'subscription' ? <><Facts items={[["订阅", access.subscription?.name ?? '未提供'], ['额度周期', access.subscription?.window ?? '未提供'], ['订阅剩余额度', money(access.subscription?.remaining)], ['钱包余额', '未提供']]} /><p className="record-note">订阅剩余额度不是现金余额，不与钱包或 Key 额度相加。</p></> : <p className="record-note">尚未连接，余额与额度暂不可用。</p>}
  </section>
}
function SnapshotFacts({ snapshot, unit }: { snapshot?: UsageSnapshot; unit?: string }) {
  return <Facts items={[["请求数", displayCount(snapshot?.requests)], ['Token 总量', displayCount(snapshot?.tokens)], ['费用', displayMoney(snapshot?.cost, unit)], ['实际费用', displayMoney(snapshot?.actualCost, unit)]]} />
}
export function KeyUsage({ access }: { access: KeyAccess }) {
  const [date, setDate] = useState(DEMO_USAGE_DATE); const [timezone, setTimezone] = useState('Asia/Shanghai')
  const daily = dailySnapshot(access, date, timezone)
  return <section className="key-usage"><h3 className="record-section-title">当前 Key 的上游统计</h3><p className="record-note">{access.source === 'platform' ? '平台共享 Key 的全部消费，不能分摊为某一位用户或专家的用量。' : '只统计当前专属 Key，可能包含在其他应用中的消费，不等同于本平台或全账号用量。'} 数据为固定示例；缺失字段不填 0。</p>
    <div className="key-usage-block"><h4>Key 累计用量</h4><p className="record-note">上游累计摘要 · 截至 2026/09/17 10:00，不受下方日期选择影响。</p><SnapshotFacts snapshot={access.total} unit={access.unit} /></div>
    <div className="key-usage-block"><h4>指定自然日用量</h4><div className="key-period"><label>日期<input type="date" aria-label="Key 用量日期" value={date} onChange={event => setDate(event.target.value)} /></label><label>时区<select aria-label="Key 用量时区" value={timezone} onChange={event => setTimezone(event.target.value)}><option value="Asia/Shanghai">Asia/Shanghai</option><option value="UTC">UTC</option></select></label></div><p className="record-note">{date || '请选择日期'} · {timezone} · 当天 00:00 至次日 00:00；示例仅提供 2026-09-17 的上海时区数据。</p>{daily ? <SnapshotFacts snapshot={daily} unit={access.unit} /> : <Notice>此日期 / 时区的统计暂不可用，不表示零消费。</Notice>}</div>
    <details className="user-foldout"><summary>上游今日摘要（服务端日期口径）</summary><p className="record-note">截至示例查询时间。日期边界由上游决定，不随日期 / 时区选择改变，不等同于最近 24 小时。</p><SnapshotFacts snapshot={access.serverToday} unit={access.unit} /></details>
    <p className="record-note">“费用”和“实际费用”保留上游口径，均不直接等于钱包扣款。统计可读取不代表 Key 仍可调用。</p>
  </section>
}
export function GatewayUsagePanel({ users, userId }: { users: ConsumerUser[]; userId?: string }) {
  const [source, setSource] = useState<KeySource>(userId ? 'personal' : 'platform')
  const [selectedUser, setSelectedUser] = useState(userId ?? users[0]?.id ?? '')
  const access = source === 'platform' ? platformAccess : accessFor(selectedUser, 'personal')
  if (!users.length) return <Empty title="暂无可查看用户" description="当前范围没有可见的 Key 统计。" />
  return <div className="model-access-panel"><SourceSwitch source={source} change={setSource} />{source === 'personal' && !userId && <label className="key-user-filter">用户<select aria-label="Key 统计用户" value={selectedUser} onChange={event => setSelectedUser(event.target.value)}>{users.map(user => <option key={user.id} value={user.id}>{user.displayName} · {user.id}</option>)}</select></label>}<p className="record-note">统计对象：{source === 'platform' ? '平台共享 Key' : users.find(user => user.id === selectedUser)?.displayName} · {access.masked ?? '未连接'} · 固定示例</p><KeyBalance access={access} /><KeyUsage access={access} />{source === 'personal' && <Notice>全账号用量未授权，不能使用 OIDC Token 或单个 Key 读取账号全部消费。</Notice>}</div>
}
