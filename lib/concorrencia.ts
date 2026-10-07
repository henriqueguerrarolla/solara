// Processa um array com um limite de tarefas simultâneas, evitando estourar
// o rate limit de requisições concorrentes da API Anthropic quando há muitas
// divergências (ex.: Investigadores em paralelo no Financeiro).
export async function mapComConcorrenciaLimitada<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length)
  let proximoIndice = 0

  async function worker() {
    while (proximoIndice < itens.length) {
      const indiceAtual = proximoIndice++
      resultados[indiceAtual] = await tarefa(itens[indiceAtual], indiceAtual)
    }
  }

  const workers = Array.from({ length: Math.min(limite, itens.length) }, () => worker())
  await Promise.all(workers)

  return resultados
}

// Retry com backoff exponencial para erros de rate limit (429) da API Anthropic.
export async function comRetryRateLimit<T>(
  fn: () => Promise<T>,
  maxTentativas = 4
): Promise<T> {
  let ultimoErro: unknown

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      ultimoErro = err
      const ehRateLimit =
        err instanceof Error && /429|rate_limit/i.test(err.message)

      if (!ehRateLimit || tentativa === maxTentativas - 1) {
        throw err
      }

      const esperaMs = 1000 * Math.pow(2, tentativa) + Math.random() * 500
      await new Promise((resolve) => setTimeout(resolve, esperaMs))
    }
  }

  throw ultimoErro
}
