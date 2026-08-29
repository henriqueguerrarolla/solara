import { createClient } from '@/lib/supabase'
import { agente } from '@/lib/agente'

export async function orquestradorFinanceiro(extrato_id: string) {
  const supabase = await createClient()

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
    // 2. Chama Investigador para cada divergência (em paralelo)
    const investigacoes = await Promise.all(
      divergencias.map((div) =>
        agente(
          'investigador',
          {
            divergencia: div,
            lancamento: null, // Stub
            titulos_candidatos: [], // Stub
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
      )
    )

    // 3. Consolidador
    const resumoCasamento = {
      qtd_casados: 0,
      valor_casado: 0,
      qtd_divergencias: divergencias.length,
      valor_divergente: divergencias.reduce(
        (s, d) => s + (d.valor_lancamento || 0),
        0
      ),
    }

    const hipotesesValidas = investigacoes
      .filter((i) => i !== null)
      .map((i) => i?.saida)

    const { saida: saidaConsolidador } = await agente(
      'consolidador',
      {
        resumo_casamento: resumoCasamento,
        hipoteses: hipotesesValidas,
      },
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

    // 4. Revisor
    const { saida: saidaRevisor } = await agente(
      'revisor',
      {
        hipoteses: hipotesesValidas,
        titulos_abertos: [],
        relatorio: saidaConsolidador?.relatorio_markdown,
      },
      {
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: extrato_id,
        chamado_por: orquestrador_id,
      }
    ).catch((err) => {
      console.error('Erro ao revisar:', err)
      return { saida: { aprovado: false, motivos: [] } }
    })

    // 5. Cria itens em aprovacoes para cada hipótese
    for (let i = 0; i < hipotesesValidas.length; i++) {
      const hipotese = hipotesesValidas[i]
      if (!hipotese) continue

      await supabase.from('aprovacoes').insert({
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: divergencias[i]?.id,
        titulo: `${hipotese.hipotese || 'Divergência'} · R$ ${hipotese.valor_lancamento}`,
        proposta: hipotese,
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
