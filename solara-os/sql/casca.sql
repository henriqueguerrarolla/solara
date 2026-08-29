-- Tabela perfis
CREATE TABLE IF NOT EXISTS perfis (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nome text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('admin', 'operador')),
  areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  criado_em timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_perfis_email ON perfis(email);
CREATE INDEX IF NOT EXISTS idx_perfis_papel ON perfis(papel);

-- RLS (Row Level Security)
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

-- Política: usuários veem seu próprio perfil
CREATE POLICY "Usuários veem próprio perfil" ON perfis
  FOR SELECT USING (auth.uid() = id);

-- Política: admins veem todos os perfis
CREATE POLICY "Admins veem todos os perfis" ON perfis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM perfis WHERE id = auth.uid() AND papel = 'admin'
    )
  );

-- Política: admins podem atualizar
CREATE POLICY "Admins atualizam perfis" ON perfis
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM perfis WHERE id = auth.uid() AND papel = 'admin'
    )
  );

-- Função para criar perfil automaticamente ao criar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, email, nome, papel, areas)
  VALUES (new.id, new.email, '', 'operador', ARRAY[]::text[])
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar perfil ao registrar
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
