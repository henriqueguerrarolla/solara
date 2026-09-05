import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // SQL para criar tabela execucoes_agentes
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.execucoes_agentes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          area text NOT NULL,
          item_tipo text NOT NULL,
          item_id text NOT NULL,
          agente text NOT NULL,
          chamado_por uuid REFERENCES public.execucoes_agentes(id),
          status text NOT NULL DEFAULT 'rodando',
          entrada jsonb,
          saida jsonb,
          erro text,
          tokens_entrada integer,
          tokens_saida integer,
          inicio timestamptz DEFAULT now(),
          fim timestamptz,
          created_at timestamptz DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_execucoes_item_id ON public.execucoes_agentes(item_id);
        CREATE INDEX IF NOT EXISTS idx_execucoes_agente ON public.execucoes_agentes(agente);
        CREATE INDEX IF NOT EXISTS idx_execucoes_status ON public.execucoes_agentes(status);
      `,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar tabela' },
      { status: 500 }
    )
  }
}
