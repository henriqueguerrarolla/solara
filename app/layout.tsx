import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Solara OS',
  description: 'Sistema operacional da Solara Distribuidora',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
