import { useEffect, useState } from 'react'
import { Button } from 'react-aria-components'
import { MediaImage, Page, Xmark } from 'iconoir-react'
import type { MessageAttachment } from './message-ui'

interface LocalAttachment extends MessageAttachment {
  file?: File
}

function AttachmentThumbnail({ attachment }: { attachment: LocalAttachment }): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const isImage = attachment.file?.type.startsWith('image/') ?? false
  useEffect(() => {
    if (!isImage || !attachment.file) return
    const objectUrl = URL.createObjectURL(attachment.file)
    setUrl(objectUrl)
    setFailed(false)
    return () => URL.revokeObjectURL(objectUrl)
  }, [attachment.file, isImage])
  return <span className={`composer-file__thumbnail${isImage ? ' is-image' : ''}`}>
    {url && !failed ? <img src={url} alt={`${attachment.name} 缩略图`} onError={() => setFailed(true)} /> : isImage ? <MediaImage aria-hidden /> : <Page aria-hidden />}
  </span>
}

export function ComposerAttachmentTray({ attachments, onOpen, onRemove }: { attachments: LocalAttachment[]; onOpen: (id: string) => void; onRemove: (id: string) => void }): React.JSX.Element | null {
  if (!attachments.length) return null
  return <ul className="composer-files" aria-label="待发送附件">
    {attachments.map((attachment) => <li className="composer-file" key={attachment.id}>
      <Button className="composer-file__preview" aria-label={`预览附件 ${attachment.name}`} onPress={() => onOpen(attachment.id)}>
        <AttachmentThumbnail attachment={attachment} />
        <span className="composer-file__info"><strong title={attachment.name}>{attachment.name}</strong><small>{attachment.detail}</small></span>
      </Button>
      <Button className="composer-file__remove" aria-label={`移除 ${attachment.name}`} onPress={() => onRemove(attachment.id)}><Xmark aria-hidden /></Button>
    </li>)}
  </ul>
}
