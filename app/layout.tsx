import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans=Geist({subsets:['latin'],variable:'--font-geist-sans'})
const geistMono=Geist_Mono({subsets:['latin'],variable:'--font-geist-mono'})
export const metadata:Metadata={title:'VERIF — Telegram group tools',description:'Configure Telegram group verification and moderation with an inline admin control center.'}
export const viewport:Viewport={themeColor:'#0b7580',width:'device-width',initialScale:1}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" className="bg-background"><body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>{children}</body></html>
}
