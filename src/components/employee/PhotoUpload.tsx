'use client'

import { useState } from 'react'
import CameraCapture from '@/components/CameraCapture'

interface Props {
  taskId: string
  uploading: boolean
  onUpload: (file: File) => void
}

export default function PhotoUpload({ uploading, onUpload }: Props) {
  const [showCamera, setShowCamera] = useState(false)

  function handleCapture(file: File) {
    setShowCamera(false)
    onUpload(file)
  }

  return (
    <>
      {/*
        Intentional non-change: paired with CameraCapture.tsx's literal black
        overlay/white shutter (camera-UI convention, like iOS Camera/Instagram/
        WhatsApp) — this trigger is deliberately left off the M3 token sweep
        rather than switched to onSurfaceVariant/primary.
      */}
      <button
        type="button"
        onClick={() => setShowCamera(true)}
        disabled={uploading}
        className={`
          inline-flex items-center gap-1.5 text-xs text-gray-400
          cursor-pointer hover:text-brand-500 transition-colors select-none
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        {uploading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Uploading…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Add photo proof
          </>
        )}
      </button>
      {showCamera && (
        <CameraCapture onCapture={handleCapture} onClose={() => setShowCamera(false)} />
      )}
    </>
  )
}
