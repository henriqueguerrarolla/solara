export interface LinhaLimpa {
  data: string // ISO yyyy-mm-dd
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

export interface ResultadoLimpeza {
  linhasAntes: string[] // 6 primeiras linhas do arquivo bruto
  linhasDepois: LinhaLimpa[] // 6 primeiras linhas normalizadas
  todasLinhas: LinhaLimpa[] // todas as linhas normalizadas
}

function detectarSeparador(linha: string): string {
  const qtdPontoVirgula = (linha.match(/;/g) || []).length
  const qtdVirgula = (linha.match(/,/g) || []).length
  return qtdPontoVirgula > qtdVirgula ? ';' : ','
}

function converterData(dataStr: string): string {
  // dd/mm/aaaa -> aaaa-mm-dd
  const match = dataStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, dia, mes, ano] = match
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  }
  // já está em ISO
  return dataStr.trim()
}

function converterValor(valorStr: string): number {
  // "1.250,00" -> 1250.00
  const limpo = valorStr.trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(limpo)
}

function jaEstaLimpo(header: string): boolean {
  const normalizado = header.toLowerCase().replace(/[;,]/g, ',')
  return normalizado.startsWith('cod_lancamento,data')
}

export function limparExtrato(conteudo: string): ResultadoLimpeza {
  const todasLinhasBrutas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const linhasAntes = todasLinhasBrutas.slice(0, 6)

  if (todasLinhasBrutas.length === 0) {
    return { linhasAntes: [], linhasDepois: [], todasLinhas: [] }
  }

  // Se já está limpo (cabeçalho cod_lancamento,data,...), usa direto
  if (jaEstaLimpo(todasLinhasBrutas[0])) {
    const sep = detectarSeparador(todasLinhasBrutas[0])
    const header = todasLinhasBrutas[0].split(sep).map((h) => h.trim().toLowerCase())
    const idxData = header.indexOf('data')
    const idxDescricao = header.indexOf('descricao')
    const idxValor = header.indexOf('valor')
    const idxTipo = header.indexOf('tipo')

    const linhas: LinhaLimpa[] = todasLinhasBrutas
      .slice(1)
      .map((linha) => {
        const cols = linha.split(sep)
        const valor = converterValor(cols[idxValor] || '0')
        return {
          data: converterData(cols[idxData] || ''),
          descricao: (cols[idxDescricao] || '').trim(),
          valor: Math.abs(valor),
          tipo: (idxTipo >= 0 ? cols[idxTipo]?.trim() : valor >= 0 ? 'credito' : 'debito') as
            | 'credito'
            | 'debito',
        }
      })
      .filter((l) => l.data && l.descricao)

    return {
      linhasAntes,
      linhasDepois: linhas.slice(0, 6),
      todasLinhas: linhas,
    }
  }

  // Arquivo bruto: detecta separador pela primeira linha não vazia
  const sep = detectarSeparador(todasLinhasBrutas[0])

  // Pula linhas até a que começa com "Data"
  let inicioIdx = todasLinhasBrutas.findIndex((l) =>
    l.trim().toLowerCase().startsWith('data')
  )
  if (inicioIdx === -1) inicioIdx = 0

  const linhasDados = todasLinhasBrutas.slice(inicioIdx + 1)

  const linhas: LinhaLimpa[] = linhasDados
    .filter((l) => !l.toUpperCase().includes('SALDO'))
    .map((linha) => {
      const cols = linha.split(sep).map((c) => c.trim())
      // Formato bruto: Data;Descricao;Valor;Saldo (descarta saldo = última coluna)
      const dataStr = cols[0] || ''
      const descricao = cols[1] || ''
      const valorStr = cols[2] || '0'
      const valor = converterValor(valorStr)

      return {
        data: converterData(dataStr),
        descricao,
        valor: Math.abs(valor),
        tipo: (valor >= 0 ? 'credito' : 'debito') as 'credito' | 'debito',
      }
    })
    .filter((l) => l.data && l.descricao)

  return {
    linhasAntes,
    linhasDepois: linhas.slice(0, 6),
    todasLinhas: linhas,
  }
}

export function decodificarArquivo(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('latin1').decode(buffer)
  }
}
