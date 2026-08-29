import { createClient } from '@/lib/supabase'
import { agente } from '@/lib/agente'

export async function orquestradorVendas(cod_pedido: string) {
  const supabase = await createClient()

  // 1. Busca pedido
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos_orcamento')
    .select('*, clientes(cod_cliente, nome, segmento)')
    .eq('cod_pedido', cod_pedido)
    .single()

  if (pedidoError || !pedido) {
    throw new Error(`Pedido não encontrado: ${cod_pedido}`)
  }

  // Atualiza status para processando
  await supabase
    .from('pedidos_orcamento')
    .update({ status: 'processando' })
    .eq('cod_pedido', cod_pedido)

  // Cria execução raiz (orquestrador)
  const { data: execOrquestrador, error: execError } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: cod_pedido,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { cod_pedido },
      inicio: new Date().toISOString(),
    })
    .select()
    .single()

  if (execError || !execOrquestrador) {
    throw new Error(`Erro ao criar execução: ${execError?.message}`)
  }

  const orquestrador_id = execOrquestrador.id

  try {
    // 2. Chama Triador
    const entradaTriador = {
      mensagem: pedido.mensagem,
      canal: pedido.canal,
      cliente: {
        cod_cliente: pedido.cod_cliente,
        nome: pedido.clientes?.nome,
        segmento: pedido.clientes?.segmento,
      },
    }

    const { saida: saidaTriador, execucao_id: triador_id } = await agente(
      'triador',
      entradaTriador,
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        chamado_por: orquestrador_id,
      }
    )

    // Se não for orçamento ou complemento, cria aprovação e finaliza
    if (!['orcamento', 'complemento'].includes(saidaTriador?.tipo)) {
      await supabase.from('aprovacoes').insert({
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        titulo: `Não é orçamento: ${saidaTriador?.tipo}`,
        proposta: saidaTriador,
        status: 'pendente',
      })

      await supabase
        .from('pedidos_orcamento')
        .update({ status: 'aguardando_aprovacao' })
        .eq('cod_pedido', cod_pedido)

      await supabase
        .from('execucoes_agentes')
        .update({ status: 'ok', fim: new Date().toISOString() })
        .eq('id', orquestrador_id)

      return
    }

    // 3. Pesquisador (faria buscas no banco, por enquanto stubado)
    const contextoPesquisador = {
      itens: saidaTriador.itens || [],
      condicao_pagamento_dias: 30,
      desconto_maximo_pct: 5,
      observacoes: '',
    }

    // 4. Redator
    const entradaRedator = {
      triagem: saidaTriador,
      contexto: contextoPesquisador,
      cliente: pedido.clientes,
    }

    const { saida: saidaRedator } = await agente('redator', entradaRedator, {
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: cod_pedido,
      chamado_por: orquestrador_id,
    })

    // 5. Revisor
    const entradaRevisor = {
      resposta: saidaRedator?.resposta,
      contexto: contextoPesquisador,
      regras: {
        prazoMinimo: 5,
        descontoMaximo: 10,
      },
    }

    const { saida: saidaRevisor } = await agente('revisor', entradaRevisor, {
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: cod_pedido,
      chamado_por: orquestrador_id,
    })

    // 6. Cria item em aprovacoes
    await supabase.from('aprovacoes').insert({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: cod_pedido,
      titulo: `${pedido.clientes?.nome} · ${saidaRedator?.resumo || 'Orçamento'}`,
      proposta: {
        resposta: saidaRedator?.resposta,
        triagem: saidaTriador,
        contexto: contextoPesquisador,
        revisao: saidaRevisor,
      },
      status: 'pendente',
    })

    // Pedido vai para aguardando_aprovacao
    await supabase
      .from('pedidos_orcamento')
      .update({ status: 'aguardando_aprovacao' })
      .eq('cod_pedido', cod_pedido)

    // Fecha execução raiz
    await supabase
      .from('execucoes_agentes')
      .update({ status: 'ok', fim: new Date().toISOString() })
      .eq('id', orquestrador_id)
  } catch (err) {
    // Em caso de erro, marca execução como erro
    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'erro',
        erro: err instanceof Error ? err.message : String(err),
        fim: new Date().toISOString(),
      })
      .eq('id', orquestrador_id)

    // Recoloca pedido em novo
    await supabase
      .from('pedidos_orcamento')
      .update({ status: 'novo' })
      .eq('cod_pedido', cod_pedido)

    throw err
  }
}
