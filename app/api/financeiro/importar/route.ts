import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { limparExtrato, decodificarArquivo } from '@/lib/financeiro/limpar'
import { casarLancamentos, Titulo } from '@/lib/financeiro/casar'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const extratoFile = formData.get('extrato') as File
    const titulosFile = formData.get('titulos') as File | null

    if (!extratoFile) {
      return NextResponse.json(
        { error: 'Arquivo de extrato é obrigatório' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Decodifica e limpa o extrato
    const extratoBuffer = await extratoFile.arrayBuffer()
    const extratoTexto = decodificarArquivo(extratoBuffer)
    const resultadoLimpeza = limparExtrato(extratoTexto)

    if (resultadoLimpeza.todasLinhas.length === 0) {
      return NextResponse.json(
        { error: 'Não foi possível ler nenhuma linha do extrato' },
        { status: 400 }
      )
    }

    // Busca títulos: do arquivo enviado ou da tabela titulos_receber
    let titulos: Titulo[] = []

    if (titulosFile) {
      const titulosBuffer = await titulosFile.arrayBuffer()
      const titulosTexto = decodificarArquivo(titulosBuffer)
      const linhasTitulos = titulosTexto.split(/\r?\n/).filter((l) => l.trim())
      const header = linhasTitulos[0].split(',').map((h) => h.trim().toLowerCase())

      titulos = linhasTitulos.slice(1).map((linha) => {
        const cols = linha.split(',')
        const obj: any = {}
        header.forEach((h, idx) => {
          obj[h] = cols[idx]?.trim()
        })
        return {
          cod_titulo: obj.cod_titulo,
          cod_cliente: obj.cod_cliente,
          nota_fiscal: obj.nota_fiscal,
          valor: parseFloat(obj.valor),
          emissao: obj.emissao,
          vencimento: obj.vencimento,
          status: obj.status || 'aberto',
        }
      })
    } else {
      const { data: titulosData } = await supabase
        .from('titulos_receber')
        .select('*')
        .eq('status', 'aberto')

      titulos = titulosData || []
    }

    // Data final do extrato (última data das linhas)
    const datas = resultadoLimpeza.todasLinhas.map((l) => l.data).sort()
    const dataFinalExtrato = datas[datas.length - 1]

    // Casamento
    const { lancamentos: lancamentosCasados, divergenciasVencidas } =
      casarLancamentos(resultadoLimpeza.todasLinhas, titulos, dataFinalExtrato)

    const totalCreditos = lancamentosCasados
      .filter((l) => l.tipo === 'credito')
      .reduce((s, l) => s + l.valor, 0)

    // Cria registro de extrato importado
    const { data: extrato, error: extratoError } = await supabase
      .from('extratos_importados')
      .insert({
        nome_arquivo: extratoFile.name,
        total_linhas: resultadoLimpeza.todasLinhas.length,
        total_creditos: totalCreditos,
      })
      .select()
      .single()

    if (extratoError || !extrato) {
      return NextResponse.json(
        { error: `Erro ao importar extrato: ${extratoError?.message}` },
        { status: 400 }
      )
    }

    // Insere lançamentos
    const { data: lancamentosData, error: lancError } = await supabase
      .from('lancamentos')
      .insert(
        lancamentosCasados.map((l) => ({
          extrato_id: extrato.id,
          data: l.data,
          descricao: l.descricao,
          valor: l.valor,
          tipo: l.tipo,
          cod_titulo_casado: l.cod_titulo_casado,
          situacao: l.situacao,
        }))
      )
      .select()

    if (lancError) {
      return NextResponse.json(
        { error: `Erro ao importar lançamentos: ${lancError.message}` },
        { status: 400 }
      )
    }

    // Cria divergências para os lançamentos divergentes
    const divergenciasParaInserir: any[] = []

    lancamentosCasados.forEach((l, idx) => {
      if (l.situacao === 'divergente') {
        divergenciasParaInserir.push({
          extrato_id: extrato.id,
          tipo_inicial: l.tipo_inicial,
          lancamento_id: lancamentosData?.[idx]?.id,
          cod_titulo: l.cod_titulo_divergente || null,
          valor_lancamento: l.valor,
          valor_titulo: l.valor_titulo || null,
          status: 'nova',
        })
      }
    })

    // Divergências de títulos vencidos sem pagamento
    divergenciasVencidas.forEach((dv) => {
      divergenciasParaInserir.push({
        extrato_id: extrato.id,
        tipo_inicial: dv.tipo_inicial,
        lancamento_id: null,
        cod_titulo: dv.cod_titulo,
        valor_lancamento: null,
        valor_titulo: dv.valor_titulo,
        status: 'nova',
      })
    })

    let divergenciasData: any[] = []
    if (divergenciasParaInserir.length > 0) {
      const { data, error: divError } = await supabase
        .from('divergencias')
        .insert(divergenciasParaInserir)
        .select()

      if (divError) {
        return NextResponse.json(
          { error: `Erro ao criar divergências: ${divError.message}` },
          { status: 400 }
        )
      }
      divergenciasData = data || []
    }

    return NextResponse.json({
      success: true,
      extrato_id: extrato.id,
      antes: resultadoLimpeza.linhasAntes,
      depois: resultadoLimpeza.linhasDepois,
      lancamentos: lancamentosData,
      divergencias: divergenciasData,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar arquivo' },
      { status: 500 }
    )
  }
}
