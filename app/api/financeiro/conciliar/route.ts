import { NextRequest, NextResponse } from 'next/server'
import { orquestradorFinanceiro } from '@/lib/orquestradores/financeiro'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { extrato_id } = await request.json()

    if (!extrato_id) {
      return NextResponse.json(
        { error: 'extrato_id é obrigatório' },
        { status: 400 }
      )
    }

    await orquestradorFinanceiro(extrato_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao conciliar' },
      { status: 500 }
    )
  }
}
