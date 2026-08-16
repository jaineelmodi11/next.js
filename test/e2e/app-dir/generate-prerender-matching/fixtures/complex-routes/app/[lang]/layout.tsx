import type { ReactNode } from 'react'

export const unstable_matcher = {
  lang: 'not-found',
} as const

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
