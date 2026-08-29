'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface Execucao {
  id: string
  agente: string
  status: string
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
  const [execucoes, setExecucoes] = useState<Record<string, Execucao>>({})
  const [loading, setLoading] = useState(true)

  const agentes = area === 'vendas' ? AGENTES_VENDAS : AGENTES_FINANCEIRO

  useEffect(() => {
    if (!item_id) {
      setLoading(false)
      return
    }

    const supabase = createBrowserSupabaseClient()

    // Carrega execuções existentes
    const loadExecucoes = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select('*')
        .eq('item_id', item_id)

      if (data) {
        const map: Record<string, Execucao> = {}
        data.forEach((exec) => {
          map[exec.agente] = exec
        })
        setExecucoes(map)
      }
      setLoading(false)
    }

    loadExecucoes()

    // Assina Realtime
    const channel = supabase
      .channel(`execucoes_${item_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execucoes_agentes',
          filter: `item_id=eq.${item_id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const exec = payload.new as Execucao
            setExecucoes((prev) => ({
              ...prev,
              [exec.agente]: exec,
            }))
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [item_id])

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

  return (
    <div style={styles.container}>
      <div style={styles.organograma}>
        {/* Orquestrador */}
        <div style={styles.nivel}>
          <div style={getCardStyle(execucoes['orquestrador']?.status)}>
            <div style={styles.cardTitle}>Orquestrador</div>
            {execucoes['orquestrador'] && (
              <div style={styles.cardInfo}>
                <div>{execucoes['orquestrador'].status}</div>
                {execucoes['orquestrador'].status === 'ok' && (
                  <div style={styles.cardStats}>
                    {getTempo(
                      execucoes['orquestrador'].inicio,
                      execucoes['orquestrador'].fim
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Agentes */}
        <div style={styles.nivel}>
          {agentes.map((agente) => {
            const exec = execucoes[agente]
            const count = agentes.length

            return (
              <div
                key={agente}
                style={{
                  flex: `1 / ${count}`,
                  minWidth: `${100 / count}%`,
                }}
              >
                <div style={getCardStyle(exec?.status)}>
                  <div style={styles.cardTitle}>
                    {agente.charAt(0).toUpperCase() + agente.slice(1)}
                  </div>
                  {exec ? (
                    <div style={styles.cardInfo}>
                      <div>{exec.status}</div>
                      {exec.status === 'ok' && (
                        <div style={styles.cardStats}>
                          <div>
                            {getTempo(exec.inicio, exec.fim)}
                          </div>
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
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function getTempo(
  inicio?: string,
  fim?: string
): string {
  if (!inicio || !fim) return '-'
  const ms =
    new Date(fim).getTime() - new Date(inicio).getTime()
  const segundos = Math.round(ms / 1000)
  return `${segundos}s`
}

function getCardStyle(status?: string) {
  const baseStyle = {
    ...styles.card,
  } as React.CSSProperties

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
    gap: '30px',
  } as React.CSSProperties,
  nivel: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
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
