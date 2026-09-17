import { useEffect, useId, useRef, type ComponentType, type ReactNode } from 'react'
import { ArrowRight, Check, Search, Xmark } from 'iconoir-react'
import { statusOf, type Entity } from './shared'

export type Icon = ComponentType<{ width?: number | string; height?: number | string; strokeWidth?: number }>
export function Button({ children, icon: Glyph, variant = 'default', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: Icon; variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  return <button type="button" {...props} className={`button button--${variant} ${className}`}>{Glyph && <Glyph width={16} height={16} />}{children}</button>
}
export function IconButton({ icon: Glyph, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: Icon; label: string }) {
  return <button type="button" {...props} aria-label={label} title={label} className="icon-button"><Glyph width={17} height={17} /></button>
}
export const statusLabels = { draft: '草稿', checked: '预检通过', published: '已发布', disabled: '已停用', blocked: '依赖受阻' }
export function Status({ entity }: { entity: Entity }) { const status = statusOf(entity); return <span className={`badge badge--${status}`}><i />{statusLabels[status]}</span> }
export function Tag({ children }: { children: ReactNode }) { return <span className="tag">{children}</span> }
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div><div className="page-actions">{children}</div></header>
}
export function Field({ label, hint, required, children, className = '' }: { label: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span className="field-label">{label}{required && <em>*</em>}</span>{children}{hint && <small>{hint}</small>}</label>
}
export function SearchField({ value, onChange, placeholder = '搜索名称、职责或责任人', label = '搜索配置' }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }) {
  return <div className="search-field"><Search width={17} /><input aria-label={label} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />{value && <IconButton label="清空搜索" icon={Xmark} onClick={() => onChange('')} />}</div>
}
export function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-symbol"><span /><span /><span /></div><h3>{title}</h3><p>{description}</p>{action}</div>
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' | 'success' }) {
  return <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>
}
export function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="section"><div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId()
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close() }, [])
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }}><header><h2 id={titleId}>{title}</h2><IconButton icon={Xmark} label="关闭对话框" onClick={onClose} /></header>{children}</dialog>
}
export function Facts({ items }: { items: [string, ReactNode][] }) { return <dl className="facts">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> }
export function StepMarker({ value, done = false }: { value: ReactNode; done?: boolean }) { return <span className={`step-marker ${done ? 'step-marker--done' : ''}`}>{done ? <Check width={15} /> : value}</span> }
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowRight width={15} /></button> }
export function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) }
export const actionLabels: Record<string, string> = { imported: '导入智能体', metadata_updated: '更新展示资料', copied: '复制智能体', archived: '归档智能体', unarchived: '取消归档', restored: '恢复草稿', created: '创建草稿', saved: '保存配置', checked: '配置预检', published: '发布配置', rolled_back: '版本回退', disabled: '停用配置', enabled: '启用配置', deleted: '删除草稿' }
