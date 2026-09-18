import { useState } from 'react'
import { ClientModal, SettingsBlock } from '../../../src/renderer/src/components/client-ui'
import { examplePlatformBalance, operationLabels, rmb, scenarioLabels, serviceExamples, sourceName, type KeySource, type ServiceRecord, type ServiceScenario } from '../../../src/shared/service-prototype'
import './service-experience.css'

export type AccessStatus = 'ready' | 'missing' | 'expired' | 'exhausted' | 'no-model'
export interface ServiceSettings {
  source: KeySource; personal: AccessStatus; balance: number; account: 'active' | 'signed-out' | 'disabled';
  availability: 'active' | 'disabled' | 'model-offline' | 'new-version'; availabilityAgentId?: string; identity: 'student' | 'staff' | 'unknown'; scenario: ServiceScenario;
}
export const initialServiceSettings: ServiceSettings = { source: 'platform', personal: 'missing', balance: examplePlatformBalance, account: 'active', availability: 'active', identity: 'student', scenario: 'normal' }
const accessLabels: Record<AccessStatus, string> = { ready: '已连接', missing: '待连接', expired: '连接已过期', exhausted: 'Key 额度不足', 'no-model': 'Key 不支持当前模型' }
export function serviceBlock(settings: ServiceSettings, disabled = false): string | undefined {
  if (settings.account === 'disabled') return '平台账号已停用。历史记录保留，请联系管理员处理。'
  if (settings.account === 'signed-out') return '登录已失效。重新登录后继续，草稿与附件已保留。'
  if (disabled || settings.availability === 'disabled') return '专家已停用，不能继续发送。历史消息和已有成果仍可查看。'
  if (settings.availability === 'model-offline') return '当前会话的模型已下线，不能继续发送。请选择其他专家，历史内容保留。'
  if (settings.source === 'personal' && settings.personal !== 'ready') return `${accessLabels[settings.personal]}。请处理个人 Key，或主动选择平台 Key。`
  if (settings.source === 'platform' && settings.balance < .12) return '平台使用余额不足（本次演示需 ¥0.12）。可连接个人 Key，或联系管理员补充额度。'
}
export function ModelAccess({ settings, change, onBack }: { settings: ServiceSettings; change: (patch: Partial<ServiceSettings>) => void; onBack: () => void }) {
  const [connecting, setConnecting] = useState(false)
  const [consent, setConsent] = useState(false)
  return <div className="service-settings">
    <div className="service-heading"><div><h2>模型接入</h2><p>为下一次发送选择调用来源。</p></div><button className="button button--quiet" onClick={onBack}>返回原对话</button></div>
    <div className="service-source-grid">
      {(['platform', 'personal'] as const).map(source => <section className={`service-source ${settings.source === source ? 'is-selected' : ''}`} key={source}>
        <div className="service-heading"><h3>{sourceName(source)}</h3><span className="service-tag">{settings.source === source ? '当前使用' : '可选择'}</span></div>
        <strong className="service-balance">{source === 'platform' ? rmb(settings.balance) : accessLabels[settings.personal]}</strong>
        <p>{source === 'platform' ? '平台使用余额 · 人民币' : '由你主动连接的专属 Key'}</p>
        <p className="quiet-meta">{source === 'platform' ? '仅使用平台 Key 时扣除。余额属于本平台使用额度。' : '不扣平台使用余额；费用由个人 Key 所属服务结算。'}</p>
        <button className="button button--quiet" disabled={settings.source === source} onClick={() => change({ source })}>使用{sourceName(source)}</button>
        {source === 'personal' && <button className="button button--primary" onClick={() => { setConsent(false); setConnecting(true) }}>{settings.personal === 'ready' ? '重新连接' : '连接个人 Key'}</button>}
      </section>)}
    </div>
    <SettingsBlock title="调用规则"><p>异常时不会自动切换来源。每次调用保留当时的 Key 来源、模型和费用；切换来源不会改写历史记录。</p><p>当前原型使用模拟连接，不收集真实 Key。模型列表和额度均为演示数据。</p></SettingsBlock>
    {settings.personal === 'ready' && <SettingsBlock title="个人 Key 可用模型"><p>deepseek-v4 · glm-5.2</p><p className="quiet-meta">连接状态不能代替调用前检查；专家使用其发布版本指定的模型。</p></SettingsBlock>}
    <ClientModal open={connecting} title="连接个人 Key" onClose={() => setConnecting(false)} size="medium">
      <div className="service-modal-body"><p>授权本平台使用你选择的专属 Key 进行模型调用，读取该 Key 可见的模型及额度。</p><p>不授权读取整个业务账号，不改变统一登录身份。</p><label className="service-checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />我同意上述使用范围（演示）</label><p className="quiet-meta">本次模拟授权，完成后默认保留当前调用来源。</p><div className="service-actions"><button className="button button--quiet" onClick={() => setConnecting(false)}>取消连接</button><button className="button button--primary" disabled={!consent} onClick={() => { change({ personal: 'ready' }); setConnecting(false) }}>完成模拟连接</button></div></div>
    </ClientModal>
  </div>
}
export function ServiceUsage({ settings, records }: { settings: ServiceSettings; records: ServiceRecord[] }) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ServiceRecord>()
  const rows = [...records, ...serviceExamples]
  const totalTokens = rows.reduce((sum, r) => sum + (r.tokens ?? 0), 0)
  const amount = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
  const pending = rows.filter(r => r.amount === null || r.tokens === null).length
  return <>
    <SettingsBlock title="用量概览"><div className="usage-summary"><div><span>平台使用余额</span><strong>{rmb(settings.balance)}</strong><small>人民币 · 仅平台 Key 扣除</small></div><div><span>已上报消费</span><strong>{rmb(amount)}</strong><small>{pending} 条待补报 · 不计为零</small></div><div><span>已上报 Token</span><strong>{totalTokens.toLocaleString()} Token</strong><small>缺报部分未计入合计</small></div></div><p className="quiet-meta">金额均为演示数据，非真实价格或钱包。余额快照不由历史记录相减推算；个人 Key 上游消费不计入平台扣款。</p></SettingsBlock>
    <SettingsBlock title="用量记录"><div className="usage-table-scroll"><table className="usage-rows" aria-label="用量记录"><thead><tr><th>使用内容 / 状态</th><th>调用来源</th><th>Token 用量</th><th>平台扣款（人民币）</th><th>详情</th></tr></thead><tbody>{rows.slice(page * 10, page * 10 + 10).map(r => <tr key={r.id}><td>{r.agentName}<small>{new Date(r.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace('/', '-')} · {scenarioLabels[r.scenario]}</small></td><td>{sourceName(r.source)}</td><td>{r.tokens === null ? '待补报' : `${r.tokens.toLocaleString()} Token`}</td><td>{r.source === 'personal' ? '¥0.00 · 不扣平台余额' : rmb(r.amount)}</td><td><button className="button button--quiet" onClick={() => setSelected(r)} aria-label={`查看消费 ${r.id}`}>查看</button></td></tr>)}</tbody></table></div><nav className="usage-pagination" aria-label="用量记录分页"><span>第 {page * 10 + 1}–{Math.min(rows.length, (page + 1) * 10)} 条，共 {rows.length} 条</span><div><button className="button button--quiet" disabled={!page} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page + 1} / {Math.max(1, Math.ceil(rows.length / 10))} 页</span><button className="button button--quiet" disabled={(page + 1) * 10 >= rows.length} onClick={() => setPage(page + 1)}>下一页</button></div></nav></SettingsBlock>
    <ClientModal open={!!selected} title="消费详情" onClose={() => setSelected(undefined)} size="medium">{selected && <div className="service-modal-body"><TraceFacts record={selected} /><p>失败也可能产生模型消耗。缺报金额等待上报后再结算，不按零元处理。</p></div>}</ClientModal>
  </>
}
export function TraceFacts({ record: r }: { record: ServiceRecord }) {
  return <dl className="service-facts"><div><dt>诊断号</dt><dd>{r.id}</dd></div><div><dt>会话 / 专家版本</dt><dd>{r.conversationId} · v{r.version}</dd></div><div><dt>调用快照</dt><dd>{sourceName(r.source)} · {r.model}</dd></div><div><dt>平台扣款</dt><dd>{rmb(r.amount)}{r.source === 'personal' && ' · 个人 Key 不扣除'}</dd></div><div><dt>操作结果</dt><dd>{operationLabels[r.operation]}</dd></div></dl>
}
export interface ResultInteraction { recipient?: string; content?: string; confirmed?: boolean }
export function ServiceResult({ record, change, files, interaction = {}, onInteraction, operationBlocked = false }: { record: ServiceRecord; change: (record: ServiceRecord) => void; files: string[]; operationBlocked?: boolean; interaction?: ResultInteraction; onInteraction: (patch: ResultInteraction) => void }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const recipient = interaction.recipient ?? '数字校园项目组（12 人）'
  const content = interaction.content ?? '请于 9 月 18 日 14:00 参加数字校园项目例会，地点：行政楼 302。'
  const confirmed = interaction.confirmed ?? false
  const generated = record.delivery !== 'failed'
  const downloaded = record.delivery === 'download-requested'
  const notice = record.scenario.startsWith('notice')
  const literature = ['literature', 'output-failed', 'material-failed'].includes(record.scenario)
  const readingNote = '# 文献阅读笔记（演示）\n\n此文件是产品交互样例，不是对上传材料的真实分析。\n\n## 研究问题\n如何评估校园智能助理的服务效果。\n\n## 方法与结论\n以完成率、错误恢复和可追溯性作为评价维度。\n\n来源：内置演示材料；请核对真实原文。\n'
  return <section className="service-result" aria-label="本次服务结果">
    {notice && <><div className="service-heading"><h3>发送通知</h3><span className="service-tag">{operationLabels[record.operation]}</span></div>
      <p>通知由「通知服务 · 下发会议摘要 · v1.2」执行，模型回复不代表已发送。</p>
      {record.operation === 'awaiting' ? <>{operationBlocked && <p role="status">账号或专家当前不可用，暂不能执行通知。确认内容已保留。</p>}<label>接收对象<input aria-label="通知接收对象" value={recipient} onChange={e => { onInteraction({ recipient: e.target.value, confirmed: false }) }} /></label><label>通知内容<textarea aria-label="待发送通知内容" value={content} onChange={e => { onInteraction({ content: e.target.value, confirmed: false }) }} rows={3} /></label><label className="service-checkbox"><input type="checkbox" checked={confirmed} onChange={e => onInteraction({ confirmed: e.target.checked })} />我已核对接收对象和内容</label><div className="service-actions"><button className="button button--quiet" onClick={() => change({ ...record, operation: 'denied' })}>拒绝发送</button><button className="button button--primary" disabled={operationBlocked || !confirmed || !recipient.trim() || !content.trim()} onClick={() => change({ ...record, operation: record.scenario === 'notice-unknown' ? 'unknown' : 'succeeded' })}>确认发送（演示）</button></div></> : <>
        <p>{record.operation === 'unauthorized' ? '当前用户未获得通知服务授权，本次未执行。请联系管理员，获得授权后重新发起并确认。' : record.operation === 'denied' ? '你已拒绝本次发送，未调用通知服务。' : record.operation === 'unknown' ? '服务超时，是否发送尚未确认。保留原操作编号核实，避免重复通知。' : `接收对象：${recipient}。已收到发送成功回执（演示）。`}</p>
        {record.operation === 'unknown' && <button className="button button--primary" onClick={() => change({ ...record, operation: 'verified' })}>核实原操作结果</button>}
      </>}
    </>}
    {literature && <><div className="service-heading"><h3>文献阅读笔记</h3><span className="service-tag">{record.scenario === 'material-failed' ? '材料读取失败' : record.scenario === 'output-failed' && !generated ? '成果生成失败' : '成果已生成（演示）'}</span></div>
      <p>{files.length ? `所选材料：${files.join('、')}` : '示例材料：校园智能助理研究摘要.md'}</p>
      {record.scenario === 'material-failed' ? <p>材料无法读取，尚未交给模型，也未扣款。请更换可读取的文件后重新发送；原文件仍可下载。</p> : <><p>演示摘要：以任务完成率、异常恢复能力和结果可追溯性评估校园智能助理。此内容来自内置样例，未真实解析上传文件。</p>{record.scenario === 'output-failed' && !generated ? <><p>摘要已保留，文件生成失败。重试仅生成成果，不重新发送消息。</p><button className="button button--quiet" onClick={() => change({ ...record, delivery: 'ready' })}>重新生成文件（演示）</button></> : <div className="service-delivery"><div><strong>文献阅读笔记-演示.md</strong><small>Markdown · 内置演示内容</small></div><a className="button button--primary" download="文献阅读笔记-演示.md" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(readingNote)}`} onClick={() => change({ ...record, delivery: 'download-requested' })}>{downloaded ? '再次下载' : '下载文件'}</a>{downloaded && <span role="status">已发起下载；若浏览器阻止，请再次下载</span>}</div>}</>}
    </>}
    {record.scenario === 'call-failed' && <><h3>回复未完成</h3><p>模型调用超时，已上报 600 Token。失败前的实际消耗仍计入费用；可以重新发送，重试会形成新调用。</p></>}
    {record.scenario === 'usage-pending' && <><h3>回复已完成，用量待补报</h3><p>暂未收到完整费用，不按零元展示。待补报记录不代表调用免费。</p></>}
    <details className="service-trace"><summary>调用与诊断 · {sourceName(record.source)} · {rmb(record.amount)}</summary><TraceFacts record={record} /><div className="service-actions"><button className="button button--quiet" onClick={async () => { try { await navigator.clipboard.writeText(record.id); setCopied(true); setCopyError(false) } catch { setCopyError(true) } }}>{copied ? '已复制诊断号' : '复制诊断号'}</button><a className="button button--quiet" href={`http://127.0.0.1:5180/#/runs?view=outcomes&trace=${encodeURIComponent(JSON.stringify(record))}`} target="_blank" rel="noreferrer">在后台查看演示记录</a></div>{copyError && <p role="alert">复制失败，请手动选择上方诊断号。</p>}<p className="quiet-meta">诊断仅包含调用元信息，不包含对话正文、文件内容和完整 Key。</p></details>
  </section>
}
export function PrototypeScenarios({ open, close, settings, change, start }: { open: boolean; close: () => void; settings: ServiceSettings; change: (patch: Partial<ServiceSettings>) => void; start: (scenario: ServiceScenario) => void }) {
  return <ClientModal open={open} title="原型演示场景" onClose={close} size="medium"><div className="service-modal-body"><p>这些选项只切换本地演示状态，刷新后重置。</p><div className="service-demo-grid">{Object.entries(scenarioLabels).map(([id, label]) => <button className="button button--quiet" key={id} onClick={() => { start(id as ServiceScenario); close() }}>{label}</button>)}</div><h3>异常与身份</h3><label>个人 Key 状态<select aria-label="模拟个人 Key 状态" value={settings.personal} onChange={e => change({ personal: e.target.value as AccessStatus })}>{Object.entries(accessLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>平台使用余额<select aria-label="模拟平台使用余额" value={settings.balance < .12 ? 'empty' : 'normal'} onChange={e => change({ balance: e.target.value === 'empty' ? 0 : examplePlatformBalance })}><option value="normal">充足 · ¥28.60</option><option value="empty">不足 · ¥0.00</option></select></label><label>会话可用性<select aria-label="模拟会话可用性" value={settings.availability} onChange={e => change({ availability: e.target.value as ServiceSettings['availability'] })}><option value="active">正常</option><option value="disabled">专家停用</option><option value="model-offline">模型下线</option><option value="new-version">已发布新版本</option></select></label><label>登录状态<select aria-label="模拟登录状态" value={settings.account} onChange={e => change({ account: e.target.value as ServiceSettings['account'] })}><option value="active">正常登录</option><option value="signed-out">登录失效</option><option value="disabled">账号停用</option></select></label><label>校园身份<select aria-label="模拟校园身份" value={settings.identity} onChange={e => change({ identity: e.target.value as ServiceSettings['identity'] })}><option value="student">学生 · 学号</option><option value="staff">教职工 · 工号</option><option value="unknown">身份 / 编号未提供</option></select></label><p className="quiet-meta">新版本只影响新建会话；已有会话保留原版本。身份样例不代表 OIDC 已提供校园身份。</p></div></ClientModal>
}
