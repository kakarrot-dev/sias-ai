import { useId, useState, type FormEvent } from 'react'
import { Button } from 'react-aria-components'
import { Check, Page } from 'iconoir-react'

export interface ConversationBrief {
  audience: string
  format: string
  requirements: string
}

export const emptyConversationBrief: ConversationBrief = { audience: '', format: '产品介绍', requirements: '' }

export function ConversationBriefForm({ value, submitted, onChange, onSubmit, onEdit }: { value: ConversationBrief; submitted: boolean; onChange: (value: ConversationBrief) => void; onSubmit: () => void; onEdit: () => void }): React.JSX.Element {
  const id = useId()
  const [audienceError, setAudienceError] = useState(false)
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!value.audience.trim()) {
      setAudienceError(true)
      event.currentTarget.querySelector<HTMLInputElement>('input')?.focus()
      return
    }
    setAudienceError(false)
    onSubmit()
  }
  return <form className="message-brief-form" aria-labelledby={`${id}-title`} onSubmit={submit} noValidate>
    <header className="message-brief-form__header"><span className="message-brief-form__icon"><Page aria-hidden /></span><div><h3 id={`${id}-title`}>补充文档需求</h3><p>告诉我写给谁看，以及你想采用的形式。</p></div></header>
    <fieldset disabled={submitted} aria-label="文档需求">
      <div className="message-brief-form__fields">
        <label htmlFor={`${id}-audience`}>目标读者 <span>必填</span></label>
        <input id={`${id}-audience`} name="audience" required maxLength={100} placeholder="例如：首次了解产品的老师和同学" value={value.audience} aria-invalid={audienceError || undefined} aria-describedby={audienceError ? `${id}-error` : undefined} onChange={(event) => { onChange({ ...value, audience: event.target.value }); if (event.target.value.trim()) setAudienceError(false) }} />
        {audienceError && <p className="message-brief-form__error" id={`${id}-error`} role="alert">请填写目标读者。</p>}
        <label htmlFor={`${id}-format`}>文档形式</label>
        <select id={`${id}-format`} name="format" value={value.format} onChange={(event) => onChange({ ...value, format: event.target.value })}><option>产品介绍</option><option>项目汇报</option><option>使用指南</option></select>
        <label htmlFor={`${id}-requirements`}>补充要求 <span>选填</span></label>
        <textarea id={`${id}-requirements`} name="requirements" rows={3} maxLength={1000} placeholder="篇幅、语气，或希望重点说明的内容" value={value.requirements} onChange={(event) => onChange({ ...value, requirements: event.target.value })} />
      </div>
    </fieldset>
    <footer className="message-brief-form__footer">
      <p role="status">{submitted ? <><Check aria-hidden />已在本次会话记录</> : '示例表单 · 仅在当前会话保存'}</p>
      {submitted ? <Button key="edit" type="button" className="button button--quiet" onPress={onEdit}>修改信息</Button> : <Button key="confirm" type="submit" className="button button--primary">确认信息</Button>}
    </footer>
  </form>
}
