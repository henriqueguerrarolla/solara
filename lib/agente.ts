import { Anthropic } from '@anthropic-ai/sdk'
import { createAdminClient } from './supabase-admin'

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

// Modelos às vezes geram strings JSON com quebras de linha reais (não escapadas
// como \n) dentro de campos de texto longos (ex.: relatorio_markdown). Isso
// quebra JSON.parse. Esta função varre o texto caractere a caractere e escapa
// quebras de linha/tab que estejam dentro de uma string JSON, preservando o
// resto da estrutura intacta.
function repararQuebrasDeLinhaEmStrings(texto: string): string {
  let resultado = ''
  let dentroDeString = false
  let anteriorEhBarra = false

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i]

    if (dentroDeString) {
      if (char === '\\' && !anteriorEhBarra) {
        anteriorEhBarra = true
        resultado += char
        continue
      }

      if (char === '"' && !anteriorEhBarra) {
        dentroDeString = false
        resultado += char
        anteriorEhBarra = false
        continue
      }

      if (char === '\n') {
        resultado += '\\n'
        anteriorEhBarra = false
        continue
      }

      if (char === '\r') {
        anteriorEhBarra = false
        continue
      }

      if (char === '\t') {
        resultado += '\\t'
        anteriorEhBarra = false
        continue
      }

      anteriorEhBarra = false
      resultado += char
    } else {
      if (char === '"') {
        dentroDeString = true
      }
      resultado += char
    }
  }

  return resultado
}

function parseJSONTolerante(texto: string): any {
  try {
    return JSON.parse(texto)
  } catch {
    return JSON.parse(repararQuebrasDeLinhaEmStrings(texto))
  }
}

export async function agente(
  papel: string,
  entrada: any,
  contexto: Contexto
): Promise<RespostaAgente> {
  const supabase = createAdminClient()

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

    // Consolidador (relatório de texto longo) e Revisor do Financeiro (pode
    // conferir dezenas de hipóteses) precisam de mais espaço de saída do que
    // os demais agentes, que respondem só um JSON curto.
    const maxTokens =
      papel === 'consolidador'
        ? 8192
        : papel === 'revisor' && contexto.area === 'financeiro'
        ? 4096
        : 2000

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(entrada),
        },
      ],
    })

    // Extrai o texto da resposta
    let texto =
      response.content[0].type === 'text' ? response.content[0].text : ''

    // Remove espaços em branco do início e fim
    texto = texto.trim()

    // Se o texto contiver markdown code blocks, extrai o JSON
    const jsonMatch = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      texto = jsonMatch[1].trim()
    }

    // 4. Faz JSON.parse do texto retornado (com reparo de quebras de linha
    // literais dentro de strings, caso o parse direto falhe)
    let saida: any
    try {
      saida = parseJSONTolerante(texto)
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
