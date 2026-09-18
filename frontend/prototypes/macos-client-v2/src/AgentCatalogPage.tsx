import type { PublicExpertPreview } from '../../../src/shared/service-prototype'
import { useState } from 'react'
import { ChatBubble, NavArrowRight, Plus } from 'iconoir-react'
import { RecruitmentAvatar } from '../../../src/renderer/src/RecruitmentCatalog'
import type { StudentAgentProfile } from './student-agent-catalog'
import { campusAgentCategories, type CatalogAudience } from './campus-agent-catalog'
import { ExpertConfigurationDetails } from './CreateExpertPage'
import { ClientModal, DetailPage, DetailSectionHeader, ProfileSummary, SearchBox, SummaryCard, SummaryCardGrid } from '../../../src/renderer/src/components/client-ui'

export function AgentCatalogPage({ customAgents, onCreateAgent, onStartConversation, preview }: { preview?: PublicExpertPreview; customAgents: StudentAgentProfile[]; onCreateAgent: () => void; onStartConversation: (employee: StudentAgentProfile) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [audience, setAudience] = useState<'all' | CatalogAudience | 'mine'>('all')
  const [categoryId, setCategoryId] = useState('all')
  const [selected, setSelected] = useState<{ employee: StudentAgentProfile; category: string }>()
  const publicCategories = campusAgentCategories.map(c => ({ ...c, employees: c.employees.filter(e => e.id !== preview?.id) }))
  if (preview) {
    const category = publicCategories.find(c => c.id === preview.category && c.audience === preview.audience)
    const employee = { id: preview.id, name: preview.name, description: preview.description, color: '#85a9c7' }
    if (category) category.employees.push(employee)
    else publicCategories.push({ id: 'published-preview', name: '学校发布', description: '管理员发布的专家', audience: preview.audience, employees: [employee] })
  }
  const ownCategory = { id: 'my-agents', name: '我创建的', description: '按你的想法创建的专属伙伴。', employees: customAgents, audience: 'mine' as const }
  const allCategories = customAgents.length ? [ownCategory, ...publicCategories] : publicCategories
  const audienceCategories = audience === 'mine' ? [ownCategory] : allCategories.filter((category) => audience === 'all' || category.audience === audience)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const categories = audienceCategories.filter((category) => categoryId === 'all' || category.id === categoryId).map((category) => ({ ...category, employees: category.employees.filter((employee) => `${employee.name} ${employee.description} ${category.name}`.toLocaleLowerCase().includes(normalizedQuery)) })).filter((category) => category.employees.length)
  const employeeCount = allCategories.reduce((count, category) => count + category.employees.length, 0)
  const resultCount = categories.reduce((count, category) => count + category.employees.length, 0)
  const audienceOptions = [
    { id: 'all', label: '全部', count: employeeCount },
    { id: 'student', label: '学生常用', count: publicCategories.filter((category) => category.audience === 'student').reduce((count, category) => count + category.employees.length, 0) },
    { id: 'staff', label: '教职工常用', count: publicCategories.filter((category) => category.audience === 'staff').reduce((count, category) => count + category.employees.length, 0) },
    { id: 'mine', label: '我创建的', count: customAgents.length }
  ] as const
  const resetFilters = (): void => { setQuery(''); setAudience('all'); setCategoryId('all') }

  return <DetailPage className="recruitment-page" width="wide">
    <section className="recruitment-catalog" aria-label="智能体目录">
      <section className="recruitment-overview recruitment-overview--experts" aria-labelledby="agent-catalog-title">
        <div className="recruitment-overview__intro">
          <span className="recruitment-overview__eyebrow">你的校园智能体</span>
          <div className="recruitment-overview__identity"><span className="recruitment-overview__icon"><ChatBubble aria-hidden /></span><div><h3 id="agent-catalog-title">学习、教学与生活，都有好帮手</h3><p>从学科辅导到备课科研，从旅行攻略到校务办公，按需要选择一位开始对话。</p></div></div>
        </div>
        <dl className="recruitment-overview__metrics" aria-label="目录概况"><div><dt>智能体</dt><dd>{employeeCount}</dd></div><div><dt>分类</dt><dd>{allCategories.length}</dd></div><div><dt>交流方式</dt><dd>一对一对话</dd></div></dl>
      </section>
      <div className="selection-catalog__toolbar"><SearchBox label="搜索智能体" placeholder="搜索名称、专长或你想做的事" value={query} onChange={setQuery} /><span role="status">{resultCount} 位智能体</span><button type="button" className="button button--primary" onClick={onCreateAgent}><Plus aria-hidden />创建专家</button></div>
      <p className="quiet-meta">学校发布的公共专家面向正常登录用户开放；人群与分类仅用于发现。个人专家仅自己可见。</p>
      <div className="agent-catalog-filters">
        <div className="agent-catalog-filters__audiences" role="group" aria-label="智能体范围">{audienceOptions.map((option) => <button key={option.id} type="button" className="button button--quiet" aria-label={option.label} aria-pressed={audience === option.id} onClick={() => { setAudience(option.id); setCategoryId('all') }}>{option.label}<span aria-hidden="true">{option.count}</span></button>)}</div>
        {audience !== 'mine' && <div className="agent-catalog-filters__categories" role="group" aria-label="用途分类"><span>分类</span><button type="button" className="button button--quiet" aria-pressed={categoryId === 'all'} onClick={() => setCategoryId('all')}>全部分类</button>{audienceCategories.map((category) => <button key={category.id} type="button" className="button button--quiet" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}</div>}
      </div>
      <div className="recruitment-catalog__categories">
        {categories.map((category) => <section className="recruitment-category" aria-label={category.name} key={category.id}>
          <DetailSectionHeader title={category.name} description={category.description} meta={`${category.employees.length} 位`} />
          <SummaryCardGrid emptyMessage="暂无智能体" label={`${category.name}智能体`}>
            {category.employees.map((employee) => <div className="recruitment-card" role="listitem" key={employee.id}>
              <SummaryCard leading={<RecruitmentAvatar employee={employee} />} title={<span className="recruitment-card__title"><span>智能体</span>{employee.name}</span>} description={<span className="recruitment-card__description">{employee.description}</span>} trailing={<span className="recruitment-card__trailing"><NavArrowRight aria-hidden /></span>} label={`查看智能体 ${employee.name}`} onClick={() => setSelected({ employee, category: category.name })} />
            </div>)}
          </SummaryCardGrid>
        </section>)}
        {categories.length === 0 && <div className="conversation-empty-state"><h2>{audience === 'mine' && !customAgents.length ? '还没有创建专家' : '没有找到匹配的智能体'}</h2><p>{audience === 'mine' && !customAgents.length ? '点击“创建专家”，添加你的专属校园伙伴。' : '试试其他分类或关键词。'}</p><button type="button" className="button button--quiet" onClick={resetFilters}>查看全部智能体</button></div>}
      </div>
    </section>
    <ClientModal open={Boolean(selected)} title={selected ? `${selected.employee.name}详情` : '智能体详情'} size="medium" onClose={() => setSelected(undefined)}>
      {selected && <div className="recruitment-detail-modal">
        <div className="recruitment-detail-modal__content"><ProfileSummary identity={{ name: selected.employee.name, initials: selected.employee.name.slice(0, 1), color: selected.employee.color }} avatar={<RecruitmentAvatar employee={selected.employee} />} title={selected.category} description={selected.employee.description} /><section className="plain-section"><h3>使用说明</h3><p>{selected.employee.id.startsWith('custom.') ? '个人专家 · 仅自己可见 · 创建后即可聊天，无需公共发布。' : `学校发布 · v${preview?.id === selected.employee.id ? preview.version : 1} · ${preview?.id === selected.employee.id ? preview.model : 'deepseek-v4'}`}</p><p>{preview?.id === selected.employee.id && preview.disabled ? '已停用，历史会话仍可查看。' : '材料需可读取；仅选择文件不表示已上传或已解析。'}</p><p>支持 {preview?.id === selected.employee.id ? preview.inputs.join(' / ') : 'TXT / MD / PDF / DOCX'} · 单个 {preview?.id === selected.employee.id ? preview.fileMB : 20} MB · 最多 {preview?.id === selected.employee.id ? preview.count : 10} 个</p>{selected.employee.id === 'staff.literature-reader' && <p>可体验文献摘要与 Markdown 文件下载。</p>}{selected.employee.id === 'staff.notice-writer' && <p>发送通知前需授权并由本人确认对象与内容；结果未知时先核实。</p>}</section>{selected.employee.prompt && <section className="plain-section"><h3>角色设定</h3><p className="student-agent-prompt">{selected.employee.prompt}</p></section>}{selected.employee.configuration && <ExpertConfigurationDetails config={selected.employee.configuration} />}</div>
        <div className="recruitment-detail-modal__actions"><p>本地原型演示，尚未连接模型服务。</p><div><button type="button" className="button button--quiet" onClick={() => setSelected(undefined)}>返回浏览</button><button type="button" className="button button--primary" disabled={preview?.id === selected.employee.id && preview.disabled} onClick={() => onStartConversation(selected.employee)}>开始对话</button></div></div>
      </div>}
    </ClientModal>
  </DetailPage>
}
