import { useEffect, useState } from 'react'
import { Button, Field, Notice, Section } from '../components'
import { prototypeStore } from '../prototype-store'
import { expertCategories } from './expert-form'
import type { CampusState, Role } from './model'

export function ExpertCategorySettings({ state, reload, notify, onDirty }: { onDirty: (dirty: boolean) => void; state?: CampusState; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [value, setValue] = useState((state?.expertCategories ?? expertCategories).join('\n'))
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  let role: Role = 'admin'; try { role = JSON.parse(sessionStorage.getItem('campus-demo-actor') ?? '{}').role ?? 'admin' } catch { /* Default prototype identity. */ }
  useEffect(() => { onDirty(value !== (state?.expertCategories ?? expertCategories).join('\n')); return () => onDirty(false) }, [value, state?.expertCategories, onDirty])
  if (!state) return null
  return <Section title="专家智能体分类" description="创建表单从这里读取分类。每行一个，已被专家使用的分类不能删除。"><Field label="分类列表"><textarea aria-label="专家分类列表" disabled={role !== 'admin' || busy} rows={5} value={value} onChange={e => setValue(e.target.value)} /></Field>{error && <Notice tone="error">{error}</Notice>}<Button disabled={role !== 'admin' || busy || value === (state.expertCategories ?? expertCategories).join('\n')} onClick={async () => { setBusy(true); setError(''); try { prototypeStore().campusAction(state.revision, {role,department:'信息化处'}, {type:'expert-categories',categories:value.split('\n').map(v=>v.trim()).filter(Boolean)}); await reload(); setValue(value.split('\n').map(v => v.trim()).filter(Boolean).join('\n')); notify('专家分类已保存') } catch (e) { setError(e instanceof Error ? e.message : '分类保存失败') } finally { setBusy(false) } }}>保存分类</Button></Section>
}
