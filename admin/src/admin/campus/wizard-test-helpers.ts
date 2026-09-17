import { fireEvent, screen, within } from '@testing-library/react'

const groups: Record<string, string> = { 基础信息: '基本信息', 职责与提示词: '基本信息', 工具: '工作能力', 技能: '工作能力', 输入契约: '输入与输出', 用户交互: '输入与输出', 人工兜底: '运行配置', 输出与验收: '输入与输出', 模型与上下文: '运行配置', 运行与安全: '运行配置', 对话体验: '基本信息', 检查配置: '检查配置' }
export function wizardStep(name: string) {
  const nav = screen.getByRole('navigation', { name: '专家表单分区' })
  fireEvent.click(within(nav).getByRole('button', { name: groups[name] ?? name }))
  const readonly = document.querySelector('.config-read-details:not([open]) > summary'); if (readonly) fireEvent.click(readonly)
  if (name === '输出与验收') fireEvent.click(screen.getByRole('button', { name: /^输出与完成条件/ }))
  const summary = [...document.querySelectorAll('summary')].find(s => (s.querySelector('span')?.textContent ?? s.textContent) === (name === '输入契约' ? '用户交互' : name))
  if (summary && !summary.parentElement?.hasAttribute('open')) fireEvent.click(summary)
}
/** Follow the current creation or configuration navigation and expand a containing optional section. */
export function wizardRole(role: Parameters<typeof screen.getByRole>[0], options?: Parameters<typeof screen.getByRole>[1]) {
  const find = () => {
    const current = screen.queryAllByRole(role, options)
    if (current.length === 1) {
      let parent = current[0].parentElement
      while (parent) { if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) fireEvent.click(parent.querySelector('summary')!); parent = parent.parentElement }
      return current[0]
    }
    return undefined
  }
  const current = find(); if (current) return current
  const nav = screen.queryByRole('navigation', { name: '专家表单分区' }) ?? screen.queryByRole('navigation', { name: '专家团创建步骤' })
  if (nav) for (const button of within(nav).getAllByRole('button')) {
    fireEvent.click(button)
    const result = find(); if (result) return result
    const output = screen.queryByRole('button', { name: /^输出与完成条件/ }); if (output) { fireEvent.click(output); const nested = find(); if (nested) return nested }
  }
  return screen.getByRole(role, options)
}
