'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { EscalationRuleWithTiers, EscalationTier, EscalationRecipientType, UserRole } from '@/types/database'

interface Roster {
  id: string
  name: string
}

interface Props {
  initialRules: EscalationRuleWithTiers[]
  storeId: string
  roster: Roster[]
}

type DraftTier = Omit<EscalationTier, 'rule_id' | 'created_at'> & { _new?: boolean }

interface DraftRule extends Omit<EscalationRuleWithTiers, 'escalation_tiers'> {
  tiers: DraftTier[]
  deletedTierIds: string[]
}

const ROLE_OPTIONS: UserRole[] = ['employee', 'manager', 'admin']
const ROLE_LABEL: Record<UserRole, string> = { employee: 'Staff', manager: 'Manager', admin: 'Admin' }

function toDraft(rule: EscalationRuleWithTiers): DraftRule {
  const { escalation_tiers, ...rest } = rule
  return {
    ...rest,
    tiers: [...escalation_tiers].sort((a, b) => a.tier_order - b.tier_order),
    deletedTierIds: [],
  }
}

let tempId = 0
function nextTempId() {
  tempId -= 1
  return `temp-${tempId}`
}

export default function AdminEscalationClient({ initialRules, storeId, roster }: Props) {
  const [rules, setRules] = useState<DraftRule[]>(initialRules.map(toDraft))
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function patchRule(ruleId: string, patch: Partial<DraftRule>) {
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...patch } : r))
  }

  function addTier(ruleId: string) {
    setRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r
      const maxOrder = r.tiers.reduce((m, t) => Math.max(m, t.tier_order), 0)
      const newTier: DraftTier = {
        id: nextTempId(),
        tier_order: maxOrder + 1,
        delay_minutes: 60,
        recipient_type: 'role',
        recipient_role: 'admin',
        recipient_user_id: null,
        _new: true,
      }
      return { ...r, tiers: [...r.tiers, newTier] }
    }))
  }

  function removeTier(ruleId: string, tierId: string) {
    setRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r
      const isPersisted = !tierId.startsWith('temp-')
      return {
        ...r,
        tiers: r.tiers.filter(t => t.id !== tierId),
        deletedTierIds: isPersisted ? [...r.deletedTierIds, tierId] : r.deletedTierIds,
      }
    }))
  }

  function patchTier(ruleId: string, tierId: string, patch: Partial<DraftTier>) {
    setRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r
      return { ...r, tiers: r.tiers.map(t => t.id === tierId ? { ...t, ...patch } : t) }
    }))
  }

  function moveTier(ruleId: string, index: number, direction: -1 | 1) {
    setRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r
      const target = index + direction
      if (target < 0 || target >= r.tiers.length) return r
      const tiers = [...r.tiers]
      const a = tiers[index]
      const b = tiers[target]
      // Swap content, keep each row's id/tier_order (its DB identity) fixed —
      // avoids any unique(rule_id, tier_order) collision on save.
      const { id: aId, tier_order: aOrder, _new: aNew, ...aContent } = a
      const { id: bId, tier_order: bOrder, _new: bNew, ...bContent } = b
      tiers[index] = { id: aId, tier_order: aOrder, _new: aNew, ...bContent }
      tiers[target] = { id: bId, tier_order: bOrder, _new: bNew, ...aContent }
      return { ...r, tiers }
    }))
  }

  async function handleSaveRule(rule: DraftRule) {
    setSaving(rule.id)
    setError(null)
    setSuccess(null)
    const supabase = createClient()

    const { error: ruleErr } = await supabase
      .from('escalation_rules')
      .update({
        name: rule.name.trim() || 'Default',
        trigger_missed: rule.trigger_missed,
        trigger_missing_proof: rule.trigger_missing_proof,
        active: rule.active,
      })
      .eq('id', rule.id)
    if (ruleErr) { setError(ruleErr.message); setSaving(null); return }

    for (const id of rule.deletedTierIds) {
      const { error: delErr } = await supabase.from('escalation_tiers').delete().eq('id', id)
      if (delErr) { setError(delErr.message); setSaving(null); return }
    }

    const persistedTiers: DraftTier[] = []
    for (const tier of rule.tiers) {
      const payload = {
        rule_id: rule.id,
        tier_order: tier.tier_order,
        delay_minutes: tier.delay_minutes,
        recipient_type: tier.recipient_type,
        recipient_role: tier.recipient_type === 'role' ? tier.recipient_role : null,
        recipient_user_id: tier.recipient_type === 'specific_user' ? tier.recipient_user_id : null,
      }
      if (tier._new) {
        const { data, error: insErr } = await supabase.from('escalation_tiers').insert(payload).select().single()
        if (insErr) { setError(insErr.message); setSaving(null); return }
        persistedTiers.push({ ...(data as EscalationTier) })
      } else {
        const { error: updErr } = await supabase.from('escalation_tiers').update(payload).eq('id', tier.id)
        if (updErr) { setError(updErr.message); setSaving(null); return }
        persistedTiers.push({ ...tier, recipient_role: payload.recipient_role, recipient_user_id: payload.recipient_user_id })
      }
    }

    setRules(prev => prev.map(r => r.id === rule.id
      ? { ...r, tiers: persistedTiers.sort((a, b) => a.tier_order - b.tier_order), deletedTierIds: [] }
      : r
    ))
    setSuccess(`"${rule.name}" saved.`)
    setSaving(null)
  }

  async function handleSetDefault(rule: DraftRule) {
    const currentDefault = rules.find(r => r.is_default)
    if (!currentDefault || currentDefault.id === rule.id) return
    setSaving(rule.id)
    setError(null)
    const supabase = createClient()

    const { error: unsetErr } = await supabase.from('escalation_rules').update({ is_default: false }).eq('id', currentDefault.id)
    if (unsetErr) { setError(unsetErr.message); setSaving(null); return }
    const { error: setErr } = await supabase.from('escalation_rules').update({ is_default: true }).eq('id', rule.id)
    if (setErr) { setError(setErr.message); setSaving(null); return }

    setRules(prev => prev.map(r => ({ ...r, is_default: r.id === rule.id })))
    setSaving(null)
  }

  async function handleAddRule() {
    setError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('escalation_rules')
      .insert({ store_id: storeId, name: 'New rule', is_default: false, trigger_missed: true, trigger_missing_proof: false, active: true })
      .select()
      .single()
    if (err) { setError(err.message); return }
    setRules(prev => [...prev, toDraft({ ...(data as EscalationRuleWithTiers), escalation_tiers: [] })])
  }

  async function handleDeleteRule(rule: DraftRule) {
    if (rule.is_default) return
    if (!confirm(`Delete "${rule.name}"? Tasks using it will fall back to the store default.`)) return
    const supabase = createClient()
    const { error: err } = await supabase.from('escalation_rules').delete().eq('id', rule.id)
    if (err) { setError(err.message); return }
    setRules(prev => prev.filter(r => r.id !== rule.id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-onSurface">Escalation Chains</h1>
          <p className="text-xs text-onSurfaceVariant/70 mt-0.5">Who gets notified, and when, if a task is missed or completed without required proof.</p>
        </div>
        <button onClick={handleAddRule} className="btn-primary">+ Add rule set</button>
      </div>

      {error && <div className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-4 py-3">{error}</div>}
      {success && <div className="text-sm text-onSuccessContainer bg-successContainer rounded-xl px-4 py-3">{success}</div>}

      <div className="space-y-4">
        {rules.map(rule => (
          <div key={rule.id} className="card space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                <input
                  className="input flex-1"
                  value={rule.name}
                  disabled={rule.is_default}
                  onChange={e => patchRule(rule.id, { name: e.target.value })}
                />
                {rule.is_default && <span className="text-xs rounded-full px-2 py-0.5 bg-primaryContainer text-onPrimaryContainer flex-shrink-0">Store default</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!rule.is_default && (
                  <button onClick={() => handleSetDefault(rule)} className="btn-ghost text-xs text-onSurfaceVariant">Set as default</button>
                )}
                {!rule.is_default && (
                  <button onClick={() => handleDeleteRule(rule)} className="btn-ghost text-xs text-error/70 hover:text-error">Delete</button>
                )}
              </div>
            </div>

            {/* Triggers */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox" className="w-4 h-4 rounded accent-primary"
                  checked={rule.trigger_missed}
                  onChange={e => patchRule(rule.id, { trigger_missed: e.target.checked })}
                />
                <span className="text-sm text-onSurface">Missed tasks</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox" className="w-4 h-4 rounded accent-primary"
                  checked={rule.trigger_missing_proof}
                  onChange={e => patchRule(rule.id, { trigger_missing_proof: e.target.checked })}
                />
                <span className="text-sm text-onSurface">Completed without required photo/notes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
                <input
                  type="checkbox" className="w-4 h-4 rounded accent-primary"
                  checked={rule.active}
                  onChange={e => patchRule(rule.id, { active: e.target.checked })}
                />
                <span className="text-sm text-onSurface">Active</span>
              </label>
            </div>

            {/* Tiers — nested rows use the flatter outlined card, sitting inside this already-elevated card */}
            <div className="space-y-2">
              <p className="label">Escalation tiers</p>
              {rule.tiers.length === 0 && (
                <p className="text-xs text-onSurfaceVariant/70">No tiers yet — add one so this chain actually notifies someone.</p>
              )}
              {rule.tiers.map((tier, idx) => (
                <div key={tier.id} className="card-outlined flex items-center gap-2 flex-wrap px-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-surface border border-outline flex items-center justify-center text-xs font-bold text-onSurfaceVariant flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-onSurfaceVariant flex-shrink-0">
                    <span>after</span>
                    <input
                      type="number" min={0} className="input w-16 py-1"
                      value={tier.delay_minutes}
                      onChange={e => patchTier(rule.id, tier.id, { delay_minutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    />
                    <span>min, notify</span>
                  </div>
                  <select
                    className="input w-auto py-1 text-xs"
                    value={tier.recipient_type}
                    onChange={e => patchTier(rule.id, tier.id, { recipient_type: e.target.value as EscalationRecipientType })}
                  >
                    <option value="assignee">Task&apos;s assignee</option>
                    <option value="role">Role…</option>
                    <option value="specific_user">Specific person…</option>
                  </select>
                  {tier.recipient_type === 'role' && (
                    <select
                      className="input w-auto py-1 text-xs"
                      value={tier.recipient_role ?? 'admin'}
                      onChange={e => patchTier(rule.id, tier.id, { recipient_role: e.target.value as UserRole })}
                    >
                      {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  )}
                  {tier.recipient_type === 'specific_user' && (
                    <select
                      className="input w-auto py-1 text-xs"
                      value={tier.recipient_user_id ?? ''}
                      onChange={e => patchTier(rule.id, tier.id, { recipient_user_id: e.target.value || null })}
                    >
                      <option value="">Choose…</option>
                      {roster.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  )}
                  <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                    <button type="button" disabled={idx === 0} onClick={() => moveTier(rule.id, idx, -1)} className="btn-ghost text-xs px-2 disabled:opacity-30">↑</button>
                    <button type="button" disabled={idx === rule.tiers.length - 1} onClick={() => moveTier(rule.id, idx, 1)} className="btn-ghost text-xs px-2 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => removeTier(rule.id, tier.id)} className="btn-ghost text-xs px-2 text-error/70 hover:text-error">Remove</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => addTier(rule.id)} className="btn-ghost text-xs">+ Add tier</button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => handleSaveRule(rule)}
                disabled={saving === rule.id}
                className={cn('btn-primary text-sm', saving === rule.id && 'opacity-60')}
              >
                {saving === rule.id ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
