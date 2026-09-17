// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import JSZip from 'jszip'
import { App } from './App'
import { CapabilityUpload, uploadExamples } from './CapabilityUpload'
import { IMPORT_LIMITS, importRowStatus, parseCapabilityFiles, type UploadFile } from './capability-import'
import { PrototypeStore, prototypeStore, resetPrototype } from './prototype-store'
import { capabilitiesOf, blankConfig, capabilityBindingIssues, expertMvpIssues, selectCapabilities } from './campus/model'
import { LEGACY_MODEL_PROVIDER, modelKey } from './model-center'

class MemoryStorage implements Storage {
  values = new Map<string, string>(); fail = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { if (this.fail) throw new Error('存储空间不足'); this.values.set(key, value) }
}
const admin = { role: 'admin', department: '信息化处' } as const
const store = () => prototypeStore()
const state = () => store().state().campus!
const upload = (name: string, content: string | ArrayBuffer): UploadFile => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content).buffer as ArrayBuffer : content
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes }
}
const examples = () => Object.entries(uploadExamples).filter(([name]) => !name.includes('references')).map(([name, content]) => upload(name, content))
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const fill = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
const selectFiles = (files = Object.entries(uploadExamples).filter(([name]) => !name.includes('references')).map(([name, content]) => new File([content], name.split('/').pop()!))) => fireEvent.change(screen.getByLabelText('上传能力文件'), { target: { files } })
beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); resetPrototype()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('parses mixed ZIP packages and preserves Skill instructions, attachments and tool schemas', async () => {
  const zip = new JSZip(); Object.entries(uploadExamples).forEach(([name, content]) => zip.file(name, content))
  zip.file('summary/scripts/inspect.js', 'throw new Error("never execute uploaded scripts")')
  const rows = await parseCapabilityFiles([upload('batch.zip', await zip.generateAsync({ type: 'arraybuffer' }))])
  expect(rows).toHaveLength(3); expect(rows.every(row => !row.error)).toBe(true)
  const skill = rows.find(row => row.capability?.kind === 'skill')!.capability!
  expect(skill.imported?.files.map(file => file.path)).toEqual(['SKILL.md', 'references/format.md', 'scripts/inspect.js'])
  expect(skill.imported?.files[0].content).toBe(uploadExamples['summary/SKILL.md'])
  expect(rows.find(row => row.capability?.kind === 'builtin')?.capability?.imported?.definition).toMatchObject({ handlerKey: 'text.stats', inputSchema: { type: 'object', required: ['text'] }, write: false })
  expect(rows.find(row => row.capability?.mcpVersionIds.length)?.capability?.execution?.toolActions).toEqual([expect.objectContaining({ name: 'search_documents', write: false })])
})
it('parses JSON arrays, OpenAI function definitions and mcpServers without discarding other valid entries', async () => {
  const rows = await parseCapabilityFiles([
    upload('tools.json', JSON.stringify([{ type: 'function', function: { name: 'count', description: '统计文本', parameters: { type: 'object', properties: {} } } }, { type: 'unknown' }])),
    upload('servers.json', JSON.stringify({ mcpServers: { docs: { url: 'https://example.invalid/mcp' }, broken: null } }))
  ])
  expect(rows).toHaveLength(4)
  expect(rows.filter(row => row.error)).toHaveLength(2)
  expect(rows[0].capability?.execution?.write).toBe(true)
  expect(rows[2].capability?.imported?.status).toBe('pending-tools')
  expect(rows[2].capability?.execution?.active).toBe(false)
})
it('keeps Skill tool declarations as data without granting tools', async () => {
  const text = uploadExamples['summary/SKILL.md'].replace('version: "1"', 'version: "1"\nallowed-tools: [Read, Bash]')
  const [row] = await parseCapabilityFiles([upload('SKILL.md', text)])
  expect(row.error).toBeUndefined(); expect(row.capability?.toolVersionIds).toEqual([])
  expect(row.capability?.imported?.definition).toMatchObject({ declaredTools: ['Read', 'Bash'] })
})
it.each([
  ['broken.json', '{', 'JSON 格式错误'],
  ['bad.md', '# No metadata', 'frontmatter'],
  ['duplicate.md', '---\nname: a\nname: b\ndescription: d\n---\nBody', '元数据格式错误'],
  ['unsupported.exe', 'no', '支持 .md'],
  ['schema.json', JSON.stringify({ type: 'tool', name: 'bad', description: 'bad schema', inputSchema: { type: 'object', properties: {}, required: ['missing'] } }), 'required'],
  ['secret.json', JSON.stringify({ mcpServers: { a: { url: 'https://example.invalid', env: { API_KEY: 'do-not-save-this-value' } } } }), '不接收明文凭证']
])('reports a readable error for %s', async (name, content, message) => {
  const [row] = await parseCapabilityFiles([upload(name, content)])
  expect(row.error).toContain(message); expect(row.capability).toBeUndefined()
  expect(row.error).not.toContain('do-not-save-this-value')
})
it('rejects unsafe ZIP paths before extraction, invalid UTF-8 and oversized batches', async () => {
  const zip = new JSZip().file('../SKILL.md', uploadExamples['summary/SKILL.md'])
  const rows = await parseCapabilityFiles([upload('unsafe.zip', await zip.generateAsync({ type: 'arraybuffer' })), upload('invalid.md', new Uint8Array([0xff]).buffer)])
  expect(rows[0].error).toContain('路径不安全'); expect(rows[1].error).toContain('UTF-8')
  await expect(parseCapabilityFiles(Array.from({ length: 31 }, () => upload('a.md', 'a')))).rejects.toThrow('1–30')
  const [large] = await parseCapabilityFiles([{ name: 'large.json', size: IMPORT_LIMITS.fileBytes + 1, arrayBuffer: vi.fn() }])
  expect(large.error).toContain('单文件不能超过')
})
it('skips repeated IDs and versions while retaining the valid members of a batch', async () => {
  const rows = await parseCapabilityFiles([...examples(), examples()[0]])
  expect(importRowStatus(rows[3], [], rows.slice(0, 3))).toContain('本批次重复')
  expect(importRowStatus(rows[0], [rows[0].capability!], [])).toContain('目录已存在')
})
it('persists imports atomically, rejects stale revisions and unauthorized writes, and isolates stores', async () => {
  const values = (await parseCapabilityFiles(examples())).map(row => row.capability!)
  const before = store().state()
  expect(() => store().importCapabilities(state().revision, { ...admin, role: 'auditor' }, values)).toThrow('系统管理员')
  ;(localStorage as MemoryStorage).fail = true
  expect(() => store().importCapabilities(state().revision, admin, values)).toThrow('存储空间不足')
  expect(store().state()).toEqual(before)
  ;(localStorage as MemoryStorage).fail = false
  expect(store().importCapabilities(state().revision, admin, values)).toBe(3)
  expect(new PrototypeStore(localStorage).state().campus?.importedCapabilities).toHaveLength(3)
  expect(new PrototypeStore().state().campus?.importedCapabilities).toBeUndefined()
  const after = store().state()
  expect(() => store().importCapabilities(state().revision - 1, admin, values)).toThrow('目录已更新')
  expect(() => store().importCapabilities(state().revision, admin, values)).toThrow('已有同标识')
  expect(store().state()).toEqual(after)
})
it('lets the administrator upload all three types, bind them to an expert and publish after reload', async () => {
  window.history.replaceState(null, '', '#/capabilities'); render(<App />)
  await screen.findByRole('button', { name: '批量上传' }); click('批量上传'); selectFiles()
  await waitFor(() => expect(screen.getByRole('button', { name: '确认添加（3）' })).toBeEnabled())
  click('确认添加（3）'); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(state().importedCapabilities).toHaveLength(3)
  click('summary-helper'); expect(within(screen.getByRole('dialog')).getByText('SKILL.md')).toBeVisible(); click('关闭')
  click('智能体中心'); await screen.findByRole('button', { name: '创建专家' }); click('创建专家'); await screen.findByRole('heading', { name: '创建专家智能体' })
  fill('专家名称', '上传能力验证专家'); fill('专家简介', '使用已导入的能力'); fill('系统提示词', '按用户要求整理资料。')
  fireEvent.change(screen.getByRole('combobox', { name: '运行模型' }), { target: { value: modelKey({ providerId: LEGACY_MODEL_PROVIDER, modelId: 'deepseek-v4' }) } })
  click('执行能力'); click('添加能力')
  fill('搜索能力', 'summary-helper'); fireEvent.click(screen.getByRole('checkbox', { name: 'summary-helper' }))
  fill('搜索能力', '文字统计工具'); fireEvent.click(screen.getByRole('checkbox', { name: '文字统计工具' }))
  fill('搜索能力', '文档检索 MCP'); fireEvent.click(screen.getByRole('checkbox', { name: '启用 search_documents' }))
  click('添加所选（3）'); click('保存草稿')
  await waitFor(() => expect(screen.getByRole('button', { name: '发布专家' })).toBeEnabled())
  click('发布专家'); fill('发布说明', '导入能力验收'); click('确认发布')
  await waitFor(() => expect(state().agents.find(a => a.draft.name === '上传能力验证专家')?.live).toBe(1))
  const saved = new PrototypeStore(localStorage).state().campus!
  const agent = saved.agents.find(a => a.draft.name === '上传能力验证专家')!
  expect(agent.versions[0].config.tools.map(b => b.id).sort()).toEqual(saved.importedCapabilities!.map(c => c.id).sort())
  expect(expertMvpIssues(saved, agent.id, agent.versions[0].config, true)).toEqual([])
})
it('does not expose the upload entry to read-only administrators', async () => {
  sessionStorage.setItem('campus-demo-actor', JSON.stringify({ ...admin, role: 'auditor' }))
  window.history.replaceState(null, '', '#/capabilities'); render(<App />)
  await screen.findByRole('heading', { name: '能力中心' })
  expect(screen.queryByRole('button', { name: '批量上传' })).not.toBeInTheDocument()
})
it('keeps pending MCP connections out of publishable bindings', async () => {
  const [row] = await parseCapabilityFiles([upload('mcp.json', JSON.stringify({ mcpServers: { search: { url: 'https://example.invalid' } } }))])
  store().importCapabilities(state().revision, admin, [row.capability!])
  const config = blankConfig(); Object.assign(config, selectCapabilities(config, [row.capability!.id], capabilitiesOf(state())))
  expect(expertMvpIssues(state(), '', config, true).join()).toContain('能力已停用或版本不可用')
})
it('does not treat an imported write tool as a read action or bypass its confirmation', async () => {
  const [row] = await parseCapabilityFiles([upload('write.json', JSON.stringify({ type: 'tool', name: '发送通知', description: '发送一条消息', write: true }))])
  const catalog = [row.capability!]; const config = blankConfig()
  Object.assign(config, selectCapabilities(config, [catalog[0].id], catalog))
  expect(config.tools[0]).toMatchObject({ read: false, write: false })
  config.tools[0].read = true
  expect(capabilityBindingIssues(config, false, catalog).join()).toContain('此工具是写操作')
  config.tools[0].read = false; config.tools[0].write = true; config.tools[0].retry = 0
  expect(capabilityBindingIssues(config, false, catalog).join()).toContain('前置人工确认节点')
})
it('retries only reload after imports were persisted, without duplicating the batch', async () => {
  const reload = vi.fn().mockRejectedValueOnce(new Error('读取失败')).mockResolvedValue(undefined); const close = vi.fn()
  render(<CapabilityUpload capabilities={store().state().capabilities} revision={state().revision} actor={admin} reload={reload} notify={vi.fn()} close={close} />)
  selectFiles(); await waitFor(() => expect(screen.getByRole('button', { name: '确认添加（3）' })).toBeEnabled()); click('确认添加（3）')
  await screen.findByRole('button', { name: '重新读取' }); const revision = state().revision
  expect(state().importedCapabilities).toHaveLength(3)
  click('重新读取'); await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(state().revision).toBe(revision); expect(state().importedCapabilities).toHaveLength(3)
})
