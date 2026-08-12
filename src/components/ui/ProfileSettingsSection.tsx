'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialBusinessName: string
  initialLogoUrl: string | null
}

export default function ProfileSettingsSection({ initialBusinessName, initialLogoUrl }: Props) {
  const router = useRouter()
  const [businessName, setBusinessName] = useState(initialBusinessName)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('business_settings')
      .update({ business_name: businessName.trim() || 'Mimori' })
      .eq('id', 1)
    if (err) { setError(err.message); setSaving(false); return }
    setSuccess('Business name saved.')
    setSaving(false)
    router.refresh()
  }

  async function handleLogoUpload(file: File) {
    setUploading(true)
    setError(null)
    setSuccess(null)
    const supabase = createClient()

    const ext = file.name.split('.').pop()
    const path = `logo-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('branding').upload(path, file, { upsert: true })
    if (uploadErr) { setError('Upload failed: ' + uploadErr.message); setUploading(false); return }

    const { data } = supabase.storage.from('branding').getPublicUrl(path)
    const { error: updateErr } = await supabase
      .from('business_settings')
      .update({ logo_url: data.publicUrl })
      .eq('id', 1)
    if (updateErr) { setError(updateErr.message); setUploading(false); return }

    setLogoUrl(data.publicUrl)
    setSuccess('Logo updated.')
    setUploading(false)
    router.refresh()
  }

  async function handleRemoveLogo() {
    setError(null)
    setSuccess(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('business_settings')
      .update({ logo_url: null })
      .eq('id', 1)
    if (err) { setError(err.message); return }
    setLogoUrl(null)
    setSuccess('Logo removed — showing the Mimori wordmark.')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="label mb-1">Branding</p>
        <p className="text-xs text-onSurfaceVariant/70">Replace the Mimori wordmark with your own logo. If no logo is set, Mimori is shown.</p>
      </div>

      {error && <p className="text-sm text-onErrorContainer bg-errorContainer rounded-xl px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-onSuccessContainer bg-successContainer rounded-xl px-3 py-2">{success}</p>}

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl border border-outline bg-surfaceContainerLow flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs text-onSurfaceVariant/70">Mimori</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary text-sm">
            {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button type="button" onClick={handleRemoveLogo} className="btn-ghost text-xs text-error/70 hover:text-error">
              Remove logo
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSaveName} className="space-y-3 border-t border-outlineVariant pt-4">
        <div>
          <label className="label">Business name</label>
          <input className="input" value={businessName} onChange={e => setBusinessName(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>

      <p className="text-xs text-onSurfaceVariant/70 border-t border-outlineVariant pt-3">
        &ldquo;Powered by Mimori&rdquo; stays in the footer regardless of your branding — it&apos;s a small credit link to the project.
      </p>
    </div>
  )
}
