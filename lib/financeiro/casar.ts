import { LinhaLimpa } from './limpar'

export interface Titulo {
  cod_titulo: string
  cod_cliente: string
  nota_fiscal: string
  valor: number
  emissao: string
  vencimento: string
  status: string
}

export interface LancamentoCasado {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
  cod_titulo_casado: string | null
  situacao: 'casado' | 'divergente' | 'ignorado'
  tipo_inicial?: string
  valor_titulo?: number
  cod_titulo_divergente?: string | null
}

export interface DivergenciaVencida {
  tipo_inicial: 'vencido_sem_pagamento'
  cod_titulo: string
  valor_titulo: number
}

export interface ResultadoCasamento {
  lancamentos: LancamentoCasado[]
  divergenciasVencidas: DivergenciaVencida[]
}

const TOLERANCIA_DIAS_VENCIMENTO = 5
const TOLERANCIA_CENTAVOS = 0.01

function extrairNF(descricao: string): string | null {
  const match = descricao.match(/NF-(\d+)/i)
  return match ? `NF-${match[1]}` : null
}

function diferencaDias(dataA: string, dataB: string): number {
  const a = new Date(dataA).getTime()
  const b = new Date(dataB).getTime()
  return Math.abs((a - b) / (1000 * 60 * 60 * 24))
}

export function casarLancamentos(
  linhas: LinhaLimpa[],
  titulos: Titulo[],
  dataFinalExtrato: string
): ResultadoCasamento {
  const titulosAbertos = titulos.filter((t) => t.status === 'aberto')
  const titulosCasados = new Set<string>()
  const lancamentos: LancamentoCasado[] = []

  for (const linha of linhas) {
    // Débitos são sempre ignorados
    if (linha.tipo === 'debito') {
      lancamentos.push({
        ...linha,
        cod_titulo_casado: null,
        situacao: 'ignorado',
      })
      continue
    }

    // 1. Descrição contém NF-<n> e existe título com essa nota e mesmo valor
    const nf = extrairNF(linha.descricao)
    if (nf) {
      const tituloPorNF = titulosAbertos.find(
        (t) => t.nota_fiscal === nf && !titulosCasados.has(t.cod_titulo)
      )

      if (tituloPorNF) {
        const mesmoValor = Math.abs(tituloPorNF.valor - linha.valor) <= TOLERANCIA_CENTAVOS

        if (mesmoValor) {
          titulosCasados.add(tituloPorNF.cod_titulo)
          lancamentos.push({
            ...linha,
            cod_titulo_casado: tituloPorNF.cod_titulo,
            situacao: 'casado',
          })
          continue
        }

        // NF encontrada, valor diferente
        lancamentos.push({
          ...linha,
          cod_titulo_casado: null,
          situacao: 'divergente',
          tipo_inicial: 'valor_diferente_mesma_nf',
          valor_titulo: tituloPorNF.valor,
          cod_titulo_divergente: tituloPorNF.cod_titulo,
        })
        continue
      }
    }

    // 2. Exatamente um título em aberto com mesmo valor e vencimento a até 5 dias
    const candidatosPorValor = titulosAbertos.filter(
      (t) =>
        !titulosCasados.has(t.cod_titulo) &&
        Math.abs(t.valor - linha.valor) <= TOLERANCIA_CENTAVOS &&
        diferencaDias(t.vencimento, linha.data) <= TOLERANCIA_DIAS_VENCIMENTO
    )

    if (candidatosPorValor.length === 1) {
      const titulo = candidatosPorValor[0]
      titulosCasados.add(titulo.cod_titulo)
      lancamentos.push({
        ...linha,
        cod_titulo_casado: titulo.cod_titulo,
        situacao: 'casado',
      })
      continue
    }

    // 3. Divergente - determina tipo_inicial
    const algumComMesmoValor = titulosAbertos.some(
      (t) => Math.abs(t.valor - linha.valor) <= TOLERANCIA_CENTAVOS
    )

    if (!algumComMesmoValor) {
      // Verifica possível soma de dois títulos do mesmo cliente
      let parEncontrado: [Titulo, Titulo] | null = null

      for (let i = 0; i < titulosAbertos.length && !parEncontrado; i++) {
        for (let j = i + 1; j < titulosAbertos.length; j++) {
          const t1 = titulosAbertos[i]
          const t2 = titulosAbertos[j]
          if (
            t1.cod_cliente === t2.cod_cliente &&
            !titulosCasados.has(t1.cod_titulo) &&
            !titulosCasados.has(t2.cod_titulo) &&
            Math.abs(t1.valor + t2.valor - linha.valor) <= TOLERANCIA_CENTAVOS
          ) {
            parEncontrado = [t1, t2]
            break
          }
        }
      }

      if (parEncontrado) {
        lancamentos.push({
          ...linha,
          cod_titulo_casado: null,
          situacao: 'divergente',
          tipo_inicial: 'possivel_soma',
        })
        continue
      }

      // Verifica se já existe lançamento casado com título de mesmo valor (duplicado)
      const jaFoiCasado = Array.from(titulosCasados).some((codTitulo) => {
        const t = titulos.find((tt) => tt.cod_titulo === codTitulo)
        return t && Math.abs(t.valor - linha.valor) <= TOLERANCIA_CENTAVOS
      })

      if (jaFoiCasado) {
        lancamentos.push({
          ...linha,
          cod_titulo_casado: null,
          situacao: 'divergente',
          tipo_inicial: 'duplicado',
        })
        continue
      }

      lancamentos.push({
        ...linha,
        cod_titulo_casado: null,
        situacao: 'divergente',
        tipo_inicial: 'sem_titulo_correspondente',
      })
      continue
    }

    // Existe título com mesmo valor, mas não casou por vencimento (mais de um candidato ou vencimento fora da janela)
    lancamentos.push({
      ...linha,
      cod_titulo_casado: null,
      situacao: 'divergente',
      tipo_inicial: 'sem_titulo_correspondente',
    })
  }

  // Títulos vencidos sem pagamento: vencimento anterior à data final do extrato e sem lançamento casado
  const divergenciasVencidas: DivergenciaVencida[] = titulosAbertos
    .filter(
      (t) =>
        !titulosCasados.has(t.cod_titulo) &&
        new Date(t.vencimento).getTime() < new Date(dataFinalExtrato).getTime()
    )
    .map((t) => ({
      tipo_inicial: 'vencido_sem_pagamento' as const,
      cod_titulo: t.cod_titulo,
      valor_titulo: t.valor,
    }))

  return { lancamentos, divergenciasVencidas }
}
