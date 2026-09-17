import JSZip from 'jszip'
import { parseDocument } from 'yaml'
import type { Capability } from './shared'

export const IMPORT_LIMITS = { files: 30, entries: 100, fileBytes: 1024 * 1024, batchBytes: 4 * 1024 * 1024 }
export interface UploadFile { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }
export interface ImportRow { key: string; source: string; name: string; capability?: Capability; error?: string }
type RecordValue = Record<string, unknown>
const object = (value: unknown, label: string): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}须为对象`)
  return value as RecordValue
}
const text = (value: unknown, label: string, max = 200): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}必填，且不超过 ${max} 字`)
  return value.trim()
}
const strings = (value: unknown, label: string): string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 20) throw new Error(`${label}须为最多 20 项的文本数组`)
  return [...new Set(value.map(v => text(v, label, 80)))]
}
const boolean = (value: unknown, label: string, fallback: boolean) => {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${label}须为布尔值`)
  return value
}
const schema = (value: unknown, label: string): RecordValue => {
  const result = object(value ?? { type: 'object', properties: {} }, label)
  if (result.type !== 'object') throw new Error(`${label}须为 type: object 的 JSON Schema`)
  if (result.properties !== undefined) object(result.properties, `${label}.properties`)
  if (result.required !== undefined && (!Array.isArray(result.required) || result.required.some(key => typeof key !== 'string' || !Object.hasOwn(result.properties ?? {}, key)))) throw new Error(`${label}.required 须引用已定义的字段`)
  return result
}
const safePath = (value: string) => {
  if (!value || /[\\\u0000-\u001f]/.test(value) || value.startsWith('/') || /^[a-z]:/i.test(value) || value.split('/').some(part => part === '..' || part === '.')) throw new Error('压缩包路径不安全，请使用相对路径且不要包含 ..')
  return value
}
const decode = (bytes: ArrayBuffer | Uint8Array) => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '') }
  catch { throw new Error('文件须为 UTF-8 文本') }
}
const failure = (source: string, error: unknown): ImportRow => ({ key: crypto.randomUUID(), source, name: source, error: error instanceof Error ? error.message : '文件解析失败' })

function base(entry: RecordValue, type: 'skill' | 'tool' | 'mcp', source: string): Capability {
  const name = text(entry.name, '名称', 100)
  const version = String(entry.version ?? '1')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,29}$/.test(version)) throw new Error('版本须为不超过 30 字的字母、数字、点、下划线或连字符')
  const code = text(entry.id ?? entry.name, '标识', 100)
  return {
    id: `uploaded.${type}.${encodeURIComponent(code)}@${version}`, name, description: text(entry.description, '说明', 1000), version,
    ...(type === 'mcp' ? {} : { kind: type === 'tool' ? 'builtin' as const : 'skill' as const }),
    purposes: strings(entry.purposes, '用途'), tags: strings(entry.tags, '标签'), skillVersionIds: [], toolVersionIds: [], mcpVersionIds: [], permissionRequirements: strings(entry.permissionRequirements, '权限'),
    imported: { source, importedAt: '', status: 'ready', files: [] },
    execution: { provider: '上传的能力定义', versions: [version], active: true, write: false, idempotent: false, input: '按能力定义提供输入', output: '按能力定义返回结果', action: '', toolActions: [] }
  }
}
function skill(content: string, source: string, files: { path: string; content: string }[]): Capability {
  const match = content.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\s*\n([\s\S]+)$/)
  if (!match || !match[2].trim()) throw new Error('Skill 须包含 YAML frontmatter（name、description）和非空指令正文')
  const document = parseDocument(match[1], { uniqueKeys: true })
  if (document.errors.length || document.warnings.length) throw new Error('Skill 元数据格式错误，请检查 YAML 字段与缩进')
  const entry = object(document.toJS({ maxAliasCount: 0 }), 'Skill 元数据')
  const cap = base(entry, 'skill', source)
  cap.skillVersionIds = [cap.id]
  cap.imported!.files = files
  if (entry['allowed-tools'] || entry.tools) cap.imported!.definition = { declaredTools: entry['allowed-tools'] ?? entry.tools, note: '仅保留工具声明，不自动授权或安装；在智能体中单独配置所需 Tool / MCP。' }
  return cap
}
function tool(entry: RecordValue, source: string): Capability {
  const cap = base(entry, 'tool', source)
  const inputSchema = schema(entry.inputSchema ?? entry.parameters, '输入格式')
  const write = boolean(entry.write, 'write', true)
  const idempotent = boolean(entry.idempotent, 'idempotent', false)
  cap.toolVersionIds = [cap.id]
  cap.execution = { ...cap.execution!, write, idempotent, action: write ? '执行工具操作' : '' }
  cap.parameters = Object.keys((inputSchema.properties ?? {}) as object).map(key => ({ key, label: key, example: '' }))
  cap.imported!.definition = { type: 'tool', name: entry.name, inputSchema, ...(entry.outputSchema ? { outputSchema: object(entry.outputSchema, '输出格式') } : {}), ...(entry.handlerKey ? { handlerKey: text(entry.handlerKey, '处理器标识') } : {}), write, idempotent }
  return cap
}
function mcp(entry: RecordValue, source: string): Capability {
  const cap = base(entry, 'mcp', source)
  const server = object(entry.server ?? entry, 'MCP 连接配置')
  const connection: RecordValue = {}
  if (server.url !== undefined) {
    const raw = text(server.url, 'MCP URL', 1000); let url: URL
    try { url = new URL(raw) } catch { throw new Error('MCP URL 格式错误') }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('MCP URL 仅支持 HTTP/HTTPS，凭证请使用服务端引用')
    connection.url = raw
  } else {
    connection.command = text(server.command, 'MCP command')
    connection.args = strings(server.args, 'MCP args')
  }
  for (const field of ['headers', 'env']) if (server[field] !== undefined) {
    const values = object(server[field], field)
    if (Object.values(values).some(value => typeof value !== 'string' || !/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value))) throw new Error(`${field} 只接受 \${ENV_NAME} 形式的服务端凭证引用，不接收明文凭证`)
    connection[field] = values
  }
  if (entry.tools !== undefined && (!Array.isArray(entry.tools) || entry.tools.length > 50)) throw new Error('MCP tools 须为最多 50 项的数组')
  const tools = ((entry.tools ?? []) as unknown[]).map(value => {
    const item = object(value, 'MCP 工具'); const name = text(item.name, 'MCP 工具名称', 100)
    return { name, description: typeof item.description === 'string' ? item.description.slice(0, 1000) : '', inputSchema: schema(item.inputSchema, `${name} 输入格式`), write: boolean(item.write, `${name}.write`, true), idempotent: boolean(item.idempotent, `${name}.idempotent`, false) }
  })
  if (new Set(tools.map(t => t.name)).size !== tools.length) throw new Error('MCP 工具名称重复')
  cap.mcpVersionIds = [cap.id]
  cap.toolVersionIds = tools.map(t => `${cap.id}/${encodeURIComponent(t.name)}`)
  cap.execution = { ...cap.execution!, active: !!tools.length, write: tools.some(t => t.write), toolActions: tools.map((t, i) => ({ id: cap.toolVersionIds[i], name: t.name, write: t.write, idempotent: t.idempotent })), mcpService: { id: cap.id, connection: tools.length ? 'available' : 'unavailable' } } as Capability['execution']
  cap.imported!.status = tools.length ? 'ready' : 'pending-tools'
  cap.imported!.definition = { type: 'mcp', server: connection, tools }
  return cap
}
function jsonRows(content: string, source: string): ImportRow[] {
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { return [failure(source, new Error('JSON 格式错误，请检查逗号、括号与引号'))] }
  let entries: unknown[]
  try {
    const root = Array.isArray(parsed) ? undefined : object(parsed, '能力文件')
    if (root?.mcpServers) entries = Object.entries(object(root.mcpServers, 'mcpServers')).map(([name, value]) => {
      const settings = value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
      return { ...settings, name, type: 'mcp', description: settings.description ?? `MCP 服务 ${name}`, server: value }
    })
    else entries = Array.isArray(parsed) ? parsed : root?.capabilities !== undefined ? root.capabilities as unknown[] : [root]
    if (!Array.isArray(entries) || !entries.length || entries.length > IMPORT_LIMITS.entries) throw new Error('能力清单须包含 1–100 项')
  } catch (error) { return [failure(source, error)] }
  return entries.map((value, index) => {
    const itemSource = entries.length > 1 ? `${source} #${index + 1}` : source
    try {
      let entry = object(value, '能力定义')
      if (entry.type === 'function') entry = { ...object(entry.function, 'function'), type: 'tool' }
      const cap = entry.type === 'tool' ? tool(entry, itemSource) : entry.type === 'mcp' ? mcp(entry, itemSource) : undefined
      if (!cap) throw new Error('JSON 的 type 须为 tool、function 或 mcp；Skill 请上传 SKILL.md')
      return { key: crypto.randomUUID(), source: itemSource, name: cap.name, capability: cap }
    } catch (error) { return failure(itemSource, error) }
  })
}

/** Inspect central directory limits before decompression; reject unsafe or duplicate paths. */
function zipSize(bytes: ArrayBuffer): number {
  const view = new DataView(bytes); let end = -1
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset--) if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('ZIP 格式不支持或已损坏')
  const count = view.getUint16(end + 10, true); let offset = view.getUint32(end + 16, true); let total = 0; const paths = new Set<string>()
  if (count > IMPORT_LIMITS.entries) throw new Error('ZIP 最多包含 100 个文件和目录')
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('ZIP 目录损坏')
    const size = view.getUint32(offset + 24, true); const nameLength = view.getUint16(offset + 28, true); const extra = view.getUint16(offset + 30, true); const comment = view.getUint16(offset + 32, true)
    if (offset + 46 + nameLength + extra + comment > end) throw new Error('ZIP 目录损坏')
    const path = safePath(decode(new Uint8Array(bytes, offset + 46, nameLength)))
    if (paths.has(path)) throw new Error('ZIP 包含重复路径')
    paths.add(path); total += size
    if (size > IMPORT_LIMITS.fileBytes || total > IMPORT_LIMITS.batchBytes) throw new Error('ZIP 解压后单文件不能超过 1 MB，总大小不能超过 4 MB')
    offset += 46 + nameLength + extra + comment
  }
  return total
}
async function zipRows(bytes: ArrayBuffer, source: string): Promise<ImportRow[]> {
  const archive = await JSZip.loadAsync(bytes)
  const files: { path: string; content: string }[] = []
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue
    safePath(entry.unsafeOriginalName ?? entry.name)
    if ((Number(entry.unixPermissions) & 0xf000) === 0xa000) throw new Error('ZIP 不支持符号链接')
    if (/^(?:__MACOSX\/)|(?:^|\/)\.DS_Store$/.test(entry.name)) continue
    const data = await entry.async('uint8array')
    if (data.length > IMPORT_LIMITS.fileBytes) throw new Error('解压文件超过 1 MB')
    files.push({ path: entry.name, content: decode(data) })
  }
  const roots = files.filter(f => /(^|\/)SKILL\.md$/i.test(f.path)).map(f => ({ file: f, root: f.path.slice(0, -8) })).sort((a, b) => b.root.length - a.root.length)
  const rows: ImportRow[] = []; const claimed = new Set<string>()
  for (const { file, root } of roots) {
    const children = files.filter(f => !claimed.has(f.path) && f.path.startsWith(root))
    children.forEach(f => claimed.add(f.path))
    const itemSource = `${source}/${file.path}`
    try { const cap = skill(file.content, itemSource, children.map(f => ({ path: f.path.slice(root.length), content: f.content }))); rows.push({ key: crypto.randomUUID(), source: itemSource, name: cap.name, capability: cap }) }
    catch (error) { rows.push(failure(itemSource, error)) }
  }
  for (const file of files.filter(f => !claimed.has(f.path))) {
    const path = `${source}/${file.path}`
    if (/\.json$/i.test(file.path)) rows.push(...jsonRows(file.content, path))
    else rows.push(failure(path, new Error('无法识别独立文件，请使用 SKILL.md 技能包或 Tool / MCP JSON')))
  }
  return rows.length ? rows : [failure(source, new Error('ZIP 中没有可导入的能力文件'))]
}
export async function parseCapabilityFiles(files: UploadFile[]): Promise<ImportRow[]> {
  if (!files.length || files.length > IMPORT_LIMITS.files) throw new Error('一次请选择 1–30 个文件')
  if (files.reduce((total, f) => total + f.size, 0) > IMPORT_LIMITS.batchBytes) throw new Error('每批上传总大小不能超过 4 MB')
  const rows: ImportRow[] = []; let totalBytes = 0
  for (const file of files) {
    try {
      if (file.size > IMPORT_LIMITS.fileBytes) throw new Error('单文件不能超过 1 MB')
      if (!/\.(md|json|zip)$/i.test(file.name)) throw new Error('支持 .md、.json、.zip 文件')
      const bytes = await file.arrayBuffer()
      totalBytes += /\.zip$/i.test(file.name) ? zipSize(bytes) : bytes.byteLength
      if (totalBytes > IMPORT_LIMITS.batchBytes) throw new Error('本批解压后总大小超过 4 MB，请分批上传')
      if (/\.zip$/i.test(file.name)) rows.push(...await zipRows(bytes, file.name))
      else if (/\.json$/i.test(file.name)) rows.push(...jsonRows(decode(bytes), file.name))
      else { const content = decode(bytes); const cap = skill(content, file.name, [{ path: 'SKILL.md', content }]); rows.push({ key: crypto.randomUUID(), source: file.name, name: cap.name, capability: cap }) }
    } catch (error) { rows.push(failure(file.name, error)) }
  }
  if (rows.length > IMPORT_LIMITS.entries) throw new Error('每批最多解析 100 项，请拆分文件后重试')
  return rows
}
export function importRowStatus(row: ImportRow, existing: Capability[], preceding: ImportRow[]): string {
  if (row.error) return row.error
  if (!row.capability) return '解析结果缺失'
  if (existing.some(c => c.id === row.capability!.id)) return '目录已存在同标识和版本，跳过'
  if (preceding.some(r => r.capability?.id === row.capability!.id)) return '本批次重复，跳过'
  return ''
}
export function validateImportedCapabilities(values: Capability[]) {
  if (!values.length || values.length > IMPORT_LIMITS.entries || JSON.stringify(values).length > IMPORT_LIMITS.batchBytes) throw new Error('导入内容为空或超过每批限制')
  if (new Set(values.map(v => v.id)).size !== values.length) throw new Error('本批导入包含重复能力')
  for (const cap of values) {
    if (!cap.id.startsWith('uploaded.') || !cap.imported || !cap.execution || !cap.name || !cap.description || !Array.isArray(cap.imported.files) || !Array.isArray(cap.execution.toolActions) || !cap.execution.versions.includes(String(cap.version))) throw new Error('能力导入数据不完整，请重新解析文件')
  }
}
