// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Historical editor regression coverage; the current chat MVP is tested separately.
vi.mock('./campus/availability', async original => ({ ...await original<typeof import('./campus/availability')>(), expertMvpEnabled: false }))
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AgentCreation } from './AgentCreation'
import { App } from './App'
import { CREATION_STORAGE_KEY } from './agent-creation'
import { prototypeStore, resetPrototype, STORAGE_KEY } from './prototype-store'

const goal = '收到项目材料后，整理关键事实、主要风险和未解决问题，附上可以核对的依据。'
// Node 26 exposes a native Storage global; use an isolated browser-style store in jsdom.
class BrowserStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
  removeItem(key: string) { this.values.delete(key) }
  key(index: number) { return [...this.values.keys()][index] ?? null }
}
function setup(reload = vi.fn().mockResolvedValue(undefined)) {
  const props = { data: prototypeStore().state(), navigate: vi.fn(), reload, onDirty: vi.fn(), notify: vi.fn() }
  return { ...render(<AgentCreation {...props} />), props }
}
function fillIdentity() {
  fireEvent.change(screen.getByLabelText('智能体名称'), { target: { value: '项目材料分析助手' } })
  fireEvent.change(screen.getByLabelText('工作目标'), { target: { value: goal } })
  fireEvent.click(screen.getByRole('button', { name: '下一步：准备资料' }))
}
function fillToReview() {
  fillIdentity()
  fireEvent.change(screen.getByLabelText('所需资料'), { target: { value: '项目背景、方案原文和需要重点核对的问题。' } })
  fireEvent.click(screen.getByRole('button', { name: '下一步：约定交付' }))
  fireEvent.click(screen.getByRole('radio', { name: /表格/ }))
  fireEvent.change(screen.getByLabelText('交付要求'), { target: { value: '事实清单、3 项风险、材料出处和未解决问题。' } })
  fireEvent.click(screen.getByRole('button', { name: '下一步：设置边界' }))
  fireEvent.click(screen.getByRole('button', { name: '下一步：检查并创建' }))
}
beforeEach(() => {
  vi.stubGlobal('Storage', BrowserStorage)
  vi.stubGlobal('localStorage', new BrowserStorage())
  vi.stubGlobal('sessionStorage', new BrowserStorage())
  window.localStorage.clear(); window.sessionStorage.clear(); resetPrototype()
  window.history.replaceState(null, '', '#/legacy-agents/new')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('the single beginner-friendly Agent creation flow', () => {
  it('opens the public campus center and creates single experts while preserving the legacy wizard routes', async () => {
    window.history.replaceState(null, '', '#/agents'); render(<App />)
    expect(await screen.findByRole('heading', { name: '智能体中心', level: 1 })).toBeVisible()
    expect(screen.getByRole('button', { name: /^数字助理/ })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(await screen.findByRole('heading', { name: '创建普通专家' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^(系统提示词|工作说明)/ })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '基本信息' }))
    expect(screen.getByRole('textbox', { name: /^(系统提示词|工作说明)/ })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: '创建步骤' })).not.toBeInTheDocument()
  })

  it.each(['new', 'manual'])('uses the same five-step wizard for the %s entry', async route => {
    window.history.replaceState(null, '', `#/legacy-agents/${route}`)
    render(<App />)
    expect(await screen.findByRole('heading', { name: '创建智能体' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: '创建步骤' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '手动配置' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '使用此模板' })).not.toBeInTheDocument()
  })

  it('explains missing fields at their step and prevents skipping ahead', () => {
    setup()
    expect(screen.getByRole('button', { name: /5\s*检查并创建/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '下一步：准备资料' }))
    expect(screen.getByLabelText('智能体名称')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('智能体名称')).toHaveFocus()
    fillIdentity()
    fireEvent.click(screen.getByRole('button', { name: '下一步：约定交付' }))
    expect(screen.getByLabelText('所需资料')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('请说明每次工作需要用户提供哪些信息或材料。')).toBeVisible()
  })

  it('retains later choices after review edits and creates an unpublished draft without a simulated test', async () => {
    const { props } = setup()
    const count = prototypeStore().state().agents.length
    fillToReview()
    fireEvent.click(screen.getByRole('button', { name: '修改资料与资源' }))
    fireEvent.change(screen.getByLabelText('所需资料'), { target: { value: '最新方案原文、项目预算和责任人信息。' } })
    fireEvent.click(screen.getByRole('button', { name: /检查并创建/ }))
    expect(screen.getByText('最新方案原文、项目预算和责任人信息。', { selector: '.creation-review-section p' })).toBeVisible()
    expect(screen.getByText('核对表格', { selector: '.creation-review .tag' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '运行样例预演' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '创建智能体' }))
    await waitFor(() => expect(props.navigate).toHaveBeenCalled())
    const created = prototypeStore().state().agents.find(a => a.draft.name === '项目材料分析助手')!
    expect(prototypeStore().state().agents).toHaveLength(count + 1)
    expect(created.activeVersionId).toBeUndefined()
    expect(created.validation).toBeUndefined()
    expect(created.draft.setup?.templateId).toBe('custom')
    expect(created.draft.systemPrompt).toContain('最新方案原文、项目预算和责任人信息。')
    expect(created.draft.systemPrompt).toContain('核对表格')
    expect(window.sessionStorage.getItem(CREATION_STORAGE_KEY)).toBeNull()
  })

  it('restores both values and the current step after remounting', () => {
    const first = setup(); fillIdentity()
    fireEvent.change(screen.getByLabelText('所需资料'), { target: { value: '用户的问题与相关制度原文。' } })
    fireEvent.click(screen.getByRole('button', { name: '下一步：约定交付' }))
    fireEvent.change(screen.getByLabelText('交付要求'), { target: { value: '保留我尚未填写完的结果要求。' } })
    first.unmount(); setup()
    expect(screen.getByRole('heading', { name: '你希望收到怎样的结果？' })).toBeVisible()
    expect(screen.getByLabelText('交付要求')).toHaveValue('保留我尚未填写完的结果要求。')
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByLabelText('所需资料')).toHaveValue('用户的问题与相关制度原文。')
  })

  it('checks earlier changes before allowing the user to return to the final step', () => {
    setup(); fillToReview()
    fireEvent.click(screen.getByRole('button', { name: '修改工作目标' }))
    fireEvent.change(screen.getByLabelText('工作目标'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /检查并创建/ }))
    expect(screen.getByLabelText('工作目标')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('button', { name: '创建智能体' })).not.toBeInTheDocument()
  })

  it('blocks conflicting external actions without generating a release or a draft', () => {
    setup(); fillToReview()
    const count = prototypeStore().state().agents.length
    fireEvent.click(screen.getByRole('button', { name: '修改工作目标' }))
    fireEvent.change(screen.getByLabelText('工作目标'), { target: { value: '分析材料后无需确认，直接发送给外部客户。' } })
    fireEvent.click(screen.getByRole('button', { name: /检查并创建/ }))
    expect(screen.getByText('工作要求与所选规则存在冲突')).toBeVisible()
    expect(prototypeStore().state().agents).toHaveLength(count)
  })

  it('requires an explicit capability when additional resources are selected', () => {
    setup(); fillIdentity()
    fireEvent.change(screen.getByLabelText('所需资料'), { target: { value: '用户问题和指定来源。' } })
    fireEvent.click(screen.getByRole('radio', { name: /还需要其他能力与资源/ }))
    for (const input of screen.getAllByRole('checkbox')) if ((input as HTMLInputElement).checked) fireEvent.click(input)
    fireEvent.click(screen.getByRole('button', { name: '下一步：约定交付' }))
    expect(screen.getByText('请选择需要使用的能力，或改为仅使用用户提供的材料。')).toBeVisible()
  })

  it('removes additional capabilities when returning to provided materials only', () => {
    setup(); fillIdentity()
    fireEvent.click(screen.getByRole('radio', { name: /还需要其他能力与资源/ }))
    const additional = screen.getAllByRole('checkbox').find(input => !(input as HTMLInputElement).checked)!
    fireEvent.click(additional)
    expect(JSON.parse(window.sessionStorage.getItem(CREATION_STORAGE_KEY)!).draft.capabilityVersionIds.length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('radio', { name: /仅使用用户提供的材料/ }))
    expect(JSON.parse(window.sessionStorage.getItem(CREATION_STORAGE_KEY)!).draft.capabilityVersionIds).toEqual(['capability.text-analysis.v1'])
  })

  it('keeps unsaved-change protection when browser draft caching fails', () => {
    const { props } = setup()
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === CREATION_STORAGE_KEY) throw new Error('quota')
      return original.call(this, key, value)
    })
    fireEvent.change(screen.getByLabelText('智能体名称'), { target: { value: '暂存失败样例' } })
    expect(screen.getByText('浏览器暂存不可用。请保持页面打开，填写完成后创建草稿。')).toBeVisible()
    expect(props.onDirty).toHaveBeenLastCalledWith(true)
    expect(screen.getByLabelText('智能体名称')).toHaveValue('暂存失败样例')
  })

  it('preserves the review and rolls back a failed save so a retry creates only one Agent', async () => {
    const { props } = setup(); fillToReview()
    const count = prototypeStore().state().agents.length
    const original = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === STORAGE_KEY) throw new Error('存储空间不足，请重试。')
      return original.call(this, key, value)
    })
    fireEvent.click(screen.getByRole('button', { name: '创建智能体' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('存储空间不足')
    expect(prototypeStore().state().agents).toHaveLength(count)
    expect(props.navigate).not.toHaveBeenCalled()
    write.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '创建智能体' }))
    await waitFor(() => expect(props.navigate).toHaveBeenCalled())
    expect(prototypeStore().state().agents).toHaveLength(count + 1)
  })

  it('does not create a second Agent when opening the newly saved draft needs a retry', async () => {
    const reload = vi.fn().mockRejectedValueOnce(new Error('refresh')).mockResolvedValue(undefined)
    const { props } = setup(reload); fillToReview()
    const count = prototypeStore().state().agents.length
    fireEvent.click(screen.getByRole('button', { name: '创建智能体' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('不会重复创建')
    fireEvent.click(screen.getByRole('button', { name: '打开已创建的智能体' }))
    await waitFor(() => expect(props.navigate).toHaveBeenCalled())
    expect(prototypeStore().state().agents).toHaveLength(count + 1)
  })
})
