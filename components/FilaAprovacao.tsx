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
  const [respostaEditada, setRespostaEditada] = useState('')
  const [valorABaixarEditado, setValorABaixarEditado] = useState('')
  const [valorPendenteEditado, setValorPendenteEditado] = useState('')
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
    if (item.item_tipo === 'divergencia') {
      const hipotese = item.proposta?.hipotese
      setValorABaixarEditado(String(hipotese?.valor_a_baixar ?? ''))
      setValorPendenteEditado(String(hipotese?.valor_pendente ?? ''))
    } else {
      const resposta = item.proposta?.resposta || JSON.stringify(item.proposta, null, 2)
      setRespostaEditada(resposta)
    }
    setObservacao('')
  }

  const acaoParaStatusTitulo = (valorPendente: number, hipotese: string): string => {
    if (hipotese === 'vencido_sem_pagamento') return 'vencido'
    return valorPendente > 0.01 ? 'pago_parcial' : 'pago'
  }

  const handleAprovar = async () => {
    if (!selectedId) return

    try {
      const supabase = createBrowserSupabaseClient()
      const selected = items.find((i) => i.id === selectedId)

      const { error: errorAprovacao } = await supabase
        .from('aprovacoes')
        .update({ status: 'aprovado' })
        .match({ id: selectedId })

      if (errorAprovacao) {
        alert('Erro ao aprovar: ' + errorAprovacao.message)
        return
      }

      if (selected?.item_tipo === 'divergencia') {
        await resolverDivergencia(supabase, selected, {
          valor_a_baixar: selected.proposta?.hipotese?.valor_a_baixar,
          valor_pendente: selected.proposta?.hipotese?.valor_pendente,
          cod_titulos_envolvidos: selected.proposta?.hipotese?.cod_titulos_envolvidos,
          hipotese: selected.proposta?.hipotese?.hipotese,
        })
      } else if (selected?.item_id) {
        await supabase
          .from('pedidos_orcamento')
          .update({ status: 'respondido' })
          .eq('cod_pedido', selected.item_id)
      }

      setItems(items.filter((i) => i.id !== selectedId))
      setSelectedId(null)
      setRespostaEditada('')
    } catch (err) {
      alert('Erro ao aprovar: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const resolverDivergencia = async (
    supabase: any,
    selected: Aprovacao,
    dados: {
      valor_a_baixar?: number
      valor_pendente?: number
      cod_titulos_envolvidos?: string[]
      hipotese?: string
    }
  ) => {
    // Divergência vai para "resolvida"
    await supabase
      .from('divergencias')
      .update({ status: 'resolvida' })
      .eq('id', selected.item_id)

    // Título(s) recebem status conforme a ação
    const statusTitulo = acaoParaStatusTitulo(
      dados.valor_pendente || 0,
      dados.hipotese || ''
    )

    if (dados.cod_titulos_envolvidos && dados.cod_titulos_envolvidos.length > 0) {
      for (const codTitulo of dados.cod_titulos_envolvidos) {
        await supabase
          .from('titulos_receber')
          .update({ status: statusTitulo })
          .eq('cod_titulo', codTitulo)
      }
    }
  }

  const handleEditar = async () => {
    if (!selectedId) return

    try {
      const supabase = createBrowserSupabaseClient()
      const selected = items.find((i) => i.id === selectedId)

      if (selected?.item_tipo === 'divergencia') {
        const valorABaixar = parseFloat(valorABaixarEditado) || 0
        const valorPendente = parseFloat(valorPendenteEditado) || 0

        const propostaAtualizada = {
          ...selected.proposta,
          hipotese: {
            ...selected.proposta?.hipotese,
            valor_a_baixar: valorABaixar,
            valor_pendente: valorPendente,
          },
        }

        const { error: errorAprovacao } = await supabase
          .from('aprovacoes')
          .update({
            status: 'aprovado',
            proposta: propostaAtualizada,
          })
          .match({ id: selectedId })

        if (errorAprovacao) {
          alert('Erro ao editar: ' + errorAprovacao.message)
          return
        }

        await resolverDivergencia(supabase, selected, {
          valor_a_baixar: valorABaixar,
          valor_pendente: valorPendente,
          cod_titulos_envolvidos: selected.proposta?.hipotese?.cod_titulos_envolvidos,
          hipotese: selected.proposta?.hipotese?.hipotese,
        })
      } else {
        const propostaAtualizada = {
          ...selected?.proposta,
          resposta: respostaEditada,
        }

        const { error: errorAprovacao } = await supabase
          .from('aprovacoes')
          .update({
            status: 'aprovado',
            proposta: propostaAtualizada,
          })
          .match({ id: selectedId })

        if (errorAprovacao) {
          alert('Erro ao editar: ' + errorAprovacao.message)
          return
        }

        if (selected?.item_id) {
          await supabase
            .from('pedidos_orcamento')
            .update({ status: 'respondido' })
            .eq('cod_pedido', selected.item_id)
        }
      }

      setItems(items.filter((i) => i.id !== selectedId))
      setSelectedId(null)
      setRespostaEditada('')
    } catch (err) {
      alert('Erro ao editar: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleRejeitar = async () => {
    if (!selectedId || !observacao.trim()) {
      alert('❌ Adicione uma observação para rejeitar')
      return
    }

    try {
      const supabase = createBrowserSupabaseClient()
      const selected = items.find((i) => i.id === selectedId)

      const { error: errorAprovacao } = await supabase
        .from('aprovacoes')
        .update({
          status: 'rejeitado',
          proposta: {
            ...selected?.proposta,
            observacao_rejeicao: observacao,
          },
        })
        .match({ id: selectedId })

      if (errorAprovacao) {
        alert('Erro ao rejeitar: ' + errorAprovacao.message)
        return
      }

      if (selected?.item_tipo === 'divergencia') {
        // Divergência volta para "nova" com a observação
        await supabase
          .from('divergencias')
          .update({ status: 'nova' })
          .eq('id', selected.item_id)
      } else if (selected?.item_id) {
        await supabase
          .from('pedidos_orcamento')
          .update({ status: 'rejeitado' })
          .eq('cod_pedido', selected.item_id)
      }

      setItems(items.filter((i) => i.id !== selectedId))
      setSelectedId(null)
      setRespostaEditada('')
      setObservacao('')
    } catch (err) {
      alert('Erro ao rejeitar: ' + (err instanceof Error ? err.message : String(err)))
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
  const isDivergencia = selected?.item_tipo === 'divergencia'
  const hipotese = selected?.proposta?.hipotese

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
                {item.item_tipo} · {item.item_id.slice(0, 8)}
              </div>
            </button>
          ))}
        </div>

        {selected && !isDivergencia && (
          <div style={styles.detalhe}>
            <h3 style={styles.heading}>{selected.titulo}</h3>

            {/* Resposta ao Cliente */}
            <div style={styles.section}>
              <label style={styles.label}>📧 Resposta para o Cliente</label>
              <div style={styles.respostaBox}>
                <textarea
                  value={respostaEditada}
                  onChange={(e) => setRespostaEditada(e.target.value)}
                  style={styles.textarea}
                  rows={8}
                />
              </div>
            </div>

            {/* Itens com destaque para não-existentes */}
            {selected.proposta?.contexto?.itens && (
              <div style={styles.section}>
                <label style={styles.label}>📦 Itens no Orçamento</label>
                <div style={styles.itensList}>
                  {selected.proposta.contexto.itens.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        ...styles.itemCard,
                        borderLeft: item.existe === false ? '4px solid #ef4444' : '4px solid #10b981',
                        backgroundColor: item.existe === false ? '#fef2f2' : '#f0fdf4',
                      }}
                    >
                      <div style={styles.itemCardHeader}>
                        <span style={styles.itemDesc}>
                          {item.descricao_cliente || item.descricao}
                        </span>
                        {item.existe === false && (
                          <span style={styles.badge}>❌ NÃO TEMOS</span>
                        )}
                        {item.atende_estoque === false && (
                          <span style={styles.badgeWarn}>⚠️ FALTA ESTOQUE</span>
                        )}
                      </div>
                      <div style={styles.itemDetails}>
                        <span>{item.quantidade} {item.unidade}</span>
                        {item.existe !== false && (
                          <>
                            <span>· R$ {item.preco_aplicado?.toFixed(2) || 'N/A'}</span>
                            <span>· Total: R$ {(item.quantidade * (item.preco_aplicado || 0)).toFixed(2)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <CamposRejeicao observacao={observacao} setObservacao={setObservacao} />
            <Botoes onAprovar={handleAprovar} onEditar={handleEditar} onRejeitar={handleRejeitar} />
          </div>
        )}

        {selected && isDivergencia && (
          <div style={styles.detalhe}>
            <h3 style={styles.heading}>{selected.titulo}</h3>

            {/* Hipótese do Investigador */}
            <div style={styles.section}>
              <label style={styles.label}>🔍 Hipótese: {hipotese?.hipotese}</label>
              <div style={styles.hipoteseBox}>
                <p style={styles.hipoteseTexto}>{hipotese?.explicacao}</p>
                <div style={styles.confiancaRow}>
                  <span
                    style={{
                      ...styles.confiancaBadge,
                      backgroundColor: (hipotese?.confianca || 0) >= 0.85 ? '#d1fae5' : '#fef3c7',
                      color: (hipotese?.confianca || 0) >= 0.85 ? '#065f46' : '#92400e',
                    }}
                  >
                    Confiança: {Math.round((hipotese?.confianca || 0) * 100)}%
                  </span>
                </div>
                <p style={styles.acaoSugerida}>💡 {hipotese?.acao_sugerida}</p>
              </div>
            </div>

            {/* Títulos envolvidos */}
            {hipotese?.cod_titulos_envolvidos?.length > 0 && (
              <div style={styles.section}>
                <label style={styles.label}>📄 Títulos Envolvidos</label>
                <div style={styles.titulosList}>
                  {hipotese.cod_titulos_envolvidos.map((cod: string) => (
                    <span key={cod} style={styles.tituloBadge}>{cod}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Valores editáveis */}
            <div style={styles.section}>
              <label style={styles.label}>💰 Valores</label>
              <div style={styles.valoresGrid}>
                <div>
                  <label style={styles.labelSmall}>Valor a Baixar (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={valorABaixarEditado}
                    onChange={(e) => setValorABaixarEditado(e.target.value)}
                    style={styles.inputValor}
                  />
                </div>
                <div>
                  <label style={styles.labelSmall}>Valor Pendente (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={valorPendenteEditado}
                    onChange={(e) => setValorPendenteEditado(e.target.value)}
                    style={styles.inputValor}
                  />
                </div>
              </div>
            </div>

            <CamposRejeicao observacao={observacao} setObservacao={setObservacao} />
            <Botoes onAprovar={handleAprovar} onEditar={handleEditar} onRejeitar={handleRejeitar} />
          </div>
        )}
      </div>
    </div>
  )
}

function CamposRejeicao({
  observacao,
  setObservacao,
}: {
  observacao: string
  setObservacao: (v: string) => void
}) {
  return (
    <div style={styles.section}>
      <label style={styles.label}>Observação (obrigatória se rejeitar)</label>
      <textarea
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        style={styles.textarea}
        rows={3}
        placeholder="Por que está rejeitando?"
      />
    </div>
  )
}

function Botoes({
  onAprovar,
  onEditar,
  onRejeitar,
}: {
  onAprovar: () => void
  onEditar: () => void
  onRejeitar: () => void
}) {
  return (
    <div style={styles.buttons}>
      <button onClick={onAprovar} style={{ ...styles.button, backgroundColor: '#10b981' }}>
        ✓ Aprovar
      </button>
      <button onClick={onEditar} style={{ ...styles.button, backgroundColor: '#3b82f6' }}>
        ✎ Editar e Aprovar
      </button>
      <button onClick={onRejeitar} style={{ ...styles.button, backgroundColor: '#ef4444' }}>
        ✕ Rejeitar
      </button>
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
    maxHeight: '800px',
    overflowY: 'auto',
  } as React.CSSProperties,
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  } as React.CSSProperties,
  labelSmall: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
    display: 'block',
    marginBottom: '4px',
  } as React.CSSProperties,
  respostaBox: {
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '2px solid #3b82f6',
    padding: '12px',
  } as React.CSSProperties,
  hipoteseBox: {
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '2px solid #8b5cf6',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as React.CSSProperties,
  hipoteseTexto: {
    fontSize: '13px',
    color: '#1f2937',
    margin: 0,
    lineHeight: '1.5',
  } as React.CSSProperties,
  confiancaRow: {
    display: 'flex',
  } as React.CSSProperties,
  confiancaBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 8px',
    borderRadius: '4px',
  } as React.CSSProperties,
  acaoSugerida: {
    fontSize: '13px',
    color: '#4338ca',
    margin: 0,
    fontWeight: '500',
  } as React.CSSProperties,
  titulosList: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  tituloBadge: {
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    padding: '4px 10px',
    borderRadius: '4px',
  } as React.CSSProperties,
  valoresGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  } as React.CSSProperties,
  inputValor: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
  } as React.CSSProperties,
  textarea: {
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontFamily: 'inherit',
    fontSize: '13px',
    resize: 'vertical',
    width: '100%',
  } as React.CSSProperties,
  itensList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  itemCard: {
    padding: '12px',
    borderRadius: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
  itemCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
  } as React.CSSProperties,
  itemDesc: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#1f2937',
    flex: 1,
  } as React.CSSProperties,
  badge: {
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: '#fecaca',
    color: '#991b1b',
    padding: '2px 6px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  badgeWarn: {
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: '#fcd34d',
    color: '#92400e',
    padding: '2px 6px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  itemDetails: {
    fontSize: '12px',
    color: '#6b7280',
    display: 'flex',
    gap: '12px',
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
