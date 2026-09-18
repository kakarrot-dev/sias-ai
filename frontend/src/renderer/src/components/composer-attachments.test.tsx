import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComposerAttachmentTray } from './composer-attachments'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('composer attachments', () => {
  it('previews local images, keeps file actions separate and releases thumbnail URLs', () => {
    const create = vi.fn(() => 'blob:image-thumbnail'), revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
    const image = { id: 'image', name: '校园建筑示意图.png', detail: 'PNG · 24 KB', file: new File(['image'], '校园建筑示意图.png', { type: 'image/png' }) }
    const document = { id: 'document', name: '活动策划.pdf', detail: 'PDF · 12 KB', file: new File(['pdf'], '活动策划.pdf', { type: 'application/pdf' }) }
    const onOpen = vi.fn(), onRemove = vi.fn()
    const { rerender } = render(<ComposerAttachmentTray attachments={[image, document]} onOpen={onOpen} onRemove={onRemove} />)
    expect(screen.getByRole('img', { name: `${image.name} 缩略图` })).toHaveAttribute('src', 'blob:image-thumbnail')
    expect(create).toHaveBeenCalledExactlyOnceWith(image.file)
    fireEvent.click(screen.getByRole('button', { name: `预览附件 ${image.name}` }))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('image')
    fireEvent.click(screen.getByRole('button', { name: `移除 ${image.name}` }))
    expect(onRemove).toHaveBeenCalledExactlyOnceWith('image')
    expect(onOpen).toHaveBeenCalledTimes(1)
    rerender(<ComposerAttachmentTray attachments={[document]} onOpen={onOpen} onRemove={onRemove} />)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:image-thumbnail')
    expect(screen.getByText(document.name)).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('falls back to an image icon when a thumbnail fails and revokes its URL on unmount', () => {
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = () => 'blob:broken-image'; static revokeObjectURL = revoke })
    const { unmount } = render(<ComposerAttachmentTray attachments={[{ id: 'broken', name: 'broken.png', detail: 'PNG · 1 KB', file: new File(['invalid'], 'broken.png', { type: 'image/png' }) }]} onOpen={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '预览附件 broken.png' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '移除 broken.png' })).toBeEnabled()
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:broken-image')
  })
})
