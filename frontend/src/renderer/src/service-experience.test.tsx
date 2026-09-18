import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from '../../../prototypes/macos-client-v2/src/App'
import { parseExpertPreview, parseServiceRecord, serviceExamples, attachmentIssue } from '../../shared/service-prototype'

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const scenario = (name: string) => { fireEvent.click(screen.getByRole('button', { name: '原型演示' })); fireEvent.click(screen.getByRole('button', { name })) }
const send = (text: string) => { fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: '发送' })) }
const personal = () => { fireEvent.click(screen.getByRole('button', { name: 'Kakarrot 用户菜单' })); fireEvent.click(screen.getByRole('menuitem', { name: '个人中心' })) }

it('preserves a draft across canceled connection, requires consent, and personal calls do not debit the RMB balance', () => {
  render(<App />); scenario('普通对话'); send('开始测试')
  fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), { target: { value: '保留此草稿' } })
  fireEvent.click(screen.getByRole('button', { name: '平台 Key · 管理接入' }))
  fireEvent.click(screen.getByRole('button', { name: '使用个人 Key' }))
  fireEvent.click(screen.getByRole('button', { name: '连接个人 Key' }))
  expect(screen.getByRole('button', { name: '完成模拟连接' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '取消连接' }))
  fireEvent.click(screen.getByRole('button', { name: '返回原对话' }))
  expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveValue('保留此草稿')
  expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '管理模型接入' }))
  fireEvent.click(screen.getByRole('button', { name: '连接个人 Key' }))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: '完成模拟连接' }))
  fireEvent.click(screen.getByRole('button', { name: '返回原对话' }))
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  personal(); expect(screen.getByText('¥28.48')).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '用量记录' })).toHaveTextContent('¥0.00 · 不扣平台余额')
})

it('invalidates confirmation after an edit and verifies an unknown operation without charging twice', () => {
  render(<App />); scenario('通知结果未知'); send('通知演示')
  const confirm = () => screen.getByRole('button', { name: '确认发送（演示）' })
  expect(confirm()).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: '我已核对接收对象和内容' }))
  fireEvent.change(screen.getByRole('textbox', { name: '通知接收对象' }), { target: { value: '教研组（5 人）' } })
  expect(confirm()).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: '我已核对接收对象和内容' }))
  fireEvent.click(confirm())
  expect(screen.getAllByText('结果未知 · 请勿重发')[0]).toBeVisible()
  expect(screen.queryByRole('button', { name: '确认发送（演示）' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '核实原操作结果' }))
  expect(screen.getByText(/接收对象：教研组/)).toBeInTheDocument()
  personal(); expect(screen.getByText('¥28.48')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^通知演示/ }))
  expect(screen.getByText(/接收对象：教研组/)).toBeInTheDocument()
})

it('retains regenerated artifact state and does not repeat the model charge', () => {
  render(<App />); scenario('成果生成失败'); send('整理文献')
  fireEvent.click(screen.getByRole('button', { name: '重新生成文件（演示）' }))
  expect(screen.getByRole('link', { name: '下载文件' })).toBeEnabled()
  const file = screen.getByRole('link', { name: '下载文件' })
  expect(file).toHaveAttribute('download', '文献阅读笔记-演示.md')
  expect(decodeURIComponent(file.getAttribute('href')!)).toContain('不是对上传材料的真实分析')
  personal(); expect(screen.getByText('¥28.48')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^整理文献/ }))
  expect(screen.getByRole('link', { name: '下载文件' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '重新生成文件（演示）' })).not.toBeInTheDocument()
})

it('keeps expert demo scenarios isolated and historical records readable while stopped', () => {
  render(<App />); scenario('通知发送成功'); send('通知对话')
  scenario('文献摘要与文件'); send('文献对话')
  fireEvent.click(screen.getByRole('button', { name: /^通知对话/ }))
  send('第二条通知')
  expect(screen.getAllByRole('heading', { name: '发送通知' })).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '原型演示' }))
  fireEvent.change(screen.getByLabelText('模拟会话可用性'), { target: { value: 'disabled' } })
  fireEvent.click(within(screen.getByRole('dialog', { name: '原型演示场景' })).getByRole('button', { name: '关闭' }))
  expect(screen.getByLabelText('对话')).toHaveTextContent('第二条通知')
  fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), { target: { value: '保留草稿' } })
  expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  expect(screen.getAllByRole('button', { name: '确认发送（演示）' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /^文献对话/ }))
  fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), { target: { value: '其他专家仍可用' } })
  expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
})

it('validates metadata boundaries and file limits without accepting a private body in diagnostic exports', () => {
  const parsed = parseServiceRecord(JSON.stringify({ ...serviceExamples[0], body: 'private prompt', apiKey: 'secret' }))!
  expect(parsed).not.toHaveProperty('body'); expect(parsed).not.toHaveProperty('apiKey')
  expect(parseServiceRecord(JSON.stringify({ ...serviceExamples[0], amount: -1 }))).toBeUndefined()
  expect(parseExpertPreview('#expert=broken')).toBeUndefined()
  expect(attachmentIssue([{ name: 'run.exe', size: 1 }])).toContain('支持')
  expect(attachmentIssue([{ name: 'paper.pdf', size: 21 * 1024 * 1024 }])).toContain('20 MB')
})
