'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface Execucao {
  id: string
  agente: string
  status: string
  entrada?: any
  saida?: any
  erro?: string
  tokens_entrada?: number
  tokens_saida?: number
  inicio?: string
  fim?: string
}

interface LinhaDoTempoProps {
  item_id: string
}

export default function LinhaDoTempo({ item_id }: LinhaDoTempoProps) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()

    const loadExecucoes = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select('*')
        .eq('item_id', item_id)
        .order('inicio', { ascending: true })

      if (data) {
        setExecucoes(data)
      }
      setLoading(false)
    }

    loadExecucoes()

    // Realtime
    const channel = supabase
      .channel(`linha_${item_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execucoes_agentes',
          filter: `item_id=eq.${item_id}`,
        },
        () => {
          loadExecucoes()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [item_id])

  if (loading) {
    return <div style={styles.container}>Carregando...</div>
  }

  if (execucoes.length === 0) {
    return <div style={styles.container}>Nenhuma execução</div>
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>Histórico de Execuções</h3>
      <div style={styles.timeline}>
        {execucoes.map((exec) => (
          <div key={exec.id} style={styles.item}>
            <button
              onClick={() =>
                setExpandedId(expandedId === exec.id ? null : exec.id)
              }
              style={{
                ...styles.itemHeader,
                borderLeft: `4px solid ${getStatusColor(exec.status)}`,
              }}
            >
              <div style={styles.itemTitle}>
                {exec.agente.charAt(0).toUpperCase() + exec.agente.slice(1)}
                {' · '}
                <span style={{ color: getStatusColor(exec.status) }}>
                  {exec.status}
                </span>
              </div>
              <div style={styles.itemStats}>
                {exec.tokens_entrada && (
                  <span>{exec.tokens_entrada + (exec.tokens_saida || 0)} tokens</span>
                )}
                {exec.inicio && exec.fim && (
                  <span>
                    {Math.round(
                      (new Date(exec.fim).getTime() -
                        new Date(exec.inicio).getTime()) /
                        1000
                    )}
                    s
                  </span>
                )}
              </div>
            </button>

            {expandedId === exec.id && (
              <div style={styles.details}>
                {exec.entrada && (
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Entrada</div>
                    <pre style={styles.json}>
                      {JSON.stringify(exec.entrada, null, 2)}
                    </pre>
                  </div>
                )}

                {exec.saida && (
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Saída</div>
                    <pre style={styles.json}>
                      {JSON.stringify(exec.saida, null, 2)}
                    </pre>
                  </div>
                )}

                {exec.erro && (
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Erro</div>
                    <pre style={{ ...styles.json, color: '#dc2626' }}>
                      {exec.erro}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'rodando':
      return '#f59e0b'
    case 'ok':
      return '#10b981'
    case 'erro':
      return '#ef4444'
    default:
      return '#6b7280'
  }
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  } as React.CSSProperties,
  heading: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#1f2937',
  } as React.CSSProperties,
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  item: {
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  itemHeader: {
    width: '100%',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  itemTitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1f2937',
  } as React.CSSProperties,
  itemStats: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: '#6b7280',
  } as React.CSSProperties,
  details: {
    padding: '16px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
  } as React.CSSProperties,
  section: {
    marginBottom: '16px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
    textTransform: 'uppercase',
  } as React.CSSProperties,
  json: {
    fontSize: '11px',
    backgroundColor: '#f3f4f6',
    padding: '12px',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '300px',
    fontFamily: 'monospace',
    color: '#374151',
    margin: 0,
  } as React.CSSProperties,
}
