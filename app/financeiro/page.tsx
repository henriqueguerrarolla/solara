'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import Organograma from '@/components/Organograma'
import FilaAprovacao from '@/components/FilaAprovacao'

const TABS = ['importar', 'divergencias', 'relatorio', 'aprovacoes']

export default function FinanceiroPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('importar')
  const [extratoFile, setExtratoFile] = useState<File | null>(null)
  const [titulosFile, setTitulosFile] = useState<File | null>(null)
  const [extratoId, setExtratoId] = useState<string | null>(null)
  const [lancamentos, setLancamentos] = useState<any[]>([])
  const [divergencias, setDivergencias] = useState<any[]>([])
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          router.push('/login')
          return
        }

        const { data: perfil } = await supabase
          .from('perfis')
          .select('areas')
          .eq('id', session.user.id)
          .single()

        if (!perfil?.areas.includes('financeiro')) {
          router.push('/')
          return
        }

        setUser(session.user)
        setLoading(false)
      } catch (err) {
        console.error(err)
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  const handleUpload = async () => {
    if (!extratoFile) {
      alert('Selecione um arquivo de extrato')
      return
    }

    try {
      const formData = new FormData()
      formData.append('extrato', extratoFile)
      if (titulosFile) {
        formData.append('titulos', titulosFile)
      }

      const response = await fetch('/api/financeiro/importar', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        alert(`Erro: ${data.error}`)
        return
      }

      setExtratoId(data.extrato_id)
      setLancamentos(data.lancamentos || [])
      setDivergencias(data.divergencias || [])
      alert('Arquivo importado com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao importar arquivo')
    }
  }

  const handleConciliar = async () => {
    if (!extratoId) {
      alert('Importe um arquivo primeiro')
      return
    }

    try {
      const response = await fetch('/api/financeiro/conciliar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extrato_id: extratoId }),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(`Erro: ${error.error}`)
        return
      }

      alert('Conciliação iniciada!')
    } catch (err) {
      console.error(err)
      alert('Erro ao conciliar')
    }
  }

  if (loading) {
    return <div style={styles.container}>Carregando...</div>
  }

  const casados = lancamentos.filter((l) => l.situacao === 'casado')
  const divergentes = lancamentos.filter((l) => l.situacao === 'divergente')
  const ignorados = lancamentos.filter((l) => l.situacao === 'ignorado')

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Financeiro</h1>
        <button onClick={() => router.push('/')} style={styles.backBtn}>
          ← Voltar
        </button>
      </div>

      <div style={styles.container}>
        {/* Organograma */}
        <div style={styles.organoramaSection}>
          <Organograma area="financeiro" item_id={extratoId || ''} />
        </div>

        {/* Abas */}
        <div style={styles.tabsContainer}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...styles.tab,
                backgroundColor: tab === t ? '#1f2937' : '#e5e7eb',
                color: tab === t ? 'white' : '#374151',
              }}
            >
              {t === 'importar' && '📤'}
              {t === 'divergencias' && '⚠️'}
              {t === 'relatorio' && '📊'}
              {t === 'aprovacoes' && '✓'}
              {' '}{t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Importar */}
        {tab === 'importar' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Importar Extrato</h2>

            <div style={styles.uploadArea}>
              <label style={styles.uploadLabel}>
                Extrato Bancário (CSV)*
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setExtratoFile(e.target.files?.[0] || null)}
                  style={styles.fileInput}
                />
              </label>

              <label style={styles.uploadLabel}>
                Títulos a Receber (CSV)
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setTitulosFile(e.target.files?.[0] || null)}
                  style={styles.fileInput}
                />
              </label>
            </div>

            <button onClick={handleUpload} style={styles.uploadBtn}>
              Importar
            </button>

            {extratoFile && (
              <div style={styles.info}>
                ✓ {extratoFile.name} ({extratoFile.size} bytes)
              </div>
            )}
          </div>
        )}

        {/* Divergências */}
        {tab === 'divergencias' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Resultados da Conciliação</h2>

            <div style={styles.resultGrid}>
              <div style={{ ...styles.resultBox, borderLeft: '4px solid #10b981' }}>
                <div style={styles.resultNumber}>{casados.length}</div>
                <div style={styles.resultLabel}>Casados</div>
                <div style={styles.resultValue}>
                  R$ {casados.reduce((s, l) => s + (l.valor || 0), 0).toFixed(2)}
                </div>
              </div>

              <div style={{ ...styles.resultBox, borderLeft: '4px solid #f59e0b' }}>
                <div style={styles.resultNumber}>{divergentes.length}</div>
                <div style={styles.resultLabel}>Divergências</div>
                <div style={styles.resultValue}>
                  R$ {divergentes.reduce((s, l) => s + (l.valor || 0), 0).toFixed(2)}
                </div>
              </div>

              <div style={{ ...styles.resultBox, borderLeft: '4px solid #6b7280' }}>
                <div style={styles.resultNumber}>{ignorados.length}</div>
                <div style={styles.resultLabel}>Ignorados</div>
                <div style={styles.resultValue}>
                  R$ {ignorados.reduce((s, l) => s + (l.valor || 0), 0).toFixed(2)}
                </div>
              </div>
            </div>

            {divergencias.length > 0 && (
              <div style={styles.divergenciasTable}>
                <h3 style={styles.tableTitle}>Divergências ({divergencias.length})</h3>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ID</th>
                      <th style={styles.th}>Tipo</th>
                      <th style={styles.th}>Valor</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divergencias.slice(0, 5).map((div: any) => (
                      <tr key={div.id}>
                        <td style={styles.td}>{div.id.slice(0, 8)}...</td>
                        <td style={styles.td}>{div.tipo_inicial}</td>
                        <td style={styles.td}>R$ {div.valor_lancamento}</td>
                        <td style={styles.td}>{div.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {divergencias.length > 5 && (
                  <p style={styles.moreText}>
                    +{divergencias.length - 5} mais
                  </p>
                )}
              </div>
            )}

            {extratoId && divergentes.length > 0 && (
              <button onClick={handleConciliar} style={styles.conciliarBtn}>
                🚀 Iniciar Conciliação
              </button>
            )}
          </div>
        )}

        {/* Relatório */}
        {tab === 'relatorio' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Relatório</h2>
            <div style={styles.relatorioBox}>
              <p style={styles.relatorioText}>
                Relatório da conciliação será exibido aqui após o processamento pelos agentes.
              </p>
            </div>
          </div>
        )}

        {/* Aprovações */}
        {tab === 'aprovacoes' && user && (
          <FilaAprovacao area="financeiro" usuarioId={user.id} />
        )}
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
  } as React.CSSProperties,
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px',
  } as React.CSSProperties,
  organoramaSection: {
    marginBottom: '30px',
  } as React.CSSProperties,
  tabsContainer: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
  } as React.CSSProperties,
  tab: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '20px',
    color: '#1f2937',
  } as React.CSSProperties,
  uploadArea: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px',
  } as React.CSSProperties,
  uploadLabel: {
    display: 'block',
    padding: '16px',
    border: '2px dashed #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  } as React.CSSProperties,
  fileInput: {
    display: 'none',
  } as React.CSSProperties,
  uploadBtn: {
    padding: '10px 20px',
    backgroundColor: '#1f2937',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
  } as React.CSSProperties,
  info: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '4px',
    fontSize: '14px',
  } as React.CSSProperties,
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '30px',
  } as React.CSSProperties,
  resultBox: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
  } as React.CSSProperties,
  resultNumber: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
  } as React.CSSProperties,
  resultLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  } as React.CSSProperties,
  resultValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginTop: '4px',
  } as React.CSSProperties,
  divergenciasTable: {
    marginTop: '30px',
  } as React.CSSProperties,
  tableTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#1f2937',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  } as React.CSSProperties,
  th: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#374151',
    borderBottom: '2px solid #e5e7eb',
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  td: {
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
  } as React.CSSProperties,
  moreText: {
    marginTop: '12px',
    fontSize: '12px',
    color: '#6b7280',
  } as React.CSSProperties,
  conciliarBtn: {
    marginTop: '20px',
    padding: '12px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
  } as React.CSSProperties,
  relatorioBox: {
    padding: '20px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
  } as React.CSSProperties,
  relatorioText: {
    color: '#6b7280',
    lineHeight: '1.6',
  } as React.CSSProperties,
}
