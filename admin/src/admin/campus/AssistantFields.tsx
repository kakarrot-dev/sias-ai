import { useState } from 'react'
import { Button, Field, Modal, Section } from '../components'
import { blankConfig, models, people, platformBinding, type Config } from './model'

const ruleDocuments = import.meta.glob('./skills/campus-assistant/SKILL.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Old per-agent overrides remain editable without placing them in everyday settings. */
export function hasAssistantOverrides(c: Config): boolean {
  const defaults = blankConfig(c.department)
  const fields = ['input', 'output', 'limits', 'temperature', 'topP', 'maxTokens', 'streaming', 'safety', 'nodes', 'fewShots'] as const
  return fields.some(key => JSON.stringify(c[key]) !== JSON.stringify(defaults[key])) || !!c.interaction || !!c.definition || !!c.scenario ||
    c.assistant.exclude.length > 0 || c.assistant.candidates !== defaults.assistant.candidates || c.assistant.clarify !== defaults.assistant.clarify ||
    c.tools.some(binding => JSON.stringify(binding) !== JSON.stringify(platformBinding('assistant')))
}

export function AssistantFields({ config: c, set, disabled }: { config: Config; set: (patch: Partial<Config>) => void; disabled: boolean }) {
  const [rulesOpen, setRulesOpen] = useState(false)
  const pinned = c.tools.find(binding => binding.id === platformBinding('assistant').id)
  return <div className="campus-assistant-fields">
    <fieldset className="campus-fieldset" disabled={disabled}>
      <Section title="基本设置" description="用于全校统一接待。">
        <div className="form-grid">
          <Field label="名称" required><input aria-label="名称" value={c.name} maxLength={100} onChange={e => set({ name: e.target.value })} /></Field>
          <Field label="责任人"><select aria-label="责任人" value={c.owner} onChange={e => set({ owner: e.target.value })}>{people.filter(p => p.department === c.department).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="简介"><textarea aria-label="简介" rows={2} maxLength={500} value={c.description} onChange={e => set({ description: e.target.value })} /></Field>
          <Field label="使用的 AI 模型"><select aria-label="使用的 AI 模型" value={c.model} onChange={e => set({ model: e.target.value, assistant: { ...c.assistant, model: e.target.value } })}>{models.map(m => <option key={m.id} value={m.id} disabled={!m.active}>{m.name}{!m.active ? '（已停用）' : ''}</option>)}</select></Field>
        </div>
        <Field label="身份提示词" required hint="只定义身份、职责和通用表达要求。"><textarea aria-label="身份提示词" rows={4} maxLength={20000} value={c.prompt} onChange={e => set({ prompt: e.target.value })} /></Field>
      </Section>
      <Section title="接待用语" description="开场白选填；无匹配时说明下一步。">
        <div className="form-grid">
          <Field label="开场白"><textarea aria-label="开场白" rows={2} value={c.opening} placeholder={`你好，我是${c.name || '校园数字助理'}，有什么可以帮你？`} onChange={e => set({ opening: e.target.value })} /></Field>
          <Field label="无匹配反馈"><textarea aria-label="无匹配反馈" rows={2} value={c.assistant.noMatch} onChange={e => set({ assistant: { ...c.assistant, noMatch: e.target.value } })} /></Field>
        </div>
        <div className="assistant-opening-preview"><small>师生看到的开场白</small><p>{c.opening || `你好，我是${c.name || '校园数字助理'}，有什么可以帮你？`}</p></div>
      </Section>
    </fieldset>
    <div className="campus-assistant-rules"><span>内置接待规则{pinned ? ` · 固定 v${pinned.version}` : ''}</span><Button variant="ghost" onClick={() => setRulesOpen(true)}>查看工作规则</Button></div>
    {rulesOpen && <Modal title="内置接待规则" onClose={() => setRulesOpen(false)}>
      <p>标准 Skill · 只读规则说明。具体执行由平台提供。</p>
      <pre className="campus-assistant-rule-text">{!pinned || pinned.version === platformBinding('assistant').version ? ruleDocuments['./skills/campus-assistant/SKILL.md'] : '当前固定版本的规则正文不在本地目录中，请由实施人员核对。'}</pre>
      <footer><Button onClick={() => setRulesOpen(false)}>关闭</Button></footer>
    </Modal>}
  </div>
}
