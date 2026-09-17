import { useId } from 'react'
import { fieldValueError, type FormValues } from './form-contract'
import type { ContractField } from './shared'
import './AgentForms.css'

export function displayFormValue(value: unknown) {
  return value === undefined || value === null || value === '' ? '未填写' : typeof value === 'boolean' ? value ? '是' : '否' : Array.isArray(value) ? value.join('、') || '未选择' : String(value)
}
export function FormFields({ fields, values, onChange, prefix = '', readOnly = false, errors = false }: { fields: ContractField[]; values: FormValues; onChange?: (values: FormValues) => void; prefix?: string; readOnly?: boolean; errors?: boolean }) {
  const id = useId()
  return <div className="rendered-form">{fields.map((f, index) => {
    const value = Object.hasOwn(values, f.key) ? values[f.key] : undefined
    const error = errors ? fieldValueError(f, value) : undefined
    const inputId = `${id}-${index}`
    const update = (v: unknown) => { const next = { ...values }; if (v === undefined) delete next[f.key]; else next[f.key] = v; onChange?.(next) }
    const props = { id: inputId, 'aria-label': `${prefix}${f.label}`, 'aria-required': f.required, 'aria-invalid': !!error, 'aria-describedby': `${inputId}-hint` }
    return <div className={`rendered-field ${readOnly ? 'is-readonly' : ''}`} key={index}>
      <label htmlFor={inputId}>{f.label || '未命名字段'}{f.required && !readOnly && <em>*</em>}</label>
      {readOnly ? <div className="form-readonly-value">{displayFormValue(value)}</div>
        : f.type === 'array' ? <fieldset {...props} className="form-multiselect" tabIndex={-1}><legend className="form-sr-only">{f.label}</legend>{(f.options ?? []).map(option => <label key={option}><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} onChange={e => update(e.target.checked ? [...(Array.isArray(value) ? value : []), option] : (Array.isArray(value) ? value : []).filter(v => v !== option))} />{option}</label>)}</fieldset>
        : f.type === 'boolean' ? <select {...props} value={value === undefined ? '' : String(value)} onChange={e => update(e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>
        : f.widget === 'select' ? <select {...props} value={typeof value === 'string' ? value : ''} onChange={e => update(e.target.value || undefined)}><option value="">请选择</option>{f.options?.map(option => <option value={option} key={option}>{option}</option>)}</select>
        : f.widget === 'textarea' ? <textarea {...props} rows={4} value={typeof value === 'string' ? value : ''} maxLength={5000} onChange={e => update(e.target.value || undefined)} />
        : <input {...props} type={f.type === 'number' ? 'number' : f.widget === 'date' ? 'date' : 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.minimum} max={f.maximum} maxLength={5000} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={e => update(e.target.value === '' ? undefined : f.type === 'number' ? Number(e.target.value) : e.target.value)} />}
      <small id={`${inputId}-hint`} className={error ? 'form-value-error' : 'muted'}>{error ?? f.help}</small>
    </div>
  })}</div>
}
