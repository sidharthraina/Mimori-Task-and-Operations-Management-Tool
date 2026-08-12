'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { cn, CATEGORY_ORDER } from '@/lib/utils'

const REPO_URL = 'https://github.com/sidharthraina/Mimori-Task-and-Operations-Management-Tool'

interface Props {
  businessName: string
  logoUrl: string | null
}

// Sourced from README.md's Core Features table + the escalation/geofencing
// commit messages — every claim here maps to a real, shipped feature.
const FEATURES = [
  {
    title: 'Flexible recurrence',
    description: "Tasks repeat every N days or weeks, optionally restricted to specific weekdays — not just “daily.”",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    ),
  },
  {
    title: 'Configurable escalation chains',
    description: 'An ordered chain per location — notify the assignee, then a role, then a specific person, each after its own delay.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    ),
  },
  {
    title: 'Photo proof of completion',
    description: 'Staff attach a photo straight from their device camera when marking a task done — a verifiable trail without extra process.',
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </>
    ),
  },
  {
    title: 'Geofenced photo checks',
    description: "Optionally flag photos taken outside a location's radius for admin review — soft by design, it never blocks the upload.",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </>
    ),
  },
  {
    title: 'Real-time admin dashboard',
    description: "Live view of Upcoming / Pending / Completed / Missed, updated the instant a staff member acts. No refresh needed.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    ),
  },
  {
    title: 'Multi-location management',
    description: 'Manage every location from one dashboard. Staff only see what they’re assigned to — switching locations is one tap.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    ),
  },
  {
    title: 'Light & dark, Material Design 3',
    description: 'A full M3 color system generated from your brand color, in both light and dark, switchable per person.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    ),
  },
  {
    title: 'Live whitelabel branding',
    description: 'Business name and logo are editable from inside the app, by an admin — no redeploy needed to rebrand.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5.586a1 1 0 01.707.293l6.414 6.414a1 1 0 010 1.414l-8.586 8.586a1 1 0 01-1.414 0L3.293 13.293a1 1 0 010-1.414L7 7z" />
    ),
  },
]

// Directly from README's "Who it's for" framing.
const WHO_ITS_FOR = [
  { emoji: '☕', label: 'Cafés' },
  { emoji: '🏋️', label: 'Gyms & studios' },
  { emoji: '🛍️', label: 'Retail stores' },
  { emoji: '🩺', label: 'Clinics' },
  { emoji: '📦', label: 'Warehouses' },
  { emoji: '✅', label: 'Any recurring-checklist team' },
]

// Mock rows for the hero card — categories pulled from lib/utils.ts's real
// CATEGORY_ORDER constant, so even the illustration matches the real schema.
const MOCK_ROWS: { category: (typeof CATEGORY_ORDER)[number]; title: string; time: string; status: 'done' | 'pending' | 'missed' }[] = [
  { category: 'Opening', title: 'Opening walkthrough', time: '7:00 AM', status: 'done' },
  { category: 'Setup', title: 'Equipment safety check', time: '7:30 AM', status: 'done' },
  { category: 'Prep', title: 'Restock supplies', time: '11:00 AM', status: 'pending' },
  { category: 'Cleaning', title: 'Deep clean — floor & counters', time: '2:00 PM', status: 'missed' },
]

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {children}
    </svg>
  )
}

export default function LandingPage({ businessName, logoUrl }: Props) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-outlineVariant bg-surface">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={businessName} className="h-8 w-auto object-contain" />
            ) : (
              <span className="text-onSurface leading-none font-display" style={{ fontSize: 28 }}>
                {businessName}
              </span>
            )}
          </div>

          <nav className="hidden sm:flex items-center gap-1 text-sm">
            <a href="#features" className="btn-ghost px-3 py-1.5">Features</a>
            <a href="#who-its-for" className="btn-ghost px-3 py-1.5">Who it&apos;s for</a>
            <a href="#how-it-works" className="btn-ghost px-3 py-1.5">How it works</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle color theme"
              className="p-2 rounded-full hover:bg-surfaceContainer transition-colors text-onSurfaceVariant"
            >
              {mounted && theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <Link href="/login" className="btn-primary text-sm">Sign in</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-10 right-0 w-[28rem] h-[28rem] rounded-full bg-tertiary/20 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 pt-16 pb-20 sm:pt-24 sm:pb-28 grid sm:grid-cols-2 gap-12 items-center">
          <div>
            <span className="chip mb-5">
              Open-source · Self-hosted · Whitelabel-ready
            </span>
            <h1 className="text-4xl sm:text-5xl font-heading text-onSurface leading-[1.1] tracking-tight">
              Your checklists, <span className="text-primary">actually completed.</span>
            </h1>
            <p className="mt-5 text-lg text-onSurfaceVariant leading-relaxed max-w-lg">
              {businessName} turns opening routines, cleaning checklists, and daily checks into a
              real-time system — with photo proof, automatic escalation, and a live view across
              every location.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary">Sign in</Link>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                View on GitHub
              </a>
            </div>
            <p className="mt-4 text-xs text-onSurfaceVariant/70">
              Free & open-source under the MIT license — fork it and run it for your own business.
            </p>
          </div>

          {/* Hero mockup — built from the app's real components/tokens, not a stock image */}
          <div className="relative">
            <div className="card w-full max-w-sm mx-auto p-5 space-y-4 shadow-elevation-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-onSurface">Today&apos;s Tasks</p>
                <span className="text-xs font-bold text-primary">18/20</span>
              </div>
              <div className="h-2 rounded-full bg-surfaceContainerHigh overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: '90%' }} />
              </div>
              <div className="space-y-2">
                {MOCK_ROWS.map(row => (
                  <div key={row.title} className="flex items-center justify-between gap-2 py-1">
                    <div className="min-w-0">
                      <p className="text-xs text-onSurfaceVariant/70 uppercase tracking-wide">{row.category}</p>
                      <p className="text-sm text-onSurface truncate">{row.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-onSurfaceVariant/70 font-mono">{row.time}</span>
                      <span className={cn(
                        row.status === 'done' && 'badge-done',
                        row.status === 'pending' && 'badge-pending',
                        row.status === 'missed' && 'badge-missed',
                      )}>
                        {row.status === 'done' ? 'Done' : row.status === 'pending' ? 'Pending' : 'Missed'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating escalation chip — Lovable-style layered depth */}
            <div className="hidden sm:flex absolute -bottom-4 -left-6 card px-4 py-2.5 items-center gap-2 shadow-elevation-2">
              <FeatureIcon>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </FeatureIcon>
              <span className="text-xs text-onSurface">Escalated to Manager · 2m ago</span>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who-its-for" className="max-w-6xl mx-auto px-4 py-16">
        <p className="text-center text-sm font-semibold text-onSurfaceVariant uppercase tracking-wider mb-6">
          Built for any business that runs on a routine
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {WHO_ITS_FOR.map(w => (
            <span key={w.label} className="chip text-sm">
              <span aria-hidden>{w.emoji}</span> {w.label}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-heading text-onSurface">Everything an operations team actually needs</h2>
          <p className="mt-3 text-onSurfaceVariant">
            Not a generic to-do app — built specifically for recurring, location-based
            accountability.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="card hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all">
              <div className="w-10 h-10 rounded-full bg-primaryContainer text-onPrimaryContainer flex items-center justify-center mb-3">
                <FeatureIcon>{f.icon}</FeatureIcon>
              </div>
              <h3 className="text-sm font-semibold text-onSurface">{f.title}</h3>
              <p className="mt-1.5 text-sm text-onSurfaceVariant leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-heading text-onSurface">How it works</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              step: '1',
              title: 'Define your checklist',
              body: 'Admins build the task list per location — category, schedule, recurrence, and whether a photo or notes are required to mark it done.',
            },
            {
              step: '2',
              title: 'Staff complete & prove it',
              body: 'One page, grouped by category, tap to complete. A photo from the camera creates a verifiable record — no extra process, no training needed.',
            },
            {
              step: '3',
              title: 'You see everything live',
              body: 'The dashboard updates the instant someone acts. Miss a step and escalation kicks in automatically — plus a nightly summary lands in your inbox.',
            },
          ].map(s => (
            <div key={s.step} className="card-outlined">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-onPrimary text-sm font-bold mb-3">
                {s.step}
              </span>
              <h3 className="text-sm font-semibold text-onSurface">{s.title}</h3>
              <p className="mt-1.5 text-sm text-onSurfaceVariant leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="rounded-modal bg-primaryContainer px-8 py-12 sm:py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-heading text-onPrimaryContainer">
            Ready to stop chasing checklists?
          </h2>
          <p className="mt-3 text-onPrimaryContainer/80 max-w-md mx-auto">
            Sign in if you already have an account, or fork the repo and deploy it for your own
            business in under an hour.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn-primary">Sign in</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary bg-surface">
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-outlineVariant">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-onSurfaceVariant/70">
            Built with Next.js 14, Supabase & Tailwind CSS. Designed to Material Design 3 specifications.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-onSurfaceVariant hover:underline"
          >
            Powered by Mimori — MIT licensed
          </a>
        </div>
      </footer>
    </div>
  )
}
