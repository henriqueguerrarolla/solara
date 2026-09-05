'use client'

import { useEffect, useRef, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface Execucao {
  id: string
  agente: string
  status: string
  chamado_por?: string | null
  tokens_entrada?: number
  tokens_saida?: number
  inicio?: string
  fim?: string
  saida?: any
  erro?: string
}

interface OrganoramaProps {
  area: string
  item_id: string
}

const AGENTES_VENDAS = ['triador', 'pesquisador', 'redator', 'revisor']
const AGENTES_FINANCEIRO = ['investigador', 'consolidador', 'revisor']

export default function Organograma({ area, item_id }: OrganoramaProps) {
  const [orquestrador, setOrquestrador] = useState<Execucao | null>(null)
  const [execucoesFilhas, setExecucoesFilhas] = useState<Execucao[]>([])
  const [loading, setLoading] = useState(true)
  const [setaVermelha, setSetaVermelha] = useState(false)
  const ultimoRevisorRef = useRef<string | null>(null)

  const agentes = area === 'vendas' ? AGENTES_VENDAS : AGENTES_FINANCEIRO
  const isFinanceiro = area === 'financeiro'

  useEffect(() => {
    if (!item_id) {
      setLoading(false)
      return
    }

    const supabase = createBrowserSupabaseClient()

    const loadExecucoes = async () => {
      if (isFinanceiro) {
        // Financeiro: orquestrador tem item_id = extrato_id.
        // Agentes filhos (investigador por divergência, consolidador, revisor)
        // são localizados por chamado_por = orquestrador.id
        const { data: orq } = await supabase
          .from('execucoes_agentes')
          .select('*')
          .eq('item_id', item_id)
          .eq('agente', 'orquestrador')
          .order('inicio', { ascending: false })
          .limit(1)
          .maybeSingle()

        setOrquestrador(orq || null)

        if (orq) {
          const { data: filhas } = await supabase
            .from('execucoes_agentes')
            .select('*')
            .eq('chamado_por', orq.id)

          setExecucoesFilhas(filhas || [])
        } else {
          setExecucoesFilhas([])
        }
      } else {
        // Vendas: todos os agentes (incluindo orquestrador) têm item_id = cod_pedido
        const { data } = await supabase
          .from('execucoes_agentes')
          .select('*')
          .eq('item_id', item_id)

        const orq = (data || []).find((e) => e.agente === 'orquestrador') || null
        setOrquestrador(orq)
        setExecucoesFilhas((data || []).filter((e) => e.agente !== 'orquestrador'))
      }

      setLoading(false)
    }

    loadExecucoes()

    // Assina Realtime. Para financeiro não dá pra filtrar direto por item_id
    // (investigadores têm item_id de cada divergência), então escuta tudo e refiltra.
    const channel = supabase
      .channel(`execucoes_${item_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execucoes_agentes',
        },
        () => {
          loadExecucoes()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [item_id, isFinanceiro])

  // Seta vermelha por 3s quando o revisor mais recente reprovou
  useEffect(() => {
    const revisorMaisRecente = execucoesFilhas
      .filter((e) => e.agente === 'revisor' && e.status === 'ok')
      .sort((a, b) => (b.fim || '').localeCompare(a.fim || ''))[0]

    if (
      revisorMaisRecente &&
      revisorMaisRecente.saida?.aprovado === false &&
      revisorMaisRecente.id !== ultimoRevisorRef.current
    ) {
      ultimoRevisorRef.current = revisorMaisRecente.id
      setSetaVermelha(true)
      const timeout = setTimeout(() => setSetaVermelha(false), 3000)
      return () => clearTimeout(timeout)
    }
  }, [execucoesFilhas])

  if (!item_id) {
    return (
      <div style={styles.container}>
        <p style={styles.empty}>Selecione um item para ver o organograma</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.empty}>Carregando...</p>
      </div>
    )
  }

  // Agrupa execuções por agente (investigador pode ter várias)
  const execucoesPorAgente: Record<string, Execucao[]> = {}
  agentes.forEach((a) => {
    execucoesPorAgente[a] = execucoesFilhas.filter((e) => e.agente === a)
  })

  return (
    <div style={styles.container}>
      <div style={styles.organograma}>
        {/* Orquestrador */}
        <div style={styles.nivel}>
          <div style={getCardStyle(orquestrador?.status)}>
            <div style={styles.cardTitle}>Orquestrador</div>
            {orquestrador && (
              <div style={styles.cardInfo}>
                <div>{orquestrador.status}</div>
                {orquestrador.status === 'ok' && (
                  <div style={styles.cardStats}>
                    {getTempo(orquestrador.inicio, orquestrador.fim)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Seta indicadora de reprovação (Vendas: revisor -> redator) */}
        {area === 'vendas' && setaVermelha && (
          <div style={styles.setaVermelhaTexto}>
            ↩ Revisor devolveu para o Redator
          </div>
        )}

        {/* Agentes */}
        <div style={styles.nivel}>
          {agentes.map((agenteNome) => {
            const execs = execucoesPorAgente[agenteNome]
            const count = agentes.length
            const ehInvestigador = isFinanceiro && agenteNome === 'investigador'

            return (
              <div
                key={agenteNome}
                style={{
                  flex: `1 / ${count}`,
                  minWidth: `${100 / count}%`,
                }}
              >
                {ehInvestigador ? (
                  <CardInvestigador execucoes={execs} />
                ) : (
                  <CardAgente
                    nome={agenteNome}
                    exec={execs[execs.length - 1]}
                    setaVermelha={agenteNome === 'revisor' && setaVermelha}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CardAgente({
  nome,
  exec,
  setaVermelha,
}: {
  nome: string
  exec?: Execucao
  setaVermelha?: boolean
}) {
  return (
    <div style={getCardStyle(exec?.status, setaVermelha)}>
      <div style={styles.cardTitle}>
        {nome.charAt(0).toUpperCase() + nome.slice(1)}
      </div>
      {exec ? (
        <div style={styles.cardInfo}>
          <div>{exec.status}</div>
          {exec.status === 'ok' && (
            <div style={styles.cardStats}>
              <div>{getTempo(exec.inicio, exec.fim)}</div>
              <div>
                {exec.tokens_entrada} + {exec.tokens_saida} tokens
              </div>
            </div>
          )}
          {exec.status === 'erro' && (
            <div style={styles.cardError}>{exec.erro}</div>
          )}
        </div>
      ) : (
        <div style={styles.cardInfo}>
          <div>-</div>
        </div>
      )}
    </div>
  )
}

function CardInvestigador({ execucoes }: { execucoes: Execucao[] }) {
  const rodando = execucoes.filter((e) => e.status === 'rodando').length
  const concluidos = execucoes.filter((e) => e.status === 'ok').length
  const erros = execucoes.filter((e) => e.status === 'erro').length

  const status = execucoes.length === 0
    ? undefined
    : rodando > 0
    ? 'rodando'
    : erros > 0 && concluidos === 0
    ? 'erro'
    : 'ok'

  return (
    <div style={getCardStyle(status)}>
      <div style={styles.cardTitle}>Investigador</div>
      {execucoes.length > 0 ? (
        <div style={styles.cardInfo}>
          <div>
            {rodando} rodando / {concluidos} concluídos
          </div>
          {erros > 0 && <div style={styles.cardError}>{erros} erro(s)</div>}
        </div>
      ) : (
        <div style={styles.cardInfo}>
          <div>-</div>
        </div>
      )}
    </div>
  )
}

function getTempo(inicio?: string, fim?: string): string {
  if (!inicio || !fim) return '-'
  const ms = new Date(fim).getTime() - new Date(inicio).getTime()
  const segundos = Math.round(ms / 1000)
  return `${segundos}s`
}

function getCardStyle(status?: string, setaVermelha?: boolean) {
  const baseStyle = {
    ...styles.card,
  } as React.CSSProperties

  if (setaVermelha) {
    baseStyle.border = '2px solid #ef4444'
  }

  if (!status) {
    baseStyle.backgroundColor = '#e5e7eb'
    baseStyle.color = '#6b7280'
  } else if (status === 'rodando') {
    baseStyle.animation = 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
    baseStyle.backgroundColor = '#fbbf24'
  } else if (status === 'ok') {
    baseStyle.backgroundColor = '#10b981'
    baseStyle.color = 'white'
  } else if (status === 'erro') {
    baseStyle.backgroundColor = '#ef4444'
    baseStyle.color = 'white'
  }

  return baseStyle
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '20px',
  } as React.CSSProperties,
  organograma: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  } as React.CSSProperties,
  nivel: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
  } as React.CSSProperties,
  setaVermelhaTexto: {
    textAlign: 'center',
    color: '#ef4444',
    fontSize: '12px',
    fontWeight: '600',
  } as React.CSSProperties,
  card: {
    padding: '15px',
    borderRadius: '6px',
    minWidth: '120px',
    textAlign: 'center',
    transition: 'all 0.3s ease',
  } as React.CSSProperties,
  cardTitle: {
    fontWeight: '600',
    fontSize: '14px',
    marginBottom: '8px',
  } as React.CSSProperties,
  cardInfo: {
    fontSize: '12px',
  } as React.CSSProperties,
  cardStats: {
    marginTop: '6px',
    fontSize: '11px',
    opacity: 0.8,
  } as React.CSSProperties,
  cardError: {
    fontSize: '11px',
    marginTop: '6px',
    wordBreak: 'break-word',
  } as React.CSSProperties,
  empty: {
    color: '#6b7280',
    textAlign: 'center',
  } as React.CSSProperties,
}

// CSS global para animação
const globalStyles = `
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
`

if (typeof window !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = globalStyles
  document.head.appendChild(style)
}
