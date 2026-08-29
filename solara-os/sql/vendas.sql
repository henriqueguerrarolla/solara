-- Tabela pedidos_orcamento
CREATE TABLE IF NOT EXISTS pedidos_orcamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_pedido text NOT NULL UNIQUE,
  cod_cliente text NOT NULL REFERENCES clientes(cod_cliente),
  canal text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'novo',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cod_pedido ON pedidos_orcamento(cod_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_cod_cliente ON pedidos_orcamento(cod_cliente);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos_orcamento(status);

ALTER PUBLICATION supabase_realtime ADD TABLE pedidos_orcamento;

-- Função para gerar próximo cod_pedido
CREATE OR REPLACE FUNCTION public.gerar_cod_pedido()
RETURNS text AS $$
DECLARE
  proximo int;
  novo_codigo text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(cod_pedido, 4) AS INTEGER)), 30) + 1
  INTO proximo
  FROM pedidos_orcamento
  WHERE cod_pedido ~ '^PED[0-9]+$';

  novo_codigo := 'PED' || LPAD(proximo::text, 3, '0');
  RETURN novo_codigo;
END;
$$ LANGUAGE plpgsql;
