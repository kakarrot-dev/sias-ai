import { useEffect, useState } from 'react'
import { Button, Field, Notice, Section, Tag, formatTime } from '../components'
import { isCaptain, canEdit, canPublish, hasChanges, configDigest, evaluationSets, evaluationSetFor, liveVersion, matchesGoal, models, people, releaseIssues, roleLabels, teamIssues, tools, usageDecision, type Actor, type Agent, type CampusState, type Config, type TestRound } from './model'
import { SelectField } from './Fields'
import type { CampusAction } from './actions'

type Props = { state: CampusState; agent: Agent; actor: Actor; dirty: boolean; busy: boolean; commit: (action: CampusAction) => Promise<boolean>; publish: () => void; config: Config; onTestSetChange: (value: Config['testSet']) => void; saveDraft: () => Promise<unknown>; onReport?: (id: string) => void; simpleAssistant?: boolean; onIssue?: (message: string) => void }
type Candidate = { id: string; name: string; version: number; description: string }
const reportId = (report: TestRound) => report.id ?? `${report.at}-${report.round}-${report.digest}`

function capabilityIssues(config: Config): string[] {
  const issues = models.some(model => model.id === config.model && model.active) ? [] : ['校内模型不可用']
  config.tools.forEach(binding => {
    const tool = tools.find(item => item.id === binding.id)
    if (!tool?.active || !tool.versions.includes(binding.version) || !tool.departments.includes(config.department)) issues.push(`${tool?.name ?? binding.id}不可用`)
  })
  return issues
}
function dependencies(state: CampusState, agent: Agent, config: Config, user: string): string[] {
  if (agent.sync !== 'synced') return ['授权尚未同步，请重试同步']
  if (agent.kind !== 'team') return capabilityIssues(config)
  return [...teamIssues(state, config, user, agent.id), ...[config.team.captain, ...config.team.members].flatMap(pin => {
    const expert = state.agents.find(item => item.id === pin.id)
    const snapshot = expert?.versions.find(item => item.number === pin.version)
    return snapshot ? capabilityIssues(snapshot.config).map(issue => `${snapshot.config.name}：${issue}`) : []
  })]
}

export function Testing({ state, agent: a, actor, dirty, busy, commit, publish, config, onTestSetChange, saveDraft, onReport, simpleAssistant, onIssue }: Props) {
  const [pass, setPass] = useState(true)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [user, setUser] = useState(people.find(p => p.department === actor.department)?.id ?? 'lin')
  const [input, setInput] = useState(a.kind === 'assistant' ? '' : config.duty || config.description)
  const [scenario, setScenario] = useState('normal')
  const [preview, setPreview] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [chosen, setChosen] = useState('')
  const editable = canEdit(actor, a) && !isCaptain(a)
  const currentDigest = configDigest(config)
  const reports = [...a.tests, ...(a.testHistory ?? [])].filter((report, index, all) => all.findIndex(item => reportId(item) === reportId(report)) === index).sort((left, right) => right.at.localeCompare(left.at))
  const latest = [...a.tests].reverse().sort((left, right) => right.at.localeCompare(left.at)).find(report => report.digest === currentDigest)
  const sampleSet = evaluationSetFor(a, config)
  useEffect(() => { setPreview(''); setCandidates([]); setChosen('') }, [a.id, input, scenario, user, state.revision, currentDigest])

  const runSamples = async () => {
    if (!editable || busy || dirty || running) return
    setRunning(true); setRunError('')
    try {
      const saved = await commit({ type: 'test', id: a.id, round: 1, pass, reviewer: `${roleLabels[actor.role]}（模拟）` })
      if (!saved) setRunError('模拟报告未保存，请保留当前配置并重试。')
    } catch (error) { setRunError(error instanceof Error ? error.message : '模拟报告未保存，请重试。') }
    finally { setRunning(false) }
  }
  const simulate = () => {
    setCandidates([]); setChosen('')
    if (!input.trim()) { setPreview('请先填写测试目标。'); return }
    if (a.disabled) { setPreview('当前智能体已停用，不能开始新的模拟任务。'); return }
    if (a.kind !== 'assistant' && !usageDecision(a, user, state.userCenter).allowed) { setPreview(`权限阻断：${usageDecision(a, user, state.userCenter).reason}。`); return }
    const issues = dependencies(state, a, config, user)
    if (issues.length) { setPreview(`依赖不可用：${issues.join('；')}。未产生外部操作。`); return }
    if (scenario === 'dependency') { setPreview('等待依赖：校内模型暂不可用。可重置样例后重试；未切换校外服务，未产生外部操作。'); return }
    if (scenario === 'no-match') { setPreview(a.kind === 'assistant' ? config.assistant.noMatch : '缺少完成目标所需资料，请补充输入或依据。未创建生产任务。'); return }
    if (a.kind === 'assistant') {
      const eligible = state.agents.flatMap(other => {
        const published = liveVersion(other)
        if (other.kind === 'assistant' || !published || other.disabled || config.assistant.exclude.includes(other.id) || !usageDecision(other, user, state.userCenter).allowed || dependencies(state, other, published.config, user).length || !matchesGoal(input, published.config)) return []
        return [{ id: other.id, name: published.config.name, version: published.number, description: published.config.description || published.config.duty }]
      })
      const matches = eligible.slice(0, Math.max(1, config.assistant.candidates))
      setCandidates(matches)
      if (eligible.length === 1) { setChosen(matches[0].id); setPreview(simpleAssistant ? '找到一位可以帮助你的专家，将由它接着处理。' : '只有一个有效候选，已根据其发布版本完成模拟转交。'); return }
      setPreview(matches.length ? simpleAssistant ? '这些专家或专家团可以帮助你，请选择一个继续。' : '找到多个有权使用的候选，请选择承接对象。' : config.assistant.noMatch)
      return
    }
    setPreview(a.kind === 'team' ? '专家团引用与业务工具可用性核对通过。由固定队长版本组织协作，当前只展示模拟承接，没有调用成员或执行外部动作。' : '已接收测试目标。此处展示固定样例，不执行真实问答或外部动作。')
  }
  if (simpleAssistant) {
    const gates = releaseIssues(state, a)
    const setupIssues = gates.filter(issue => !issue.includes('固定样例') && !issue.includes('无需重复发布'))
    return <div className="assistant-trial">
      <Notice>本地原型：展示接待流程和固定检查样例。真实问答效果需接入模型后试用。</Notice>
      <Section title="1. 试着说一句话" description="看看助理如何打招呼、推荐专家，或在无法处理时给出提示。试用不会让修改生效。">
        <p className="campus-hint">以当前演示人员 {people.find(p => p.id === user)?.name} 的专家使用权限试用。</p>
        <div className="assistant-conversation">
          <div className="assistant-message"><strong>{config.name}</strong><p>{config.opening || '尚未设置开场白，师生可以直接提问。'}</p></div>
          <div className="campus-inline campus-wrap" aria-label="试用示例">{[['normal', '找专家办事', '安排会议并整理纪要'], ['no-match', '找不到合适专家时', '帮我处理这件事'], ['dependency', '模型暂时不可用时', '请帮我安排会议']].map(([value, label, example]) => <Button key={value} aria-pressed={scenario === value} onClick={() => { setScenario(value); setInput(example) }}>{label}</Button>)}</div>
          <Field label="输入想对助理说的话"><textarea rows={3} placeholder="例如：帮我安排会议并整理纪要" value={input} onChange={event => setInput(event.target.value)} /></Field>
          <Button variant="primary" disabled={dirty || busy || !editable || !input.trim()} onClick={simulate}>发送（模拟）</Button>
          {preview && <div className="assistant-message" role="status"><strong>助理的处理结果 · 模拟</strong><p>{preview}</p>
            {(candidates.length > 1 || !chosen) && candidates.map(candidate => <div className="assistant-candidate" key={candidate.id}><Button disabled={!!chosen} onClick={() => setChosen(candidate.id)}>{candidate.name}</Button><p>{candidate.description}</p></div>)}
            {chosen && <Notice tone="success">将由「{candidates.find(candidate => candidate.id === chosen)?.name}」接着处理（模拟）。本次没有发起真实工作。</Notice>}
          </div>}
        </div>
        {dirty && <Notice tone="warning">有未保存的修改，保存后即可试用。<Button disabled={busy || !editable} onClick={() => void saveDraft()}>保存修改</Button></Notice>}
        {!editable && <p className="campus-hint">当前身份只能查看；请由平台管理员操作试用和生效。</p>}
      </Section>
      {hasChanges(a) || dirty ? <Section title="2. 让这次修改生效" description={a.live ? `师生目前使用第 ${a.live} 版设置。检查并确认后，新发起的对话和工作才会使用这次修改。` : '完成检查并确认后，师生才可以开始使用助理。'}>
        <div className="assistant-readiness"><div><strong>{dirty ? '先保存修改' : hasChanges(a) ? '修改已保存，尚未生效' : '已是当前生效的设置'}</strong><p>{dirty ? '保存后需要重新检查。' : latest ? `${latest.passed} / ${latest.total} 项样例通过（模拟）${latest.passed === latest.total ? '，可以继续核对生效条件。' : '，请处理失败项后重新检查。'}` : '还没有这份设置的检查结果。修改设置后需要重新检查。'}</p></div>
          <Button disabled={!editable || busy || dirty || running || !hasChanges(a)} onClick={() => void runSamples()}>{running ? '检查中…' : latest ? '重新检查（模拟）' : '检查这次修改（模拟）'}</Button>
        </div>
        {latest?.failures.length ? <Notice tone="error"><ul>{latest.failures.map(f => <li key={f}>{f}</li>)}</ul><p>本次检查未通过，当前生效的设置未改变。</p></Notice> : null}
        {runError && <Notice tone="error">{runError}</Notice>}
        {setupIssues.length > 0 && <div className="campus-inset"><h3>还需要处理</h3><ul>{setupIssues.map(issue => <li key={issue}><button className="campus-issue-link" onClick={() => onIssue?.(issue)}>{issue}</button></li>)}</ul></div>}
        <details className="assistant-details"><summary>查看检查内容与演示选项</summary><p className="campus-hint">以下是固定样例，不代表真实质量检测结果。</p><ul>{sampleSet.cases.map(sample => <li key={sample}>{sample}</li>)}</ul><SelectField label="演示检查结果" value={pass ? 'pass' : 'fail'} options={[{ value: 'pass', label: '检查通过的样例' }, { value: 'fail', label: '检查失败的样例' }]} disabled={!editable || busy || running} onChange={value => setPass(value === 'pass')} /></details>
        <div className="campus-savebar"><span>{!canPublish(actor, a) ? '当前身份不能让设置生效' : !hasChanges(a) ? '没有等待生效的修改' : dirty ? '先保存，再检查' : gates.length ? '完成以上检查后可继续' : '检查已完成，等待你确认'}</span><Button variant="primary" disabled={!canPublish(actor, a) || busy || running || dirty || gates.length > 0} onClick={publish}>{a.pending?.failed ? '重试让修改生效' : '让修改生效'}</Button></div>
      </Section> : <Section title="当前设置已生效" description={`师生目前使用第 ${a.live} 版设置，没有等待生效的修改。${editable ? '可以继续在上方试用；需要调整时，点击顶部“修改当前设置”。' : '当前身份可查看设置与使用范围。'}`} children={null} />}
    </div>
  }
  return <div className="campus-test-layout"><div><Section title="固定样例检查" description="发布前为当前保存配置生成并复核模拟报告。">
    <Notice>结果来自本地固定样例，不调用模型或业务系统，不代表真实评估通过。</Notice>
    <SelectField label="关联测试集" value={config.testSet} options={Object.entries(evaluationSets).map(([value, entry]) => ({ value, label: entry.name }))} disabled={!editable || !hasChanges(a) || !!a.pending || busy || running || a.kind === 'team'} onChange={value => onTestSetChange(value as Config['testSet'])} />
    <p className="campus-hint">报告关联保存时的草稿摘要。提示词、输入输出、能力或团队引用变化后，旧报告仍保留并标记配置变化。</p>
    <ol className="campus-test-cases">{sampleSet.cases.map((sample, index) => <li key={sample}><strong>样例 {index + 1}</strong><p>{sample}</p></li>)}</ol>
    <section className="campus-inset"><h3>演示结果设置</h3><SelectField label="模拟测试结果" value={pass ? 'pass' : 'fail'} options={[{ value: 'pass', label: '通过样例 · 5 / 5' }, { value: 'fail', label: '失败样例 · 2 / 5' }]} disabled={busy || running} onChange={value => setPass(value === 'pass')} /><p className="campus-hint">此开关仅切换固定样例，实际质量需要真实环境评估。</p></section>
    {dirty && <Notice tone="warning">当前有未保存修改。保存后可为此配置生成模拟报告。<Button disabled={!editable || busy || running} onClick={() => void saveDraft()}>保存草稿后测试</Button></Notice>}
    <div className="campus-inline campus-wrap"><Button variant="primary" disabled={!editable || dirty || busy || running} onClick={() => void runSamples()}>{running ? '正在生成模拟报告…' : '运行 5 个固定样例'}</Button><span className="campus-hint">{running ? '正在记录样例结果' : latest ? `当前配置：${latest.passed} / ${latest.total}（模拟）` : '当前配置尚无模拟报告'}</span></div>
    {running && <progress aria-label="模拟报告生成进度" max={5} />}
    {runError && <Notice tone="error">{runError}</Notice>}
  </Section><Section title="模拟报告" description="保存与当前、历史配置关联的结果，可重新演示。">
    {reports.length ? reports.map(report => <article className="campus-inset" key={reportId(report)} aria-label={`模拟报告 ${formatTime(report.at)}`}>
      <div className="campus-row"><strong>{report.passed} / {report.total} 项通过（模拟）</strong><Tag>{report.digest === currentDigest ? '对应当前配置' : '配置已变化'}</Tag></div>
      <p className="campus-hint">{formatTime(report.at)} · {report.reviewer}</p>
      {report.failures.length > 0 ? <ul>{report.failures.map(failure => <li className="campus-error-text" key={failure}>{failure}</li>)}</ul> : <p>固定样例全部通过，仅用于展示报告。</p>}
      {report.digest !== currentDigest && <p className="campus-hint">这份报告不能说明当前配置的行为；需要时重新运行样例。</p>}
      {onReport && report.id && <Button onClick={() => onReport(report.id!)}>查看模拟报告</Button>}
    </article>) : <p className="campus-hint">尚无模拟报告。完善配置后运行样例，再继续发布。</p>}
  </Section></div><aside><Section title={a.kind === 'assistant' ? '助理匹配调试' : '简洁调试'} description="使用保存的配置与当前有效权限演示承接结果。">
    <SelectField label="模拟使用人" value={user} options={people.filter(person => person.id === (people.find(p => p.department === actor.department)?.id ?? 'lin')).map(person => ({ value: person.id, label: `${person.name} · ${person.department}` }))} onChange={setUser} />
    <Field label="测试目标"><textarea placeholder="例如：安排会议、整理会议纪要" value={input} onChange={event => setInput(event.target.value)} rows={4} /></Field>
    <section className="campus-inset"><h3>异常样例</h3><SelectField label="调试场景" value={scenario} options={[{ value: 'normal', label: '按目标和当前权限匹配' }, { value: 'no-match', label: '无匹配 / 信息缺失' }, { value: 'dependency', label: '校内依赖不可用' }]} onChange={setScenario} /></section>
    <div className="campus-inline campus-wrap"><Button variant="primary" disabled={dirty || busy || !editable} onClick={simulate}>运行交互模拟</Button><Button onClick={() => { setScenario('normal'); setPreview(''); setCandidates([]); setChosen('') }}>重置调试样例</Button></div>
    {dirty && <p className="campus-hint">保存当前修改后即可运行调试。</p>}
    {preview && <div className="campus-simulation" role="status"><Tag>本地交互模拟</Tag><p>{preview}</p>
      {(candidates.length > 1 || !chosen) && candidates.map(candidate => <div key={candidate.id}><Button disabled={!!chosen} onClick={() => setChosen(candidate.id)}>{candidate.name}</Button><p className="campus-hint">v{candidate.version} · {candidate.description}</p></div>)}
      {chosen && <Notice tone="success">已转交「{candidates.find(candidate => candidate.id === chosen)?.name}」v{candidates.find(candidate => candidate.id === chosen)?.version}（模拟）；未创建生产任务。</Notice>}
    </div>}
  </Section></aside></div>
}
