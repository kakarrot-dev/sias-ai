import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash } from 'iconoir-react'
import { Button, IconButton } from './components'
import { changeFieldKind, fieldExample, fieldKind, fieldKinds, fieldsSchema, formExamples, type FieldKind } from './form-contract'
import { FormFields } from './FormFields'
import type { ContractField } from './shared'
import './AgentForms.css'

export function ContractFields({ label, fields, onChange }: { label: string; fields: ContractField[]; onChange: (fields: ContractField[]) => void }) {
  const [example, setExample] = useState('report')
  const id = useId()
  const limit = label === '补充' ? 6 : 20
  const patch = (index: number, value: Partial<ContractField>) => onChange(fields.map((f, i) => i === index ? { ...f, ...value } : f))
  const move = (index: number, delta: number) => { const next = [...fields]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; onChange(next) }
  return <div className="contract-fields" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement) event.preventDefault() }}>
    <div className="section-heading"><div><h3>{label}字段 <span className="muted">{fields.length} / {limit}</span></h3><p>{label === '补充' ? '预设常见追问，用于演示运行中补充信息。只询问入口中没有的内容。' : '定义用户看到的字段，按顺序展示；可从常用场景开始。'}</p></div><Button icon={Plus} disabled={fields.length >= limit} onClick={() => onChange([...fields, { key: '', label: '', type: 'string', required: true }])}>添加{label}字段</Button></div>
    {!fields.length && <div className="form-starter"><p>{label === '输出' ? '选择场景填入一组字段，再按业务需要调整。' : label === '补充' ? '没有预设补充字段时，不演示运行中追问。' : '不定义字段时，用户直接提供文字材料。'}</p><div className="row-actions"><select aria-label={`${label}字段示例`} value={example} onChange={e => setExample(e.target.value)}>{formExamples.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><Button onClick={() => { const t = formExamples.find(t => t.id === example)!; onChange(structuredClone(label === '输出' ? t.outputs : label === '补充' ? t.followUp : t.inputs)) }}>填入{label}示例</Button></div></div>}
    <div className="form-definition-list">{fields.map((f, i) => <div className="form-definition" key={i}>
      <div className="form-definition-head"><span className="form-index">{i + 1}</span><strong>{f.label || '新字段'}</strong><label className="form-required"><input aria-label={`${label}字段 ${i + 1} 必填`} type="checkbox" checked={f.required} onChange={e => patch(i, { required: e.target.checked })} />必填</label><IconButton label={`上移${label}字段 ${i + 1}`} icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} /><IconButton label={`下移${label}字段 ${i + 1}`} icon={ArrowDown} disabled={i === fields.length - 1} onClick={() => move(i, 1)} /><IconButton label={`移除${label}字段 ${i + 1}`} icon={Trash} onClick={() => onChange(fields.filter((_, n) => n !== i))} /></div>
      <div className="form-definition-main">
        <label>显示名称<input aria-label={`${label}字段 ${i + 1} 含义`} value={f.label} maxLength={200} placeholder="如任务名称" onChange={e => patch(i, { label: e.target.value })} /></label>
        <label>填写方式<select aria-label={`${label}字段 ${i + 1} 类型`} value={fieldKind(f)} onChange={e => onChange(fields.map((item, n) => n === i ? changeFieldKind(item, e.target.value as FieldKind) : item))}>{Object.entries(fieldKinds).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label>字段标识<input aria-label={`${label}字段 ${i + 1} 名称`} value={f.key} maxLength={40} placeholder="如 task_name" onChange={e => patch(i, { key: e.target.value })} /></label>
      </div>
      {(f.widget === 'select' || f.type === 'array') && <label className="form-options-editor">可选内容 <small>每行一个，最多 30 个；顺序即展示顺序。</small><textarea aria-label={`${label}字段 ${i + 1} 选项`} rows={3} maxLength={3000} value={f.options?.join('\n') ?? ''} onChange={e => patch(i, { options: e.target.value.split('\n') })} /></label>}
      <details className="form-field-details"><summary>填写提示{f.type === 'number' ? '与数字范围' : ''}</summary><label>辅助说明<input aria-label={`${label}字段 ${i + 1} 提示`} value={f.help ?? ''} maxLength={200} placeholder="选填，说明用户应如何填写" onChange={e => patch(i, { help: e.target.value })} /></label>{f.type === 'number' && <div className="form-range">{(['minimum', 'maximum'] as const).map(key => <label key={key}>{key === 'minimum' ? '最小值' : '最大值'}<input aria-label={`${label}字段 ${i + 1} ${key === 'minimum' ? '最小值' : '最大值'}`} type="number" value={f[key] ?? ''} onChange={e => patch(i, { [key]: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>)}</div>}</details>
    </div>)}</div>
    {!!fields.length && <><details className="prompt-disclosure"><summary>查看{label}表单样式</summary><FormFields fields={fields} values={fieldExample(fields)} prefix={`${id}预览`} readOnly /></details><details className="prompt-disclosure"><summary>查看{label} JSON Schema</summary><pre className="prompt-display">{JSON.stringify(fieldsSchema(fields), null, 2)}</pre></details></>}
  </div>
}
