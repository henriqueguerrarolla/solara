import { Anthropic } from '@anthropic-ai/sdk'
import { createClient } from './supabase'

interface Contexto {
  area: string
  item_tipo: string
  item_id: string
  chamado_por?: string
}

interface RespostaAgente {
  saida: any
  execucao_id: string
}

export async function agente(
  papel: string,
  entrada: any,
  contexto: Contexto
): Promise<RespostaAgente> {
  const supabase = await createClient()

  // 1. Insere linha em execucoes_agentes com status = rodando
  const { data: execucao, error: insertError } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por || null,
      status: 'rodando',
      entrada,
      inicio: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError || !execucao) {
    throw new Error(`Erro ao criar execução: ${insertError?.message}`)
  }

  const execucao_id = execucao.id

  try {
    // 2. Lê o system prompt de prompts/<area>/<papel>.md
    const promptPath = `solara-os/prompts/${contexto.area}/${papel}.md`
    let systemPrompt = ''

    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      const filePath = path.join(process.cwd(), promptPath)
      systemPrompt = await fs.readFile(filePath, 'utf-8')
    } catch (err) {
      throw new Error(`Não encontrado: ${promptPath}`)
    }

    // 3. Chama a API Anthropic
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(entrada),
        },
      ],
    })

    // Extrai o texto da resposta
    const texto =
      response.content[0].type === 'text' ? response.content[0].text : ''

    // 4. Faz JSON.parse do texto retornado
    let saida: any
    try {
      saida = JSON.parse(texto)
    } catch (parseError) {
      // Se falhar, marca erro e lança exceção
      await supabase
        .from('execucoes_agentes')
        .update({
          status: 'erro',
          erro: `JSON parse falhou: ${parseError}`,
          fim: new Date().toISOString(),
        })
        .eq('id', execucao_id)

      throw new Error(`Resposta do agente não é JSON válido: ${texto}`)
    }

    // 5. Atualiza a linha com status = ok, saida, tokens, fim
    const { error: updateError } = await supabase
      .from('execucoes_agentes')
      .update({
        status: 'ok',
        saida,
        tokens_entrada: response.usage.input_tokens,
        tokens_saida: response.usage.output_tokens,
        fim: new Date().toISOString(),
      })
      .eq('id', execucao_id)

    if (updateError) {
      throw new Error(`Erro ao atualizar execução: ${updateError.message}`)
    }

    // 6. Devolve { saida, execucao_id }
    return {
      saida,
      execucao_id,
    }
  } catch (err) {
    // Marca erro na execução
    try {
      await supabase
        .from('execucoes_agentes')
        .update({
          status: 'erro',
          erro: err instanceof Error ? err.message : String(err),
          fim: new Date().toISOString(),
        })
        .eq('id', execucao_id)
    } catch {
      // Ignora erro ao marcar erro
    }

    throw err
  }
}
