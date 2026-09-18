import { ModelAccess, ServiceUsage, ServiceResult, PrototypeScenarios, initialServiceSettings, serviceBlock, type ServiceSettings, type ResultInteraction } from './ServiceExperience'
import { attachmentIssue, makeServiceRecord, parseExpertPreview, sourceName, type PublicExpertPreview, type ServiceRecord, type ServiceScenario } from '../../../src/shared/service-prototype'
import { NewConversationHeader, NewConversationActions } from './NewConversationWelcome'
import { ConversationBriefForm, emptyConversationBrief, type ConversationBrief } from './ConversationBriefForm'
import documentStructureExample from './conversation-example.md?raw'
import { ArchivedConversationsPage } from './ArchivedConversationsPage'
import { AgentCatalogPage } from './AgentCatalogPage'
import { CreateExpertPage } from './CreateExpertPage'
import { blankExpertDraft, expertCapabilities, expertQuestions, type ExpertDraft } from './expert-creation'
import { campusAgentCategories } from './campus-agent-catalog'
import { employeeAvatarSrc, supervisorIdentity } from '../../../src/renderer/src/employee-avatar'
import { formatClientTimestamp } from '../../../src/renderer/src/client-time'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentType, FormEvent, ReactNode } from 'react'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Book,
  Brain,
  Check,
  Database,
  EditPencil,
  Group,
  InfoCircle,
  Link,
  Microphone,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  Plus,
  Search,
  ShieldCheck,
  Sparks,
  Tools,
  User,
  Xmark
} from 'iconoir-react'
import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components'
import networkIntelligenceAvatar from '../../../src/renderer/src/assets/employee-avatars/network-intelligence.png'
import documentWriterAvatar from '../../../src/renderer/src/assets/employee-avatars/document-writer.png'
import { ClientIconSystem } from '../../../src/renderer/src/components/client-icon-system'
import {
  AppShell, Toolbar as ClientToolbar, Rail as ClientRail, ContextPane as ClientContextPane,
  type RailItem,
  IconButton as ClientIconButton, Avatar as ClientAvatar, StatusLight as ClientStatusLight,
  SearchBox as ClientSearchBox, ListRow as ClientListRow,
  SectionHeader, SummaryCardGrid, SummaryCard,
  DetailPage, DetailSummaryPanel, DetailSectionHeader, DetailState, SettingsBlock
} from '../../../src/renderer/src/components/client-ui'
import { ChatMessage, MarkdownMessage, MarkdownContent, MessageAttachmentGroup as ClientMessageAttachmentGroup, fileDetail } from '../../../src/renderer/src/components/message-ui'
import { ComposerAttachmentTray } from '../../../src/renderer/src/components/composer-attachments'
import githubConnectionIcon from '../../../src/renderer/src/assets/connections/github.svg'
import feishuConnectionIcon from '../../../src/renderer/src/assets/connections/feishu.svg'
import teamsConnectionIcon from '../../../src/renderer/src/assets/connections/teams.svg'
import notionConnectionIcon from '../../../src/renderer/src/assets/connections/notion.svg'
import dingtalkConnectionIcon from '../../../src/renderer/src/assets/connections/dingtalk.svg'
import wecomConnectionIcon from '../../../src/renderer/src/assets/connections/wecom.svg'
import wechatConnectionIcon from '../../../src/renderer/src/assets/connections/wechat.svg'
import yuqueConnectionIcon from '../../../src/renderer/src/assets/connections/yuque.svg'
import wpsConnectionIcon from '../../../src/renderer/src/assets/connections/wps.svg'
import baiduNetdiskConnectionIcon from '../../../src/renderer/src/assets/connections/baidu-netdisk.svg'
import giteeConnectionIcon from '../../../src/renderer/src/assets/connections/gitee.svg'
import alibabaCloudConnectionIcon from '../../../src/renderer/src/assets/connections/alibaba-cloud.svg'

type PageId = 'messages' | 'contacts' | 'capabilities' | 'connections' | 'personal' | 'archives' | 'create-expert' | 'model-access'
type IconComponent = ComponentType<{ width?: number | string; height?: number | string; strokeWidth?: number; 'aria-hidden'?: boolean }>
type StatusTone = 'active' | 'waiting' | 'success' | 'danger' | 'muted'
type DetailView = 'capability-info' | null

interface Conversation {
  scenario?: ServiceScenario
  id: string
  title: string
  preview: string
  time: string
  unread?: number
  attention?: boolean
  avatar: string
  color: string
  agentId: string
  agentSnapshot: Agent
  isNew?: boolean
  archived?: boolean
}

function employeeAvatarForName(name: string): string | undefined {
  if (name.includes('网络') || name.includes('情报')) return networkIntelligenceAvatar
  if (name.includes('文档') || name.includes('编辑')) return documentWriterAvatar
  return undefined
}

interface Agent {
  version?: number
  preview?: PublicExpertPreview
  id: string
  name: string
  initials: string
  role: string
  status: string
  tone: StatusTone
  description: string
  color: string
  avatarUrl?: string | null
  prompt?: string
  configuration?: ExpertDraft
  model?: string
  joinedAt?: string
  capabilities: string[]
  memoryScopes?: string[]
  deliveries: Array<{ title: string; meta: string; state: string }>
}

interface UserProfile {
  readonly name: string
  readonly studentId: string
  avatarUrl: string | null
}

interface Capability {
  id: string
  kind: 'skill' | 'tool'
  category: string
  name: string
  summary: string
  status: string
  tone: StatusTone
  agents: string[]
  version: string
  useCases: string[]
  skills: string[]
  tools: string[]
  permissions: string[]
  skillMarkdown?: string
}

interface MessageAttachment {
  file?: File
  id: string
  name: string
  detail: string
}

interface LocalMessage {
  interaction?: ResultInteraction
  result?: ServiceRecord
  id: string
  createdAt: string
  text: string
  attachments: MessageAttachment[]
}

interface ConversationSession {
  draft: string
  attachments: MessageAttachment[]
  messages: LocalMessage[]
  brief?: ConversationBrief
  briefSubmitted?: boolean
}

const emptyConversationSession: ConversationSession = { draft: '', attachments: [], messages: [] }
const prototypeReply = '这是一条单智能体对话的演示回复。你的消息和附件仅保留在当前会话中，尚未调用模型处理。'

function messageDateLabel(value: string): string {
  const date = new Date(value)
  return date.toDateString() === new Date().toDateString() ? '今天' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

const exampleUserAttachments: MessageAttachment[] = [
  { id: 'brief', name: 'SEA-SaaS-研究需求.pdf', detail: 'PDF · 1.8 MB' },
  { id: 'markets', name: '目标市场清单.xlsx', detail: 'XLSX · 128 KB' },
  { id: 'notes', name: '补充说明.md', detail: 'Markdown · 24 KB' }
]

const generatedAttachments: MessageAttachment[] = [
  { id: 'report', name: 'SEA-SaaS-Market-Entry.md', detail: 'Markdown · 286 KB' },
  { id: 'evidence', name: 'Evidence-Index.csv', detail: 'CSV · 94 KB' },
  { id: 'sources', name: 'Verified-Sources.pdf', detail: 'PDF · 2.4 MB' }
]

const assistantIdentity = supervisorIdentity({ name: '助理' })
const assistantAgent: Agent = {
  id: 'assistant', ...assistantIdentity, avatarUrl: assistantIdentity.avatarSrc,
  role: '日常助理', status: '可对话', tone: 'success',
  description: '有什么想聊的，或需要我帮忙的？你也可以去找不同专长的专家聊天。',
  capabilities: [], deliveries: []
}

const initialAgents: Agent[] = [
  {
    id: 'employee.network-intelligence', name: '网络情报员', initials: '网', role: '公开信息检索与核验', status: '待命', tone: 'success', color: '#b8c982', avatarUrl: networkIntelligenceAvatar,
    description: '从经过授权的公开来源收集资料，形成可追溯的 ResearchBundle。',
    capabilities: ['多源网络调研', '来源核验'],
    deliveries: [
      { title: '东南亚 SaaS 市场资料包', meta: '今天 14:18', state: '验收通过' },
      { title: 'Agent 框架近 30 天动态', meta: '8 月 29 日', state: '验收通过' },
      { title: '高校数字员工案例清单', meta: '8 月 26 日', state: '存在 1 项缺口' }
    ]
  },
  {
    id: 'employee.document-writer', name: '文档编写员', initials: '文', role: '结构化文档撰写', status: '待命', tone: 'success', color: '#d7b36a', avatarUrl: documentWriterAvatar,
    description: '只读取经过确认的任务资料，保留来源、冲突和信息缺口，输出可验收文档。',
    capabilities: ['调研分析报告', '内容编辑', '格式检查'],
    deliveries: [
      { title: '东南亚市场进入建议', meta: '今天 14:32', state: '验收通过' },
      { title: '多智能体产品竞品分析', meta: '8 月 30 日', state: '验收通过' },
      { title: '内容渠道数据复盘', meta: '8 月 25 日', state: '验收通过' }
    ]
  }
]

const catalogAgents: Agent[] = campusAgentCategories.flatMap((category) => category.employees.map((employee) => ({
  id: employee.id, name: employee.name, initials: employee.name.slice(0, 1), role: category.name,
  status: '可对话', tone: 'success', description: employee.description, color: employee.color,
  avatarUrl: employeeAvatarSrc({ employeeId: employee.id }), model: 'deepseek-v4', version: 1, capabilities: [], deliveries: []
})))

// Each conversation belongs to exactly one agent; the snapshot preserves history after deletion.
const initialConversations: Conversation[] = [
  { id: 'assistant-chat', title: '与助理对话', preview: '助理 · 开始一段新对话', time: '刚刚', avatar: assistantAgent.initials, color: assistantAgent.color, agentId: assistantAgent.id, agentSnapshot: assistantAgent, isNew: true },
  { id: 'sea-saas', title: '东南亚市场研究', preview: '网络情报员 · 研究资料示例', time: '14:32', avatar: '网', color: '#b8c982', agentId: initialAgents[0].id, agentSnapshot: initialAgents[0] },
  { id: 'plain-qa', title: 'Agent 产品讨论', preview: '文档编写员 · 文档结构示例', time: '12:26', avatar: '文', color: '#d7b36a', agentId: initialAgents[1].id, agentSnapshot: initialAgents[1] }
]

function createSkillMarkdown({ name, description, version, useCases, steps, tools, permissions, output, acceptance }: { name: string; description: string; version: string; useCases: string[]; steps: string[]; tools: string[]; permissions: string[]; output: string; acceptance: string[] }): string {
  return `# ${name}

> ${description}

## 元数据

| 字段 | 内容 |
| --- | --- |
| 名称 | ${name} |
| 版本 | ${version} |
| 状态 | 可用于对话 |

## 适用范围

${useCases.map((item) => `- ${item}`).join('\n')}

## 执行流程

${steps.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## Tools

${tools.map((item) => `- \`${item}\``).join('\n')}

## 权限边界

${permissions.map((item) => `- ${item}`).join('\n')}

> 只使用当前会话明确授予的最小权限。不得把一次授权延续到其他会话。

## 交付物

${output}

## 验收标准

${acceptance.map((item) => `- [ ] ${item}`).join('\n')}

## 禁止事项

- 不得伪造来源、执行结果或已通过验收的状态。
- 不得在缺少执行证据时向用户承诺已完成。
- 不得把未验证信息写成确定结论。
`
}

const capabilities: Capability[] = [
  {
    id: 'research', kind: 'skill', category: 'Research Skill', name: '多源网络调研', summary: '从许可来源收集、核验并结构化外部资料。', status: '可用', tone: 'success', agents: ['网络情报员'], version: '2.1',
    useCases: ['竞品调研', '市场研究', '公开资料核验'], skills: ['来源规划', '交叉核验', '信息缺口识别'], tools: ['GitHub Repository Search', 'RSS Reader'], permissions: ['公开网络读取', 'ResearchBundle 写入'],
    skillMarkdown: createSkillMarkdown({ name: '多源网络调研', description: '从许可来源收集、核验并结构化外部资料。', version: '2.1', useCases: ['需要外部公开资料支撑的市场、竞品与趋势研究', '需要保留来源定位与检索时间的事实核验', '需要显式标注信息冲突和缺口的研究问题'], steps: ['确认研究目标、范围、时效与验收标准', '建立来源计划并检查当前会话的访问授权', '使用获准 Tool 收集资料，记录来源 URL 与时间', '对关键事实进行交叉核验，标记冲突与缺口', '生成 ResearchBundle 并向用户说明来源和缺口'], tools: ['GitHub Repository Search', 'RSS Reader'], permissions: ['只读访问公开网络来源', '向当前会话的 ResearchBundle 写入结构化资料'], output: '`ResearchBundle`：包含来源、事实、冲突、信息缺口和检索时间。', acceptance: ['每项关键事实至少有一个可定位来源', '结论与来源可以双向追溯', '冲突信息和未知项没有被隐藏'] })
  },
  {
    id: 'analysis', kind: 'skill', category: 'Analysis Skill', name: '调研分析报告', summary: '依据已验证来源形成分析结论与可交付文档。', status: '可用', tone: 'success', agents: ['文档编写员'], version: '1.4',
    useCases: ['研究报告', '决策建议', '证据综合'], skills: ['Claim 综合', '冲突处理', '报告结构化'], tools: ['Document Export'], permissions: ['任务资料读取', '交付目录写入'],
    skillMarkdown: createSkillMarkdown({ name: '调研分析报告', description: '依据已验证来源形成分析结论与可交付文档。', version: '1.4', useCases: ['把 ResearchBundle 转化为可评审的分析报告', '识别事实、推断、建议之间的证据边界', '输出带有风险和信息缺口的决策材料'], steps: ['读取冻结的研究资料与验收标准', '拆分事实、推断、假设和建议', '处理来源冲突并评估证据强度', '形成报告结构与关键结论', '导出版本化文档并交付用户评审'], tools: ['Document Export'], permissions: ['读取当前会话资料', '写入当前会话交付目录'], output: '版本化分析报告、证据索引和待确认问题清单。', acceptance: ['结论均能定位到证据或明确标注为推断', '报告覆盖用户确认的验收标准', '剩余风险和信息缺口完整披露'] })
  },
  {
    id: 'editing', kind: 'skill', category: 'Content Skill', name: '内容编辑', summary: '将确认内容编辑为符合渠道规范的发布稿。', status: '可用', tone: 'success', agents: ['文档编写员'], version: '1.2',
    useCases: ['长文编辑', '渠道改写', '格式检查'], skills: ['内容结构优化', '发布前检查'], tools: ['Markdown Export'], permissions: ['任务资料读取', '交付目录写入'],
    skillMarkdown: createSkillMarkdown({ name: '内容编辑', description: '将确认内容编辑为符合渠道规范的发布稿。', version: '1.2', useCases: ['长文结构与表达优化', '基于同一事实源生成渠道版本', '发布前格式、链接和措辞检查'], steps: ['读取已确认事实、受众与渠道约束', '保持事实边界并重组内容结构', '按渠道生成对应版本', '执行格式、链接与禁用表达检查', '导出发布稿并交付用户确认'], tools: ['Markdown Export'], permissions: ['读取当前会话已确认内容', '写入当前会话交付目录'], output: 'Markdown 发布稿、渠道版本和发布前检查结果。', acceptance: ['没有新增未经确认的事实', '结构和语气符合目标渠道', '链接、格式和禁用表达检查通过'] })
  },
  {
    id: 'visual', kind: 'skill', category: 'Creative Skill', name: '视觉方案', summary: '从内容目标生成视觉方向、提示词和版本化资产。', status: '可用', tone: 'success', agents: [], version: '1.0',
    useCases: ['文章封面', '产品配图', '视觉提案'], skills: ['视觉方向', '提示词编排'], tools: ['Image Generation'], permissions: ['图像模型调用', '交付目录写入'],
    skillMarkdown: createSkillMarkdown({ name: '视觉方案', description: '从内容目标生成视觉方向、提示词和版本化资产。', version: '1.0', useCases: ['文章封面与社交媒体配图', '产品概念和视觉方向提案', '基于既有资产进行受控图像编辑'], steps: ['确认内容目标、品牌约束与使用场景', '提出可比较的视觉方向', '获得方向确认后编排生成提示词', '调用图像 Tool 并记录模型与版本', '整理预览和源文件交付用户评审'], tools: ['Image Generation'], permissions: ['调用已配置的图像模型', '写入当前会话交付目录'], output: '视觉方向说明、生成提示词、预览图和版本化资产。', acceptance: ['视觉结果符合已确认方向', '提示词、模型和版本记录完整', '交付尺寸和格式满足使用场景'] })
  },
  {
    id: 'github-search', kind: 'tool', category: 'MCP Tool', name: 'GitHub Repository Search', summary: '通过 MCP 搜索公开仓库、代码与发布信息。', status: '可用', tone: 'success', agents: ['网络情报员'], version: '1.3',
    useCases: ['仓库检索', '代码证据定位', 'Release 核验'], skills: ['多源网络调研', '来源核验'], tools: ['MCP Server: github', 'Transport: stdio'], permissions: ['公开仓库读取', '搜索结果写入任务上下文']
  },
  {
    id: 'rss-reader', kind: 'tool', category: 'MCP Tool', name: 'RSS Reader', summary: '通过 MCP 获取、解析并去重订阅源内容。', status: '可用', tone: 'success', agents: ['网络情报员'], version: '1.1',
    useCases: ['行业动态监控', '来源订阅', '增量内容读取'], skills: ['多源网络调研'], tools: ['MCP Server: rss', 'Transport: stdio'], permissions: ['公开订阅源读取']
  },
  {
    id: 'document-export', kind: 'tool', category: '内置 Tool', name: 'Document Export', summary: '把验收通过的内容写入版本化交付目录。', status: '可用', tone: 'success', agents: ['文档编写员'], version: '2.0',
    useCases: ['Markdown 导出', '交付物固化', '版本记录'], skills: ['调研分析报告', '内容编辑'], tools: ['Runtime: local', 'Mode: built-in'], permissions: ['交付目录写入']
  },
  {
    id: 'image-generation', kind: 'tool', category: '模型 Tool', name: 'Image Generation', summary: '调用已配置的图像模型生成和编辑视觉资产。', status: '可用', tone: 'success', agents: [], version: '1.0',
    useCases: ['图像生成', '局部编辑', '版本化视觉资产'], skills: ['视觉方案'], tools: ['Provider: Poe', 'Model: gpt-image-2'], permissions: ['图像模型调用', '交付目录写入']
  }
]

const navItems: Array<RailItem<PageId | 'new-conversation' | 'knowledge'>> = [
  { id: 'new-conversation', label: '新对话', icon: EditPencil },
  { id: 'contacts', label: '专家市场', icon: Group },
  { id: 'knowledge', label: '知识库', icon: Book, badge: '敬请期待', disabled: true }
]

function IconButton({ onPress, isDisabled, ...props }: { label: string; icon: IconComponent; onPress?: () => void; isDisabled?: boolean; className?: string }): React.JSX.Element {
  return <ClientIconButton {...props} onClick={onPress} disabled={isDisabled} />
}

function StatusLight({ tone, ...props }: { tone: StatusTone; label: string; breathing?: boolean }): React.JSX.Element {
  return <ClientStatusLight state={tone} {...props} />
}

function Avatar({ size = 'medium', ...props }: { label: string; initials: string; color: string; size?: 'small' | 'medium' | 'large'; src?: string | null }): React.JSX.Element {
  return <ClientAvatar {...props} size={size} />
}

function SearchBox({ placeholder, ...props }: { placeholder: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  return <ClientSearchBox label={placeholder} placeholder={placeholder} {...props} />
}

function selectionIncludes(values: string[], query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return !normalized || values.some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized))
}

function ListRow({ onPress, ...props }: { selected?: boolean; avatar?: ReactNode; title: string; subtitle: string; meta?: string; marker?: ReactNode; onPress: () => void }): React.JSX.Element {
  return <ClientListRow {...props} onClick={onPress} />
}

function ConversationRow({ conversation, selected, onPress, onArchive }: { conversation: Conversation; selected: boolean; onPress: () => void; onArchive: () => void }): React.JSX.Element {
  return (
    <div className="conversation-row">
      <ListRow selected={selected} title={conversation.title} subtitle={conversation.preview} meta={conversation.time} marker={conversation.unread ? <span className="unread-dot" aria-label="未读消息" /> : undefined} onPress={onPress} />
      <IconButton className="conversation-row__archive" label={`归档对话 ${conversation.title}`} icon={Archive} onPress={onArchive} />
    </div>
  )
}

function MessageAttachmentGroup({ attachments, source, onRemove }: { attachments: MessageAttachment[]; source: 'user' | 'agent'; onRemove?: (id: string) => void }): React.JSX.Element | null {
  const [preview, setPreview] = useState<MessageAttachment | null>(null)
  const [fileUrl, setFileUrl] = useState('')
  useEffect(() => {
    if (!preview?.file) return
    const url = URL.createObjectURL(preview.file)
    setFileUrl(url)
    return () => { URL.revokeObjectURL(url) }
  }, [preview])
  if (!attachments.length) return null
  const canOpen = attachments.every((attachment) => attachment.file)
  return <>
    {onRemove ? <ComposerAttachmentTray attachments={attachments} onRemove={onRemove} onOpen={(id) => setPreview(attachments.find((attachment) => attachment.id === id) ?? null)} /> : <ClientMessageAttachmentGroup attachments={attachments} source={source} layout="list" openMode="preview" onOpen={canOpen ? (id) => setPreview(attachments.find((attachment) => attachment.id === id) ?? null) : undefined} />}
    {!onRemove && !canOpen && <p className="message-attachment-note">示例附件未提供文件，无法打开或下载。</p>}
    <ModalOverlay isOpen={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)} isDismissable className="modal-overlay modal-overlay--nested"><Modal className="app-modal app-modal--medium"><Dialog className="modal-dialog" aria-label="附件预览"><div className="modal-header"><Heading slot="title">{preview?.name}</Heading><IconButton label="关闭" icon={Xmark} onPress={() => setPreview(null)} /></div><div className="modal-content"><p>{preview?.detail}</p>{fileUrl && preview?.file?.type.startsWith('image/') && <img className="attachment-image-preview" src={fileUrl} alt={preview.name} />}{fileUrl && <a className="button button--primary" href={fileUrl} download={preview?.name}>下载文件</a>}</div></Dialog></Modal></ModalOverlay>
  </>
}

function AttachmentUploadButton({ onFiles }: { onFiles: (files: File[]) => void }): React.JSX.Element {
  return <label className="attachment-upload-button" title="添加附件"><input type="file" multiple aria-label="添加附件" onChange={(event) => { onFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} /><span className="icon-button" aria-hidden="true"><Plus /></span></label>
}

function DirectoryPane({ page, conversations, onArchiveConversation, selectedConversation, onConversation, selectedCapability, onCapability, onOpenDetail }: {
  page: PageId
  conversations: Conversation[]
  onArchiveConversation: (id: string) => void
  selectedConversation: string
  onConversation: (id: string) => void
  selectedCapability: string
  onCapability: (id: string) => void
  onOpenDetail: (view: DetailView) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [capabilityFilter, setCapabilityFilter] = useState<'skill' | 'tool'>('skill')
  const pageTitle = { messages: '聊天记录', contacts: '专家市场', capabilities: '能力', connections: '连接', personal: '个人中心', archives: '归档对话', 'create-expert': '创建专家', 'model-access': '模型接入' }[page]
  const filteredConversations = conversations.filter((item) => selectionIncludes([item.title, item.preview], query))
  const filteredCapabilities = capabilities.filter((item) => selectionIncludes([item.name, item.summary], query))
  const visibleCapabilities = filteredCapabilities.filter((item) => item.kind === capabilityFilter)

  useEffect(() => {
    setQuery('')
  }, [page])

  const contextAction = page === 'capabilities'
        ? <IconButton label="能力目录信息" icon={InfoCircle} onPress={() => onOpenDetail('capability-info')} />
        : undefined

  return (
    <ClientContextPane>
      <SectionHeader title={pageTitle} action={contextAction} />
      {page !== 'connections' && <SearchBox placeholder={page === 'messages' ? '搜索会话' : page === 'contacts' ? '搜索智能体' : '搜索能力'} value={query} onChange={setQuery} />}
      {page === 'messages' && <>
        <div className="context-scroll">{filteredConversations.length === 0 && <p className="contact-list-empty" role="status">{query.trim() ? '没有匹配的会话' : '暂无会话'}</p>}{filteredConversations.map((item) => <ConversationRow key={item.id} conversation={item} selected={selectedConversation === item.id} onPress={() => onConversation(item.id)} onArchive={() => onArchiveConversation(item.id)} />)}</div>
      </>}
      {page === 'capabilities' && <>
        <Tabs className="contact-tabs" selectedKey={capabilityFilter} onSelectionChange={(key) => { const kind = key as 'skill' | 'tool'; setCapabilityFilter(kind); onCapability(capabilities.find((item) => item.kind === kind)?.id ?? selectedCapability) }}>
          <TabList className="filter-row capability-kind-switch" aria-label="能力类型">{([['skill', 'Skills'], ['tool', 'Tools']] as const).map(([id, label]) => <Tab key={id} id={id} className={({ isSelected }) => isSelected ? 'is-active' : ''}>{label}</Tab>)}</TabList>
          {(['skill', 'tool'] as const).map((kind) => <TabPanel key={kind} id={kind} className="context-scroll context-scroll--flush">{visibleCapabilities.length === 0 && <p className="contact-list-empty" role="status">没有匹配的能力</p>}{visibleCapabilities.map((item) => <ListRow key={item.id} selected={selectedCapability === item.id} title={item.name} subtitle={item.category} marker={<StatusLight tone={item.tone} label={item.status} />} onPress={() => onCapability(item.id)} />)}</TabPanel>)}
        </Tabs>
      </>}
      {page === 'connections' && <div className="context-scroll context-scroll--flush"><p className="contact-list-empty">暂无已连接应用</p></div>}
    </ClientContextPane>
  )
}

function MessagesPage({ conversation, agent, unavailable, session, onSessionChange, userProfile, onFindExpert, settings, onAccess, onRecord, onLogin, onNewVersion }: { conversation: Conversation; agent: Agent; unavailable: boolean; session: ConversationSession; onSessionChange: (patch: Partial<ConversationSession>) => void; userProfile: UserProfile; onFindExpert: () => void; settings: ServiceSettings; onAccess: () => void; onRecord: (record: ServiceRecord) => void; onLogin: () => void; onNewVersion: () => void }): React.JSX.Element {
  const availability = settings.availabilityAgentId && settings.availabilityAgentId !== agent.id ? 'active' : settings.availability
  const block = serviceBlock({ ...settings, availability }, unavailable)
  const [fileError, setFileError] = useState('')
  const formats: Record<string, string[]> = { text: ['TXT', 'MD'], document: ['PDF', 'DOCX'], spreadsheet: ['XLSX', 'CSV'], image: ['PNG', 'JPG'], audio: ['MP3', 'WAV', 'M4A'] }
  const fileRule = agent.preview ?? { inputs: agent.configuration ? agent.configuration.inputs.flatMap(input => formats[input] ?? []) : ['TXT', 'MD', 'PDF', 'DOCX', 'XLSX', 'CSV'], fileMB: 20, count: 10, totalMB: 100 }
  const messageScrollRef = useRef<HTMLDivElement>(null)
  const messageCanvasRef = useRef<HTMLDivElement>(null)
  const followLatestRef = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const [composerPanel, setComposerPanel] = useState<'model' | 'voice' | null>(null)
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const { draft, attachments: draftAttachments, messages: localMessages } = session
  const isAssistantWelcome = conversation.isNew && localMessages.length === 0 && agent.id === assistantAgent.id
  const pauseFollowing = (): void => { followLatestRef.current = false }
  const examplePrompt = conversation.id === 'sea-saas' ? '帮我整理东南亚 SaaS 市场研究的资料结构，重点关注竞争格局和进入风险。' : '帮我梳理 Agent 产品介绍文档的结构。'
  const exampleReply = conversation.id === 'sea-saas' ? '建议按**市场概况、竞争格局、进入风险、来源索引**组织资料。以下附件展示资料交付的样式，内容为原型示例，未进行真实检索。' : documentStructureExample
  const revealLatest = (): void => {
    const scroll = messageScrollRef.current
    if (scroll) scroll.scrollTop = scroll.scrollHeight
    followLatestRef.current = true
    setShowLatest(false)
  }
  const updateScrollPosition = (): void => {
    const scroll = messageScrollRef.current
    if (!scroll) return
    const nearBottom = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 80
    followLatestRef.current = nearBottom
    setShowLatest(!nearBottom)
  }
  const chooseStarter = (prompt: string): void => {
    onSessionChange({ draft: draft.trim() ? `${draft.trimEnd()}\n\n${prompt}` : prompt })
    composerInputRef.current?.focus()
  }
  const addAttachments = (files: File[]): void => {
    const issue = attachmentIssue([...draftAttachments.map(a => ({ name: a.name, size: a.file?.size ?? 0 })), ...files], fileRule)
    setFileError(issue ?? '')
    if (!issue) onSessionChange({ attachments: [...draftAttachments, ...files.map(file => ({ id: crypto.randomUUID(), name: file.name, detail: fileDetail(file), file }))] })
  }
  const removeAttachment = (id: string): void => onSessionChange({ attachments: draftAttachments.filter((item) => item.id !== id) })
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (block || (!draft.trim() && !draftAttachments.length)) return
    const scenario = conversation.scenario ?? (agent.id === 'staff.literature-reader' ? 'literature' : (agent.preview ? agent.preview.notice : agent.id === 'staff.notice-writer') ? 'notice' : 'normal')
    const result = makeServiceRecord({ id: `SIAS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, conversationId: conversation.id, agentId: agent.id, agentName: agent.name, version: agent.version ?? 1, model: agent.model ?? 'deepseek-v4', source: settings.source, scenario })
    onRecord(result)
    followLatestRef.current = true
    onSessionChange({ messages: [...localMessages, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), text: draft.trim(), attachments: draftAttachments, result }], draft: '', attachments: [] })
    composerInputRef.current?.focus()
  }

  useEffect(() => {
    if (!conversation.isNew) return
    const input = composerInputRef.current
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  }, [conversation.id, conversation.isNew])

  useLayoutEffect(() => {
    const input = composerInputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [draft])

  useLayoutEffect(revealLatest, [localMessages.length])

  useEffect(() => {
    const scroll = messageScrollRef.current, canvas = messageCanvasRef.current
    if (!scroll || !canvas || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followLatestRef.current) revealLatest()
      else updateScrollPosition()
    })
    observer.observe(scroll)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])
  return (
    <div className={`workspace-page message-page${isAssistantWelcome ? ' message-page--welcome' : ''}`}>
      <div className="conversation-workspace is-sidebar-collapsed">
      <div className="conversation-column">
      {!isAssistantWelcome && <div className="service-context"><span>{agent.id === 'assistant' ? '系统服务' : agent.id.startsWith('custom.') ? '个人专家 · 仅自己可见' : '学校发布'} · v{agent.version ?? 1} · {agent.model ?? 'deepseek-v4'}</span><button className="button button--quiet" onClick={onAccess}>{sourceName(settings.source)} · 管理接入</button></div>}
      <div ref={messageScrollRef} className="message-scroll" aria-label="对话" role="region" tabIndex={0} onScroll={updateScrollPosition}>
        <div ref={messageCanvasRef} className="message-canvas">
          {isAssistantWelcome ? <NewConversationHeader name={userProfile.name} /> : conversation.isNew && localMessages.length === 0 ? <div className="runtime-empty-state"><Avatar label={agent.name} initials={agent.initials} color={agent.color} size="large" src={agent.avatarUrl} /><h2>与{agent.name}对话</h2><p>{agent.description}</p>{agent.configuration?.opening && <p className="expert-chat-opening">{agent.configuration.opening}</p>}{agent.configuration && expertQuestions(agent.configuration).length > 0 && <div className="expert-chat-questions" aria-label="推荐问题">{expertQuestions(agent.configuration).map((question, index) => <button type="button" className="button button--quiet" key={index} onClick={() => { onSessionChange({ draft: question }); composerInputRef.current?.focus() }}>{question}</button>)}</div>}<p className="quiet-meta">本地原型演示 · 未连接模型，刷新后重置</p></div> : !conversation.isNew ? <div className="date-divider"><span>示例对话</span></div> : null}
          {!conversation.isNew && <>
            <ChatMessage source="user" name={userProfile.name.trim() || '本地用户'} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl ?? undefined} time="12:24" copyText={examplePrompt} attachments={conversation.id === 'sea-saas' && <MessageAttachmentGroup attachments={exampleUserAttachments} source="user" />}><MarkdownMessage onExpandedChange={pauseFollowing}>{examplePrompt}</MarkdownMessage></ChatMessage>
            <ChatMessage source="agent" name={agent.name} initials={agent.initials} color={agent.color} avatarSrc={agent.avatarUrl ?? undefined} time="12:26" headerStatus="示例回复" copyText={exampleReply} attachments={conversation.id === 'sea-saas' && <MessageAttachmentGroup attachments={generatedAttachments} source="agent" />}><MarkdownMessage collapsible={false}>{exampleReply}</MarkdownMessage></ChatMessage>
            {conversation.id === 'plain-qa' && <ChatMessage source="agent" name={agent.name} initials={agent.initials} color={agent.color} avatarSrc={agent.avatarUrl ?? undefined} time="12:27" headerStatus="示例表单" surface="none"><ConversationBriefForm value={session.brief ?? emptyConversationBrief} submitted={session.briefSubmitted ?? false} onChange={(brief) => onSessionChange({ brief })} onSubmit={() => onSessionChange({ briefSubmitted: true })} onEdit={() => onSessionChange({ briefSubmitted: false })} /></ChatMessage>}
          </>}
          {localMessages.map((message, index) => {
            const time = new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
            const showDate = index === 0 || new Date(localMessages[index - 1].createdAt).toDateString() !== new Date(message.createdAt).toDateString()
            return <React.Fragment key={message.id}>
              {showDate && <div className="date-divider"><span>{messageDateLabel(message.createdAt)}</span></div>}
              <ChatMessage source="user" name={userProfile.name.trim() || '本地用户'} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl ?? undefined} time={time} dateTime={message.createdAt} copyText={message.text} attachments={<MessageAttachmentGroup attachments={message.attachments} source="user" />}><MarkdownMessage onExpandedChange={pauseFollowing}>{message.text || '已添加附件'}</MarkdownMessage></ChatMessage>
              <ChatMessage source="agent" name={agent.name} initials={agent.initials} color={agent.color} avatarSrc={agent.avatarUrl ?? undefined} time={time} dateTime={message.createdAt} headerStatus="演示回复" copyText={prototypeReply}><MarkdownMessage onExpandedChange={pauseFollowing}>{prototypeReply}</MarkdownMessage>{message.result && <ServiceResult operationBlocked={settings.account !== 'active' || unavailable || availability === 'disabled'} interaction={message.interaction} onInteraction={patch => onSessionChange({ messages: localMessages.map(m => m.id === message.id ? { ...m, interaction: { ...m.interaction, ...patch } } : m) })} record={message.result} files={message.attachments.map(a => a.name)} change={result => { onSessionChange({ messages: localMessages.map(m => m.id === message.id ? { ...m, result } : m) }); onRecord(result) }} />}</ChatMessage>
            </React.Fragment>
          })}
        </div>
      </div>
      <form className="composer" onSubmit={submit}>
        {showLatest && <Button className="conversation-latest" onPress={revealLatest}><ArrowDown aria-hidden />回到最新消息</Button>}
        <div className="composer__box">
          {block && <div className="service-block" role="status"><p>{block}</p>{settings.account === 'signed-out' ? <button type="button" className="button button--quiet" onClick={onLogin}>重新登录（演示）</button> : settings.account !== 'disabled' && <button type="button" className="button button--quiet" onClick={availability === 'disabled' || availability === 'model-offline' || unavailable ? onFindExpert : onAccess}>{availability === 'disabled' || availability === 'model-offline' || unavailable ? '选择其他专家' : '管理模型接入'}</button>}</div>}
          {availability === 'new-version' && (agent.version ?? 1) < 2 && <div className="service-block"><p>有新版本可用。本会话继续使用 v{agent.version ?? 1}，草稿和历史保留。</p><button type="button" className="button button--quiet" onClick={onNewVersion}>按最新版本新建会话</button></div>}
          {fileError && <p className="service-block" role="alert">{fileError}</p>}
          {draftAttachments.length > 0 && <p className="service-material-rule">已选文件 · 尚未上传或读取。支持 {fileRule.inputs.join(' / ')}；单个 {fileRule.fileMB} MB，最多 {fileRule.count} 个，总计 {fileRule.totalMB} MB。</p>}
          {draftAttachments.length > 0 && <MessageAttachmentGroup attachments={draftAttachments} source="user" onRemove={removeAttachment} />}
          <textarea disabled={unavailable} ref={composerInputRef} aria-label="发送消息" aria-describedby="composer-hint" rows={2} value={draft} onChange={(event) => onSessionChange({ draft: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder={unavailable ? '该专家当前不可用，历史对话仍可查看' : `发送给${agent.name}`} />
          <div className="composer__toolbar">
            <div className="composer__group">{!unavailable && <AttachmentUploadButton onFiles={addAttachments} />}</div>
            <div className="composer__group"><Button className="composer__control" aria-expanded={composerPanel === 'model'} aria-controls="prototype-composer-model-panel" onPress={() => setComposerPanel((panel) => panel === 'model' ? null : 'model')}><Sparks aria-hidden /><span>{agent.model ?? 'deepseek-v4'}</span><NavArrowDown aria-hidden /></Button><IconButton label="语音输入" icon={Microphone} onPress={() => setComposerPanel((panel) => panel === 'voice' ? null : 'voice')} /><Button type="submit" aria-label="发送" className="composer__send" isDisabled={!!block || (!draft.trim() && !draftAttachments.length)}><ArrowUp aria-hidden /></Button></div>
          </div>
          {composerPanel && <div className={`composer-popover composer-popover--${composerPanel}`} id={`prototype-composer-${composerPanel}-panel`} role="dialog" aria-label={composerPanel === 'model' ? '当前会话模型' : '语音输入说明'}>{composerPanel === 'model' ? <><strong>当前会话模型</strong><div className="composer-popover__options"><button type="button" className="is-active" onClick={() => setComposerPanel(null)}><span><b>{agent.model ?? 'deepseek-v4'}</b><small>原型演示</small></span><Check aria-hidden /></button></div><p>此页面用于演示消息交互，尚未连接模型服务。</p></> : <><strong>语音输入</strong><p>语音输入暂未开放。</p><StatusLight tone="muted" label="暂未开放" /></>}</div>}
        </div>
        <div className="composer-hint" id="composer-hint"><span>Enter 发送<span className="composer-hint__separator">·</span>Shift + Enter 换行</span>{!isAssistantWelcome && <span>本地演示 · 未连接模型</span>}</div>
      </form>
      {isAssistantWelcome && <><NewConversationActions onPrompt={chooseStarter} onFindExpert={onFindExpert} /><p className="welcome-prototype-note">本地原型 · 暂未连接模型，刷新后重置</p></>}
      </div>
      </div>
    </div>
  )
}

function CapabilityPage({ capability, onAgent, onOpenDetail }: { capability: Capability; onAgent: (name: string) => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const isSkill = capability.kind === 'skill'
  const MarkIcon = isSkill ? Sparks : Tools
  return (
    <DetailPage>
        <section className="capability-intro"><div className="capability-mark"><MarkIcon aria-hidden /></div><div><span className="capability-category">{capability.category} · v{capability.version}</span><h2>{capability.name}</h2><p>{capability.summary}</p></div></section>
        <section className="plain-section"><h3>{isSkill ? '适用任务' : '可用于'}</h3><div className="use-case-list">{capability.useCases.map((item) => <span key={item}>{item}</span>)}</div></section>
        <section className="plain-section"><h3>{isSkill ? '执行与依赖' : '调用关系'}</h3><div className="dependency-groups">{isSkill ? <><DependencyGroup icon={Brain} title="执行步骤" items={capability.skills} /><DependencyGroup icon={Tools} title="Tools" items={capability.tools} /></> : <><DependencyGroup icon={Sparks} title="关联 Skills" items={capability.skills} /><DependencyGroup icon={Database} title="连接与运行" items={capability.tools} /></>}<DependencyGroup icon={ShieldCheck} title="权限" items={capability.permissions} /></div></section>
        <section className="plain-section"><div className="content-section-title"><h3>已绑定 Agent</h3><span>{capability.agents.length} 位</span></div>{capability.agents.map((name) => <Button className="linked-agent" key={name} onPress={() => onAgent(name)}><Avatar label={name} initials={name.slice(0, 1)} color="#b8c982" size="small" src={employeeAvatarForName(name)} /><span><strong>{name}</strong><small>查看员工资料</small></span><NavArrowRight aria-hidden /></Button>)}</section>
        {isSkill && capability.skillMarkdown && <section className="plain-section skill-document"><div className="content-section-title"><h3>SKILL.md</h3><span>完整文档 · v{capability.version}</span></div><MarkdownContent className="skill-document__markdown">{capability.skillMarkdown}</MarkdownContent></section>}
        <Button className="advanced-disclosure" onPress={() => onOpenDetail('capability-info')}>高级信息 <NavArrowRight aria-hidden /></Button>
      </DetailPage>
  )
}

const connectionCategories = [
  {
    id: 'collaboration',
    name: '协作沟通',
    description: '连接团队消息、组织协同与客户触达渠道。',
    applications: [
      { id: 'feishu', name: '飞书', description: '消息、文档、日历与组织协作。', icon: feishuConnectionIcon },
      { id: 'teams', name: 'Microsoft Teams', description: '团队消息、会议与协作空间。', icon: teamsConnectionIcon },
      { id: 'dingtalk', name: '钉钉', description: '组织通讯、消息、审批与协同办公。', icon: dingtalkConnectionIcon },
      { id: 'wecom', name: '企业微信', description: '企业内部协作与客户连接。', icon: wecomConnectionIcon },
      { id: 'wechat', name: '微信', description: '消息触达与客户沟通渠道。', icon: wechatConnectionIcon }
    ]
  },
  {
    id: 'knowledge',
    name: '知识与文件',
    description: '连接知识库、在线文档与企业文件空间。',
    applications: [
      { id: 'notion', name: 'Notion', description: '知识库、文档与工作流协作。', icon: notionConnectionIcon },
      { id: 'yuque', name: '语雀', description: '团队知识库、文档与结构化知识管理。', icon: yuqueConnectionIcon },
      { id: 'wps', name: 'WPS Office', description: '文档、表格、演示与云端协作。', icon: wpsConnectionIcon },
      { id: 'baidu-netdisk', name: '百度网盘', description: '云端文件存储、同步与共享。', icon: baiduNetdiskConnectionIcon }
    ]
  },
  {
    id: 'development',
    name: '研发与云服务',
    description: '连接代码协作平台与云端基础设施。',
    applications: [
      { id: 'github', name: 'GitHub', description: '代码仓库、Issue、Pull Request 与 CI 协作。', icon: githubConnectionIcon },
      { id: 'gitee', name: 'Gitee', description: '代码托管、协作开发与 DevOps。', icon: giteeConnectionIcon },
      { id: 'alibaba-cloud', name: '阿里云', description: '云计算资源、数据服务与企业基础设施。', icon: alibabaCloudConnectionIcon }
    ]
  }
]

const connectionApplications = connectionCategories.flatMap((category) => category.applications)

function ConnectionsPage(): React.JSX.Element {
  return <DetailPage width="wide" className="connections-page"><section className="recruitment-catalog connections-catalog" aria-label="连接" data-source="static">
    <DetailSummaryPanel icon={<Link aria-hidden />} title="外部系统与应用" description="当前版本静态展示可连接应用目录，所有应用均为默认未连接状态。" metrics={[{ label: '应用总数', value: connectionApplications.length }, { label: '应用类型', value: connectionCategories.length }, { label: '已连接', value: 0 }]} />
    <div className="recruitment-catalog__categories">{connectionCategories.map((category) => <section className="recruitment-category" aria-label={category.name} key={category.id}>
      <DetailSectionHeader title={category.name} description={category.description} meta={`${category.applications.length} 个`} />
      <SummaryCardGrid emptyMessage="暂无已连接应用" label={`${category.name}应用`}>
        {category.applications.map((application) => <div className="recruitment-card connection-card" role="listitem" key={application.id}><SummaryCard leading={<span className="connection-logo" role="img" aria-label={`${application.name} 官方图标`}><img alt="" src={application.icon} /></span>} title={application.name} description={application.description} tone="muted" trailing={<DetailState tone="muted">未连接</DetailState>} /></div>)}
      </SummaryCardGrid>
    </section>)}</div>
  </section></DetailPage>
}

function DependencyGroup({ icon: Icon, title, items }: { icon: IconComponent; title: string; items: string[] }): React.JSX.Element {
  return <div><div className="dependency-groups__title"><Icon aria-hidden /><span>{title}</span></div>{items.map((item) => <p key={item}><Check aria-hidden />{item}</p>)}</div>
}

function PersonalCenterPage({ section, onSectionChange, userProfile, onAvatarChange, archivedConversations, onRestore, onDelete, settings, onSettings, records, onBack }: {
  settings: ServiceSettings
  onSettings: (patch: Partial<ServiceSettings>) => void
  records: ServiceRecord[]
  onBack: () => void
  section: 'personal' | 'archives' | 'model-access'
  onSectionChange: (section: 'personal' | 'archives' | 'model-access') => void
  userProfile: UserProfile
  onAvatarChange: (avatarUrl: string) => void
  archivedConversations: Conversation[]
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="workspace-page personal-center-layout">
      <nav className="personal-center-navigation" aria-label="个人中心菜单">
        <Button className="personal-center-navigation__item" aria-current={section === 'personal' ? 'page' : undefined} onPress={() => onSectionChange('personal')}><User aria-hidden />基本资料</Button>
        <Button className="personal-center-navigation__item" aria-current={section === 'model-access' ? 'page' : undefined} onPress={() => onSectionChange('model-access')}><Link aria-hidden />模型接入</Button>
        <Button className="personal-center-navigation__item" aria-current={section === 'archives' ? 'page' : undefined} onPress={() => onSectionChange('archives')}><Archive aria-hidden />归档会话</Button>
      </nav>
      {section === 'personal' ? <DetailPage className="personal-center-page">
        <ProfileSection profile={userProfile} onAvatarChange={onAvatarChange} identity={settings.identity} />
        <ServiceUsage settings={settings} records={records} />
      </DetailPage> : section === 'model-access' ? <DetailPage className="personal-center-page"><ModelAccess settings={settings} change={onSettings} onBack={onBack} /></DetailPage> : <ArchivedConversationsPage conversations={archivedConversations} onRestore={onRestore} onDelete={onDelete} />}
    </div>
  )
}

function ProfileSection({ profile, onAvatarChange, identity }: { profile: UserProfile; onAvatarChange: (avatarUrl: string) => void; identity: ServiceSettings['identity'] }): React.JSX.Element {
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') onAvatarChange(reader.result) }
    reader.readAsDataURL(file)
  }
  return <SettingsBlock title="个人资料"><div className="employee-identity-editor"><div className="employee-avatar-setting"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传个人头像" onChange={(event) => { changeAvatar(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = '' }} /><Avatar label={profile.name || '本地用户'} initials={profile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="large" src={profile.avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label><small>上传头像</small></div><dl className="personal-profile-facts"><div><dt>姓名</dt><dd>{profile.name}</dd></div><div><dt>{identity === 'staff' ? '工号' : identity === 'student' ? '学号' : '校园编号'}</dt><dd>{identity === 'unknown' ? '未提供' : identity === 'staff' ? 'T20260001' : profile.studentId}<small>（校园身份样例 · 只读）</small></dd></div></dl></div></SettingsBlock>
}

function DetailDataRow({ title, description, value, tone }: { title: string; description: string; value: string; tone?: StatusTone }): React.JSX.Element {
  return <div className="detail-data-row"><span><strong>{title}</strong><small>{description}</small></span>{tone ? <StatusLight tone={tone} label={value} breathing={tone === 'waiting' || tone === 'active'} /> : <em>{value}</em>}</div>
}

function DetailModal({ view, capability, onClose }: { view: DetailView; capability: Capability; onClose: () => void }): React.JSX.Element {
  const definitions: Record<Exclude<DetailView, null>, { title: string; description: string }> = {
    'capability-info': { title: '能力高级信息', description: '查看能力版本、依赖、授权边界与已绑定员工。' },
  }
  const definition = view ? definitions[view] : definitions['capability-info']
  return <ModalOverlay isOpen={Boolean(view)} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay modal-overlay--nested"><Modal className="app-modal app-modal--large"><Dialog className="modal-dialog" aria-label={definition.title}>
    <div className="modal-header"><div><Heading slot="title">{definition.title}</Heading><span className="quiet-meta">详情页</span></div><IconButton label="关闭" icon={Xmark} onPress={onClose} /></div>
    <div className="detail-browser-content"><div className="detail-browser-intro"><h3>{definition.title}</h3><p>{definition.description}</p></div>
      {view === 'capability-info' && <><section><div className="content-section-title"><h3>版本与状态</h3><span>{capability.kind === 'skill' ? 'Skill' : 'Tool'}</span></div><div className="detail-data-list"><DetailDataRow title={capability.name} description={`${capability.category} · 当前版本 v${capability.version}`} value={capability.status} tone={capability.tone} /><DetailDataRow title="更新策略" description="版本由能力目录统一发布，运行中的任务继续使用冻结快照" value="版本化" /><DetailDataRow title="绑定范围" description={capability.agents.length ? capability.agents.join('、') : '尚未绑定员工'} value={`${capability.agents.length} 位`} /></div></section><section><div className="content-section-title"><h3>运行边界</h3><span>只读</span></div><div className="detail-data-list"><DetailDataRow title="依赖" description={[...capability.skills, ...capability.tools].join(' · ')} value="已解析" tone="success" /><DetailDataRow title="权限" description={capability.permissions.join(' · ')} value="任务取交集" /></div></section></>}
    </div>
  </Dialog></Modal></ModalOverlay>
}

export function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>(() => parseExpertPreview(window.location.hash) ? 'contacts' : 'messages')
  const [settings, setSettings] = useState<ServiceSettings>(initialServiceSettings)
  const [demoOpen, setDemoOpen] = useState(false)
  const [records, setRecords] = useState<ServiceRecord[]>([])
  const [publicPreview, setPublicPreview] = useState(() => parseExpertPreview(window.location.hash))
  useEffect(() => { const update = () => { setPublicPreview(parseExpertPreview(window.location.hash)); setPage('contacts') }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, [])
  const changeSettings = (patch: Partial<ServiceSettings>) => setSettings(current => ({ ...current, ...patch, ...(patch.availability ? { availabilityAgentId: activeConversation?.agentId } : {}) }))
  const recordCall = (record: ServiceRecord) => {
    if (!records.some(r => r.id === record.id) && record.source === 'platform' && record.amount !== null) setSettings(current => ({ ...current, balance: Math.max(0, Math.round((current.balance - record.amount!) * 100) / 100) }))
    setRecords(current => [record, ...current.filter(r => r.id !== record.id)])
  }
  const [expertDraft, setExpertDraft] = useState<ExpertDraft>(blankExpertDraft)
  const [contextCollapsed, setContextCollapsed] = useState(false)
  const [customAgents, setCustomAgents] = useState<Agent[]>([])
  const previewAgent: Agent | undefined = publicPreview ? { id: publicPreview.id, name: publicPreview.name, initials: publicPreview.name.slice(0, 1), description: publicPreview.description, role: '学校发布', status: publicPreview.disabled ? '已停用' : '可对话', tone: 'success', color: '#85a9c7', model: publicPreview.model, version: publicPreview.version, preview: publicPreview, capabilities: [], deliveries: [] } : undefined
  const agentItems = [assistantAgent, ...initialAgents, ...catalogAgents.filter(a => a.id !== previewAgent?.id), ...customAgents, ...(previewAgent ? [previewAgent] : [])]
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [conversationSessions, setConversationSessions] = useState<Record<string, ConversationSession>>({})
  // Unsent conversations remain drafts; only conversations with messages appear in history.
  const conversationHistory = conversations.filter((conversation) => !conversation.archived && (!conversation.isNew || (conversationSessions[conversation.id]?.messages.length ?? 0) > 0))
  const archivedConversations = conversations.filter((conversation) => conversation.archived)
  const [selectedConversation, setSelectedConversation] = useState(initialConversations[0].id)
  const [selectedCapability, setSelectedCapability] = useState('research')
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: 'Kakarrot', studentId: '20260001', avatarUrl: null })
  const [detailView, setDetailView] = useState<DetailView>(null)
  const capabilityDefinition = capabilities.find((item) => item.id === selectedCapability) ?? capabilities[0]
  const activeCapability = { ...capabilityDefinition, agents: agentItems.filter((agent) => capabilityDefinition.kind === 'skill' ? agent.capabilities.includes(capabilityDefinition.name) : capabilityDefinition.skills.some((skill) => agent.capabilities.includes(skill))).map((agent) => agent.name) }
  const activeConversation = conversations.find((item) => item.id === selectedConversation && !item.archived) ?? conversations.find((item) => !item.archived)
  const conversationAgent = agentItems.find((agent) => agent.id === activeConversation?.agentId)
  const navigate = (id: PageId): void => { setPage(id); setDetailView(null) }
  const createConversation = (agent: Agent, scenario?: ServiceScenario): void => {
    const conversation: Conversation = { scenario, id: crypto.randomUUID(), title: `与${agent.name}对话`, preview: `${agent.name} · 新对话`, time: '刚刚', avatar: agent.initials, color: agent.color, agentId: agent.id, agentSnapshot: { ...agent, version: settings.availability === 'new-version' && settings.availabilityAgentId === agent.id ? Math.max(2, agent.version ?? 1) : agent.version ?? 1 }, isNew: true }
    setConversations((items) => [conversation, ...items])
    setSelectedConversation(conversation.id)
    setContextCollapsed(false)
    navigate('messages')
  }
  const createStudentAgent = (draft: ExpertDraft): void => {
    const agent: Agent = {
      id: `custom.${crypto.randomUUID()}`, name: draft.name, initials: draft.name.slice(0, 1),
      role: '我创建的', description: draft.description, prompt: draft.prompt, configuration: draft, model: draft.model,
      color: '#85a9c7', status: '可对话', tone: 'success', capabilities: draft.capabilities.map(binding => expertCapabilities.find(item => item.id === binding.id)!.name), deliveries: []
    }
    setCustomAgents((items) => [agent, ...items])
    setExpertDraft(blankExpertDraft())
    createConversation(agent)
  }
  const archiveConversation = (id: string): void => {
    if (!conversationHistory.some((item) => item.id === id)) return
    setConversations((items) => items.map((item) => item.id === id ? { ...item, archived: true } : item))
    if (selectedConversation === id && page === 'messages') createConversation(assistantAgent)
  }
  const restoreConversation = (id: string): void => {
    if (!archivedConversations.some((item) => item.id === id)) return
    setConversations((items) => items.map((item) => item.id === id ? { ...item, archived: false } : item))
    setSelectedConversation(id)
    setContextCollapsed(false)
    navigate('messages')
  }
  const deleteConversation = (id: string): void => {
    if (!archivedConversations.some((item) => item.id === id)) return
    setConversations((items) => items.filter((item) => item.id !== id))
    if (selectedConversation === id) setSelectedConversation('')
    setConversationSessions((items) => { const remaining = { ...items }; delete remaining[id]; return remaining })
  }
  const updateConversationSession = (id: string, patch: Partial<ConversationSession>): void => {
    setConversationSessions((items) => ({ ...items, [id]: { ...(items[id] ?? emptyConversationSession), ...patch } }))
    const lastMessage = patch.messages?.at(-1)
    if (lastMessage) setConversations((items) => items.map((item) => item.id === id ? { ...item, title: item.isNew && patch.messages?.length === 1 ? lastMessage.text.slice(0, 24) || '附件对话' : item.title, preview: `${agentItems.find((agent) => agent.id === item.agentId)?.name ?? item.agentSnapshot.name} · ${lastMessage.text || '已添加附件'}`, time: formatClientTimestamp(lastMessage.createdAt) } : item))
  }
  const openLinkedAgent = (): void => navigate('contacts')
  const isEmptyConversation = activeConversation?.isNew && !(conversationSessions[activeConversation.id]?.messages.length)
  const toolbarTitle = page === 'messages' ? isEmptyConversation ? '新对话' : activeConversation?.title ?? '消息' : page === 'contacts' ? '专家市场' : page === 'create-expert' ? '创建专家' : page === 'capabilities' ? activeCapability.name : page === 'connections' ? '连接' : '个人中心'
  const toolbarSupport = page === 'messages' ? `${conversationAgent?.name ?? activeConversation?.agentSnapshot.name ?? '助理'} · 一对一对话` : page === 'contacts' ? '发现适合学习、教学与生活的智能体' : page === 'personal' ? '基本资料与用量信息' : page === 'archives' ? '归档会话' : undefined

  return (
    <ClientIconSystem>
      <AppShell className="campus-shell" contextCollapsed={contextCollapsed}
        toolbar={<ClientToolbar label="页面顶部栏" title={toolbarTitle} support={toolbarSupport && <span className="campus-toolbar-support">{toolbarSupport}</span>} trailing={<button className="button button--quiet campus-preview-label" onClick={() => setDemoOpen(true)}>原型演示</button>} navigation={<ClientIconButton label={contextCollapsed ? '展开左侧栏' : '折叠左侧栏'} icon={contextCollapsed ? NavArrowRight : NavArrowLeft} onClick={() => setContextCollapsed((value) => !value)} />} />}
        rail={<ClientRail expanded={!contextCollapsed} active={page === 'create-expert' ? 'contacts' : page} items={navItems} footerItems={[]} profileLabel="个人中心" profileActive={page === 'personal' || page === 'archives' || page === 'model-access'} profileMenuItems={[{ id: 'personal', label: '个人中心', icon: User }, { id: 'archives', label: '归档会话', icon: Archive }]} userProfile={userProfile} onNavigate={(id) => { if (id === 'new-conversation') createConversation(assistantAgent); else if (id !== 'knowledge') navigate(id) }} header={<div className="campus-brand" title="西亚斯数字员工"><span className="campus-brand__mark" aria-hidden="true"><Sparks /></span><strong>西亚斯数字员工</strong></div>}>
          <DirectoryPane page="messages" conversations={conversationHistory} onArchiveConversation={archiveConversation} selectedConversation={page === 'messages' ? selectedConversation : ''} onConversation={(id) => { setSelectedConversation(id); navigate('messages') }} selectedCapability={selectedCapability} onCapability={setSelectedCapability} onOpenDetail={setDetailView} />
        </ClientRail>}
        context={null}>
            {page === 'messages' && activeConversation && <MessagesPage key={activeConversation.id} conversation={activeConversation} agent={activeConversation.agentSnapshot} unavailable={!conversationAgent || !!conversationAgent.preview?.disabled} settings={settings} onAccess={() => navigate('model-access')} onRecord={recordCall} onLogin={() => changeSettings({ account: 'active' })} onNewVersion={() => conversationAgent && createConversation(conversationAgent)} session={conversationSessions[activeConversation.id] ?? emptyConversationSession} onSessionChange={(patch) => updateConversationSession(activeConversation.id, patch)} userProfile={userProfile} onFindExpert={() => navigate('contacts')} />}
            {page === 'contacts' && <AgentCatalogPage key={publicPreview ? `${publicPreview.id}-${publicPreview.version}-${publicPreview.disabled}` : 'catalog'} preview={publicPreview} customAgents={customAgents} onCreateAgent={() => navigate('create-expert')} onStartConversation={(employee) => { const agent = agentItems.find((item) => item.id === employee.id); if (agent) createConversation(agent) }} />}
            {page === 'create-expert' && <CreateExpertPage draft={expertDraft} onChange={setExpertDraft} onCreate={createStudentAgent} onBack={() => navigate('contacts')} />}
            {page === 'capabilities' && <CapabilityPage capability={activeCapability} onAgent={openLinkedAgent} onOpenDetail={setDetailView} />}
            {page === 'connections' && <ConnectionsPage />}
            {(page === 'personal' || page === 'archives' || page === 'model-access') && <PersonalCenterPage settings={settings} onSettings={changeSettings} records={records} onBack={() => navigate('messages')} section={page} onSectionChange={navigate} userProfile={userProfile} onAvatarChange={(avatarUrl) => setUserProfile((profile) => ({ ...profile, avatarUrl }))} archivedConversations={archivedConversations} onRestore={restoreConversation} onDelete={deleteConversation} />}
            {page === 'messages' && !activeConversation && <div className="conversation-empty-state"><h2>选择或新建会话开始</h2></div>}
      </AppShell>
        <PrototypeScenarios open={demoOpen} close={() => setDemoOpen(false)} settings={settings} change={changeSettings} start={(scenario: ServiceScenario) => { changeSettings({ scenario, availability: 'active', account: 'active' }); const id = scenario.startsWith('notice') ? 'staff.notice-writer' : scenario === 'normal' ? 'assistant' : 'staff.literature-reader'; const agent = agentItems.find(a => a.id === id)!; createConversation(agent, scenario) }} />
        <DetailModal view={detailView} capability={activeCapability} onClose={() => setDetailView(null)} />
    </ClientIconSystem>
  )
}
