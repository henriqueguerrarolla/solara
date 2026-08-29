'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface Aprovacao {
  id: string
  area: string
  item_tipo: string
  item_id: string
  titulo: string
  proposta: any
  status: string
  observacao?: string
}

interface FilaAprovacaoProps {
  area: string
  usuarioId: string
}

export default function FilaAprovacao({
  area,
  usuarioId,
}: FilaAprovacaoProps) {
  const [items, setItems] = useState<Aprovacao[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [proposta, setProposta] = useState('')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()

    const loadItems = async () => {
      const { data } = await supabase
        .from('aprovacoes')
        .select('*')
        .eq('area', area)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })

      if (data) {
        setItems(data)
      }
      setLoading(false)
    }

    loadItems()

    // Realtime
    const channel = supabase
      .channel(`aprovacoes_${area}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'aprovacoes',
          filter: `area=eq.${area}`,
        },
        () => {
          loadItems()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [area])

  const handleSelectItem = (item: Aprovacao) => {
    setSelectedId(item.id)
    setProposta(
      typeof item.proposta === 'string'
        ? item.proposta
        : JSON.stringify(item.proposta, null, 2)
    )
    setObservacao('')
  }

  const handleAprovar = async () => {
    if (!selectedId) return

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase
      .from('aprovacoes')
      .update({
        status: 'aprovada',
        decidido_por: usuarioId,
        decidido_em: new Date().toISOString(),
      })
      .eq('id', selectedId)

    if (!error) {
      setItems(items.filter((i) => i.id !== selectedId))
      setSelectedId(null)
      setProposta('')
    }
  }

  const handleEditar = async () => {
    if (!selectedId) return

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase
      .from('aprovacoes')
      .update({
        status: 'editada',
        proposta: JSON.parse(proposta),
        decidido_por: usuarioId,
        decidido_em: new Date().toISOString(),
      })
      .eq('id', selectedId)

    if (!error) {
      setItems(items.filter((i) => i.id !== selectedId))
      setSelectedId(null)
      setProposta('')
    }
  }

  const handleRejeitar = async () => {
    if (!selectedId || !observacao.trim()) {
      alert('Adicione uma observação para rejeitar')
      return
    }

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase
      .from('aprovacoes')
      .update({
        status: 'rejeitada',
        observacao,
        decidido_por: usuarioId,
        decidido_em: new Date().toISOString(),
      })
      .eq('id', selectedId)

    if (!error) {
      setItems(items.filter((i) => i.id !== selectedId))
      setSelectedId(null)
      setProposta('')
      setObservacao('')
    }
  }

  if (loading) {
    return <div style={styles.container}>Carregando...</div>
  }

  if (items.length === 0) {
    return (
      <div style={styles.container}>
        <p style={styles.empty}>Nenhuma aprovação pendente</p>
      </div>
    )
  }

  const selected = items.find((i) => i.id === selectedId)

  return (
    <div style={styles.container}>
      <div style={styles.layout}>
        <div style={styles.lista}>
          <h3 style={styles.heading}>
            Pendente de aprovação ({items.length})
          </h3>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectItem(item)}
              style={{
                ...styles.itemButton,
                backgroundColor:
                  selectedId === item.id ? '#dbeafe' : '#f3f4f6',
                borderLeft:
                  selectedId === item.id ? '4px solid #3b82f6' : 'none',
              }}
            >
              <div style={styles.itemTitle}>{item.titulo}</div>
              <div style={styles.itemMeta}>
                {item.item_tipo} · {item.item_id}
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div style={styles.detalhe}>
            <h3 style={styles.heading}>{selected.titulo}</h3>

            <div style={styles.section}>
              <label style={styles.label}>Proposta</label>
              <textarea
                value={proposta}
                onChange={(e) => setProposta(e.target.value)}
                style={styles.textarea}
                rows={10}
              />
            </div>

            <div style={styles.section}>
              <label style={styles.label}>
                Observação (só se rejeitar)
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                style={styles.textarea}
                rows={3}
                placeholder="Por que está rejeitando?"
              />
            </div>

            <div style={styles.buttons}>
              <button
                onClick={handleAprovar}
                style={{ ...styles.button, backgroundColor: '#10b981' }}
              >
                ✓ Aprovar
              </button>
              <button
                onClick={handleEditar}
                style={{ ...styles.button, backgroundColor: '#3b82f6' }}
              >
                ✎ Editar e Aprovar
              </button>
              <button
                onClick={handleRejeitar}
                style={{ ...styles.button, backgroundColor: '#ef4444' }}
              >
                ✕ Rejeitar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  } as React.CSSProperties,
  layout: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: '20px',
  } as React.CSSProperties,
  lista: {
    borderRight: '1px solid #e5e7eb',
    paddingRight: '20px',
    maxHeight: '600px',
    overflowY: 'auto',
  } as React.CSSProperties,
  heading: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#1f2937',
  } as React.CSSProperties,
  itemButton: {
    width: '100%',
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    marginBottom: '8px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  itemTitle: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  itemMeta: {
    fontSize: '11px',
    color: '#6b7280',
  } as React.CSSProperties,
  detalhe: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  } as React.CSSProperties,
  textarea: {
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '12px',
    resize: 'vertical',
  } as React.CSSProperties,
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
  } as React.CSSProperties,
  button: {
    flex: 1,
    padding: '10px 16px',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
  empty: {
    color: '#6b7280',
    textAlign: 'center',
    padding: '20px',
  } as React.CSSProperties,
}
