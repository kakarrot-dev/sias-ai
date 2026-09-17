import { useEffect, useRef, useState } from 'react'
import { Button } from '../components'
import { models, personName, type Config } from './model'
import { fallbackReplies, previewActions, resourceNames } from './expert-resources'

type Turn = { question: string; response: string; pending: boolean; trace: string[]; action?: ReturnType<typeof previewActions>[number] }
export function ExpertDebug({ config: c }: { config: Config }) {
  const [resultMode, setResultMode] = useState('normal'); const [message, setMessage] = useState(''); const [turns, setTurns] = useState<Turn[]>([]); const [actionKey, setActionKey] = useState('')
  const previous = useRef(JSON.stringify(c)); const transcript = useRef<HTMLDivElement>(null)
  const actions = previewActions(c)
  const p = c.expert!
  const ready = !!c.prompt.trim() && models.some(m => m.id === c.model && m.active)
  const busy = turns.some(turn => turn.pending)
  const full = turns.length >= (p.maxRounds ?? 50)
  const name = c.name || '你的专家智能体'
  const greeting = (c.opening || `你好，我是${name}${c.description ? `，${c.description}` : '。告诉我你想完成什么事。'}`).replaceAll('{用户名}', '林晓').replaceAll('{{user.name}}', '林晓').replaceAll('{{用户姓名}}', '林晓')
  useEffect(() => { const next = JSON.stringify(c); if (previous.current !== next) { previous.current = next; setTurns([]); setActionKey('') } }, [c])
  useEffect(() => { transcript.current?.scrollTo?.({ top: transcript.current.scrollHeight, behavior: 'smooth' }) }, [turns])
  const send = (question = message) => {
    if (!ready || busy || full || !question.trim()) return
    const action = resultMode === 'normal' ? actions.find(a => a.key === actionKey) : undefined
    const trace = [`采用当前表单配置：${models.find(m => m.id === c.model)?.name}，提示词 ${c.prompt.length} 字。`, ...resourceNames(c, 'skill').map(name => `可参考技能：${name}。`), ...(action ? [`演示操作：${action.name}；参数为界面示例。`] : ['仅展示对话样式，本次未选择演示工具。'])]
    setTurns(current => [...current, { question: question.trim(), action, trace, pending: !!action?.needsConfirmation, response: resultMode === 'unknown' ? `操作结果未知：${c.definition?.runtime.unknownResult === 'stop_and_handoff' ? '停止后续调用并转人工核验' : '先核验原动作，无法确认则转人工'}。接管人：${personName(c.definition?.governance.handoffOwner ?? c.owner)}。保留原动作标识与已有回执，不重新发送。` : resultMode === 'timeout' ? `达到运行限制，停止后续调用。保留已完成结果与未完成事项，交给${personName(c.definition?.governance.handoffOwner ?? c.owner)}处理。上限：${c.limits.steps} 次模型调用、${c.limits.minutes} 分钟。` : resultMode === 'unanswered' ? p.unansweredReply || fallbackReplies.unanswered : resultMode === 'error' ? p.errorReply || fallbackReplies.error : action?.needsConfirmation ? '请先核对本次操作。' : p.replyLanguage === 'en' ? 'This is a preview response. Your agent will answer according to the instructions you configure.' : '这里将展示专家的回复。正式运行时会结合身份配置与所选 Skill 处理问题，并提供相应结果。' }]); setMessage('')
  }
  const resolve = (confirmed: boolean) => setTurns(current => current.map(turn => turn.pending ? { ...turn, pending: false, response: confirmed ? '已确认，本次模拟流程结束。未调用工具或修改业务数据。' : '已取消本次操作，可以修改需求后再试。', trace: [...turn.trace, confirmed ? '用户确认 → 展示模拟完成状态。' : '用户取消 → 不执行操作。'] } : turn))
  return <section className="expert-debug-panel" aria-label="调试对话">
    <header><div><strong>当前配置 · 模拟运行</strong><span>无需先保存，关闭后可继续编辑</span></div><Button variant="ghost" onClick={() => { setTurns([]); setMessage('') }}>清空对话</Button></header>
    <div className="expert-preview-agent"><span className="expert-preview-avatar" style={{ background: p.iconColor }}>{p.iconStyle === 'upload' && p.iconImage ? <img src={p.iconImage} alt="" /> : p.iconStyle === 'letter' ? name.slice(0, 1) : c.icon}</span><div><h2>{name}</h2><p>{c.description || '填写简介，说明专家能帮用户做什么'}</p></div></div>
    <div className="expert-preview-conversation" ref={transcript} aria-live="polite">
      <p className="expert-chat-bubble">{greeting}</p>
      {!!p.questions.filter(q => q.trim()).length && <div className="expert-preview-questions">{p.questions.filter(q => q.trim()).map((q, i) => <button key={i} disabled={!ready || busy || full} onClick={() => send(q)}>{q}<span>↗</span></button>)}</div>}
      {turns.map((turn, index) => <article key={index} className="expert-preview-turn"><p className="expert-chat-bubble is-user">{turn.question}</p><div className="expert-preview-trace"><strong>过程示意</strong>{turn.trace.map((line, i) => <p key={i}>{line}</p>)}</div><p className="expert-chat-bubble">{turn.response}</p>{turn.pending && <div className="expert-preview-confirm" aria-label="操作确认卡"><strong>{turn.action!.name}</strong><dl>{turn.action!.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.key === 'goal' ? turn.question : field.example}</dd></div>)}</dl><p>仅演示确认交互</p><Button onClick={() => resolve(false)}>取消操作</Button><Button variant="primary" onClick={() => resolve(true)}>确认操作</Button></div>}</article>)}
    </div>
    <div className="expert-preview-composer">
      <label className="expert-preview-action">结果示例<select aria-label="调试结果示例" value={resultMode} disabled={busy} onChange={e => setResultMode(e.target.value)}><option value="normal">正常回复</option><option value="unanswered">无法回答</option><option value="error">系统异常</option><option value="unknown">写操作结果未知</option><option value="timeout">执行超限</option></select></label>
      {!!actions.length && resultMode === 'normal' && <label className="expert-preview-action">体验工具流程<select aria-label="调试工具" value={actionKey} disabled={busy} onChange={e => setActionKey(e.target.value)}><option value="">仅对话</option>{actions.map(action => <option key={action.key} value={action.key}>{action.name}{action.needsConfirmation ? ' · 先确认' : ''}</option>)}</select></label>}
      {c.interaction!.input.modalities.some(m => m !== 'text') && <p className="expert-preview-file">可附加：{c.interaction!.input.modalities.filter(m => m !== 'text').map(m => ({ document: '文档', spreadsheet: '表格', image: '图片', audio: '音频' })[m]).join('、')}</p>}
      <form onSubmit={e => { e.preventDefault(); send() }}><textarea aria-label="调试消息" value={message} disabled={!ready || busy || full} rows={2} onChange={e => setMessage(e.target.value)} placeholder={!ready ? '请先填写模型和系统提示词' : busy ? '请先确认或取消上方操作' : full ? '已达对话轮次上限，请清空后开始新对话' : '输入一句话，体验对话界面'} /><Button type="submit" variant="primary" disabled={!ready || busy || full || !message.trim()}>发送</Button></form>
      <small>仅展示交互样式，不调用模型或工具。未保存的配置仅用于本次调试。</small>
    </div>
  </section>
}
