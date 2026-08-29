import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

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

    // Lê conteúdo dos arquivos
    const extratoText = await extratoFile.text()

    const supabase = await createClient()

    // Cria registro de extrato importado
    const { data: extrato, error: extratoError } = await supabase
      .from('extratos_importados')
      .insert({
        nome_arquivo: extratoFile.name,
        conteudo_bruto: extratoText,
        conteudo_normalizado: extratoText, // Stub: deveria normalizar
        total_linhas: extratoText.split('\n').length,
      })
      .select()
      .single()

    if (extratoError || !extrato) {
      return NextResponse.json(
        { error: 'Erro ao importar extrato' },
        { status: 400 }
      )
    }

    // Stub: parse CSV e cria lançamentos
    const linhas = extratoText.split('\n').slice(1) // pula header
    const lancamentos = linhas
      .filter((l) => l.trim())
      .slice(0, 10) // primeiras 10 linhas
      .map((linha, idx) => {
        const cols = linha.split(',')
        return {
          data: new Date().toISOString().split('T')[0],
          descricao: cols[1] || `Lançamento ${idx}`,
          valor: parseFloat(cols[2]) || 0,
          tipo: parseFloat(cols[2]) > 0 ? 'credito' : 'debito',
          situacao: 'divergente',
        }
      })

    // Insere lançamentos
    const { data: lancamentosData, error: lancError } = await supabase
      .from('lancamentos')
      .insert(lancamentos.map((l) => ({ extrato_id: extrato.id, ...l })))
      .select()

    if (lancError) {
      return NextResponse.json(
        { error: 'Erro ao importar lançamentos' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      extrato_id: extrato.id,
      lancamentos: lancamentosData,
      divergencias: [], // Stub
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'Erro ao processar arquivo' },
      { status: 500 }
    )
  }
}
