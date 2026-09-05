'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import Organograma from '@/components/Organograma'
import FilaAprovacao from '@/components/FilaAprovacao'
import LinhaDoTempo from '@/components/LinhaDoTempo'

const TABS = ['importar', 'divergencias', 'relatorio', 'aprovacoes']
const STATUSES_DIVERGENCIA = ['nova', 'investigando', 'aguardando_aprovacao', 'resolvida']

interface Lancamento {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  situacao: string
  cod_titulo_casado: string | null
}

interface Divergencia {
  id: string
  tipo_inicial: string
  lancamento_id: string | null
  cod_titulo: string | null
  valor_lancamento: number | null
  valor_titulo: number | null
  status: string
  hipotese: any
}

export default function FinanceiroPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('importar')
  const [extratoFile, setExtratoFile] = useState<File | null>(null)
  const [titulosFile, setTitulosFile] = useState<File | null>(null)
  const [extratoId, setExtratoId] = useState<string | null>(null)
  const [antes, setAntes] = useState<string[]>([])
  const [depois, setDepois] = useState<any[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [divergencias, setDivergencias] = useState<Divergencia[]>([])
  const [relatorio, setRelatorio] = useState<string | null>(null)
  const [selectedDivergencia, setSelectedDivergencia] = useState<string | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [conciliando, setConciliando] = useState(false)
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

  // Realtime + polling para lançamentos e divergências do extrato atual
  useEffect(() => {
    if (!extratoId) return

    const supabase = createBrowserSupabaseClient()

    const loadDados = async () => {
      const [{ data: lancData }, { data: divData }] = await Promise.all([
        supabase.from('lancamentos').select('*').eq('extrato_id', extratoId),
        supabase.from('divergencias').select('*').eq('extrato_id', extratoId),
      ])

      if (lancData) setLancamentos(lancData)
      if (divData) setDivergencias(divData)
    }

    loadDados()

    const channel = supabase
      .channel(`financeiro_${extratoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lancamentos', filter: `extrato_id=eq.${extratoId}` },
        () => loadDados()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'divergencias', filter: `extrato_id=eq.${extratoId}` },
        () => loadDados()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'execucoes_agentes', filter: `item_id=eq.${extratoId}` },
        (payload) => {
          const novo: Record<string, any> = payload.new || {}
          if (novo.agente === 'consolidador' && novo.saida?.relatorio_markdown) {
            setRelatorio(novo.saida.relatorio_markdown)
          }
          if (novo.agente === 'orquestrador' && novo.saida?.relatorio) {
            setRelatorio(novo.saida.relatorio)
          }
        }
      )
      .subscribe()

    const pollInterval = setInterval(loadDados, 5000)

    return () => {
      channel.unsubscribe()
      clearInterval(pollInterval)
    }
  }, [extratoId])

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
      setAntes(data.antes || [])
      setDepois(data.depois || [])
      setLancamentos(data.lancamentos || [])
      setDivergencias(data.divergencias || [])
      setTab('divergencias')
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

    setConciliando(true)
    try {
      const response = await fetch('/api/financeiro/conciliar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extrato_id: extratoId }),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(`Erro: ${error.error}`)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao conciliar')
    } finally {
      setConciliando(false)
    }
  }

  if (loading) {
    return <div style={styles.container}>Carregando...</div>
  }

  const casados = lancamentos.filter((l) => l.situacao === 'casado')
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
                {extratoFile && <div style={styles.fileName}>✓ {extratoFile.name}</div>}
              </label>

              <label style={styles.uploadLabel}>
                Títulos a Receber (CSV, opcional)
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setTitulosFile(e.target.files?.[0] || null)}
                  style={styles.fileInput}
                />
                {titulosFile && <div style={styles.fileName}>✓ {titulosFile.name}</div>}
              </label>
            </div>

            <button onClick={handleUpload} style={styles.uploadBtn}>
              Importar
            </button>

            {/* Antes e Depois */}
            {antes.length > 0 && (
              <div style={styles.antesDepoisSection}>
                <h3 style={styles.subTitle}>Antes e Depois (6 primeiras linhas)</h3>
                <div style={styles.antesDepoisGrid}>
                  <div>
                    <div style={styles.antesDepoisLabel}>📄 Como veio (bruto)</div>
                    <pre style={styles.codeBox}>
                      {antes.join('\n')}
                    </pre>
                  </div>
                  <div>
                    <div style={styles.antesDepoisLabel}>✨ Normalizado</div>
                    <pre style={styles.codeBox}>
                      {depois
                        .map(
                          (l) =>
                            `${l.data} | ${l.descricao} | R$ ${l.valor.toFixed(2)} | ${l.tipo}`
                        )
                        .join('\n')}
                    </pre>
                  </div>
                </div>
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
                <div style={styles.resultLabel}>✅ Bateram</div>
                <div style={styles.resultValue}>
                  R$ {casados.reduce((s, l) => s + (l.valor || 0), 0).toFixed(2)}
                </div>
              </div>

              <div style={{ ...styles.resultBox, borderLeft: '4px solid #f59e0b' }}>
                <div style={styles.resultNumber}>{divergencias.length}</div>
                <div style={styles.resultLabel}>⚠️ Divergências</div>
                <div style={styles.resultValue}>
                  R$ {divergencias.reduce((s, d) => s + (d.valor_lancamento || d.valor_titulo || 0), 0).toFixed(2)}
                </div>
              </div>

              <div style={{ ...styles.resultBox, borderLeft: '4px solid #6b7280' }}>
                <div style={styles.resultNumber}>{ignorados.length}</div>
                <div style={styles.resultLabel}>🚫 Ignorados (débitos)</div>
                <div style={styles.resultValue}>
                  R$ {ignorados.reduce((s, l) => s + (l.valor || 0), 0).toFixed(2)}
                </div>
              </div>
            </div>

            {extratoId && divergencias.length > 0 && (
              <button
                onClick={handleConciliar}
                disabled={conciliando}
                style={{
                  ...styles.conciliarBtn,
                  opacity: conciliando ? 0.6 : 1,
                  cursor: conciliando ? 'not-allowed' : 'pointer',
                }}
              >
                {conciliando ? '⏳ Investigando...' : '🚀 Iniciar Investigação'}
              </button>
            )}

            {/* Kanban de Divergências */}
            {divergencias.length > 0 && (
              <div style={styles.kanban}>
                {STATUSES_DIVERGENCIA.map((status) => {
                  const divsStatus = divergencias.filter((d) => d.status === status)
                  return (
                    <div key={status} style={styles.column}>
                      <div style={styles.columnTitle}>
                        {status.toUpperCase()} ({divsStatus.length})
                      </div>
                      <div style={styles.cards}>
                        {divsStatus.map((div) => (
                          <div
                            key={div.id}
                            onClick={() => {
                              setSelectedDivergencia(div.id)
                              setShowTimeline(true)
                            }}
                            style={{
                              ...styles.card,
                              backgroundColor:
                                selectedDivergencia === div.id ? '#dbeafe' : 'white',
                            }}
                          >
                            <div style={styles.cardTipo}>{div.tipo_inicial}</div>
                            <div style={styles.cardValor}>
                              R$ {(div.valor_lancamento || div.valor_titulo || 0).toFixed(2)}
                            </div>
                            {div.cod_titulo && (
                              <div style={styles.cardTitulo}>{div.cod_titulo}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Relatório */}
        {tab === 'relatorio' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Relatório</h2>
            <div style={styles.relatorioBox}>
              {relatorio ? (
                <pre style={styles.relatorioMarkdown}>{relatorio}</pre>
              ) : (
                <p style={styles.relatorioText}>
                  Relatório da conciliação será exibido aqui após o processamento pelos agentes.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Aprovações */}
        {tab === 'aprovacoes' && user && (
          <FilaAprovacao area="financeiro" usuarioId={user.id} />
        )}
      </div>

      {/* Painel Timeline */}
      {showTimeline && selectedDivergencia && (
        <div style={styles.sidePanel}>
          <button
            onClick={() => setShowTimeline(false)}
            style={styles.closePanelBtn}
          >
            ✕
          </button>
          <h3 style={styles.panelTitle}>Divergência {selectedDivergencia.slice(0, 8)}</h3>
          <LinhaDoTempo item_id={selectedDivergencia} />
        </div>
      )}
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
  subTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#374151',
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
    display: 'block',
    marginTop: '8px',
  } as React.CSSProperties,
  fileName: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#10b981',
    fontWeight: '600',
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
  antesDepoisSection: {
    marginTop: '30px',
  } as React.CSSProperties,
  antesDepoisGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  } as React.CSSProperties,
  antesDepoisLabel: {
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '8px',
    color: '#374151',
  } as React.CSSProperties,
  codeBox: {
    fontSize: '11px',
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    padding: '12px',
    borderRadius: '6px',
    overflow: 'auto',
    maxHeight: '250px',
    fontFamily: 'monospace',
    margin: 0,
    whiteSpace: 'pre-wrap',
  } as React.CSSProperties,
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
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
  conciliarBtn: {
    marginBottom: '20px',
    padding: '12px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
  } as React.CSSProperties,
  kanban: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  } as React.CSSProperties,
  column: {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    padding: '16px',
  } as React.CSSProperties,
  columnTitle: {
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#374151',
  } as React.CSSProperties,
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '10px',
    cursor: 'pointer',
  } as React.CSSProperties,
  cardTipo: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '4px',
  } as React.CSSProperties,
  cardValor: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#059669',
  } as React.CSSProperties,
  cardTitulo: {
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '4px',
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
  relatorioMarkdown: {
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    fontSize: '14px',
    color: '#1f2937',
    lineHeight: '1.6',
    margin: 0,
  } as React.CSSProperties,
  sidePanel: {
    position: 'fixed',
    right: 0,
    top: 0,
    bottom: 0,
    width: '400px',
    backgroundColor: 'white',
    borderLeft: '1px solid #e5e7eb',
    padding: '20px',
    overflowY: 'auto',
    zIndex: 999,
    boxShadow: '-2px 0 4px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  closePanelBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    marginBottom: '12px',
  } as React.CSSProperties,
  panelTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#1f2937',
  } as React.CSSProperties,
}
