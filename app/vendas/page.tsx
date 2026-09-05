'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import Organograma from '@/components/Organograma'
import FilaAprovacao from '@/components/FilaAprovacao'
import LinhaDoTempo from '@/components/LinhaDoTempo'

interface Pedido {
  cod_pedido: string
  cod_cliente: string
  canal: string
  mensagem: string
  status: string
  data?: string
  clientes?: { nome: string }
}

interface Cliente {
  cod_cliente: string
  nome: string
}

const STATUSES = ['novo', 'processando', 'aguardando_aprovacao', 'respondido', 'rejeitado']

export default function VendasPage() {
  const [user, setUser] = useState<any>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPedido, setSelectedPedido] = useState<string | null>(null)
  const [tab, setTab] = useState<'kanban' | 'aprovacoes'>('kanban')
  const [showNewPedido, setShowNewPedido] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [newPedido, setNewPedido] = useState({
    cod_cliente: '',
    canal: '',
    mensagem: '',
  })
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

        if (!perfil?.areas.includes('vendas')) {
          router.push('/')
          return
        }

        setUser(session.user)

        // Carrega clientes
        const { data: clientesData } = await supabase
          .from('clientes')
          .select('cod_cliente, nome')
          .order('nome')

        if (clientesData) {
          setClientes(clientesData)
        }

        // Carrega pedidos
        const { data: pedidosData } = await supabase
          .from('pedidos_orcamento')
          .select('*')
          .order('data', { ascending: false })

        if (pedidosData) {
          console.log('📦 Pedidos carregados:', pedidosData.length, pedidosData)
          setPedidos(pedidosData)
        } else {
          console.log('⚠️  Nenhum pedido encontrado')
        }

        setLoading(false)
      } catch (err) {
        console.error(err)
        router.push('/login')
      }
    }

    checkAuth()

    // Realtime subscription
    const supabase = createBrowserSupabaseClient()
    const channel = supabase
      .channel('pedidos_vendas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos_orcamento' },
        (payload) => {
          const novo = payload.new as Pedido
          const antigo = payload.old as Record<string, any>
          console.log('📡 Realtime update:', payload.eventType, novo?.cod_pedido)
          if (payload.eventType === 'INSERT') {
            setPedidos((prev) => [novo, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setPedidos((prev) =>
              prev.map((p) => (p.cod_pedido === novo.cod_pedido ? novo : p))
            )
          } else if (payload.eventType === 'DELETE') {
            setPedidos((prev) => prev.filter((p) => p.cod_pedido !== antigo.cod_pedido))
          }
        }
      )
      .subscribe()

    // Polling a cada 5 segundos como fallback
    const pollInterval = setInterval(async () => {
      const { data: pedidosData } = await supabase
        .from('pedidos_orcamento')
        .select('*')
        .order('data', { ascending: false })

      if (pedidosData) {
        setPedidos(pedidosData)
      }
    }, 5000)

    return () => {
      channel.unsubscribe()
      clearInterval(pollInterval)
    }
  }, [router])

  const handleCreatePedido = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newPedido.cod_cliente || !newPedido.canal || !newPedido.mensagem) {
      alert('Preencha todos os campos')
      return
    }

    try {
      const supabase = createBrowserSupabaseClient()

      // Gera próximo cod_pedido
      const { data: proximos } = await supabase
        .from('pedidos_orcamento')
        .select('cod_pedido')
        .like('cod_pedido', 'PED%')
        .order('cod_pedido', { ascending: false })
        .limit(1)

      const numero = proximos && proximos[0]
        ? parseInt(proximos[0].cod_pedido.slice(3)) + 1
        : 31

      const cod_pedido = `PED${String(numero).padStart(3, '0')}`

      const { error } = await supabase
        .from('pedidos_orcamento')
        .insert({
          cod_pedido,
          cod_cliente: newPedido.cod_cliente,
          canal: newPedido.canal,
          mensagem: newPedido.mensagem,
        })

      if (!error) {
        setNewPedido({ cod_cliente: '', canal: '', mensagem: '' })
        setShowNewPedido(false)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao criar pedido')
    }
  }

  const handleProcessar = async (cod_pedido: string) => {
    try {
      const response = await fetch('/api/vendas/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod_pedido }),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(`Erro: ${error.error}`)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao processar pedido')
    }
  }

  if (loading) {
    return <div style={styles.container}>Carregando...</div>
  }

  const selectedPedidoData = pedidos.find((p) => p.cod_pedido === selectedPedido)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Vendas</h1>
        <button onClick={() => router.push('/')} style={styles.backBtn}>
          ← Voltar
        </button>
      </div>

      <div style={styles.container}>
        {/* Organograma */}
        <div style={styles.organoramaSection}>
          <Organograma area="vendas" item_id={selectedPedidoData?.cod_pedido || ''} />
        </div>

        {/* Abas */}
        <div style={styles.tabsContainer}>
          <button
            onClick={() => setTab('kanban')}
            style={{
              ...styles.tab,
              backgroundColor: tab === 'kanban' ? '#1f2937' : '#e5e7eb',
              color: tab === 'kanban' ? 'white' : '#374151',
            }}
          >
            📋 Pedidos
          </button>
          <button
            onClick={() => setTab('aprovacoes')}
            style={{
              ...styles.tab,
              backgroundColor: tab === 'aprovacoes' ? '#1f2937' : '#e5e7eb',
              color: tab === 'aprovacoes' ? 'white' : '#374151',
            }}
          >
            ✓ Aprovações
          </button>
        </div>

        {/* Kanban */}
        {tab === 'kanban' && (
          <div>
            <button
              onClick={() => setShowNewPedido(true)}
              style={styles.newPedidoBtn}
            >
              + Novo Pedido
            </button>

            <div style={{...styles.kanban, position: 'relative'}}>
              {pedidos.length === 0 && <div style={{padding: '20px', color: '#999'}}>Carregando pedidos...</div>}
              {STATUSES.map((status) => {
                const pedidosStatus = pedidos.filter((p) => p.status === status)
                console.log(`Status ${status}: ${pedidosStatus.length} pedidos`)
                return (
                  <div key={status} style={styles.column}>
                    <div style={styles.columnTitle}>
                      {status.toUpperCase()} ({pedidosStatus.length})
                    </div>
                    <div style={styles.cards}>
                      {pedidosStatus.map((pedido) => (
                        <div
                          key={pedido.cod_pedido}
                          onClick={() => {
                            setSelectedPedido(pedido.cod_pedido)
                            setShowTimeline(true)
                          }}
                          style={{
                            ...styles.card,
                            backgroundColor:
                              selectedPedido === pedido.cod_pedido ? '#dbeafe' : 'white',
                          }}
                        >
                          <div style={styles.cardCod}>{pedido.cod_pedido}</div>
                          <div style={styles.cardCliente}>
                            {clientes.find(c => c.cod_cliente === pedido.cod_cliente)?.nome || pedido.cod_cliente}
                          </div>
                          <div style={styles.cardDesc}>
                            {pedido.canal} · {pedido.mensagem.substring(0, 50)}...
                          </div>

                          {status === 'novo' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleProcessar(pedido.cod_pedido)
                              }}
                              style={styles.processarBtn}
                            >
                              Processar
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Fila de Aprovações */}
        {tab === 'aprovacoes' && user && (
          <FilaAprovacao area="vendas" usuarioId={user.id} />
        )}
      </div>

      {/* Modal Novo Pedido */}
      {showNewPedido && (
        <div style={styles.modal} onClick={() => setShowNewPedido(false)}>
          <div
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={styles.modalTitle}>Novo Pedido</h2>
            <form onSubmit={handleCreatePedido} style={styles.form}>
              <select
                value={newPedido.cod_cliente}
                onChange={(e) =>
                  setNewPedido({ ...newPedido, cod_cliente: e.target.value })
                }
                style={styles.input}
                required
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((c) => (
                  <option key={c.cod_cliente} value={c.cod_cliente}>
                    {c.nome}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Canal (e-mail, WhatsApp, telefone...)"
                value={newPedido.canal}
                onChange={(e) =>
                  setNewPedido({ ...newPedido, canal: e.target.value })
                }
                style={styles.input}
                required
              />

              <textarea
                placeholder="Mensagem do pedido"
                value={newPedido.mensagem}
                onChange={(e) =>
                  setNewPedido({ ...newPedido, mensagem: e.target.value })
                }
                style={{ ...styles.input, minHeight: '120px' }}
                required
              />

              <div style={styles.formButtons}>
                <button type="submit" style={styles.submitBtn}>
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewPedido(false)}
                  style={styles.cancelBtn}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Painel Timeline */}
      {showTimeline && selectedPedidoData && (
        <div style={styles.sidePanel}>
          <button
            onClick={() => setShowTimeline(false)}
            style={styles.closePanelBtn}
          >
            ✕
          </button>
          <h3 style={styles.panelTitle}>{selectedPedidoData.cod_pedido}</h3>
          <LinhaDoTempo item_id={selectedPedidoData.cod_pedido} />
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
  newPedidoBtn: {
    padding: '10px 16px',
    backgroundColor: '#1f2937',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '20px',
    fontSize: '14px',
  } as React.CSSProperties,
  kanban: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
  } as React.CSSProperties,
  column: {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    padding: '16px',
  } as React.CSSProperties,
  columnTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#374151',
    textTransform: 'uppercase',
  } as React.CSSProperties,
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  cardCod: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '4px',
  } as React.CSSProperties,
  cardCliente: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: '6px',
  } as React.CSSProperties,
  cardDesc: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '8px',
  } as React.CSSProperties,
  processarBtn: {
    width: '100%',
    padding: '6px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
  } as React.CSSProperties,
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    maxWidth: '500px',
    width: '90%',
  } as React.CSSProperties,
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '20px',
    color: '#1f2937',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,
  input: {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  formButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
  } as React.CSSProperties,
  submitBtn: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  } as React.CSSProperties,
  cancelBtn: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#e5e7eb',
    color: '#374151',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
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
