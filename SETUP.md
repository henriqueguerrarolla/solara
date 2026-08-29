# Setup - Casca + Motor

## SQL para Supabase

Copie e cole os scripts abaixo no SQL Editor do Supabase.

### 1. Tabela `perfis` (Casca)

```sql
CREATE TABLE IF NOT EXISTS perfis (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nome text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('admin', 'operador')),
  areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perfis_email ON perfis(email);
CREATE INDEX IF NOT EXISTS idx_perfis_papel ON perfis(papel);

ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem próprio perfil" ON perfis
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins veem todos os perfis" ON perfis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM perfis WHERE id = auth.uid() AND papel = 'admin'
    )
  );

CREATE POLICY "Admins atualizam perfis" ON perfis
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM perfis WHERE id = auth.uid() AND papel = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, email, nome, papel, areas)
  VALUES (new.id, new.email, '', 'operador', ARRAY[]::text[])
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 2. Tabelas `execucoes_agentes` e `aprovacoes` (Motor)

```sql
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

CREATE INDEX IF NOT EXISTS idx_execucoes_item_id ON execucoes_agentes(item_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_area ON execucoes_agentes(area);
CREATE INDEX IF NOT EXISTS idx_execucoes_agente ON execucoes_agentes(agente);
CREATE INDEX IF NOT EXISTS idx_execucoes_status ON execucoes_agentes(status);
CREATE INDEX IF NOT EXISTS idx_execucoes_chamado_por ON execucoes_agentes(chamado_por);

ALTER PUBLICATION supabase_realtime ADD TABLE execucoes_agentes;

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

CREATE INDEX IF NOT EXISTS idx_aprovacoes_status ON aprovacoes(status);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_area ON aprovacoes(area);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_item_id ON aprovacoes(item_id);

ALTER PUBLICATION supabase_realtime ADD TABLE aprovacoes;
```

## Próximos Passos

1. ✅ Copie e cole o SQL acima no Supabase
2. ✅ Crie o primeiro usuário (admin) direto no painel: Auth → Users → Add user
3. ✅ Defina `papel = admin` e `areas = {vendas, financeiro}` para esse usuário na tabela `perfis`
4. ✅ Teste login em http://localhost:3000
5. ✅ Acesse `/admin` para criar mais usuários
6. ✅ Teste o menu de áreas e visualização de usuários

## Componentes Implementados

- ✅ **MenuAreas**: Menu de áreas com links ativos/inativos
- ✅ **FilaAprovacao**: Fila de itens pendentes com aprovação/rejeição/edição
- ✅ **Organograma**: Visualização de execuções em tempo real
- ✅ **LinhaDoTempo**: Histórico detalhado de cada execução
- ✅ **Página /admin**: Criação de usuários e tabela de perfis
- ✅ **Função agente()**: Base para chamar agentes (falta API key)

## Para Testar

1. `npm run dev`
2. Faça login com o usuário admin
3. Clique em "Administração" para criar novos usuários
4. Teste as áreas de Vendas e Financeiro (ainda vazio, apenas layout)

## Estrutura de Pastas

```
app/
├── admin/
│   └── page.tsx           # Gerenciamento de usuários
└── api/
    └── admin/
        └── criar-usuario/
            └── route.ts    # Cria usuário em Auth + perfis

components/
├── MenuAreas.tsx          # Menu com cartões de áreas
├── FilaAprovacao.tsx      # Fila de aprovações
├── Organograma.tsx        # Visualização de agentes
└── LinhaDoTempo.tsx       # Histórico de execuções

lib/
├── agente.ts              # Função base para agentes
├── supabase.ts            # Cliente servidor
├── supabase-browser.ts    # Cliente browser
└── supabase-middleware.ts # Autenticação no middleware
```
