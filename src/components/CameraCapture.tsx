'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (file: File) => void
  onClose: () => void
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {
        if (!cancelled) setError('Could not access the camera. Please allow camera permission and try again.')
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  function handleCapture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) return
      onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-black rounded-2xl overflow-hidden w-full max-w-md shadow-xl">
        {error ? (
          <div className="p-6 text-center text-white">
            <p className="text-sm">{error}</p>
            <button onClick={onClose} className="btn-secondary mt-4">Close</button>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-square object-cover bg-black" />
            <div className="flex items-center justify-center gap-6 py-4 bg-black">
              <button
                onClick={onClose}
                aria-label="Cancel"
                className="text-white text-sm px-4 py-2 rounded-full hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCapture}
                aria-label="Take photo"
                className="w-14 h-14 rounded-full bg-white border-4 border-white/30 hover:border-white/60 transition-colors"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
