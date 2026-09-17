// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AgentFormPreview } from './AgentFormPreview'
import { ContractFields } from './ContractFields'
import { contractIssues, defaultContract } from './agent-management'
import { creationIssues, readCreationSession } from './agent-creation'
import { defaultSetup, effectivePrompt } from './guided-config'
import { changeFieldKind, fieldDefinitionIssues, fieldExample, fieldsSchema, formExamples, validateContractValue } from './form-contract'
import { parseConfig } from './config-validation'
import { PrototypeStore } from './prototype-store'
import { activeVersion, blankAgent, type AgentConfig, type ContractField, type Entity } from './shared'

class BrowserStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
beforeEach(() => { vi.stubGlobal('sessionStorage', new BrowserStorage()) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const config = (changes: Partial<AgentConfig> = {}): AgentConfig => ({ ...blankAgent(), name: '通用表单验收', role: '整理材料并核对结果', description: '整理任务材料，形成有依据的结论并由用户确认。', output: '输出任务名称、负责人和截止日期，便于逐项核对。', setup: { ...defaultSetup('custom'), inputDescription: '提供材料与本次工作目标', outputFormat: 'form' }, contract: { ...defaultContract(), inputFields: [{ key: 'topic', label: '任务主题', type: 'string', required: true }], outputFields: formExamples[1].outputs, followUpFields: formExamples[0].followUp }, ...changes })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
const validInput = () => fill('任务信息 · 任务主题', '梳理产品评审结论')
const start = () => click('运行样例预演')

describe('form definitions and persisted contracts', () => {
  it('keeps seven field kinds consistent across rendering hints, schema, examples and persistence', () => {
    const fields: ContractField[] = [
      { key: 'title', label: '标题', type: 'string', required: true },
      { key: 'body', label: '正文', type: 'string', widget: 'textarea', required: true },
      { key: 'date', label: '日期', type: 'string', widget: 'date', required: true },
      { key: 'number', label: '数量', type: 'number', minimum: 0, maximum: 10, required: true },
      { key: 'flag', label: '是否完成', type: 'boolean', required: true },
      { key: 'choice', label: '单选', type: 'string', widget: 'select', options: ['甲', '乙'], required: true },
      { key: 'choices', label: '多选', type: 'array', widget: 'multiselect', options: ['甲', '乙'], required: true }
    ]
    expect(fieldDefinitionIssues(fields, '输入', 'input')).toEqual([])
    expect(validateContractValue(fields, { ...fieldExample(fields), number: 0, flag: false })).toEqual([])
    const schema = fieldsSchema(fields)
    expect(schema.properties.date).toMatchObject({ type: 'string', format: 'date' })
    expect(schema.properties.choices).toMatchObject({ type: 'array', uniqueItems: true, items: { enum: ['甲', '乙'] } })
    const store = new PrototypeStore(undefined, false)
    const entity = store.create('agent', config({ contract: { ...defaultContract(), inputFields: fields, outputFields: fields } }))
    const checked = store.check(entity.id, entity.revision)
    expect(checked.validation?.issues).toEqual([])
    const published = store.publish(entity.id, checked.revision, '表单测试') as Entity<AgentConfig>
    expect(activeVersion(published)?.config.contract?.outputFields).toEqual(fields)
    expect(parseConfig('agent', published.draft)).toEqual(published.draft)
  })
  it('rejects invalid dates, range, enum values, duplicate selections, whitespace and unknown fields', () => {
    const fields = [...formExamples[1].outputs, { key: 'amount', label: '金额', type: 'number' as const, minimum: 0, maximum: 10, required: true }]
    const errors = validateContractValue(fields, { task_name: ' ', assignee: '张三', due_date: '2026-02-30', priority: '紧急', categories: ['产品', '产品', '不存在'], amount: -1, user_id: 'forged' }).join(' ')
    for (const text of ['任务名称', '日期', '优先级', '分类', '金额', '未声明']) expect(errors).toContain(text)
  })
  it('rejects mismatched widgets, empty choices, invalid ranges and protected inputs; switching type drops incompatible settings', () => {
    expect(fieldDefinitionIssues([{ key: 'password', label: '密码', type: 'string', required: true }, { key: 'amount', label: '金额', type: 'number', required: true, minimum: 10, maximum: 0 }, { key: 'enum', label: '枚举', type: 'string', widget: 'multiselect', required: true, options: [] }], '输入', 'input', true).length).toBeGreaterThanOrEqual(3)
    expect(changeFieldKind({ key: 'amount', label: '金额', type: 'number', required: true, minimum: 0 }, 'select')).toEqual({ key: 'amount', label: '金额', type: 'string', widget: 'select', options: ['选项一', '选项二'], required: true })
    const legacy = config({ contract: defaultContract(), setup: { ...defaultSetup('custom'), inputDescription: '资料' } })
    expect((parseConfig('agent', legacy) as AgentConfig).contract).toEqual(defaultContract())
  })
  it('routes bad input and output definitions to their creation steps and restores valid fields', () => {
    const data = new PrototypeStore(undefined, false).state()
    const draft = config({ contract: { ...defaultContract(), inputFields: [{ key: '', label: '', type: 'string', required: true }], outputFields: [] } })
    expect(creationIssues(draft, data).filter(i => i.field === 'contract.inputFields').every(i => i.step === 1)).toBe(true)
    expect(creationIssues(draft, data).find(i => i.field === 'contract.outputFields')?.step).toBe(2)
    const original = config()
    const restored = readCreationSession(JSON.stringify({ schema: 1, draft: original, step: 4, reached: 4 }), data)
    expect(restored.draft.contract).toEqual(original.contract)
    expect(contractIssues(config({ contract: { ...defaultContract(), inputFields: [], outputFields: formExamples[0].outputs, followUpFields: Array.from({ length: 7 }, (_, i) => ({ key: `q${i}`, label: '问题', type: 'string', required: true })) } })).map(i => i.message).join(' ')).toContain('最多 6')
  })
  it('offers reusable field examples and maintains order when moving fields', () => {
    const onChange = vi.fn()
    const view = render(<ContractFields label="输出" fields={[]} onChange={onChange} />)
    fill('输出字段示例', 'task'); click('填入输出示例')
    expect(onChange).toHaveBeenLastCalledWith(formExamples[1].outputs)
    view.rerender(<ContractFields label="输出" fields={formExamples[1].outputs} onChange={onChange} />)
    click('下移输出字段 1')
    expect(onChange.mock.calls.at(-1)?.[0][0].key).toBe('assignee')
  })
})

describe('form interaction preview lifecycle', () => {
  it('keeps missing fields visible while filling, resumes the same run, validates edited output, locks it after confirmation', () => {
    render(<AgentFormPreview config={config()} />)
    start()
    expect(screen.getByText('等待补充输入', { exact: true })).toBeInTheDocument()
    fill('补充信息 · 任务主题', '材料分析')
    expect(screen.getByLabelText('补充信息 · 任务主题')).toHaveValue('材料分析')
    click('提交补充并继续')
    expect(screen.getByText('等待你的确认', { exact: true })).toBeInTheDocument()
    fill('结果 · 任务名称', '')
    click('确认并交付')
    expect(screen.getByRole('alert')).toHaveTextContent('任务名称')
    fill('结果 · 任务名称', '交付产品评审清单')
    fill('结果 · 截止日期', '2026-10-01')
    fireEvent.click(screen.getByRole('checkbox', { name: '研发' }))
    click('确认并交付')
    expect(screen.getByText('预演已完成', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认并交付' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('结果 · 任务名称')).not.toBeInTheDocument()
    expect(screen.getByText('交付产品评审清单')).toBeInTheDocument()
  })
  it('restores a pending follow-up with typed answers after remount and continues into confirmation', () => {
    const c = config(); c.systemPrompt = effectivePrompt(c); const view = render(<AgentFormPreview config={c} previewId="reload" />)
    validInput(); fill('预演情形', 'followup'); start()
    fill('补充信息 · 阅读对象', '项目团队')
    view.unmount(); render(<AgentFormPreview config={parseConfig('agent', c) as AgentConfig} previewId="reload" />)
    expect(screen.getByText(/已恢复上次预演/)).toBeInTheDocument()
    expect(screen.getByLabelText('补充信息 · 阅读对象')).toHaveValue('项目团队')
    click('提交补充并继续')
    expect(screen.getByText('等待你的确认', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('项目团队')).toBeInTheDocument()
  })
  it.each(['拒绝补充', '取消本次预演'])('terminates on %s and requires an explicit restart', action => {
    render(<AgentFormPreview config={config()} />)
    validInput(); fill('预演情形', 'followup'); start(); click(action)
    expect(screen.queryByRole('button', { name: '提交补充并继续' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('补充信息 · 阅读对象')).not.toBeInTheDocument()
    click('重新开始')
    expect(screen.getByLabelText('任务信息 · 任务主题')).toHaveValue('梳理产品评审结论')
  })
  it('honors stop-on-missing policy without offering a form to continue', () => {
    const c = config(); c.contract!.missingInputPolicy = 'reject'
    render(<AgentFormPreview config={c} />); start()
    expect(screen.getByText('预演已停止', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '提交补充并继续' })).not.toBeInTheDocument()
  })
  it('direct delivery does not bypass external-operation confirmation and supports rejection', () => {
    const c = config(); c.setup!.approval = 'external'
    render(<AgentFormPreview config={c} />); validInput(); start()
    expect(screen.getByText('预演已完成', { exact: true })).toBeInTheDocument()
    click('重新开始'); fill('预演情形', 'external'); start()
    expect(screen.getByText('等待你的确认', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认示例操作' })).toBeInTheDocument()
    click('拒绝操作')
    expect(screen.getByText('预演已停止', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认示例操作' })).not.toBeInTheDocument()
  })
  it('blocks denied resources, invalidates a previous approval when configuration changes, and reports storage failure', () => {
    const c = config(); const view = render(<AgentFormPreview config={c} />)
    validInput(); fill('预演情形', 'denied'); start()
    expect(screen.getByText('访问已阻断', { exact: true })).toBeInTheDocument()
    click('重新开始'); fill('预演情形', 'normal'); start()
    view.rerender(<AgentFormPreview config={{ ...c, output: '新的交付要求' }} />)
    expect(screen.getByText('等待开始', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认并交付' })).not.toBeInTheDocument()
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    validInput()
    expect(screen.getByText(/浏览器暂存不可用/)).toBeInTheDocument()
  })
})
