import { useState, type ReactNode } from 'react'
import { Button, Field, Modal, Notice, Section } from '../components'
import { deleteField, fieldReferences, outputReferences, fieldTypeLabels, id, newInputField, peopleDirectory, inputMethodChoices, outputFormatChoices, validateInteractionConfig, type InputField, type InteractionConfig, type AttachmentLimits } from './interaction-model'
import { InputSetupPreview, OutputSetupPreview } from './InteractionSetupPreview'
import { ValueControl } from './UserInputForm'
import './interaction.css'

type Props = { value: InteractionConfig; onChange: (value: InteractionConfig) => void; disabled?: boolean; formMode?: boolean; children?: ReactNode; settingsErrors?: string[]; livePreview?: boolean; singleUser?: boolean }
function OutputTypeCards({ value, onChange, singleUser = false }: Props) {
  const [singleFormat, setSingleFormat] = useState<InteractionConfig['output']['format']>(value.output.format === 'recipient' ? 'text' : value.output.format)
  const selectFormat = (format: InteractionConfig['output']['format']) => { if (format !== 'recipient') setSingleFormat(format); else if (value.output.format !== 'recipient') setSingleFormat(value.output.format); onChange({ ...value, output: { ...value.output, format, additionalFormats: value.output.additionalFormats?.filter(item => item !== format) } }) }
  return <div className="output-choice-groups">
    {!singleUser && <div role="radiogroup" aria-label="交付方式" className="output-delivery-choice">
      <label className="campus-check"><input type="radio" name="output-delivery" checked={value.output.format !== 'recipient'} onChange={() => selectFormat(singleFormat)} />统一交付成果</label>
      <label className="campus-check"><input type="radio" aria-label="分别交付给多人" name="output-delivery" checked={value.output.format === 'recipient'} onChange={() => selectFormat('recipient')} />分别交付给多人</label>
    </div>}
    {value.output.format === 'recipient' && singleUser && <Notice tone="warning">当前向发起用户返回结果，请选择下方输出格式。</Notice>}
    {value.output.format === 'recipient' && !singleUser ? <p className="campus-hint">为每位接收人准备文字内容，逐人确认后交付。接收人在下方选择。</p> : <div className="output-format-groups" role="radiogroup" aria-label="成果形式">{[
      { label: '对话回复', formats: ['text', 'markdown'] },
      { label: '文件与数据', formats: ['document', 'pdf', 'table', 'json'] },
    ].map(group => <div key={group.label}><h3>{group.label}</h3><div className="interaction-option-cards">{outputFormatChoices.filter(format => group.formats.includes(format.value)).map(format => <label className={`interaction-option-card ${value.output.format === format.value ? 'is-selected' : ''}`} key={format.value}>
      <input type="radio" aria-label={format.label} name="output-format" checked={value.output.format === format.value} onChange={() => selectFormat(format.value)} /><span><strong>{format.label}</strong><span>{format.description}</span></span>
    </label>)}</div></div>)}</div>}
  </div>
}

const inputModes: { value: InteractionConfig['input']['followUp']; label: string; description: string }[] = [
  { value: 'auto', label: '智能选择（推荐）', description: '缺少信息时，智能体会通过对话提问或显示表单，请用户补充。' },
  { value: 'text', label: '优先对话', description: '优先在对话中逐项询问；日期、选项等内容仍可直接选择。' },
  { value: 'form', label: '集中填表', description: '把需要补充的内容放在一张表单中，让用户一起填写。' },
]

export function InputEditor({ value, onChange, disabled = false, children, settingsErrors = [], livePreview = false }: Props) {
  const [preview, setPreview] = useState(false)
  const [showLegacyChoice] = useState(value.input.followUp === 'choice')
  const patch = (input: Partial<InteractionConfig['input']>) => onChange({ ...value, input: { ...value.input, ...input } })
  const hasFiles = value.input.modalities.some(m => ['text', 'document', 'spreadsheet', 'image'].includes(m))
  const hasAudio = value.input.modalities.includes('audio')
  const modeDescription = inputModes.find(mode => mode.value === value.input.followUp)?.description ?? '保留已有的优先选项设置；新配置可在具体问题中选择单选或多选。'
  const fileLimitError = settingsErrors.some(error => /附件限制 (fileMB|count|totalMB)/.test(error))
  const audioLimitError = settingsErrors.some(error => /附件限制 (audioMB|audioMinutes)/.test(error))
  const uploadError = fileLimitError || audioLimitError
  const thresholdError = settingsErrors.some(error => /表单阈值/.test(error))
  const collectionError = thresholdError || settingsErrors.some(error => /缺少必要输入|missingInput/.test(error))
  const fileSummary = hasFiles ? `单份 ${value.input.attachments.fileMB} MB · 最多 ${value.input.attachments.count} 份 · 合计 ${value.input.attachments.totalMB} MB` : ''
  const audioSummary = hasAudio ? `录音 1 份 · ${value.input.attachments.audioMinutes} 分钟 · ${value.input.attachments.audioMB} MB` : ''
  return <div className={`interaction-editor interaction-input-editor ${livePreview ? 'input-designer-layout' : ''}`}>
    <fieldset className="campus-fieldset" disabled={disabled}>
      <div className="input-entry-setting"><h3>用户如何开始</h3><div className="input-entry-options" role="radiogroup" aria-label="开始方式">{[
        ['conversation', '先对话，按需补充', '用户先描述需求，缺少信息时再询问。'],
        ['form', '先填写表单', '展示你配置的表单，信息齐全后开始任务。'],
      ].map(([mode, label, description]) => <label className={`interaction-option-card ${(value.input.entryMode ?? 'conversation') === mode ? 'is-selected' : ''}`} key={mode}><input type="radio" name="entry-mode" aria-label={label} checked={(value.input.entryMode ?? 'conversation') === mode} onChange={() => patch({ entryMode: mode as 'form' | 'conversation' })} /><span><strong>{label}</strong><span>{description}</span></span></label>)}</div></div>
      <div className="interaction-setting-group" role="group" aria-label="用户填写">
        <div className="interaction-group-label interaction-form-heading"><div><h3>表单内容</h3><p>设置用户需要提供的内容</p></div><Button variant="ghost" onClick={() => setPreview(true)}>预览填写页面</Button></div>
        <div className="interaction-group-content">
          <div className="form-grid"><Field label="表单标题"><input aria-label="表单标题" maxLength={60} value={value.input.formTitle ?? ''} placeholder="填写任务信息" onChange={e => patch({ formTitle: e.target.value })} /></Field><Field label="提交按钮文字"><input aria-label="提交按钮文字" maxLength={20} value={value.input.submitLabel ?? ''} placeholder="提交输入" onChange={e => patch({ submitLabel: e.target.value })} /></Field></div>
          <FieldList value={value} onChange={onChange} disabled={disabled} />
          <Field label="填写提示（选填）" hint="用户填写时会看到这段提示。" className="interaction-input-note"><textarea aria-label="填写提示（选填）" rows={2} maxLength={2000} value={value.input.instructions ?? ''} placeholder="例如：请准备申请材料，并说明用途。" onChange={e => patch({ instructions: e.target.value })} /></Field>
          <div className="interaction-collection-mode"><Field label="填写方式" hint="缺少信息时如何收集"><select aria-label="填写方式" value={value.input.followUp} onChange={e => patch({ followUp: e.target.value as InteractionConfig['input']['followUp'] })}>
            {inputModes.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            {(showLegacyChoice || value.input.followUp === 'choice') && <option value="choice">优先选项（已有设置）</option>}
          </select></Field></div><p className="interaction-mode-description">{modeDescription}</p>
          {(children || value.input.followUp === 'auto' && !!value.input.fields.length || collectionError) && <details className="interaction-collection-rules" open={collectionError || undefined}><summary>信息不完整时<span>设置处理方式{value.input.followUp === 'auto' && value.input.fields.length ? '和填表时机' : ''}</span></summary><div className="interaction-rule-fields">
            {children}
            {(value.input.followUp === 'auto' && !!value.input.fields.length || thresholdError) && <Field label="缺少几项时改用表单" hint="例如设为 2：缺少两项及以上时，合并到表单中填写。"><input aria-label="缺少几项时改用表单" type="number" min={1} max={10} value={value.input.formThreshold} onChange={e => patch({ formThreshold: Number(e.target.value) })} /></Field>}
          </div></details>}
        </div>
      </div>
      <div className="interaction-setting-group" role="group" aria-label="接收资料">
        <div className="interaction-group-label"><h3>接收资料</h3><p>允许用户提供的内容类型</p></div>
        <div className="interaction-group-content">
          <div className="interaction-material-options">{inputMethodChoices.map(method => <label key={method.value} className="interaction-material-option">
            <input type="checkbox" aria-label={method.label} checked={value.input.modalities.includes(method.value)} onChange={e => patch({ modalities: e.target.checked ? [...value.input.modalities, method.value] : value.input.modalities.filter(v => v !== method.value) })} /><span>{method.label}<small>{method.example}</small></span>
          </label>)}</div>
          {(hasFiles || hasAudio || uploadError) && <details className="interaction-upload-rules" open={uploadError || undefined}><summary>上传限制<span>{[fileSummary, audioSummary].filter(Boolean).join('；') || '检查已保存的限制'}</span></summary>
            <div className="interaction-upload-grid">{([...(hasFiles || fileLimitError ? [['fileMB', '每份文档、表格或图片大小（MB）', '单份大小（MB）', 20], ['count', '文档、表格和图片总份数', '最多份数', 10], ['totalMB', '这些资料的合计大小（MB）', '合计大小（MB）', 100]] : []), ...(hasAudio || audioLimitError ? [['audioMB', '每份录音大小（MB）', '录音大小（MB）', 200], ['audioMinutes', '每份录音时长（分钟）', '录音时长（分钟）', 60]] : [])] as [keyof AttachmentLimits, string, string, number][]).map(([key, label, title, max]) => <Field key={key} label={title} hint={`1—${max}`}><input aria-label={label} type="number" min={1} max={max} value={value.input.attachments[key]} onChange={e => patch({ attachments: { ...value.input.attachments, [key]: Number(e.target.value) } })} /></Field>)}</div>
            <p className="campus-hint">文本文件、文档、表格和图片共用一组上限；录音单独计算。</p>
          </details>}
        </div>
      </div>
    </fieldset>
    {livePreview && <aside className="input-designer-preview"><InputSetupPreview value={value} /></aside>}
    {preview && <Modal title="填写页面预览" onClose={() => setPreview(false)}><InputSetupPreview value={value} /><footer><Button onClick={() => setPreview(false)}>返回配置</Button></footer></Modal>}
  </div>
}

export function OutputEditor(props: Props) {
  const { value, onChange, disabled = false } = props
  const examples = { json: '按固定字段输出结构化结果，缺失依据的字段明确说明。', text: '回答简短一些，先给结论，再说明原因。', markdown: '按结论、依据、下一步建议分三段说明。', document: '整理成一份会议纪要，包含会议结论和待办事项。', pdf: '整理成一份便于打印的材料核对报告。', table: '列出事项、负责人、截止时间三列。', recipient: '分别整理每个人需要处理的事情，内容简短清楚。' }
  const example = examples[value.output.format]
  return <div className="interaction-editor interaction-simple-editor">
    <fieldset className="campus-fieldset" disabled={disabled}>
      <Section title="交付什么成果" description="选择主要成果；需要同时提供正文、文件或数据时，再添加附加成果。"><OutputTypeCards value={value} onChange={onChange} singleUser={props.singleUser} />
        {value.output.format !== 'recipient' && <div className="output-additional-formats"><h3>同时交付（可多选）</h3><div className="interaction-actions">{outputFormatChoices.filter(format => format.value !== 'recipient' && format.value !== value.output.format).map(format => <label className="campus-check" key={format.value}><input type="checkbox" aria-label={`同时交付${format.label}`} checked={value.output.additionalFormats?.includes(format.value as NonNullable<InteractionConfig['output']['additionalFormats']>[number]) ?? false} onChange={e => onChange({ ...value, output: { ...value.output, additionalFormats: e.target.checked ? [...value.output.additionalFormats ?? [], format.value as NonNullable<InteractionConfig['output']['additionalFormats']>[number]] : value.output.additionalFormats?.filter(item => item !== format.value) } })} />{format.label}</label>)}</div></div>}
      </Section>
      <Section title="内容与模板" description="写清交付要求；有固定模板时，填写已有模板的引用。">
        <Field label="模板引用（选填）" hint="已有模板的标识或路径；此处保存引用，实际可用性需接入后核验。"><input aria-label="模板引用（选填）" maxLength={500} value={value.output.templateRef ?? ''} placeholder="例如：会议纪要模板 v2" onChange={e => onChange({ ...value, output: { ...value.output, templateRef: e.target.value } })} /></Field>
        <Field label="补充要求"><textarea aria-label="结果内容要求" rows={3} maxLength={5000} value={value.output.requirements} placeholder={example} onChange={e => onChange({ ...value, output: { ...value.output, requirements: e.target.value } })} /></Field>
        {!value.output.requirements && <div className="interaction-simple-example"><span>例如：{example}</span><Button variant="ghost" onClick={() => onChange({ ...value, output: { ...value.output, requirements: example } })}>使用这句</Button></div>}
      </Section>
      {value.output.format === 'recipient' && !props.singleUser && <Section title="内容分别给谁？" description="每份内容都要先确认。这里只选择演示接收人，不会发送消息。">{peopleDirectory.map(person => <label className="campus-check" key={person.id}><input type="checkbox" checked={value.output.recipients.includes(person.id)} disabled={!person.active} onChange={e => onChange({ ...value, output: { ...value.output, recipients: e.target.checked ? [...value.output.recipients, person.id] : value.output.recipients.filter(key => key !== person.id) } })} />{person.name} · {person.detail}</label>)}</Section>}
    </fieldset>
    <OutputRules {...props} />
  </div>
}


function FieldList({ value, onChange, disabled = false, output = false }: Props & { output?: boolean }) {
  const [editing, setEditing] = useState<{ field: InputField; original?: string }>(); const [error, setError] = useState(''); const [removal, setRemoval] = useState<InputField>()
  const fields = output ? value.output.fields : value.input.fields
  const update = (next: InputField[]) => onChange(output ? { ...value, output: { ...value.output, fields: next } } : { ...value, input: { ...value.input, fields: next } })
  const move = (index: number, direction: number) => { const next = [...fields]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; update(next) }
  const remove = (field: InputField) => {
    const refs = output ? outputReferences(value, field.key) : fieldReferences(value, field.key)
    if (!output && refs.length === 1 && refs[0] === '入口表单') { setError(''); setRemoval(field); return }
    try { onChange(deleteField(value, field.key, output)); setError('') } catch { setError(`“${field.label}”还用于${refs.map(ref => ref.replace('条件字段', '条件提问').replace('输出事实比对', '成果核对').replace('入口表单', '开始时填写')).join('、')}。请先调整对应设置，再删除这项信息。`) }
  }
  const addExample = (sample: { label: string; type: InputField['type']; example: string }) => {
    const field = { ...newInputField(fields), ...sample }
    onChange(output ? { ...value, output: { ...value.output, fields: [...fields, field] } } : { ...value, input: { ...value.input, fields: [...fields, field], entryFields: [...value.input.entryFields, field.key] } })
  }
  const samples: { label: string; type: InputField['type']; example: string }[] = output
    ? [{ label: '事项', type: 'text', example: '补充申请材料' }, { label: '负责人', type: 'person', example: '' }, { label: '完成时间', type: 'datetime', example: '' }]
    : [{ label: '办事主题', type: 'text', example: '核对项目申请材料' }, { label: '截止时间', type: 'datetime', example: '' }, { label: '联系人', type: 'person', example: '' }]
  return <div className="interaction-field-list"><div className="interaction-heading"><div><h3>{output ? value.output.format === 'table' ? '表格需要哪些列？' : '固定展示的项目（可选）' : '填写项目'}</h3><small>{fields.length} / 20 项</small></div><Button disabled={disabled || fields.length >= 20} onClick={() => { setError(''); setEditing({ field: newInputField(fields) }) }}>{output ? '添加成果项目' : '添加填写项'}</Button></div>
    <div className="interaction-example-buttons"><span>快速添加：</span>{samples.map(sample => <Button key={sample.label} variant="ghost" disabled={disabled || fields.length >= 20 || fields.some(f => f.label === sample.label)} onClick={() => addExample(sample)}>添加{sample.label}</Button>)}</div>
    {!fields.length ? <p className="interaction-empty-guide">{output ? value.output.format === 'table' ? '例如：每行是一件待办，每列分别写事项、负责人和完成时间。可点击上面的常用示例开始。' : '如果只需要自然语言回答，可以留空；需要固定展示姓名、金额或日期时再添加。' : value.input.followUp === 'form' ? '先添加填写项，例如申请事项、截止时间，再让用户填写表单。' : value.input.followUp === 'choice' ? '添加填写项，并将填写类型设为单选或多选。' : '还没有填写项。用户可以直接描述需求；如需固定收集姓名、日期等内容，请在这里添加。'}</p> : <div className="interaction-fields">{fields.map((field, index) => <article key={field.id} className={output ? undefined : "interaction-input-field"}><div className="interaction-field-info"><strong>{field.label}</strong><small>{fieldTypeLabels[field.type]} · {field.requirement === 'required' ? output ? '必须包含' : '必填' : field.requirement === 'optional' ? '选填' : '条件必填'}{!output && field.source === 'agent_prefill' ? ' · AI 补充后由用户确认' : ''}</small>{field.example && <small>例如：{field.example}</small>}{!output && field.defaultValue !== undefined && <small>默认值：{typeof field.defaultValue === 'boolean' ? field.defaultValue ? '是' : '否' : String(field.defaultValue)}</small>}</div>{!output && <div className="interaction-field-timing">{value.input.entryMode === 'form' ? <span>{field.requirement === 'conditional' ? '条件满足时显示' : '表单中展示'}</span> : field.requirement === 'required' ? <select aria-label={`收集${field.label}的时机`} disabled={disabled} value={value.input.entryFields.includes(field.key) ? 'start' : 'missing'} onChange={e => onChange({ ...value, input: { ...value.input, entryFields: e.target.value === 'start' ? [...new Set([...value.input.entryFields, field.key])] : value.input.entryFields.filter(key => key !== field.key) } })}><option value="start">开始时填写</option><option value="missing">缺少时补充</option></select> : <span>{field.requirement === 'conditional' ? '条件满足时询问' : '按需填写（选填）'}</span>}</div>}
      {output ? <div className="interaction-actions"><Button variant="ghost" disabled={disabled || !index} aria-label={`上移${field.label}`} onClick={() => move(index, -1)}>上移</Button><Button variant="ghost" disabled={disabled || index === fields.length - 1} aria-label={`下移${field.label}`} onClick={() => move(index, 1)}>下移</Button><Button variant="ghost" disabled={disabled} onClick={() => setEditing({ field: structuredClone(field), original: field.key })}>编辑{field.label}</Button><Button variant="ghost" disabled={disabled || fields.length >= 20} onClick={() => setEditing({ field: { ...structuredClone(field), id: id(), key: newInputField(fields).key, label: `${field.label}副本` } })}>复制{field.label}</Button><Button variant="ghost" disabled={disabled} onClick={() => remove(field)}>删除{field.label}</Button></div> : <div className="interaction-actions"><Button variant="ghost" disabled={disabled} aria-label={`编辑${field.label}`} onClick={() => setEditing({ field: structuredClone(field), original: field.key })}>编辑</Button><details className="interaction-field-menu"><summary aria-label={`${field.label}的更多操作`}>更多</summary><div onClick={event => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.parentElement?.removeAttribute('open') }}>
        <Button variant="ghost" disabled={disabled || !index} aria-label={`上移${field.label}`} onClick={() => move(index, -1)}>上移</Button>
        <Button variant="ghost" disabled={disabled || index === fields.length - 1} aria-label={`下移${field.label}`} onClick={() => move(index, 1)}>下移</Button>
        <Button variant="ghost" disabled={disabled || fields.length >= 20} aria-label={`复制${field.label}`} onClick={() => setEditing({ field: { ...structuredClone(field), id: id(), key: newInputField(fields).key, label: `${field.label}副本` } })}>复制</Button>
        <Button variant="ghost" disabled={disabled} aria-label={`删除${field.label}`} onClick={() => remove(field)}>删除</Button>
      </div></details></div>}</article>)}</div>}
    {error && <Notice tone="error">{error}</Notice>}
    {removal && <Modal title="删除这项信息？" onClose={() => setRemoval(undefined)}><p>删除“{removal.label}”时，也会移除开始时对应的提问。其他信息保留。</p><footer><Button onClick={() => setRemoval(undefined)}>取消</Button><Button variant="danger" disabled={disabled} onClick={() => { const next = { ...value, input: { ...value.input, entryFields: value.input.entryFields.filter(key => key !== removal.key) } }; onChange(deleteField(next, removal.key)); setRemoval(undefined) }}>删除信息和对应提问</Button></footer></Modal>}
    {editing && <FieldDialog value={value} field={editing.field} original={editing.original} output={output} disabled={disabled} onClose={() => setEditing(undefined)} onSave={next => { onChange(next); setEditing(undefined) }} />}
  </div>
}

function FieldDialog({ value, field, original, output, disabled, onClose, onSave }: { value: InteractionConfig; field: InputField; original?: string; output: boolean; disabled: boolean; onClose: () => void; onSave: (value: InteractionConfig) => void }) {
  const [draft, setDraft] = useState(field); const [error, setError] = useState<string[]>([]); const [advancedOpen, setAdvancedOpen] = useState(false)
  const patch = (value: Partial<InputField>) => setDraft({ ...draft, ...value })
  const save = () => {
    if (original && original !== draft.key) {
      const refs = output ? outputReferences(value, original) : fieldReferences(value, original)
      if (refs.length) { setAdvancedOpen(true); setError([`更改标识前请先解除引用：${refs.join('、')}`]); return }
    }
    const next = structuredClone(value); const fields = output ? next.output.fields : next.input.fields; const index = fields.findIndex(f => f.key === original)
    const normalized = { ...draft, options: draft.options.map(v => v.trim()).filter(Boolean), ...(draft.requirement !== 'conditional' ? { condition: undefined } : {}) }
    if (index < 0) fields.push(normalized); else fields[index] = normalized
    if (!output) {
      if (!original && draft.requirement === 'required') next.input.entryFields.push(draft.key)
      if (original && draft.requirement !== 'required') next.input.entryFields = next.input.entryFields.filter(key => key !== original)
    }
    const errors = validateInteractionConfig(next); if (errors.length) { if (errors.some(message => /标识|敏感|来源|数值范围|最多选择数|文字长度/.test(message))) setAdvancedOpen(true); setError(errors); return } onSave(next)
  }
  return <div className="interaction-field-dialog"><Modal title={`${original ? '编辑' : '添加'}${output ? '成果项目' : '填写项'}`} onClose={onClose}>
    <div className="interaction-field-dialog-body"><p className="campus-hint">{output ? '告诉专家结果中需要包含什么，例如“负责人”或“完成时间”。' : '设置用户需要填写的一项内容，例如申请事项、截止时间或联系人。'}</p>
    <fieldset className="campus-fieldset" disabled={disabled}>
      <Field label={output ? '这项成果叫什么？' : '填写项名称'} required><input aria-label={output ? '成果项目名称' : '填写项名称'} autoFocus maxLength={100} value={draft.label} placeholder={output ? '例如：检查结论、负责人、完成时间' : '例如：办事主题、截止时间、联系人'} onChange={e => patch({ label: e.target.value })} /></Field>
      <div className="form-grid"><Field label={output ? '用什么方式呈现？' : '填写类型'}><select value={draft.type} onChange={e => patch({ type: e.target.value as InputField['type'], defaultValue: undefined, options: ['enum', 'multi_enum'].includes(e.target.value) && draft.options.length < 2 ? ['选项一', '选项二'] : draft.options })}>{Object.entries(fieldTypeLabels).map(([key, label]) => <option value={key} key={key}>{label}{key === 'text' ? ' · 一句话' : key === 'long_text' ? ' · 一段说明' : key === 'datetime_range' ? ' · 开始和结束时间' : key === 'enum' ? ' · 选一个答案' : key === 'multi_enum' ? ' · 可选多个答案' : ''}</option>)}</select></Field>
      <Field label={output ? '结果必须包含吗？' : '是否必填'}><select value={draft.requirement} onChange={e => patch({ requirement: e.target.value as InputField['requirement'], condition: e.target.value === 'conditional' ? draft.condition ?? { field: '', operator: 'eq', value: '' } : undefined })}><option value="required">{output ? '必须包含' : '必填'}</option><option value="optional">{output ? '可以不包含' : '选填'}</option>{!output && <option value="conditional">满足条件时必填</option>}</select></Field></div>
      {draft.requirement === 'conditional' && draft.condition && <div className="interaction-condition"><Field label="根据哪项回答判断？"><select value={draft.condition.field} onChange={e => patch({ condition: { ...draft.condition!, field: e.target.value } })}><option value="">选择另一项信息</option>{value.input.fields.filter(f => f.key !== original).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field><Field label="什么情况下需要？"><select value={draft.condition.operator} onChange={e => patch({ condition: { ...draft.condition!, operator: e.target.value as NonNullable<InputField['condition']>['operator'] } })}>{[['eq', '答案等于'], ['ne', '答案不等于'], ['in', '答案是其中之一'], ['not_empty', '已经填写'], ['empty', '尚未填写']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>{!['empty', 'not_empty'].includes(draft.condition.operator) && <Field label="对应的答案" hint={draft.condition.operator === 'in' ? '多个答案用英文逗号分隔' : undefined}><input value={draft.condition.value} onChange={e => patch({ condition: { ...draft.condition!, value: e.target.value } })} /></Field>}</div>}
      {['enum', 'multi_enum'].includes(draft.type) && <Field label="可选内容" hint="每行一个选项，至少两个。例如：线上会议、线下会议。"><textarea rows={4} value={draft.options.join('\n')} onChange={e => patch({ options: e.target.value.split('\n') })} /></Field>}
      <Field label="填写示例（选填）" hint="展示给用户参考，例如：核对项目申请材料。"><input aria-label="填写示例" value={draft.example} onChange={e => patch({ example: e.target.value })} /></Field>
      {!output && <Field label="填写说明（选填）"><textarea aria-label="填写说明（选填）" rows={2} maxLength={500} value={draft.helpText ?? ''} placeholder="说明这项信息的用途或填写要求" onChange={e => patch({ helpText: e.target.value })} /></Field>}
      {!output && draft.source === 'user' && draft.type !== 'file' && <div className="field-default-editor"><h3>默认值（选填）</h3><p className="campus-hint">自动带入表单，用户可以修改。填写示例只作提示。</p><ValueControl field={{ ...draft, label: '默认值' }} config={value} disabled={disabled} value={draft.defaultValue} onChange={defaultValue => patch({ defaultValue: defaultValue as InputField['defaultValue'] })} /><Button variant="ghost" disabled={disabled || draft.defaultValue === undefined} onClick={() => patch({ defaultValue: undefined })}>清除默认值</Button></div>}
      {draft.type === 'datetime_range' && <Notice>用户会分别选择开始和结束时间，结束时间须晚于开始时间。</Notice>}
      {draft.type === 'file' && <Notice>请同时在输入页面勾选允许提供的资料类型，例如文档或图片。</Notice>}
      <details className="interaction-field-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>高级设置<span>信息来源、填写限制与内部标识</span></summary>
      {!output && <div className="form-grid"><Field label="信息来源"><select value={draft.source} onChange={e => patch({ source: e.target.value as InputField['source'], defaultValue: undefined })}><option value="user">用户自己填写</option><option value="lookup">从已有名单或目录中查找</option><option value="agent_prefill" disabled={draft.sensitivity === 'high'}>AI 先补充，用户再确认</option></select></Field><Field label="信息敏感程度"><select value={draft.sensitivity} onChange={e => patch({ sensitivity: e.target.value as InputField['sensitivity'] })}><option value="low">普通信息</option><option value="medium">内部信息</option><option value="high">敏感信息</option></select></Field>{draft.source === 'lookup' && <Field label="从哪里查找？"><select value={draft.lookupSource} onChange={e => patch({ lookupSource: e.target.value })}><option value="">请选择</option><option value="people">组织人员名单</option><option value="rooms">场地名单</option></select></Field>}</div>}
      {draft.sensitivity === 'high' && draft.source === 'agent_prefill' && <Notice tone="error">高敏感字段不能使用 AI 推断。请先改为用户自己填写或从已有名单中查找。</Notice>}
      <div className="form-grid">{draft.type === 'number' && <><Field label="允许的最小数字"><input type="number" value={draft.minimum ?? ''} onChange={e => patch({ minimum: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field><Field label="允许的最大数字"><input type="number" value={draft.maximum ?? ''} onChange={e => patch({ maximum: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field></>}{['multi_enum', 'person_list'].includes(draft.type) && <Field label="最多选择数量"><input type="number" min={1} max={100} value={draft.maxItems ?? ''} onChange={e => patch({ maxItems: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>}{['text', 'long_text'].includes(draft.type) && <Field label="最多填写字数"><input type="number" min={1} max={20000} value={draft.maxLength ?? 5000} onChange={e => patch({ maxLength: Number(e.target.value) })} /></Field>}</div>
      <Field label="内部标识" hint="系统自动生成，用于关联其他设置，通常无需修改。"><input aria-label="内部标识" value={draft.key} maxLength={50} onChange={e => patch({ key: e.target.value })} /></Field>
    </details></fieldset>{error.length > 0 && <Notice tone="error"><ul>{error.map(message => <li key={message}>{message}</li>)}</ul></Notice>}</div><footer><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={disabled} onClick={save}>{output ? '保存成果项目' : '保存填写项'}</Button></footer></Modal></div>
}

function OutputRules({ value, onChange, disabled = false }: Props) {
  const patch = (output: Partial<InteractionConfig['output']>) => onChange({ ...value, output: { ...value.output, ...output } })
  return <div className="interaction-editor"><fieldset className="campus-fieldset" disabled={disabled}>

    <Section title="内容需要怎样组织？" description="可选。没有固定格式时，智能体会按内容自行组织；有固定报告格式或表格列名时，在这里明确。">
      <div className="interaction-heading"><h3>必需章节</h3><Button disabled={disabled || value.output.sections.length >= 20} onClick={() => patch({ sections: [...value.output.sections, { id: id(), title: '' }] })}>添加小标题</Button></div>
      {!value.output.sections.length && <p className="interaction-empty-guide">例如会议纪要可以分成“会议结论”“待办事项”“待确认问题”。不需要固定顺序时，可以留空。</p>}
      {value.output.sections.map((section, index) => <div className="interaction-section-row" key={section.id}><Field label={`小标题 ${index + 1}`}><input value={section.title} maxLength={100} placeholder="例如：待办事项" onChange={e => patch({ sections: value.output.sections.map(v => v.id === section.id ? { ...v, title: e.target.value } : v) })} /></Field><Button variant="ghost" disabled={!index} aria-label={`上移小标题 ${index + 1}`} onClick={() => { const sections = [...value.output.sections]; [sections[index - 1], sections[index]] = [sections[index], sections[index - 1]]; patch({ sections }) }}>上移</Button><Button variant="ghost" onClick={() => patch({ sections: value.output.sections.filter(v => v.id !== section.id) })}>删除小标题 {index + 1}</Button></div>)}
      <FieldList value={value} onChange={onChange} disabled={disabled} output />
    </Section>
    <Section title="交付前需要核对什么？" description="涉及姓名、日期、金额等关键信息时，可以要求与用户提供的信息核对。需要用户审阅内容时，再开启交付确认。">
      <label className="campus-check"><input type="checkbox" aria-label="输出附带依据与来源" checked={value.output.sourceRequired} onChange={e => patch({ sourceRequired: e.target.checked })} />输出附带依据与来源</label><p className="campus-hint">发送通知、写入系统等操作的执行前确认，在“执行能力”中设置。</p>
      <label className="campus-check"><input type="checkbox" checked={value.output.deliveryConfirm || value.output.format === 'recipient'} disabled={value.output.format === 'recipient'} onChange={e => patch({ deliveryConfirm: e.target.checked })} />交付前请用户确认{value.output.format === 'recipient' ? '（每位接收人的内容分别确认，必须开启）' : ''}</label>
      <div className="interaction-heading"><h3>哪些内容需要对照检查？ <span className="interaction-optional">可选</span></h3><Button disabled={disabled || !value.output.fields.length} onClick={() => patch({ factChecks: [...value.output.factChecks, { id: id(), outputKey: value.output.fields[0].key, source: value.input.fields.length ? 'input' : 'directory', inputKey: value.input.fields[0]?.key ?? '', result: 'unknown' }] })}>添加一项核对</Button></div>
      <p className="campus-hint">例如，把结果中的“会议时间”与用户提供的“会议时间”对照。{!value.output.fields.length ? '先在上方添加需要核对的成果项目，即可选择对应的信息。' : '选择要核对的成果，再选择它应当与哪项信息一致。'}</p>
      {value.output.factChecks.map(check => <div key={check.id} className="interaction-fact-check"><Field label="核对哪项成果？"><select value={check.outputKey} onChange={e => patch({ factChecks: value.output.factChecks.map(v => v.id === check.id ? { ...v, outputKey: e.target.value } : v) })}>{value.output.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field><Field label="与什么信息对照？"><select value={check.source === 'directory' ? 'directory' : check.inputKey} onChange={e => patch({ factChecks: value.output.factChecks.map(v => v.id === check.id ? { ...v, source: e.target.value === 'directory' ? 'directory' : 'input', inputKey: e.target.value === 'directory' ? '' : e.target.value } : v) })}><option value="directory">已有业务记录（示例）</option>{value.input.fields.map(f => <option key={f.key} value={f.key}>用户提供的{f.label}</option>)}</select></Field><Field label="核对结果示例" hint="仅用于演示，不代表已经核实。"><select aria-label="核对结果示例" value={check.result} onChange={e => patch({ factChecks: value.output.factChecks.map(v => v.id === check.id ? { ...v, result: e.target.value as typeof check.result } : v) })}><option value="match">一致</option><option value="different">存在差异</option><option value="unknown">尚未核实</option></select></Field><Button variant="ghost" onClick={() => patch({ factChecks: value.output.factChecks.filter(v => v.id !== check.id) })}>移除这项核对</Button></div>)}
    </Section>
  </fieldset><details className="output-preview-details"><summary>预览用户收到的成果</summary><OutputSetupPreview value={value} /></details></div>
}
