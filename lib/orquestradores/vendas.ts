import { createAdminClient } from '@/lib/supabase-admin'
import { agente } from '@/lib/agente'

export async function orquestradorVendas(cod_pedido: string) {
  const supabase = createAdminClient()

  // 1. Busca pedido
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos_orcamento')
    .select('*')
    .eq('cod_pedido', cod_pedido)
    .single()

  if (pedidoError || !pedido) {
    throw new Error(`Pedido não encontrado: ${cod_pedido}`)
  }

  // 2. Busca dados do cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('cod_cliente, nome, segmento, prazo_pagamento_dias, desconto_maximo_pct, cliente_desde')
    .eq('cod_cliente', pedido.cod_cliente)
    .single()

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
    // 3. Chama Triador
    const entradaTriador = {
      mensagem: pedido.mensagem,
      canal: pedido.canal,
      cliente: {
        cod_cliente: pedido.cod_cliente,
        nome: cliente?.nome,
        segmento: cliente?.segmento,
      },
    }

    const { saida: saidaTriador } = await agente(
      'triador',
      entradaTriador,
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        chamado_por: orquestrador_id,
      }
    )

    // Se não for orçamento nem complemento, cria aprovação e encerra
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

    // 4. Pesquisador - consultas paralelas ao banco
    const [produtosData, pedidosAnterioresData] = await Promise.all([
      // Busca produtos similares para cada item
      supabase
        .from('produtos')
        .select('cod_produto, descricao, unidade, preco_unitario, preco_acima_100_un, estoque, prazo_reposicao_dias'),
      // Busca pedidos anteriores do cliente nos últimos 30 dias
      supabase
        .from('pedidos_orcamento')
        .select('cod_pedido, data, mensagem, status')
        .eq('cod_cliente', pedido.cod_cliente)
        .gte('data', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('data', { ascending: false }),
    ])

    // Monta candidatos por item (busca simples por descrição)
    const candidatos_catalogo: any[] = []
    if (saidaTriador.itens) {
      for (const item of saidaTriador.itens) {
        const palavras = item.descricao_cliente.toLowerCase().split(/\s+/)
        const matches = produtosData.data?.filter((p: any) => {
          const desc = p.descricao.toLowerCase()
          return palavras.some((palavra: string) => desc.includes(palavra))
        }) || []
        candidatos_catalogo.push({
          item: item.descricao_cliente,
          candidatos: matches.slice(0, 5), // Top 5
        })
      }
    }

    const entradaPesquisador = {
      itens_pedidos: saidaTriador.itens || [],
      candidatos_catalogo,
      cliente: {
        cod_cliente: cliente?.cod_cliente,
        nome: cliente?.nome,
        segmento: cliente?.segmento,
        prazo_pagamento_dias: cliente?.prazo_pagamento_dias || 30,
        desconto_maximo_pct: cliente?.desconto_maximo_pct || 0,
        cliente_desde: cliente?.cliente_desde,
      },
      pedidos_anteriores: pedidosAnterioresData.data || [],
    }

    const { saida: saidaPesquisador } = await agente(
      'pesquisador',
      entradaPesquisador,
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: cod_pedido,
        chamado_por: orquestrador_id,
      }
    )

    const contexto = saidaPesquisador

    // 5. Loop Redator/Revisor (máximo 2 voltas)
    let saidaRedator: any
    let saidaRevisor: any
    let volta = 0
    const maxVoltas = 2

    do {
      volta++

      // 5a. Chama Redator
      const entradaRedator = {
        triagem: saidaTriador,
        contexto,
        cliente: { nome: cliente?.nome, segmento: cliente?.segmento },
        ...(volta > 1 ? { ajustes: saidaRevisor.motivos } : {}),
      }

      saidaRedator = await agente(
        'redator',
        entradaRedator,
        {
          area: 'vendas',
          item_tipo: 'pedido',
          item_id: cod_pedido,
          chamado_por: orquestrador_id,
        }
      ).then((r) => r.saida)

      // 5b. Chama Revisor
      const entradaRevisor = {
        resposta: saidaRedator.resposta,
        contexto,
        regras: {
          prazoMinimo: 5,
          descontoMaximo: contexto.desconto_maximo_pct,
        },
      }

      saidaRevisor = await agente(
        'revisor',
        entradaRevisor,
        {
          area: 'vendas',
          item_tipo: 'pedido',
          item_id: cod_pedido,
          chamado_por: orquestrador_id,
        }
      ).then((r) => r.saida)

      // Se aprovado ou atingiu máximo de voltas, sai do loop
      if (saidaRevisor.aprovado || volta >= maxVoltas) {
        break
      }
    } while (volta < maxVoltas)

    // 6. Cria item em aprovações
    await supabase.from('aprovacoes').insert({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: cod_pedido,
      titulo: `${cliente?.nome} · ${saidaRedator.resumo || 'Orçamento'}`,
      proposta: {
        resposta: saidaRedator.resposta,
        resumo: saidaRedator.resumo,
        triagem: saidaTriador,
        contexto,
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
