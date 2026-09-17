// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { UserInputForm } from './UserInputForm'
import { InputEditor, OutputEditor } from './InteractionConfig'
import { defaultInteractionConfig, initialInputValues, newInputField, outputFormats, validateInteractionConfig, type InputField, type InteractionConfig } from './interaction-model'
import { blankConfig, seedCampus } from './model'
import { defaultDefinition, definitionIssues } from './agent-definition'
import { releaseChanges } from './config-summary'

const field = (key: string, extra: Partial<InputField> = {}): InputField => ({ ...newInputField(), key, label: key, ...extra })
function configWith(...fields: InputField[]) { const config = defaultInteractionConfig(); config.input.entryMode = 'form'; config.input.fields = fields; return config }
function click(name: string) { fireEvent.click(screen.getByRole('button', { name })) }
beforeEach(() => { Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', '') } }); vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('input/output configuration and user form', () => {
  it('keeps examples as hints, initializes typed defaults including false and zero, and validates before submission', () => {
    const config = configWith(field('主题', { key: 'topic', example: '仅作提示' }), field('人数', { key: 'count', type: 'number', defaultValue: 0, minimum: 0 }), field('需审批', { key: 'approval', type: 'boolean', defaultValue: false }))
    config.input.formTitle = '填写会议需求'; config.input.submitLabel = '提交会议需求'
    render(<UserInputForm config={config} />)
    expect(screen.getByLabelText('主题')).toHaveValue(''); expect(screen.getByLabelText('主题')).toHaveAttribute('placeholder', '仅作提示')
    expect(screen.getByLabelText('人数')).toHaveValue(0); expect(screen.getByLabelText('需审批')).toHaveValue('false')
    click('提交会议需求'); expect(screen.getByRole('alert')).toHaveTextContent('请填写主题')
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: '年度会议' } }); click('提交会议需求')
    expect(screen.getByText('输入校验通过。以下是本次填写内容，尚未启动智能体。')).toBeVisible()
    expect(screen.getByText('年度会议')).toBeVisible(); click('返回修改输入'); expect(screen.getByLabelText('主题')).toHaveValue('年度会议')
  })
  it('shows optional fields and clears conditional answers when their condition changes', () => {
    const config = configWith(field('类型', { key: 'kind', type: 'enum', options: ['线下', '线上'], defaultValue: '线下' }), field('地点', { key: 'place', requirement: 'conditional', condition: { field: 'kind', operator: 'eq', value: '线下' } }), field('备注', { key: 'note', requirement: 'optional' }))
    render(<UserInputForm config={config} />); expect(screen.getByLabelText('备注')).toBeVisible()
    fireEvent.change(screen.getByLabelText('地点'), { target: { value: '旧会议室' } })
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: '线上' } }); expect(screen.queryByLabelText('地点')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: '线下' } }); expect(screen.getByLabelText('地点')).toHaveValue('')
    click('提交输入'); expect(screen.getByRole('alert')).toHaveTextContent('请填写地点')
  })
  it('captures native date input events before submitting the form', () => {
    const config = configWith(field('会议时间', { key: 'time', type: 'datetime' }))
    render(<UserInputForm config={config} />)
    fireEvent.input(screen.getByLabelText('会议时间'), { target: { value: '2026-09-20T10:00' } }); click('提交输入')
    expect(screen.getByText('2026-09-20T10:00')).toBeVisible()
  })
  it('rejects invalid file metadata and accepts an allowed attachment without reading bytes', () => {
    const config = configWith(field('材料', { key: 'file', type: 'file' })); config.input.modalities = ['document']
    render(<UserInputForm config={config} />)
    fireEvent.change(screen.getByLabelText('材料'), { target: { files: [{ name: '材料.pdf', size: 21 * 1024 ** 2 }] } }); expect(screen.getByRole('alert')).toHaveTextContent('超过')
    fireEvent.change(screen.getByLabelText('材料'), { target: { files: [{ name: '材料.pdf', size: 1024 }] } }); click('提交输入'); expect(screen.getByText('材料.pdf')).toBeVisible()
  })
  it('uses the same validation for defaults and does not mutate legacy configuration', () => {
    const config = configWith(field('amount', { type: 'number', minimum: 1, defaultValue: 0 }))
    expect(validateInteractionConfig(config)).toContain('输入「amount」默认值不符合字段类型或填写限制')
    config.input.fields[0] = field('file', { type: 'file', defaultValue: 'fake.pdf' }); expect(validateInteractionConfig(config).join()).toContain('非附件字段')
    const legacy = defaultInteractionConfig(); const before = structuredClone(legacy)
    expect(initialInputValues(legacy)).toEqual({}); expect(validateInteractionConfig(legacy)).toEqual([]); expect(legacy).toEqual(before)
  })
  it('edits a default value and updates the live form from the same contract', () => {
    function Host() { const [value, setValue] = useState(configWith(field('主题', { key: 'topic' }))); return <InputEditor livePreview value={value} onChange={setValue} /> }
    render(<Host />); click('编辑主题'); fireEvent.change(screen.getByLabelText('默认值'), { target: { value: '月度会议' } }); click('保存填写项')
    expect(within(screen.getByRole('region', { name: '用户填写效果' })).getByLabelText('主题')).toHaveValue('月度会议')
  })
  it('validates supplemental JSON and renders each configured deliverable', () => {
    const config = defaultInteractionConfig(); config.output.format = 'document'; config.output.additionalFormats = ['json', 'text']
    expect(validateInteractionConfig(config, { complete: true })).toContain('结构化输出至少需要一个成果字段')
    config.output.fields = [field('result')]; expect(validateInteractionConfig(config, { complete: true })).toEqual([])
    render(<OutputEditor value={config} onChange={() => {}} />); fireEvent.click(screen.getByText('预览用户收到的成果'))
    expect(screen.getAllByRole('region', { name: '交付效果' })).toHaveLength(3)
    expect(outputFormats(config.output)).toEqual(['document', 'json', 'text'])
  })
  it('requires explicit receipt evidence or acceptance criteria and leaves simple completion backwards compatible', () => {
    const config = blankConfig('信息化处'); config.schemaVersion = '2.0'; config.definition = defaultDefinition(config)
    config.definition.task.completion = 'receipt'
    expect(definitionIssues(config).filter(issue => ['receiptSystem', 'evidence'].includes(issue.field))).toHaveLength(2)
    config.definition.task.receiptSystem = 'OA · 提交申请'; config.definition.task.evidence = '单号、成功状态及时间'
    expect(definitionIssues(config).filter(issue => ['receiptSystem', 'evidence'].includes(issue.field))).toEqual([])
    config.definition.task.completion = 'accepted'; expect(definitionIssues(config).some(issue => issue.field === 'success')).toBe(true)
    config.definition.task.success = '用户核对事项后验收'; expect(definitionIssues(config).some(issue => issue.field === 'success')).toBe(false)
    delete config.definition.task.completion; expect(definitionIssues(config).some(issue => issue.field === 'completion')).toBe(false)
  })
  it('includes form defaults, templates and completion evidence in release review without mutating the published snapshot', () => {
    const state = seedCampus(); const agent = state.agents.find(agent => agent.id === 'schedule')!
    const published = JSON.stringify(agent.versions)
    agent.draft.interaction = configWith(field('topic', { defaultValue: '新默认值' })); agent.draft.interaction.input.formTitle = '新表单'
    agent.draft.interaction.output.templateRef = '模板 v2'; agent.draft.definition = defaultDefinition(agent.draft); agent.draft.definition.task.completion = 'receipt'; agent.draft.definition.task.receiptSystem = 'OA'
    const changes = releaseChanges(agent, state)
    expect(changes.find(change => change.label === '用户输入')?.after).toContain('新默认值')
    expect(changes.find(change => change.label === '交付内容')?.after).toContain('模板 v2')
    expect(changes.find(change => change.label === '完成条件与证据')?.after).toContain('取得业务回执')
    expect(JSON.stringify(agent.versions)).toBe(published)
  })
})
