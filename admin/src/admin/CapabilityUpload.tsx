import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Button, Modal, Notice, Tag } from './components'
import { capabilityPurposes, capabilityTypeLabel } from './capability-search'
import { importRowStatus, parseCapabilityFiles, type ImportRow } from './capability-import'
import { prototypeStore } from './prototype-store'
import type { Actor } from './campus/model'
import type { Capability } from './shared'
import './capability-upload.css'

export const uploadExamples = {
  'summary/SKILL.md': '---\nname: summary-helper\ndescription: 阅读用户提供的材料，提炼重点和待确认事项。\nversion: "1"\npurposes: [内容分析, 文档处理]\n---\n# 材料摘要\n\n依据用户提供的材料整理要点，区分原文事实和推测。缺失信息时明确说明。\n',
  'summary/references/format.md': '# 输出格式\n结论、要点、待确认事项。\n',
  'tool.json': JSON.stringify({ type: 'tool', id: 'text-stats', name: '文字统计工具', description: '统计输入文本的字符数量。', version: '1', purposes: ['内容分析'], write: false, idempotent: true, handlerKey: 'text.stats', inputSchema: { type: 'object', properties: { text: { type: 'string', description: '待统计文本' } }, required: ['text'] } }, null, 2),
  'mcp.json': JSON.stringify({ type: 'mcp', id: 'document-search', name: '文档检索 MCP', description: '查询已授权的文档索引。', version: '1', purposes: ['信息检索', '文档处理'], server: { url: 'https://mcp.example.invalid/mcp', headers: { Authorization: '${DOCUMENT_API_KEY}' } }, tools: [{ name: 'search_documents', description: '按关键词检索文档', write: false, idempotent: true, inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }] }, null, 2)
}
function buffer(file: File): Promise<ArrayBuffer> {
  if (file.arrayBuffer) return file.arrayBuffer()
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsArrayBuffer(file) })
}
export function CapabilityUpload({ capabilities, revision, actor, reload, notify, close }: { capabilities: Capability[]; revision: number; actor: Actor; reload: () => Promise<void>; notify: (message: string) => void; close: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([]); const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState(''); const [parsing, setParsing] = useState(false); const [saving, setSaving] = useState(false); const [savedCount, setSavedCount] = useState(0)
  const input = useRef<HTMLInputElement>(null); const sequence = useRef(0); const lock = useRef(false)
  useEffect(() => () => { sequence.current++ }, [])
  const status = (row: ImportRow, index: number) => importRowStatus(row, capabilities, rows.slice(0, index))
  const validRows = rows.filter((row, index) => !status(row, index))
  const ready = validRows.filter(row => selected.includes(row.key))
  const busy = parsing || saving
  const parse = async (files: File[]) => {
    if (saving || savedCount) return
    const current = ++sequence.current; setParsing(true); setRows([]); setSelected([]); setError('')
    try {
      const result = await parseCapabilityFiles(files.map(file => ({ name: file.name, size: file.size, arrayBuffer: () => buffer(file) })))
      if (current !== sequence.current) return
      setRows(result); setSelected(result.filter((row, index) => !importRowStatus(row, capabilities, result.slice(0, index))).map(row => row.key))
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : '解析失败，请重试') }
    finally { if (current === sequence.current) setParsing(false) }
  }
  const save = async () => {
    if (lock.current || parsing || !ready.length && !savedCount) return
    lock.current = true; setSaving(true); setError('')
    try {
      const count = savedCount || prototypeStore().importCapabilities(revision, actor, ready.map(row => row.capability!))
      setSavedCount(count)
      await reload(); notify(`已添加 ${count} 项能力，可在智能体配置中选择`); close()
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败，请重试') }
    finally { lock.current = false; setSaving(false) }
  }
  const downloadExamples = async () => {
    try {
      const zip = new JSZip(); Object.entries(uploadExamples).forEach(([path, content]) => zip.file(path, content))
      const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'skill-tool-mcp-examples.zip'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('示例下载失败，请重试') }
  }
  return <div className={`capability-upload${rows.length ? ' has-results' : ''}`}><Modal title="批量上传能力" onClose={() => !saving && close()}>
    <p>选择多个文件或 ZIP 包，自动识别 Skill、Tool 和 MCP，核对后添加。</p>
    <div className="capability-upload-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && !savedCount) void parse([...event.dataTransfer.files]) }}>
      <input ref={input} type="file" multiple accept=".md,.json,.zip" aria-label="上传能力文件" disabled={busy || !!savedCount} onChange={event => { const files = [...event.target.files ?? []]; event.target.value = ''; if (files.length) void parse(files) }} />
      <strong>拖入文件，或选择文件批量上传</strong>
      <span>SKILL.md / JSON / ZIP · 每批最多 30 个文件、100 项能力 · 单文件 1 MB，总计 4 MB（含解压内容）</span>
      <Button variant="primary" disabled={busy || !!savedCount} onClick={() => input.current?.click()}>{parsing ? '正在解析…' : rows.length ? '重新选择文件' : '选择文件'}</Button>
    </div>
    <div className="capability-upload-help"><span>Skill 包保留指令和文本附件；Tool / MCP 使用 JSON 定义。</span><Button variant="ghost" onClick={() => void downloadExamples()}>下载示例包</Button></div>
    <p className="record-note">文件在当前浏览器解析与保存，不执行脚本或连接服务。MCP 仅有连接配置时，先入库并标记待补充工具定义。凭证使用 $&#123;ENV_NAME&#125; 服务端引用。</p>
    {error && <Notice tone="error">{error}</Notice>}
    {!!savedCount && <Notice>已添加 {savedCount} 项，但页面尚未完成刷新。重新读取即可，不会重复添加。</Notice>}
    {!!rows.length && <>
      <div className="capability-upload-summary"><strong>解析 {rows.length} 项 · 可添加 {validRows.length} 项 · 跳过 / 错误 {rows.length - validRows.length} 项</strong><Button disabled={busy || !!savedCount || !validRows.length} variant="ghost" onClick={() => setSelected(ready.length === validRows.length ? [] : validRows.map(row => row.key))}>{ready.length === validRows.length ? '取消全选' : '全选可添加项'}</Button></div>
      <div className="table-scroll capability-upload-preview"><table className="data-table"><thead><tr><th>选择</th><th>能力 / 来源文件</th><th>类型</th><th>用途</th><th>解析结果</th></tr></thead><tbody>{rows.map((row, index) => {
        const reason = status(row, index); const cap = row.capability
        return <tr key={row.key}><td><input type="checkbox" aria-label={`添加 ${row.name}`} disabled={!!reason || busy || !!savedCount} checked={!reason && selected.includes(row.key)} onChange={event => setSelected(event.target.checked ? [...selected, row.key] : selected.filter(key => key !== row.key))} /></td><td><strong>{row.name}</strong><small>{row.source}</small>{cap && <small>v{cap.version}</small>}</td><td>{cap ? capabilityTypeLabel(cap) : '—'}</td><td>{cap ? capabilityPurposes(cap).join('、') : '—'}</td><td><Tag>{reason ? row.error ? '解析失败' : '跳过重复' : cap?.imported?.status === 'pending-tools' ? '可添加 · 待补充工具定义' : '解析成功'}</Tag>{reason && <p>{reason}</p>}</td></tr>
      })}</tbody></table></div>
    </>}
    <footer><span>已有同标识和版本的能力不会覆盖。</span><Button disabled={saving} onClick={close}>取消</Button><Button variant="primary" disabled={busy || !ready.length && !savedCount} onClick={() => void save()}>{saving ? '正在保存…' : savedCount ? '重新读取' : `确认添加（${ready.length}）`}</Button></footer>
  </Modal></div>
}
export function ImportedCapabilityDetail({ capability }: { capability: Capability }) {
  const data = capability.imported
  if (!data) return null
  return <div className="capability-imported-detail"><h3>上传内容</h3><p>{data.source} · {data.files.length} 个文本文件</p><p className="record-note">保留上传定义，尚未接入执行服务。</p>{data.files.map(file => <details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}{data.definition && <details><summary>Tool / MCP 定义</summary><pre>{JSON.stringify(data.definition, null, 2)}</pre></details>}</div>
}
