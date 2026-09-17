import { useRef, useState } from 'react'
import { Button, Field, Notice } from '../components'
import { attachmentIssues, empty, fieldApplies, initialInputValues, inputIssues, peopleDirectory, roomDirectory, type InputField, type InteractionConfig } from './interaction-model'

export function DirectoryControl({ field, value, onChange, disabled = false }: { field: InputField; value: unknown; onChange: (value: unknown) => void; disabled?: boolean }) {
  const [query, setQuery] = useState(''); const directory = field.type === 'room' ? roomDirectory : peopleDirectory; const multiple = field.type === 'person_list'
  const chosen = multiple ? Array.isArray(value) ? value : [] : value ? [value] : []
  const rows = directory.filter(p => `${p.name} ${p.detail} ${p.id}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="interaction-directory"><Field label={`搜索${field.label}`}><input value={query} disabled={disabled} onChange={e => setQuery(e.target.value)} placeholder="搜索名称、部门或标识" /></Field>{chosen.length > 0 && <div className="interaction-selected">已选：{chosen.map(key => <Button variant="ghost" key={String(key)} disabled={disabled} onClick={() => onChange(multiple ? chosen.filter(v => v !== key) : '')}>{directory.find(p => p.id === key)?.name ?? String(key)} · 移除</Button>)}</div>}<div className="interaction-directory-options">{rows.map(p => <label className="campus-check" key={p.id}><input type={multiple ? 'checkbox' : 'radio'} name={`directory-${field.id}`} checked={chosen.includes(p.id)} disabled={disabled || !p.active || multiple && !chosen.includes(p.id) && chosen.length >= (field.maxItems ?? 100)} onChange={e => onChange(multiple ? e.target.checked ? [...chosen, p.id] : chosen.filter(key => key !== p.id) : p.id)} /><span>{p.name}<small>{p.detail} · {p.id}</small></span></label>)}</div>{!rows.length && <Notice>没有匹配对象。调整搜索词，原选择仍保留。</Notice>}</div>
}
export function ValueControl({ field: f, value, onChange, disabled, config }: { field: InputField; value: unknown; onChange: (value: unknown) => void; disabled: boolean; config: InteractionConfig }) {
  if (['person', 'person_list', 'room'].includes(f.type)) return <DirectoryControl field={f} value={value} onChange={onChange} disabled={disabled} />
  if (f.type === 'datetime_range') return <div className="form-grid">{[0, 1].map(index => <Field key={index} label={`${f.label}${index ? '结束' : '开始'}`}><input type="datetime-local" value={Array.isArray(value) ? value[index] ?? '' : ''} disabled={disabled} onInput={e => { const next = Array.isArray(value) ? [...value] : ['', '']; next[index] = e.currentTarget.value; onChange(next) }} onChange={e => { const next = Array.isArray(value) ? [...value] : ['', '']; next[index] = e.target.value; onChange(next) }} /></Field>)}</div>
  if (f.type === 'multi_enum') return <div role="group" aria-label={f.label}><strong>{f.label}</strong>{f.options.map(option => <label className="campus-check" key={option}><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} disabled={disabled} onChange={e => onChange(e.target.checked ? [...(Array.isArray(value) ? value : []), option] : (Array.isArray(value) ? value : []).filter(v => v !== option))} />{option}</label>)}</div>
  if (f.type === 'enum' || f.type === 'boolean') return <Field label={f.label}><select disabled={disabled} value={empty(value) ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? '' : f.type === 'boolean' ? e.target.value === 'true' : e.target.value)}><option value="">请选择</option>{(f.type === 'boolean' ? [['true', '是'], ['false', '否']] : f.options.map(v => [v, v])).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
  if (f.type === 'file') return <InlineFileControl field={f} value={value} config={config} onChange={onChange} disabled={disabled} />
  if (f.type === 'long_text') return <Field label={f.label}><textarea disabled={disabled} value={String(value ?? '')} placeholder={f.example || undefined} maxLength={f.maxLength ?? 5000} onChange={e => onChange(e.target.value)} /></Field>
  return <Field label={f.label}><input disabled={disabled} value={typeof value === 'number' || typeof value === 'string' ? value : ''} type={f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'number' : 'text'} min={f.minimum} max={f.maximum} onInput={f.type === 'datetime' ? e => onChange(e.currentTarget.value) : undefined} placeholder={f.example || undefined} maxLength={f.maxLength ?? 5000} onChange={e => onChange(f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} /></Field>
}
function InlineFileControl({ field, value, config, onChange, disabled }: { field: InputField; value: unknown; config: InteractionConfig; onChange: (value: unknown) => void; disabled: boolean }) {
  const [errors, setErrors] = useState<string[]>([])
  return <div>{typeof value === 'object' && value !== null && 'name' in value && <p className="campus-hint">已选择：{String(value.name)}<Button variant="ghost" disabled={disabled} onClick={() => { onChange(''); setErrors([]) }}>移除附件</Button></p>}<Field label={field.label} hint="按当前附件限制校验，只在本次预览记录文件名"><input type="file" aria-label={field.label} disabled={disabled} onChange={e => { const file = e.target.files?.[0]; const issues = attachmentIssues(file ? [{ name: file.name, size: file.size }] : [], config); setErrors(issues); onChange(file && !issues.length ? { name: file.name, size: file.size } : '') }} /></Field>{errors.map(error => <Notice key={error} tone="error">{error}</Notice>)}</div>
}
/** Shared, local-only form rendered directly from the saved input contract. */
export function UserInputForm({ config }: { config: InteractionConfig }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initialInputValues(config))
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [started, setStarted] = useState(config.input.entryMode === 'form')
  const [message, setMessage] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const fields = config.input.fields
  const visible = fields.filter(field => fieldApplies(field, values, fields) && (started || config.input.entryFields.includes(field.key) || field.requirement === 'conditional'))
  const update = (field: InputField, value: unknown) => {
    setValues(current => {
      const next = { ...current, [field.key]: value }
      for (const other of fields) if (!fieldApplies(other, next, fields)) delete next[other.key]
      return next
    })
    setConfirmed(current => current.filter(key => key !== field.key)); setErrors([])
  }
  const submit = () => {
    const issues = inputIssues(config, values, confirmed)
    if (!fields.length && !message.trim()) issues.push('请填写任务信息')
    setStarted(true); setErrors(issues)
    if (!issues.length) setSubmitted(true)
    else requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[role="alert"]')?.focus())
  }
  const display = (field: InputField, value: unknown): string => {
    if (empty(value)) return '未填写'
    if (Array.isArray(value)) return value.map(item => display(field, item)).join('、')
    if (typeof value === 'boolean') return value ? '是' : '否'
    if (typeof value === 'object' && value && 'name' in value) return String(value.name)
    return [...peopleDirectory, ...roomDirectory].find(person => ['person', 'person_list', 'room'].includes(field.type) && person.id === value)?.name ?? String(value)
  }
  return <form ref={form} className="user-input-form" noValidate onSubmit={event => { event.preventDefault(); submit() }}>
    <h3>{config.input.formTitle?.trim() || '填写任务信息'}</h3>
    {config.input.instructions && <p className="user-form-description">{config.input.instructions}</p>}
    {!submitted ? <>
      {(!fields.length || !started && !visible.length) && <Field label="任务信息"><textarea aria-label="任务信息" placeholder="请描述你想完成的事" value={message} onChange={e => { setMessage(e.target.value); setErrors([]) }} /></Field>}
      {visible.map(field => <div className="user-form-item" key={field.id}>
        <div className="user-form-item-meta"><span>{field.requirement === 'optional' ? '选填' : '必填'}{field.requirement === 'conditional' ? ' · 条件已满足' : ''}</span>{field.source !== 'user' && <span>{field.source === 'lookup' ? '从示例目录选择' : '填写后请核对确认'}</span>}</div>
        <ValueControl field={field} value={values[field.key]} config={config} disabled={false} onChange={value => update(field, value)} />
        {field.helpText && <small className="user-form-help">{field.helpText}</small>}
        {field.source === 'agent_prefill' && !empty(values[field.key]) && <label className="campus-check"><input type="checkbox" checked={confirmed.includes(field.key)} onChange={e => setConfirmed(current => e.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} />确认{field.label}无误</label>}
      </div>)}
      {!!errors.length && <div role="alert" tabIndex={-1} className="user-form-errors"><strong>请完善以下信息</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
      <Button type="submit" variant="primary">{config.input.submitLabel?.trim() || '提交输入'}</Button>
    </> : <>
      <Notice tone="success">输入校验通过。以下是本次填写内容，尚未启动智能体。</Notice>
      <dl className="user-input-summary">{message && <><dt>任务信息</dt><dd>{message}</dd></>}{fields.filter(field => fieldApplies(field, values, fields)).map(field => <div key={field.key}><dt>{field.label}</dt><dd>{display(field, values[field.key])}</dd></div>)}</dl>
      <Button onClick={() => setSubmitted(false)}>返回修改输入</Button>
    </>}
  </form>
}
