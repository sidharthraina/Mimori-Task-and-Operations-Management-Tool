import type { Metadata } from 'next'
import { Permanent_Marker, Roboto } from 'next/font/google'
import './globals.css'

const permanentMarker = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-permanent-marker',
})

const roboto = Roboto({
  weight: '300',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
})

export const metadata: Metadata = {
  title: `${process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'Café'} — Task Management`,
  description: 'Internal café task management',
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${permanentMarker.variable} ${roboto.variable}`}>
      <body>{children}</body>
    </html>
  )
}
