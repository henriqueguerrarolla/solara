'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface Perfil {
  id: string
  email: string
  nome: string
  papel: string
  areas: string[]
}

export default function AdminPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()

  // Formulário de novo usuário
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    nome: '',
    papel: 'operador',
    areas: [] as string[],
  })

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          router.push('/login')
          return
        }

        setUser(session.user)

        // Verifica se é admin
        const { data: perfil } = await supabase
          .from('perfis')
          .select('papel')
          .eq('id', session.user.id)
          .single()

        if (perfil?.papel !== 'admin') {
          router.push('/')
          return
        }

        setIsAdmin(true)

        // Carrega perfis
        const { data: perfisData } = await supabase
          .from('perfis')
          .select('*')
          .order('criado_em', { ascending: false })

        if (perfisData) {
          setPerfis(perfisData)
        }
      } catch (err) {
        console.error(err)
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newUser.email || !newUser.password || !newUser.nome) {
      alert('Preencha todos os campos')
      return
    }

    try {
      // Chama API para criar usuário
      const response = await fetch('/api/admin/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      const data = await response.json()

      if (!response.ok) {
        alert(`Erro: ${data.error}`)
        return
      }

      alert('Usuário criado com sucesso!')
      setNewUser({
        email: '',
        password: '',
        nome: '',
        papel: 'operador',
        areas: [],
      })

      // Recarrega perfis
      const supabase = createBrowserSupabaseClient()
      const { data: perfisData } = await supabase
        .from('perfis')
        .select('*')
        .order('criado_em', { ascending: false })

      if (perfisData) {
        setPerfis(perfisData)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao criar usuário')
    }
  }

  const toggleArea = (area: string) => {
    setNewUser((prev) => ({
      ...prev,
      areas: prev.areas.includes(area)
        ? prev.areas.filter((a) => a !== area)
        : [...prev.areas, area],
    }))
  }

  if (loading) {
    return <div style={styles.container}>Carregando...</div>
  }

  if (!isAdmin) {
    return <div style={styles.container}>Acesso negado</div>
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Administração</h1>
        <button
          onClick={() => router.push('/')}
          style={styles.backBtn}
        >
          ← Voltar
        </button>
      </div>

      <div style={styles.container}>
        {/* Formulário de novo usuário */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Criar Novo Usuário</h2>
          <form onSubmit={handleCreateUser} style={styles.form}>
            <div style={styles.formRow}>
              <input
                type="email"
                placeholder="E-mail"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
                style={styles.input}
                required
              />
              <input
                type="password"
                placeholder="Senha"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                style={styles.input}
                required
              />
            </div>

            <input
              type="text"
              placeholder="Nome completo"
              value={newUser.nome}
              onChange={(e) =>
                setNewUser({ ...newUser, nome: e.target.value })
              }
              style={{ ...styles.input, width: '100%' }}
              required
            />

            <div style={styles.formRow}>
              <select
                value={newUser.papel}
                onChange={(e) =>
                  setNewUser({ ...newUser, papel: e.target.value })
                }
                style={styles.input}
              >
                <option value="operador">Operador</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div>
              <p style={styles.label}>Áreas de acesso</p>
              <div style={styles.checkboxGroup}>
                {['vendas', 'financeiro'].map((area) => (
                  <label key={area} style={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={newUser.areas.includes(area)}
                      onChange={() => toggleArea(area)}
                    />
                    {area.charAt(0).toUpperCase() + area.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" style={styles.submitBtn}>
              Criar Usuário
            </button>
          </form>
        </div>

        {/* Tabela de perfis */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Usuários ({perfis.length})</h2>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.tableHeader}>E-mail</th>
                  <th style={styles.tableHeader}>Nome</th>
                  <th style={styles.tableHeader}>Papel</th>
                  <th style={styles.tableHeader}>Áreas</th>
                </tr>
              </thead>
              <tbody>
                {perfis.map((perfil) => (
                  <tr key={perfil.id} style={styles.tableRow}>
                    <td style={styles.tableCell}>{perfil.email}</td>
                    <td style={styles.tableCell}>{perfil.nome || '-'}</td>
                    <td style={styles.tableCell}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          backgroundColor:
                            perfil.papel === 'admin' ? '#fbbf24' : '#e0e7ff',
                          color:
                            perfil.papel === 'admin' ? '#92400e' : '#3730a3',
                        }}
                      >
                        {perfil.papel}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      {perfil.areas.length > 0
                        ? perfil.areas.join(', ')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
  backBtn: {
    padding: '8px 16px',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '30px 20px',
  } as React.CSSProperties,
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '20px',
    color: '#1f2937',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  } as React.CSSProperties,
  input: {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px',
  } as React.CSSProperties,
  checkboxGroup: {
    display: 'flex',
    gap: '16px',
  } as React.CSSProperties,
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitBtn: {
    padding: '10px 20px',
    backgroundColor: '#1f2937',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  tableContainer: {
    overflowX: 'auto',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  } as React.CSSProperties,
  tableHeaderRow: {
    backgroundColor: '#f3f4f6',
    borderBottom: '2px solid #e5e7eb',
  } as React.CSSProperties,
  tableHeader: {
    padding: '12px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
  } as React.CSSProperties,
  tableRow: {
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  tableCell: {
    padding: '12px',
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
}
