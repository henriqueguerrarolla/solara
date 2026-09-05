import { createAdminClient } from '@/lib/supabase-admin'
import { agente } from '@/lib/agente'

export async function orquestradorFinanceiro(extrato_id: string) {
  const supabase = createAdminClient()

  // 1. Busca divergências
  const { data: divergencias, error: divError } = await supabase
    .from('divergencias')
    .select('*')
    .eq('extrato_id', extrato_id)

  if (divError) {
    throw new Error(`Erro ao buscar divergências: ${divError.message}`)
  }

  if (!divergencias || divergencias.length === 0) {
    throw new Error('Nenhuma divergência encontrada')
  }

  // Atualiza divergências para investigando
  await supabase
    .from('divergencias')
    .update({ status: 'investigando' })
    .eq('extrato_id', extrato_id)

  // Cria execução raiz
  const { data: execOrquestrador, error: execError } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'financeiro',
      item_tipo: 'divergencia',
      item_id: extrato_id,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { extrato_id, total_divergencias: divergencias.length },
      inicio: new Date().toISOString(),
    })
    .select()
    .single()

  if (execError || !execOrquestrador) {
    throw new Error(`Erro ao criar execução: ${execError?.message}`)
  }

  const orquestrador_id = execOrquestrador.id

  try {
    // Busca todos os títulos em aberto e clientes (usados por todos os investigadores)
    const [{ data: titulosAbertos }, { data: clientes }] = await Promise.all([
      supabase.from('titulos_receber').select('*').eq('status', 'aberto'),
      supabase.from('clientes').select('cod_cliente, nome'),
    ])

    const clienteMap = new Map((clientes || []).map((c) => [c.cod_cliente, c.nome]))

    // Busca lançamentos referenciados pelas divergências
    const lancamentoIds = divergencias
      .map((d) => d.lancamento_id)
      .filter((id) => id != null)

    const { data: lancamentos } =
      lancamentoIds.length > 0
        ? await supabase.from('lancamentos').select('*').in('id', lancamentoIds)
        : { data: [] }

    const lancamentoMap = new Map((lancamentos || []).map((l) => [l.id, l]))

    // 2. Chama Investigador para cada divergência (em paralelo)
    const investigacoes = await Promise.all(
      divergencias.map((div) => {
        const lancamento = div.lancamento_id ? lancamentoMap.get(div.lancamento_id) : null

        // Candidatos: títulos do mesmo cliente identificável pela descrição,
        // ou de valor próximo (±10%), com vencimento a até 30 dias
        const valorReferencia = div.valor_lancamento || div.valor_titulo || 0
        const descricao = lancamento?.descricao?.toLowerCase() || ''

        const titulosCandidatos = (titulosAbertos || [])
          .filter((t) => {
            const nomeCliente = clienteMap.get(t.cod_cliente)?.toLowerCase() || ''
            const clienteNaDescricao = nomeCliente && descricao.includes(nomeCliente)
            const valorProximo =
              valorReferencia > 0 &&
              Math.abs(t.valor - valorReferencia) / valorReferencia <= 0.1

            if (!clienteNaDescricao && !valorProximo) return false

            // Vencimento a até 30 dias da data do lançamento
            if (lancamento?.data) {
              const dias = Math.abs(
                (new Date(t.vencimento).getTime() - new Date(lancamento.data).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
              return dias <= 30
            }

            return true
          })
          .map((t) => ({
            cod_titulo: t.cod_titulo,
            cod_cliente: t.cod_cliente,
            nome_cliente: clienteMap.get(t.cod_cliente) || '',
            nota_fiscal: t.nota_fiscal,
            valor: t.valor,
            vencimento: t.vencimento,
            status: t.status,
          }))

        return agente(
          'investigador',
          {
            divergencia: {
              tipo_inicial: div.tipo_inicial,
              valor_lancamento: div.valor_lancamento,
              valor_titulo: div.valor_titulo,
            },
            lancamento: lancamento
              ? {
                  data: lancamento.data,
                  descricao: lancamento.descricao,
                  valor: lancamento.valor,
                }
              : null,
            titulos_candidatos: titulosCandidatos,
          },
          {
            area: 'financeiro',
            item_tipo: 'divergencia',
            item_id: div.id,
            chamado_por: orquestrador_id,
          }
        ).catch((err) => {
          console.error(`Erro ao investigar divergência ${div.id}:`, err)
          return null
        })
      })
    )

    const hipotesesValidas = investigacoes
      .filter((i) => i !== null)
      .map((i) => i?.saida)
      .filter(Boolean)

    // 3. Consolidador + 4. Revisor (com no máximo 1 refação do Consolidador)
    const qtdCasados =
      (await supabase
        .from('lancamentos')
        .select('id', { count: 'exact', head: true })
        .eq('extrato_id', extrato_id)
        .eq('situacao', 'casado')
      ).count || 0

    const { data: lancamentosCasadosData } = await supabase
      .from('lancamentos')
      .select('valor')
      .eq('extrato_id', extrato_id)
      .eq('situacao', 'casado')

    const valorCasado = (lancamentosCasadosData || []).reduce(
      (s, l) => s + (l.valor || 0),
      0
    )

    const valorDivergente = divergencias.reduce(
      (s, d) => s + (d.valor_lancamento || d.valor_titulo || 0),
      0
    )

    const resumoCasamento = {
      qtd_casados: qtdCasados,
      valor_casado: valorCasado,
      qtd_divergencias: divergencias.length,
      valor_divergente: valorDivergente,
      periodo: new Date().toISOString().slice(0, 7),
    }

    const titulosAbertosParaRevisor = (titulosAbertos || []).map((t) => ({
      cod_titulo: t.cod_titulo,
      valor: t.valor,
      cod_cliente: t.cod_cliente,
      vencimento: t.vencimento,
    }))

    let saidaConsolidador: any = null
    let saidaRevisor: any = null
    let tentativa = 0
    const maxTentativas = 2 // original + 1 refação

    do {
      tentativa++

      const entradaConsolidador: any = {
        resumo_casamento: resumoCasamento,
        hipoteses: hipotesesValidas,
        ...(tentativa > 1 ? { ajustes: saidaRevisor?.motivos } : {}),
      }

      const resultConsolidador = await agente(
        'consolidador',
        entradaConsolidador,
        {
          area: 'financeiro',
          item_tipo: 'divergencia',
          item_id: extrato_id,
          chamado_por: orquestrador_id,
        }
      ).catch((err) => {
        console.error('Erro ao consolidar:', err)
        return { saida: null }
      })

      saidaConsolidador = resultConsolidador.saida

      // 4. Revisor
      const resultRevisor = await agente(
        'revisor',
        {
          hipoteses: hipotesesValidas,
          titulos_abertos: titulosAbertosParaRevisor,
          relatorio: {
            relatorio_markdown: saidaConsolidador?.relatorio_markdown,
            acoes: saidaConsolidador?.acoes,
          },
        },
        {
          area: 'financeiro',
          item_tipo: 'divergencia',
          item_id: extrato_id,
          chamado_por: orquestrador_id,
        }
      ).catch((err) => {
        console.error('Erro ao revisar:', err)
        return { saida: { aprovado: true, motivos: [] } }
      })

      saidaRevisor = resultRevisor.saida

      if (saidaRevisor?.aprovado || tentativa >= maxTentativas) {
        break
      }
    } while (tentativa < maxTentativas)

    // 5. Cria itens em aprovacoes para cada hipótese
    for (let i = 0; i < hipotesesValidas.length; i++) {
      const hipotese = hipotesesValidas[i]
      const divergencia = divergencias[i]
      if (!hipotese || !divergencia) continue

      const lancamento = divergencia.lancamento_id
        ? lancamentoMap.get(divergencia.lancamento_id)
        : null

      const clienteOuDescricao =
        (hipotese.cod_titulos_envolvidos?.[0] &&
          clienteMap.get(
            (titulosAbertos || []).find(
              (t) => t.cod_titulo === hipotese.cod_titulos_envolvidos[0]
            )?.cod_cliente || ''
          )) ||
        lancamento?.descricao ||
        divergencia.cod_titulo ||
        'sem identificação'

      const valor = hipotese.valor_a_baixar || divergencia.valor_lancamento || divergencia.valor_titulo || 0

      await supabase.from('aprovacoes').insert({
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: divergencia.id,
        titulo: `${hipotese.hipotese} · ${clienteOuDescricao} · R$ ${valor.toFixed(2)}`,
        proposta: {
          hipotese,
          relatorio: saidaConsolidador?.relatorio_markdown,
          acoes: saidaConsolidador?.acoes,
          revisao: saidaRevisor,
        },
        status: 'pendente',
      })
    }

    // Divergências para aguardando_aprovacao
    await supabase
      .from('divergencias')
      .update({ status: 'aguardando_aprovacao' })
      .eq('extrato_id', extrato_id)

    // Fecha execução raiz
    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'ok',
        saida: {
          relatorio: saidaConsolidador?.relatorio_markdown,
          aprovado: saidaRevisor?.aprovado,
        },
        fim: new Date().toISOString(),
      })
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

    // Recoloca divergências em nova
    await supabase
      .from('divergencias')
      .update({ status: 'nova' })
      .eq('extrato_id', extrato_id)

    throw err
  }
}
