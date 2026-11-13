import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VERIF — Group verification and moderation',
  description: 'Telegram group verification and moderation configured by admins with inline controls.',
}
export const viewport: Viewport = { themeColor: '#0b1820', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="bg-background"><body>{children}</body></html>
}
