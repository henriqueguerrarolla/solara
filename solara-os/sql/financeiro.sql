-- Tabela extratos_importados
CREATE TABLE IF NOT EXISTS extratos_importados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo text NOT NULL,
  importado_em timestamptz DEFAULT now(),
  importado_por uuid REFERENCES perfis(id),
  total_linhas int,
  total_creditos numeric,
  conteudo_bruto text,
  conteudo_normalizado text
);

CREATE INDEX IF NOT EXISTS idx_extratos_importado_em ON extratos_importados(importado_em);

-- Tabela lancamentos
CREATE TABLE IF NOT EXISTS lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extrato_id uuid NOT NULL REFERENCES extratos_importados(id) ON DELETE CASCADE,
  data date NOT NULL,
  descricao text NOT NULL,
  valor numeric NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('credito', 'debito')),
  cod_titulo_casado text REFERENCES titulos_receber(cod_titulo),
  situacao text NOT NULL DEFAULT 'divergente' CHECK (situacao IN ('casado', 'divergente', 'ignorado')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_extrato_id ON lancamentos(extrato_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data ON lancamentos(data);
CREATE INDEX IF NOT EXISTS idx_lancamentos_situacao ON lancamentos(situacao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cod_titulo ON lancamentos(cod_titulo_casado);

ALTER PUBLICATION supabase_realtime ADD TABLE lancamentos;

-- Tabela divergencias
CREATE TABLE IF NOT EXISTS divergencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extrato_id uuid NOT NULL REFERENCES extratos_importados(id) ON DELETE CASCADE,
  tipo_inicial text NOT NULL,
  lancamento_id uuid REFERENCES lancamentos(id),
  cod_titulo text REFERENCES titulos_receber(cod_titulo),
  valor_lancamento numeric,
  valor_titulo numeric,
  status text NOT NULL DEFAULT 'nova' CHECK (status IN ('nova', 'investigando', 'aguardando_aprovacao', 'resolvida')),
  hipotese jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divergencias_extrato_id ON divergencias(extrato_id);
CREATE INDEX IF NOT EXISTS idx_divergencias_status ON divergencias(status);
CREATE INDEX IF NOT EXISTS idx_divergencias_tipo_inicial ON divergencias(tipo_inicial);

ALTER PUBLICATION supabase_realtime ADD TABLE divergencias;
