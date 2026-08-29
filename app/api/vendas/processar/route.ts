import { NextRequest, NextResponse } from 'next/server'
import { orquestradorVendas } from '@/lib/orquestradores/vendas'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { cod_pedido } = await request.json()

    if (!cod_pedido) {
      return NextResponse.json(
        { error: 'cod_pedido é obrigatório' },
        { status: 400 }
      )
    }

    await orquestradorVendas(cod_pedido)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar' },
      { status: 500 }
    )
  }
}
