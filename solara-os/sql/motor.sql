-- Tabela execucoes_agentes
CREATE TABLE IF NOT EXISTS execucoes_agentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  item_tipo text NOT NULL,
  item_id text NOT NULL,
  agente text NOT NULL,
  chamado_por uuid REFERENCES execucoes_agentes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'rodando',
  entrada jsonb,
  saida jsonb,
  erro text,
  tokens_entrada int,
  tokens_saida int,
  inicio timestamptz DEFAULT now(),
  fim timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_execucoes_item_id ON execucoes_agentes(item_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_area ON execucoes_agentes(area);
CREATE INDEX IF NOT EXISTS idx_execucoes_agente ON execucoes_agentes(agente);
CREATE INDEX IF NOT EXISTS idx_execucoes_status ON execucoes_agentes(status);
CREATE INDEX IF NOT EXISTS idx_execucoes_chamado_por ON execucoes_agentes(chamado_por);

-- Habilitar Realtime na tabela
ALTER PUBLICATION supabase_realtime ADD TABLE execucoes_agentes;

-- Tabela aprovacoes
CREATE TABLE IF NOT EXISTS aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  item_tipo text NOT NULL,
  item_id text NOT NULL,
  titulo text NOT NULL,
  proposta jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  decidido_por uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  decidido_em timestamptz,
  observacao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_aprovacoes_status ON aprovacoes(status);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_area ON aprovacoes(area);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_item_id ON aprovacoes(item_id);

-- Habilitar Realtime na tabela
ALTER PUBLICATION supabase_realtime ADD TABLE aprovacoes;
