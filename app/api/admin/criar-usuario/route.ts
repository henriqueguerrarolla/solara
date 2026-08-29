import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, nome, papel, areas } = await request.json()

    if (!email || !password || !nome) {
      return NextResponse.json(
        { error: 'E-mail, senha e nome são obrigatórios' },
        { status: 400 }
      )
    }

    // Cria cliente com service role (só no servidor)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Cria usuário no Auth
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: authError?.message || 'Erro ao criar usuário' },
        { status: 400 }
      )
    }

    // Cria perfil
    const { error: perfilError } = await supabase
      .from('perfis')
      .insert({
        id: authUser.user.id,
        email,
        nome,
        papel,
        areas,
      })

    if (perfilError) {
      // Se falhar ao criar perfil, delete o usuário do Auth
      await supabase.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json(
        { error: `Erro ao criar perfil: ${perfilError.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      user: authUser.user,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
