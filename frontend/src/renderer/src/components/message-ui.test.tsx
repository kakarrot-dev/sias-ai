import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentActivityMessage, MessageActionCard, MessageConfirmationActions, ChatContentBlock, ChatMessage, MarkdownContent, MarkdownMessage, MatterRouteNote, MessageAttachmentGroup, TimelineSummary } from './message-ui'

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

describe('message UI contracts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('renders GFM structures and copies only the original fenced code without executing HTML', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const code = 'const html = "<script>alert(1)</script>";\n'
    const markdown = ['### 标题', '', '1. 第一步', '2. 第二步', '', '- 材料', '  - 附件', '', '> 一条引用', '', '| 名称 | 数量 |', '| :--- | ---: |', '| 文件 | 2 |', '', '- [x] 完成', '- [ ] 待办', '', '```js', code.trimEnd(), '```', '', '<form><input name="injected" /></form>'].join('\n')
    const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>)
    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument()
    expect(container.querySelector('ol')).toHaveTextContent('第一步')
    expect(container.querySelector('ul ul')).toHaveTextContent('附件')
    expect(container.querySelector('blockquote')).toHaveTextContent('一条引用')
    expect(screen.getByRole('region', { name: '表格内容，可横向滚动' })).toContainElement(screen.getByRole('table'))
    expect(screen.getByRole('columnheader', { name: '数量' })).toHaveStyle({ textAlign: 'right' })
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled()
    expect(container.querySelector('script, form, input[name="injected"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(code))
  })

  it('keeps complete assistant content visible when collapse is disabled', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60)
    const { container } = render(<MarkdownMessage collapsible={false}>{'段落\n\n'.repeat(20)}</MarkdownMessage>)
    expect(container.querySelector('.markdown-message__content')).toHaveClass('is-expanded')
    expect(screen.queryByRole('button', { name: /展开全文/ })).not.toBeInTheDocument()
  })

  it('keeps route changes real and dismisses the menu after an action', () => {
    const onOpenMatter = vi.fn()
    const onCreateMatter = vi.fn()
    const onRequestChange = vi.fn()
    render(<MatterRouteNote title="市场研究" mode="linked" onOpenMatter={onOpenMatter} onCreateMatter={onCreateMatter} onRequestChange={onRequestChange} />)
    expect(screen.getByText('已归入已有事项')).toBeInTheDocument()
    expect(screen.queryByText('市场研究')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    const options = screen.getByRole('group', { name: '更改消息归类' })
    fireEvent.click(screen.getByRole('button', { name: '将最新消息作为变更请求' }))
    expect(onRequestChange).toHaveBeenCalledOnce()
    expect(options).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    fireEvent.click(screen.getByRole('button', { name: '创建新事项草稿' }))
    expect(onCreateMatter).toHaveBeenCalledOnce()
  })

  it('does not offer a duplicate matter for a message that already created its own matter', () => {
    render(<MatterRouteNote title="客户材料分析" mode="created" onOpenMatter={vi.fn()} onCreateMatter={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '更改' }))
    expect(screen.queryByRole('button', { name: '创建新事项草稿' })).not.toBeInTheDocument()
  })

  it('reuses one accessible attachment menu for open and reveal interactions', () => {
    const onOpen = vi.fn()
    const onReveal = vi.fn()
    const { rerender } = render(<MessageAttachmentGroup source="agent" attachments={[{ id: 'report', name: 'report.md', detail: 'Markdown · SHA-256 已记录' }]} onOpen={onOpen} onReveal={onReveal} />)
    fireEvent.click(screen.getByRole('button', { name: '打开方式 report.md' }))
    expect(screen.getByRole('menu', { name: '打开方式 report.md' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /使用系统默认应用打开/ }))
    fireEvent.click(screen.getByRole('button', { name: '打开方式 report.md' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /打开所在文件夹/ }))
    expect(onOpen).toHaveBeenCalledWith('report')
    expect(onReveal).toHaveBeenCalledWith('report')
    expect(screen.queryByRole('menu', { name: '打开方式 report.md' })).not.toBeInTheDocument()

    const onRemove = vi.fn()
    rerender(<MessageAttachmentGroup source="user" attachments={[{ id: 'brief', name: 'brief.pdf', detail: 'PDF · 1.8 MB' }]} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: '移除 brief.pdf' }))
    expect(onRemove).toHaveBeenCalledWith('brief')
  })

  it('expands and collapses long markdown without changing the message bubble contract', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(240)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60)
    const onExpandedChange = vi.fn()
    const { container } = render(<MarkdownMessage onExpandedChange={onExpandedChange}>{'# 标题\n\n一段较长的消息内容。'.repeat(20)}</MarkdownMessage>)
    const expand = await screen.findByRole('button', { name: /展开全文/ })
    expect(container.querySelector('.markdown-message__content')).toHaveClass('is-collapsible')
    fireEvent.click(expand)
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('button', { name: /收起/ })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: /收起/ }))
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
    await waitFor(() => expect(screen.getByRole('button', { name: /展开全文/ })).toHaveAttribute('aria-expanded', 'false'))
  })

  it('supports preview and download in the same attachment menu without desktop-only actions', () => {
    const onOpen = vi.fn(), onDownload = vi.fn()
    const attachment = { id: 'summary', name: '会议摘要.md', detail: 'Markdown · 演示文档' }
    const { rerender } = render(<MessageAttachmentGroup source="agent" embedded openMode="preview" attachments={[attachment]} onOpen={onOpen} onDownload={onDownload} />)
    fireEvent.click(screen.getByRole('button', { name: '打开方式 会议摘要.md' }))
    expect(screen.queryByRole('menuitem', { name: /使用系统默认应用打开/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /打开所在文件夹/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /预览文档/ }))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('summary')
    fireEvent.click(screen.getByRole('button', { name: '打开方式 会议摘要.md' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /下载文档/ }))
    expect(onDownload).toHaveBeenCalledExactlyOnceWith('summary')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    rerender(<MessageAttachmentGroup source="agent" openMode="preview" attachments={[attachment]} />)
    expect(screen.getByRole('button', { name: '打开方式 会议摘要.md' })).toBeDisabled()
  })

  it('does not mark a short message as collapsible', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(32)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32)
    const { container } = render(<MarkdownMessage>Hi there!</MarkdownMessage>)
    await waitFor(() => expect(container.querySelector('.markdown-message__content')).not.toHaveClass('is-collapsible'))
    expect(screen.queryByRole('button', { name: /展开全文/ })).not.toBeInTheDocument()
  })

  it('uses the compact disclosure boundary for process messages', () => {
    const { container } = render(<MarkdownMessage compact>过程内容</MarkdownMessage>)
    expect(container.querySelector('.markdown-message')).toHaveClass('markdown-message--compact')
  })

  it('copies the original markdown and reports clipboard failures without claiming success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const text = '**保留格式**\n\n- 第一项\n- 第二项'
    const { unmount } = render(<ChatMessage source="agent" name="助理" initials="助" color="#56623d" time="09:00" copyText={text}><MarkdownMessage>{text}</MarkdownMessage></ChatMessage>)
    fireEvent.click(screen.getByRole('button', { name: '复制消息' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已复制到剪贴板'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
    unmount()
    writeText.mockRejectedValue(new Error('denied'))
    render(<ChatMessage source="agent" name="助理" initials="助" color="#56623d" time="09:00" copyText={text}>{text}</ChatMessage>)
    fireEvent.click(screen.getByRole('button', { name: '复制消息' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('复制失败，请选择正文手动复制'))
    expect(screen.queryByText('已复制')).not.toBeInTheDocument()
  })

  it('keeps every file and its action visible in list mode without carousel navigation', () => {
    const onOpen = vi.fn()
    render(<MessageAttachmentGroup source="user" layout="list" attachments={[{ id: 'a', name: '一份很长的完整文件名.txt', detail: 'TXT' }, { id: 'b', name: 'b.pdf', detail: 'PDF' }]} onOpen={onOpen} />)
    expect(screen.getByText('一份很长的完整文件名.txt')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '打开 b.pdf' }))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('b')
    expect(screen.queryByRole('button', { name: '查看下一份附件' })).not.toBeInTheDocument()
  })

  it('uses one borderless chat contract for timeline messages and their status', () => {
    const { container } = render(<ChatMessage source="agent" variant="timeline" name="网络情报员" initials="网" color="#9ebd79" time="12:49" status={<span>阶段完成</span>}><MarkdownMessage compact>已完成多源检索。</MarkdownMessage></ChatMessage>)
    expect(container.querySelector('.message-block')).toHaveClass('message-block--timeline', 'message-stream-item')
    expect(container.querySelector('.message-bubble__status')).toHaveTextContent('阶段完成')
    expect(container.querySelector('.message-block--progress')).toBeNull()
  })

  it('renders any agent activity through one accessible bubbleless contract', () => {
    const { container } = render(<AgentActivityMessage activity={{ state: 'thinking', agent: { name: '网络情报员', initials: '网', color: '#9ebd79' }, time: '12:50' }} />)

    expect(screen.getByRole('status', { name: '网络情报员 思考中' })).toHaveTextContent('思考中')
    expect(container.querySelector('.message-author')).toHaveTextContent('网络情报员12:50')
    expect(container.querySelector('.message-bubble')).toBeNull()
    expect(container.querySelector('.agent-activity')).toHaveAttribute('data-state', 'thinking')
  })

  it('renders legacy markdown assignment summaries as regular plain timeline text', () => {
    const { container } = render(<TimelineSummary>{'## 研究范围与结论摘要 **研究任务：** 交叉核验。 | 通道 | 结果 | |---|---| | agent-reach.search | 5 条 |'}</TimelineSummary>)
    const summary = container.querySelector('.chat-content__summary')

    expect(summary).toHaveTextContent('研究范围与结论摘要 研究任务： 交叉核验。；通道；结果；agent-reach.search；5 条')
    expect(summary?.closest('.chat-content')).toHaveClass('chat-content--timeline')
    expect(container.querySelector('h2')).toBeNull()
  })

  it('renders one structured chat content contract for timeline and delivery messages', () => {
    const content = { schemaVersion: 1 as const, title: '公开信息核验完成', summary: '共有 **3 条结论**：\n\n- 目标不清\n- 数据不足', metrics: [{ label: '来源', value: '11' }, { label: '结论', value: '5' }], detail: { label: '查看研究说明', content: '查询结果。\n冲突明细。\n\n补充结论。' } }
    const { rerender } = render(<ChatContentBlock content={content} />)
    expect(screen.getByText('公开信息核验完成')).toHaveClass('chat-content__title')
    expect(screen.getByText('3 条结论')).toHaveProperty('tagName', 'STRONG')
    expect(screen.getByText('目标不清')).toHaveProperty('tagName', 'LI')
    expect(screen.getByText('数据不足')).toHaveProperty('tagName', 'LI')
    expect(screen.getByLabelText('内容概况')).toHaveTextContent('11来源5结论')
    fireEvent.click(screen.getByRole('button', { name: /查看研究说明/ }))
    const detailParagraphs = document.querySelectorAll('.chat-content__detail-body p')
    expect(detailParagraphs).toHaveLength(2)
    expect(detailParagraphs[0].textContent).toBe('查询结果。\n冲突明细。')
    expect(detailParagraphs[1]).toHaveTextContent('补充结论。')
    expect(screen.getByRole('button', { name: /收起详情/ })).toHaveAttribute('aria-expanded', 'true')

    rerender(<ChatContentBlock content={content} variant="delivery" />)
    expect(screen.getByText('公开信息核验完成').closest('.chat-content')).toHaveClass('chat-content--delivery')
  })
})

it('uses one confirmation action contract with a busy state and an accessible status', () => {
  const confirm = vi.fn(), cancel = vi.fn()
  const view = (busy: boolean) => <MessageActionCard title="确认事项变更" status="等待你确认" tone="waiting" actions={<MessageConfirmationActions cancelLabel="保持原事项" confirmLabel="确认变更并继续" busy={busy} onCancel={cancel} onConfirm={confirm} />}><p>更新会议参会人</p></MessageActionCard>
  const { rerender } = render(view(false))
  expect(screen.getByRole('article', { name: '确认事项变更' })).toHaveAttribute('data-component-contract', 'message-action-card')
  expect(screen.getByRole('status')).toHaveTextContent('等待你确认')
  fireEvent.click(screen.getByRole('button', { name: '确认变更并继续' }))
  expect(confirm).toHaveBeenCalledOnce()
  rerender(view(true))
  expect(screen.getByRole('button', { name: '正在处理' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '保持原事项' })).toBeDisabled()
})
