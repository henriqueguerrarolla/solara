'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import MenuAreas from '@/components/MenuAreas'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          router.push('/login')
          return
        }

        setUser(session.user)

        // Busca perfil do usuário
        const { data: perfilData } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (perfilData) {
          setPerfil(perfilData)
        }
      } catch (err) {
        console.error(err)
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Carregando...</p>
      </div>
    )
  }

  const areas = perfil?.areas || []
  const isAdmin = perfil?.papel === 'admin'

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Solara OS</h1>
        <div style={styles.userInfo}>
          <span style={styles.email}>{user?.email}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Sair
          </button>
        </div>
      </div>

      {perfil?.nome && (
        <div style={styles.greeting}>
          Bem-vindo, {perfil.nome}!
        </div>
      )}

      <MenuAreas areas={areas} isAdmin={isAdmin} />
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    margin: '0',
    color: '#1f2937',
  } as React.CSSProperties,
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  } as React.CSSProperties,
  email: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  logoutBtn: {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  greeting: {
    maxWidth: '1000px',
    margin: '20px auto',
    padding: '16px 20px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    fontSize: '16px',
    color: '#374151',
  } as React.CSSProperties,
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    padding: '20px',
  } as React.CSSProperties,
}
