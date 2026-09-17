import { useId, useMemo, useState } from 'react'
import { Xmark } from 'iconoir-react'
import { Button, Empty, IconButton, SearchField } from './components'
import { CAPABILITY_PAGE_SIZE, isBuiltinCapability, searchCapabilities, type CapabilityFilter } from './capability-search'
import { MAX_AGENT_CAPABILITIES, type Capability } from './shared'
import './CapabilityPicker.css'

export function CapabilityPicker({ capabilities, selectedIds, selectedVersions, onChange, error, disabledReason, singleKind = false }: { capabilities: Capability[]; selectedIds: string[]; selectedVersions?: Record<string, string>; onChange: (ids: string[]) => void; error?: string; disabledReason?: (cap: Capability) => string | undefined; singleKind?: boolean }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CapabilityFilter>('all')
  const [page, setPage] = useState(0)
  const id = useId()
  const resourceLabel = singleKind ? capabilities.every(isBuiltinCapability) ? '工具' : '技能' : '能力'
  const results = useMemo(() => searchCapabilities(capabilities, query, filter), [capabilities, query, filter])
  const pages = Math.max(1, Math.ceil(results.length / CAPABILITY_PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const visible = results.slice(currentPage * CAPABILITY_PAGE_SIZE, (currentPage + 1) * CAPABILITY_PAGE_SIZE)
  const unavailable = (cap: Capability) => cap.execution?.active === false ? '已停用' : disabledReason?.(cap)
  const remove = (removed: string) => onChange(selectedIds.filter(value => value !== removed))
  const reset = () => { setQuery(''); setFilter('all'); setPage(0) }

  const selectedPanel = <div className="capability-picker-selected"><div className="capability-picker-selected-heading"><strong>已选 {selectedIds.length} 项</strong><span className="capability-picker-limit">最多 {MAX_AGENT_CAPABILITIES} 项</span>{selectedIds.length > 0 && <Button variant="ghost" onClick={() => onChange([])}>清空已选</Button>}</div>
      {selectedIds.length ? <ul aria-label="已选能力" className="capability-picker-chips">{selectedIds.map(selected => {
        const cap = capabilities.find(item => item.id === selected)
        const label = cap?.name ?? selected
        return <li key={selected} className={!cap || unavailable(cap) ? 'is-unavailable' : undefined}><span title={label}>{label}</span>{cap && <small>{isBuiltinCapability(cap) ? '工具' : 'Skill'}{selectedVersions?.[selected] ? ` · v${selectedVersions[selected]}` : ''}</small>}{(!cap || unavailable(cap)) && <small>{cap ? unavailable(cap) : '已不可用'}</small>}<IconButton icon={Xmark} label={`移除 ${label}`} onClick={() => remove(selected)} /></li>
      })}</ul> : !singleKind && <p>从下方列表勾选。切换搜索词或翻页，已选项都会保留。</p>}
    </div>

  return <fieldset className={`capability-picker ${singleKind ? 'is-library' : ''}`} tabIndex={-1} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
    <legend>选择需要的{resourceLabel}</legend>
    {!singleKind && selectedPanel}
    <div className="capability-picker-toolbar" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) event.preventDefault() }}><SearchField label="搜索能力" placeholder={singleKind ? `搜索${resourceLabel}名称或用途` : "搜索名称、说明或标签"} value={query} onChange={value => { setQuery(value); setPage(0) }} />{!singleKind && <select aria-label="能力类型" value={filter} onChange={event => { setFilter(event.target.value as CapabilityFilter); setPage(0) }}><option value="all">全部类型</option><option value="skill">Skill</option><option value="builtin">内置工具</option></select>}</div>
    <div className="capability-picker-result-info" role="status">{query.trim() || filter !== 'all' ? `找到 ${results.length} 项` : `共 ${capabilities.length} 项${resourceLabel}`}<span>{singleKind ? "可多选，确认后添加" : "支持部分名称，也可用空格组合关键词"}</span></div>
    {visible.length ? <ul className="capability-picker-list" aria-label="可选能力">{visible.map(cap => <li key={cap.id}>
      <label className={selectedIds.includes(cap.id) ? 'is-selected' : ''}><input type="checkbox" aria-label={cap.name} disabled={(!!unavailable(cap) || selectedIds.length >= MAX_AGENT_CAPABILITIES) && !selectedIds.includes(cap.id)} checked={selectedIds.includes(cap.id)} onChange={event => event.target.checked ? onChange([...selectedIds, cap.id]) : remove(cap.id)} /><span className="capability-picker-item"><span className="capability-picker-item-heading"><strong>{cap.name}</strong><small>v{cap.version}</small></span><span className="capability-picker-description" title={cap.description}>{cap.description}</span>{singleKind && isBuiltinCapability(cap) && !!cap.parameters?.length && <span className="capability-picker-description">需要的信息：{cap.parameters.map(p => p.label).join('、')}</span>}</span><span className="capability-picker-types">{!singleKind && <span>{isBuiltinCapability(cap) ? '内置工具' : 'Skill'}</span>}{singleKind && cap.execution?.write && <span className="capability-picker-write">会修改数据 · 执行前确认</span>}{unavailable(cap) && <span>{unavailable(cap)}</span>}</span></label>
    </li>)}</ul> : <Empty title={capabilities.length ? '没有找到匹配的能力' : '暂无可选能力'} description={capabilities.length ? '试试更短的关键词或其他类型；已选能力不会受影响。' : '可以先选择仅使用用户提供的材料。'} action={(query || filter !== 'all') ? <Button onClick={reset}>清除搜索与筛选</Button> : undefined} />}
    <div className="capability-picker-pagination"><span>{results.length ? `${currentPage * CAPABILITY_PAGE_SIZE + 1}–${Math.min((currentPage + 1) * CAPABILITY_PAGE_SIZE, results.length)} / ${results.length} 项` : '0 项'}</span><div><Button aria-label="能力上一页" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage + 1} / {pages}</span><Button aria-label="能力下一页" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div>
    {singleKind && selectedPanel}
    {error && <p id={`${id}-error`} className="creation-field-error">{error}</p>}
  </fieldset>
}
