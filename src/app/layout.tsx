import type { Metadata } from 'next'
import { Permanent_Marker, Roboto } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { createClient } from '@/lib/supabase/server'
import './globals.css'

const permanentMarker = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-permanent-marker',
})

const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
})

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const supabase = createClient()
  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name')
    .eq('id', 1)
    .single()

  const businessName = settings?.business_name ?? 'Mimori'
  return {
    title: `${businessName} — Task Management`,
    description: 'Internal task & operations management',
    robots: { index: false, follow: false },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${permanentMarker.variable} ${roboto.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
