// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { InputEditor, OutputEditor } from './InteractionConfig'
import { InteractionPreview } from './InteractionPreview'
import { applyDecision, attachmentIssues, defaultInteractionConfig, deleteField, fieldApplies, fieldReferences, inputIssues, missingPresentation, newInputField, validateInteractionConfig, type DecisionState, type InputField, type InteractionConfig } from './interaction-model'

const field = (key: string, extra: Partial<InputField> = {}): InputField => ({ ...newInputField(), key, label: key, ...extra })
function configWith(...fields: InputField[]) { const c = defaultInteractionConfig(); c.input.fields = fields; c.input.entryFields = fields.filter(f => f.requirement === 'required').map(f => f.key); return c }
function Host({ initial, output = false }: { initial: InteractionConfig; output?: boolean }) { const [value, setValue] = useState(initial); return <><div data-testid="saved">{JSON.stringify(value)}</div>{output ? <OutputEditor value={value} onChange={setValue} /> : <InputEditor value={value} onChange={setValue} />}</> }
const click = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('输入输出的结构化约束', () => {
  it('uses text defaults and leaves genuine completeness issues saveable', () => {
    const c = defaultInteractionConfig(); expect(c.input.modalities).toEqual(['text']); expect(c.output.format).toBe('text')
    c.input.modalities = []; c.output.format = 'recipient'
    expect(validateInteractionConfig(c)).toEqual([])
    expect(validateInteractionConfig(c, { complete: true })).toEqual(expect.arrayContaining(['至少选择一种输入方式', '按接收人交付须选择至少一位接收人']))
    c.input.followUp='form'; expect(validateInteractionConfig(c)).toEqual([])
    expect(validateInteractionConfig(c,{complete:true})).toContain('选择集中填表时，请至少添加一个填写项')
  })
  it('rejects duplicate keys, conditional cycles and high-sensitive inferred values', () => {
    const c = configWith(field('one'), field('one')); expect(validateInteractionConfig(c)).toContain('输入字段标识不能重复')
    const cyclic = configWith(field('a', { requirement: 'conditional', condition: { field: 'b', operator: 'empty', value: '' } }), field('b', { requirement: 'conditional', condition: { field: 'a', operator: 'empty', value: '' } }))
    expect(validateInteractionConfig(cyclic).some(e => e.includes('循环引用'))).toBe(true)
    expect(validateInteractionConfig(configWith(field('secret', { sensitivity: 'high', source: 'agent_prefill' }))).some(e => e.includes('高敏感'))).toBe(true)
  })
  it('protects input references in entry forms, conditions and output comparisons', () => {
    const c = configWith(field('topic'), field('detail', { requirement: 'conditional', condition: { field: 'topic', operator: 'eq', value: 'yes' } }))
    c.output.fields = [field('result')]; c.output.factChecks = [{ id: 'check', outputKey: 'result', source: 'input', inputKey: 'topic', result: 'unknown' }]
    expect(fieldReferences(c, 'topic')).toEqual(['入口表单', '条件字段「detail」', '输出事实比对'])
    expect(() => deleteField(c, 'topic')).toThrow('先解除引用')
    c.input.entryFields = []; c.input.fields.pop(); c.output.factChecks = []
    expect(deleteField(c, 'topic').input.fields).toEqual([]); expect(c.input.fields).toHaveLength(1)
  })
  it('evaluates required conditions without treating false or zero as missing', () => {
    const c = configWith(field('enabled', { type: 'boolean' }), field('count', { type: 'number' }), field('detail', { requirement: 'conditional', condition: { field: 'enabled', operator: 'eq', value: 'true' } }))
    expect(inputIssues(c, { enabled: false, count: 0 })).toEqual([])
    expect(inputIssues(c, { enabled: true, count: 0 })).toContain('请填写detail')
    expect(fieldApplies(c.input.fields[2], { enabled: false }, c.input.fields)).toBe(false)
  })
  it('uses the configured missing fields and independently confirms AI prefill', () => {
    const c = configWith(field('topic')); expect(missingPresentation(c, {})).toBe('text')
    c.input.fields.push(field('time', { type: 'datetime_range' }), field('people', { type: 'person_list' }))
    expect(missingPresentation(c, { topic: '会议' })).toBe('form')
    const ai = configWith(field('topic', { source: 'agent_prefill' }))
    expect(inputIssues(ai, { topic: '推断值' })).toContain('请确认 AI 推断的topic')
    expect(inputIssues(ai, { topic: '推断值' }, ['topic'])).toEqual([])
    expect(missingPresentation(ai, { topic: '推断值' })).toBe('form')
    expect(missingPresentation(ai, { topic: '推断值' }, ['topic'])).toBe('ready')
    const numeric=configWith(field('amount',{type:'number',minimum:1}))
    expect(missingPresentation(numeric,{amount:0})).toBe('form')
    expect(missingPresentation(numeric,{amount:10})).toBe('ready')
    const choice=configWith(field('category',{type:'enum',options:['通知','报告']}))
    expect(missingPresentation(choice,{})).toBe('data_select')
  })
  it('checks audio separately from the non-audio total, including simulated duration', () => {
    const c = defaultInteractionConfig(); c.input.modalities = ['document', 'audio']
    const files = [{ name: '资料.pdf', size: 20 * 1024 ** 2 }, { name: '录音.mp3', size: 200 * 1024 ** 2, minutes: 60 }]
    expect(attachmentIssues(files, c)).toEqual([])
    expect(attachmentIssues([...files, { name: '第二音频.wav', size: 1024 }], c)).toContain('音频超过数量、大小或时长限制')
    expect(attachmentIssues([{ ...files[1], minutes: 61 }], c)).toContain('音频超过数量、大小或时长限制')
    expect(attachmentIssues([{ name: '运行.exe', size: 1024 }], c)).toContain('附件格式不在允许的输入方式中')
  })
  it('honors the chosen number of missing answers before showing a form in automatic mode', () => {
    const c = configWith(field('topic'), field('purpose'), field('description'))
    c.input.formThreshold = 3
    expect(missingPresentation(c, { topic: '材料核对' })).toBe('text')
    expect(missingPresentation(c, {})).toBe('form')
    c.input.formThreshold = 2
    expect(missingPresentation(c, { topic: '材料核对' })).toBe('form')
    c.input.fields[1].type = 'datetime'
    c.input.formThreshold = 3
    expect(missingPresentation(c, { topic: '材料核对', description: '项目评审' })).toBe('form')
  })
  it('keeps per-recipient decisions independent, invalidates old content and deduplicates repeats', () => {
    const initial: DecisionState = { interactionId: 'one', contentVersion: 1, status: 'pending', keys: [], transitions: 0 }
    const other = { ...initial, interactionId: 'two' }
    const changed = applyDecision(initial, { key: 'edit', contentVersion: 1, decision: 'modify' })
    expect(() => applyDecision(changed, { key: 'old', contentVersion: 1, decision: 'confirm' })).toThrow('内容已变化')
    const action = { key: 'approve', contentVersion: 2, decision: 'confirm' as const }; const approved = applyDecision(changed, action)
    expect(applyDecision(approved, action)).toBe(approved); expect(approved.transitions).toBe(2); expect(other.status).toBe('pending')
  })
})

describe('输入输出与交互页面', () => {
  it('shows the collection mode first and keeps optional settings and the preview out of the main flow', () => {
    const c = defaultInteractionConfig(); render(<Host initial={c} />)
    expect(screen.getByLabelText('填写提示（选填）')).toBeVisible()
    expect(screen.queryByRole('region', { name: '用户填写效果' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '填写方式' })).toHaveValue('auto')
    expect(within(screen.getByRole('combobox', { name: '填写方式' })).getAllByRole('option')).toHaveLength(3)
    expect(screen.queryByText('更多设置')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('缺少几项时改用表单')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加填写项' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('填写提示（选填）'), { target: { value: '请说明你想解决的问题，并提供相关背景。' } })
    const saved: InteractionConfig = JSON.parse(screen.getByTestId('saved').textContent!)
    expect(saved.input.instructions).toBe('请说明你想解决的问题，并提供相关背景。')
    expect(saved.input.fields).toEqual([]); expect(saved.input.followUp).toBe('auto'); expect(saved.output).toEqual(c.output)

    expect(screen.getByLabelText('填写提示（选填）')).toHaveValue(saved.input.instructions)
  })
  it('preserves existing output structure while changing only the selected type and plain-language request', () => {
    const c = configWith(field('time')); c.output.fields = [field('result_time')]
    c.output.sections = [{ id: 'one', title: '结论' }]; c.output.factChecks = [{ id: 'check', source: 'input', inputKey: 'time', outputKey: 'result_time', result: 'unknown' }]
    render(<Host initial={c} output />)
    expect(screen.getByLabelText('小标题 1')).toBeVisible()
    expect(screen.getByRole('button', { name: '添加小标题' })).toBeVisible()
    fireEvent.click(screen.getByText('预览用户收到的成果')); expect(screen.getByRole('region', { name: '交付效果' })).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: 'PDF 文件' })); click('使用这句')
    const saved: InteractionConfig = JSON.parse(screen.getByTestId('saved').textContent!)
    expect(saved.output.requirements).toBe('整理成一份便于打印的材料核对报告。')
    expect(saved.output.sections).toEqual(c.output.sections); expect(saved.output.fields).toEqual(c.output.fields); expect(saved.output.factChecks).toEqual(c.output.factChecks)
    expect(saved.input).toEqual(c.input)
    expect(screen.getByLabelText('小标题 1')).toHaveValue('结论')
    expect(screen.getByLabelText('结果内容要求')).toHaveValue(saved.output.requirements)
  })
  it('shows the preparation note to the person using the expert and keeps older configuration valid', () => {
    const c = defaultInteractionConfig(); delete c.input.instructions
    expect(validateInteractionConfig(c)).toEqual([])
    c.input.instructions = '请准备项目申请材料，并说明申请用途。'
    render(<InteractionPreview value={c} name="材料专家" />)
    expect(screen.getByText(c.input.instructions)).toBeVisible()
    c.input.instructions = '长'.repeat(2001)
    expect(validateInteractionConfig(c)).toContain('填写提示须为不超过 2000 字的文字')
  })
  it('adds and copies a field through the dialog and prevents duplicate keys', () => {
    render(<Host initial={defaultInteractionConfig()} />); click('添加填写项')
    fireEvent.change(screen.getByLabelText('填写项名称'), { target: { value: '任务主题' } }); click('保存填写项')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); fireEvent.click(screen.getByLabelText('任务主题的更多操作')); click('复制任务主题')
    fireEvent.click(screen.getByText('高级设置', { exact: false, selector: 'summary' })); fireEvent.change(screen.getByLabelText('内部标识'), { target: { value: 'field_1' } }); click('保存填写项')
    expect(screen.getByRole('alert')).toHaveTextContent('标识不能重复')
    fireEvent.change(screen.getByLabelText('内部标识'), { target: { value: 'topic_copy' } }); click('保存填写项')
    const saved = JSON.parse(screen.getByTestId('saved').textContent!); expect(saved.input.fields.map((f: InputField) => f.key)).toEqual(['field_1', 'topic_copy'])
  })
  it('blocks high sensitivity with AI source, then accepts an explicit source change', () => {
    render(<Host initial={configWith(field('secret', { source: 'agent_prefill' }))} />); click('编辑secret')
    fireEvent.click(screen.getByText('高级设置', { exact: false, selector: 'summary' })); fireEvent.change(screen.getByLabelText('信息敏感程度'), { target: { value: 'high' } }); click('保存填写项')
    expect(screen.getByRole('dialog')).toHaveTextContent('高敏感字段不能使用 AI 推断')
    fireEvent.change(screen.getByLabelText('信息来源'), { target: { value: 'user' } }); click('保存填写项')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const saved = JSON.parse(screen.getByTestId('saved').textContent!); expect(saved.input.fields[0]).toMatchObject({ sensitivity: 'high', source: 'user' })
  })
  it('explains that deleting required information also removes its opening question', () => {
    render(<Host initial={configWith(field('topic'))} />); fireEvent.click(screen.getByLabelText('topic的更多操作')); click('删除topic')
    expect(screen.getByRole('dialog')).toHaveTextContent('也会移除开始时对应的提问')
    click('删除信息和对应提问')
    expect(JSON.parse(screen.getByTestId('saved').textContent!).input.fields).toEqual([])
  })
  it('preserves information referenced by another question and explains which setting must change first', () => {
    const c = configWith(field('kind', { label: '办事类型' }), field('reason', { label: '补充说明', requirement: 'conditional', condition: { field: 'kind', operator: 'not_empty', value: '' } }))
    render(<Host initial={c} />); fireEvent.click(screen.getByLabelText('办事类型的更多操作')); click('删除办事类型')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('条件提问「补充说明」')
    expect(JSON.parse(screen.getByTestId('saved').textContent!).input.fields).toEqual(c.input.fields)
  })
  it('starts with natural questions, adds a ready example, and previews only the information requested at the start', () => {
    const original = defaultInteractionConfig(); render(<Host initial={original} />);
    expect(screen.getByRole('heading', { name: '接收资料' })).toBeVisible()
    expect(screen.queryByLabelText('内部标识')).not.toBeInTheDocument()
    expect(document.querySelector('.interaction-upload-rules')).not.toHaveAttribute('open')
    expect(screen.queryByRole('heading', { name: '每次最多可以提供多少资料？' })).not.toBeInTheDocument()
    click('添加办事主题')
    expect(screen.getByRole('button', { name: '添加办事主题' })).toBeDisabled()
    const config: InteractionConfig = JSON.parse(screen.getByTestId('saved').textContent!)
    expect(config.input.fields[0]).toMatchObject({ label: '办事主题', type: 'text', requirement: 'required', example: '核对项目申请材料' })
    expect(config.input.entryFields).toEqual([config.input.fields[0].key]); expect(config.output).toEqual(original.output)
    click('预览填写页面')
    const preview = screen.getByRole('region', { name: '用户填写效果' })
    expect(within(preview).getByLabelText('办事主题')).toHaveAttribute('placeholder', '核对项目申请材料'); expect(within(preview).getByLabelText('办事主题')).toHaveValue('')
    click('返回配置')
    fireEvent.change(screen.getByLabelText('收集办事主题的时机'), { target: { value: 'missing' } })
    click('预览填写页面'); expect(screen.queryByLabelText('办事主题')).not.toBeInTheDocument(); click('提交输入'); expect(screen.getByLabelText('办事主题')).toBeVisible(); click('返回配置')
    fireEvent.click(screen.getByLabelText('办事主题的更多操作')); click('删除办事主题'); expect(JSON.parse(screen.getByTestId('saved').textContent!).input.fields).toEqual([])
  })
  it('shows only relevant upload limits and retains values when a material type or follow-up mode is switched', () => {
    render(<Host initial={defaultInteractionConfig()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '文档' }))
    expect(screen.getByLabelText('每份文档、表格或图片大小（MB）')).not.toBeVisible()
    fireEvent.click(screen.getByText('上传限制', { exact: false, selector: 'summary' }))
    expect(screen.getByLabelText('每份文档、表格或图片大小（MB）')).toHaveValue(20)
    expect(screen.queryByLabelText('每份录音时长（分钟）')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '音频' }))
    fireEvent.change(screen.getByLabelText('每份录音时长（分钟）'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '音频' })); fireEvent.click(screen.getByRole('checkbox', { name: '音频' }))
    expect(screen.getByLabelText('每份录音时长（分钟）')).toHaveValue(30)
    fireEvent.change(screen.getByRole('combobox', { name: '填写方式' }), { target: { value: 'text' } })
    expect(screen.queryByLabelText('缺少几项时改用表单')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '填写方式' }), { target: { value: 'auto' } })
    click('添加办事主题'); fireEvent.click(screen.getByText('信息不完整时', { exact: false, selector: 'summary' })); expect(screen.getByLabelText('缺少几项时改用表单')).toHaveValue(2)
  })
  it('guides an empty form and preserves fields, timing and limits across all collection modes', () => {
    render(<Host initial={defaultInteractionConfig()} />)
    fireEvent.change(screen.getByRole('combobox', { name: '填写方式' }), { target: { value: 'form' } })
    expect(screen.getByText('先添加填写项，例如申请事项、截止时间，再让用户填写表单。')).toBeVisible()
    click('预览填写页面')
    expect(screen.getByRole('dialog')).toHaveTextContent('尚未添加填写项')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('请描述你想完成的事')
    click('返回配置'); click('添加办事主题'); click('添加截止时间')
    fireEvent.change(screen.getByLabelText('收集截止时间的时机'), { target: { value: 'missing' } })
    const configured: InteractionConfig = JSON.parse(screen.getByTestId('saved').textContent!)
    for (const mode of ['text', 'auto', 'form']) fireEvent.change(screen.getByRole('combobox', { name: '填写方式' }), { target: { value: mode } })
    expect(JSON.parse(screen.getByTestId('saved').textContent!)).toEqual(configured)
  })
  it('allows inspection in read-only mode and reveals optional settings when their validation fails', () => {
    const c = defaultInteractionConfig(); c.input.modalities.push('spreadsheet'); c.input.attachments.fileMB = 21
    const onChange = vi.fn()
    const { rerender } = render(<InputEditor value={c} onChange={onChange} disabled />)
    expect(screen.getByRole('combobox', { name: '填写方式' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '添加填写项' })).toBeDisabled()
    fireEvent.click(screen.getByText('上传限制', { exact: false, selector: 'summary' }))
    expect(screen.getByLabelText('每份文档、表格或图片大小（MB）')).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('上传限制', { exact: false, selector: 'summary' }))
    rerender(<InputEditor value={c} onChange={onChange} settingsErrors={['附件限制 fileMB 须为 1—20']} />)
    expect(screen.getByLabelText('每份文档、表格或图片大小（MB）')).toBeVisible()
    expect(screen.getByLabelText('每份文档、表格或图片大小（MB）')).toHaveValue(21)
  })
  it('keeps the existing choice preference editable without offering it to new configurations', () => {
    const c = configWith(field('kind', { type: 'enum', options: ['申请', '咨询'] })); c.input.followUp = 'choice'
    render(<Host initial={c} />)
    const mode = screen.getByRole('combobox', { name: '填写方式' })
    expect(mode).toHaveValue('choice')
    fireEvent.change(screen.getByLabelText('填写提示（选填）'), { target: { value: '请选择办理事项。' } })
    expect(JSON.parse(screen.getByTestId('saved').textContent!).input.followUp).toBe('choice')
    fireEvent.change(mode, { target: { value: 'auto' } }); fireEvent.change(mode, { target: { value: 'choice' } })
    const saved: InteractionConfig = JSON.parse(screen.getByTestId('saved').textContent!)
    expect(saved.input.fields).toEqual(c.input.fields); expect(saved.input.entryFields).toEqual(c.input.entryFields)
    expect(saved.input.followUp).toBe('choice')
  })
  it('keeps collection rules and upload limits in their own groups and reveals only the affected settings', () => {
    const c = configWith(field('topic')); c.input.modalities = ['text']
    const { rerender } = render(<InputEditor value={c} onChange={() => {}}><div>缺少必要输入时</div></InputEditor>)
    const collection = screen.getByRole('group', { name: '用户填写' }), materials = screen.getByRole('group', { name: '接收资料' })
    expect(within(collection).getByLabelText('填写提示（选填）')).toBeVisible()
    expect(within(collection).queryByText('上传限制', { exact: false })).not.toBeInTheDocument()
    expect(within(materials).queryByText('缺少必要输入时')).not.toBeInTheDocument()
    rerender(<InputEditor value={c} onChange={() => {}} settingsErrors={['多字段表单阈值须为 1—10']}><div>缺少必要输入时</div></InputEditor>)
    expect(screen.getByLabelText('缺少几项时改用表单')).toBeVisible()
    expect(screen.getByLabelText('每份文档、表格或图片大小（MB）')).not.toBeVisible()
    rerender(<InputEditor value={c} onChange={() => {}} settingsErrors={['附件限制 fileMB 须为 1—20']}><div>缺少必要输入时</div></InputEditor>)
    expect(screen.getByLabelText('每份文档、表格或图片大小（MB）')).toBeVisible()
    expect(screen.getByLabelText('缺少几项时改用表单')).not.toBeVisible()
    expect(screen.queryByLabelText('每份录音时长（分钟）')).not.toBeInTheDocument()
  })
  it('keeps advanced rules intact when only an information name is edited', () => {
    const c = configWith(field('amount', { label: '金额', type: 'number', minimum: 0, maximum: 100, sensitivity: 'medium', requirement: 'optional' }))
    render(<Host initial={c} />); click('编辑金额')
    expect(screen.getByLabelText('内部标识')).not.toBeVisible()
    expect(screen.getByLabelText('允许的最大数字')).toHaveValue(100)
    expect(screen.queryByRole('tab', { name: '更多规则' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('填写项名称'), { target: { value: '申请金额' } }); click('保存填写项')
    expect(JSON.parse(screen.getByTestId('saved').textContent!).input.fields[0]).toEqual({ ...c.input.fields[0], label: '申请金额' })
  })
  it('discards unsaved dialog changes on cancel and escape', () => {
    const c = configWith(field('topic', { label: '申请事项', maxLength: 120 }))
    render(<Host initial={c} />); click('编辑申请事项')
    expect(screen.getByRole('dialog', { name: '编辑填写项' })).toBeVisible()
    expect(screen.getByLabelText('内部标识')).not.toBeVisible()
    fireEvent.change(screen.getByLabelText('填写项名称'), { target: { value: '未保存名称' } })
    click('取消')
    expect(JSON.parse(screen.getByTestId('saved').textContent!)).toEqual(c)
    click('添加填写项')
    fireEvent.change(screen.getByLabelText('填写项名称'), { target: { value: '临时填写项' } })
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('saved').textContent!)).toEqual(c)
  })
  it('reveals a hidden invalid advanced value without losing the edited name', () => {
    const c = configWith(field('amount', { label: '金额', type: 'number', minimum: 100, maximum: 10 }))
    render(<Host initial={c} />); click('编辑金额')
    expect(screen.getByLabelText('允许的最大数字')).not.toBeVisible()
    fireEvent.change(screen.getByLabelText('填写项名称'), { target: { value: '申请金额' } }); click('保存填写项')
    expect(screen.getByRole('alert')).toHaveTextContent('数值范围不正确')
    expect(screen.getByLabelText('允许的最大数字')).toBeVisible()
    expect(screen.getByLabelText('填写项名称')).toHaveValue('申请金额')
    fireEvent.change(screen.getByLabelText('允许的最大数字'), { target: { value: '200' } }); click('保存填写项')
    expect(JSON.parse(screen.getByTestId('saved').textContent!).input.fields[0]).toMatchObject({ label: '申请金额', minimum: 100, maximum: 200 })
  })
  it('previews the selected output style and custom columns without changing input or dropping existing output structure', () => {
    const c = configWith(field('topic')); render(<Host initial={c} output />);
    expect(document.querySelector('.output-preview-details')).not.toHaveAttribute('open'); fireEvent.click(screen.getByText('预览用户收到的成果'))
    fireEvent.click(screen.getByRole('radio', { name: '可编辑文档' })); click('使用这句')
    expect((screen.getByLabelText('结果内容要求') as HTMLTextAreaElement).value).toContain('会议结论和待办事项')
    fireEvent.click(screen.getByRole('radio', { name: '表格清单' })); click('添加事项'); click('添加负责人')
    const preview = screen.getByRole('region', { name: '交付效果' })
    expect(within(preview).getAllByRole('columnheader').map(th => th.textContent)).toEqual(['事项', '负责人'])
    click('添加小标题'); fireEvent.change(screen.getByLabelText('小标题 1'), { target: { value: '待办清单' } })
    expect(preview).toHaveTextContent('待办清单')
    fireEvent.click(screen.getByRole('radio', { name: 'PDF 文件' }))
    expect(screen.getByRole('region', { name: '交付效果' })).toHaveTextContent('成果示例.pdf')
    const saved = JSON.parse(screen.getByTestId('saved').textContent!)
    expect(saved.input).toEqual(c.input); expect(saved.output.fields).toHaveLength(2); expect(saved.output.sections[0].title).toBe('待办清单')
  })
  it('requires confirmation of AI prefill, then locks submitted input', () => {
    render(<InteractionPreview value={configWith(field('topic', { label: '主题', source: 'agent_prefill' }))} name="专家" />)
    click('提交输入'); expect(screen.getByRole('alert')).toHaveTextContent('请确认 AI 推断的主题')
    fireEvent.click(screen.getByLabelText('确认主题无误')); click('提交补充信息')
    expect(screen.getByLabelText('主题')).toBeDisabled(); expect(screen.getByText(/输入已提交并只读/)).toBeInTheDocument()
  })
  it('reveals conditional fields and clears hidden answers before submission', () => {
    const c = configWith(field('kind', { label: '任务类型', type: 'enum', options: ['会议', '其他'] }), field('location', { label: '会议地点', requirement: 'conditional', condition: { field: 'kind', operator: 'eq', value: '会议' } }))
    render(<InteractionPreview value={c} name="专家" />)
    expect(screen.queryByLabelText('会议地点')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('任务类型'), { target: { value: '会议' } }); fireEvent.change(screen.getByLabelText('会议地点'), { target: { value: '旧会议室' } })
    fireEvent.change(screen.getByLabelText('任务类型'), { target: { value: '其他' } }); click('提交输入')
    expect(screen.queryByText(/旧会议室/)).not.toBeInTheDocument(); expect(screen.getByText(/输入已提交并只读/)).toBeInTheDocument()
  })
  it('handles person search, duplicate names and disabled directory objects', () => {
    const c = configWith(field('person', { label: '联系人', type: 'person' })); render(<InteractionPreview value={c} name="专家" />)
    fireEvent.change(screen.getByLabelText('搜索联系人'), { target: { value: '周宁' } })
    const radios = screen.getAllByRole('radio'); expect(radios).toHaveLength(2); expect(radios[1]).toBeDisabled()
    fireEvent.click(radios[0]); fireEvent.change(screen.getByLabelText('搜索联系人'), { target: { value: '不存在' } })
    expect(screen.getByText(/没有匹配对象/)).toBeInTheDocument(); click('提交输入'); expect(screen.getByText(/输入已提交并只读/)).toBeInTheDocument()
  })
  it('reviews recipients independently and shows stale/deduplicated submissions', () => {
    const c = defaultInteractionConfig(); c.output.recipients = ['lin', 'zhou']; render(<InteractionPreview value={c} name="专家" />)
    fireEvent.change(screen.getByLabelText('交互样例'), { target: { value: 'review' } })
    click('批准林晓的内容'); expect(screen.getByRole('button', { name: '批准周宁的内容' })).toBeEnabled()
    const cards = screen.getAllByRole('article'); fireEvent.click(within(cards[0]).getByRole('button', { name: '重复提交上次决定' }))
    expect(within(cards[0]).getByText(/已识别重复提交/)).toBeInTheDocument()
    fireEvent.click(within(cards[1]).getByRole('button', { name: '保存修改并更新版本' })); fireEvent.click(within(cards[1]).getByRole('button', { name: '提交旧内容版本' }))
    expect(within(cards[1]).getByText(/内容已变化/)).toBeInTheDocument(); expect(within(cards[1]).getByRole('button', { name: '批准周宁的内容' })).toBeEnabled()
  })
  it('recreates preview state when saved configuration changes', () => {
    const c = configWith(field('topic', { label: '主题' })); const view = render(<InteractionPreview value={c} name="专家" configDigest="v1" />)
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: '旧输入' } }); click('提交输入'); expect(screen.getByLabelText('主题')).toBeDisabled()
    view.rerender(<InteractionPreview value={c} name="专家" configDigest="v2" />); expect(screen.getByLabelText('主题')).toHaveValue(''); expect(screen.getByLabelText('主题')).toBeEnabled()
  })
  it('edits output independently and requires recipient review without granting other recipients', () => {
    render(<Host initial={defaultInteractionConfig()} output />);
    fireEvent.click(screen.getByRole('radio', { name: '分别交付给多人' })); expect(screen.getByRole('checkbox', { name: /交付前请用户确认/ })).toBeChecked(); expect(screen.getByRole('checkbox', { name: /交付前请用户确认/ })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('林晓 · 信息化处'))
    const saved = JSON.parse(screen.getByTestId('saved').textContent!); expect(saved.output.recipients).toEqual(['lin']); expect(saved.input).toEqual(defaultInteractionConfig().input)
  })
})

describe('十类样例的操作与恢复', () => {
  function open(mode: string, config = defaultInteractionConfig()) { render(<InteractionPreview value={config} name="样例专家" />); fireEvent.change(screen.getByLabelText('交互样例'), { target: { value: mode } }) }
  it('submits a text follow-up and requires an explanation when no clarification choice fits', () => {
    open('text'); click('提交补充'); expect(screen.getByRole('alert')).toHaveTextContent('请先填写补充信息')
    fireEvent.change(screen.getByLabelText('补充任务信息'), { target: { value: '只核对本部门材料' } }); click('提交补充'); expect(screen.getByLabelText('补充任务信息')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('交互样例'), { target: { value: 'clarify_choice' } }); fireEvent.click(screen.getByLabelText('没有适合的选项')); click('确认选择'); expect(screen.getByRole('alert')).toHaveTextContent('请补充说明')
    fireEvent.change(screen.getByLabelText('补充说明'), { target: { value: '需要核对报销单' } }); click('确认选择'); expect(screen.getByRole('button', { name: '确认选择' })).toBeDisabled()
  })
  it('handles missing data candidates and rejected authorization with a retry path', () => {
    open('data_select'); fireEvent.click(screen.getByLabelText('没有适合的候选')); fireEvent.change(screen.getByLabelText('调整需求'), { target: { value: '另选其他时段' } }); click('提交场地选择'); expect(screen.getByText(/已保留调整需求/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('交互样例'), { target: { value: 'authorization_request' } }); click('拒绝授权'); expect(screen.getByText(/保持未授权/)).toBeInTheDocument(); click('返回授权核对'); click('模拟同意授权'); expect(screen.getByText(/仅此工具获得本次样例许可/)).toBeInTheDocument()
  })
  it('regenerates one review item with a new content version before allowing approval', () => {
    const c = defaultInteractionConfig(); c.output.recipients = ['lin']; open('review', c)
    click('重新生成（模拟）'); expect((screen.getByLabelText('林晓的待确认内容') as HTMLTextAreaElement).value).toContain('重新整理的示例内容'); click('批准林晓的内容'); expect(screen.getByText(/此项已确认/)).toBeInTheDocument()
  })
  it('cancels future steps while preserving the simulated completed summary', () => {
    open('status'); click('推进模拟步骤'); click('演示依赖不可用'); expect(screen.getByText(/校内示例服务暂不可用/)).toBeInTheDocument(); click('继续任务'); click('取消任务')
    expect(screen.getByText(/已取消后续步骤/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: '推进模拟步骤' })).toBeDisabled(); expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2')
  })
  it('checks attachment failure and recovery without uploading file bytes', () => {
    open('file_request'); click('演示非音频超限'); expect(screen.getByRole('alert')).toHaveTextContent('非音频附件超过'); expect(screen.getByRole('button', { name: '提交附件元数据' })).toBeDisabled()
    click('载入文字附件示例'); click('提交附件元数据'); expect(screen.getByText(/没有上传或解析内容/)).toBeInTheDocument()
  })
  it('protects inline file fields with the same task-level total limit', () => {
    const c = configWith(...Array.from({ length: 6 }, (_, i) => field(`file_${i}`, { type: 'file' }))); c.input.modalities = ['document']
    const values = Object.fromEntries(c.input.fields.map(f => [f.key, { name: '材料.pdf', size: 20 * 1024 ** 2 }]))
    expect(inputIssues(c, values)).toContain('非音频附件超过单文件、数量或合计限制')
    open('form', configWith(field('file', { label: '材料', type: 'file' })))
    const file = new File(['bad'], '不可运行.exe', { type: 'application/octet-stream' }); fireEvent.change(screen.getByLabelText(/按当前附件限制校验/), { target: { files: [file] } }); expect(screen.getByRole('alert')).toHaveTextContent('附件格式不在允许')
  })
  it('preserves unresolved result facts and exposes unknown messages without action buttons', () => {
    const c = defaultInteractionConfig(); c.output.fields = [field('total', { label: '金额', type: 'number' })]; c.output.factChecks = [{ id: 'check', outputKey: 'total', source: 'directory', inputKey: '', result: 'different' }]; c.output.deliveryConfirm = true
    open('result', c); expect(screen.getByText(/存在差异或未核实项/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: '确认此份交付（模拟）' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('交互样例'), { target: { value: 'unsupported' } }); expect(screen.getByText(/当前界面尚不支持此消息版本/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /确认.*模拟/ })).not.toBeInTheDocument()
  })
})
