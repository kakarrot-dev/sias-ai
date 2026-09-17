import { useState } from 'react'
import { Button } from '../components'
import { UserInputForm } from './UserInputForm'
import { exampleValue, outputFormatChoices, outputFormats, peopleDirectory, roomDirectory, type InputField, type InteractionConfig } from './interaction-model'

function sampleText(field: InputField): string {
  const value = exampleValue(field)
  const label = (item: unknown) => ['person', 'person_list', 'room'].includes(field.type) ? [...peopleDirectory, ...roomDirectory].find(p => p.id === item)?.name ?? String(item) : String(item).replace('T', ' ')
  if (Array.isArray(value)) return value.map(label).join('、')
  if (typeof value === 'object' && value !== null && 'name' in value) return String(value.name)
  return typeof value === 'boolean' ? value ? '是' : '否' : label(value)
}

export function InputSetupPreview({ value }: { value: InteractionConfig }) {
  const [revision, setRevision] = useState(0)
  return <section className="interaction-setup-preview input-live-preview" aria-label="用户填写效果">
    <div className="interaction-heading"><div><h3>用户填写预览</h3><span>试填并检查必填项与条件联动</span></div><Button variant="ghost" onClick={() => setRevision(current => current + 1)}>重新试填</Button></div>
    {(value.input.entryMode === 'form' || value.input.followUp === 'form') && !value.input.fields.length ? <p>尚未添加填写项，请返回配置添加。</p> : <UserInputForm key={`${JSON.stringify(value.input)}:${revision}`} config={value} />}
    <p className="user-preview-boundary">预览仅校验输入，不启动任务；附件只记录名称与大小。</p>
  </section>
}

function OutputFormatPreview({ value }: { value: InteractionConfig }) {
  const output = value.output
  const format = outputFormatChoices.find(choice => choice.value === output.format)!
  return <section className="interaction-setup-preview" aria-label="交付效果">
    <div className="interaction-heading"><h3>用户会收到什么</h3><span>{format.label} · 效果示意</span></div>
    {output.requirements && <p className="setup-preview-brief">内容要求：{output.requirements}</p>}
    {['document', 'pdf'].includes(output.format) && <div className="interaction-file-card"><strong>{format.example}</strong><small>展示文件样式，未生成真实文件</small></div>}
    {output.format === 'json' ? <pre className="team-prompt-preview">{JSON.stringify(Object.fromEntries(output.fields.map(field => [field.key, exampleValue(field)])), null, 2)}</pre> : output.format === 'table' ? output.fields.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{output.fields.map(f => <th key={f.id}>{f.label}</th>)}</tr></thead><tbody><tr>{output.fields.map(f => <td key={f.id}>{sampleText(f)}</td>)}</tr></tbody></table></div> : <div className="setup-preview-answer">{format.example}<small>示例列名；添加表格列后，这里会展示你的列名。</small></div>
      : output.format === 'recipient' ? <div className="setup-preview-grid">{output.recipients.length ? output.recipients.map(person => <div className="setup-preview-answer" key={person}>给{peopleDirectory.find(p => p.id === person)?.name ?? '待核对接收人'}的内容<small>逐人确认后交付</small></div>) : <div className="setup-preview-answer">请在下方选择接收人，每人一份待确认内容。</div>}</div>
        : !['document', 'pdf'].includes(output.format) && <div className="setup-preview-answer">{output.requirements ? '专家会按上述要求整理正文。' : format.example}</div>}
    {output.sections.map(section => <div className="setup-preview-section" key={section.id}><strong>{section.title || '待填写小标题'}</strong><p>这一部分的内容将放在这里。</p></div>)}
    {output.format !== 'table' && !!output.fields.length && <p>固定展示：{output.fields.map(f => f.label).join('、')}。</p>}
    <small>{output.deliveryConfirm || output.format === 'recipient' ? '交付前需要用户确认。' : '未要求用户确认交付。'}这里只预览样式，未调用模型或发送内容。</small>
  </section>
}

export function OutputSetupPreview({ value }: { value: InteractionConfig }) {
  return <div className="output-preview-list">{outputFormats(value.output).map(format => <OutputFormatPreview key={format} value={{ ...value, output: { ...value.output, format } }} />)}{value.output.templateRef && <p className="campus-hint">模板引用：{value.output.templateRef}（待核验）</p>}</div>
}
