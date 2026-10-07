#!/bin/bash
echo "✅ Verificando implementação do Triador..."
echo ""

# Componentes e páginas
files=(
  "app/vendas/page.tsx"
  "app/api/vendas/processar/route.ts"
  "lib/orquestradores/vendas.ts"
  "components/Organograma.tsx"
  "components/LinhaDoTempo.tsx"
  "prompts/vendas/triador.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file - NÃO ENCONTRADO"
  fi
done

echo ""
echo "📊 Estrutura da tela /vendas:"
grep -q "kanban\|Organograma\|LinhaDoTempo" app/vendas/page.tsx && echo "✅ Kanban implementado" || echo "❌ Kanban não encontrado"
grep -q "Organograma\|area=\"vendas\"" app/vendas/page.tsx && echo "✅ Organograma integrado" || echo "❌ Organograma não integrado"
grep -q "LinhaDoTempo\|timeline\|sidePanel" app/vendas/page.tsx && echo "✅ Painel lateral com LinhaDoTempo implementado" || echo "❌ Painel lateral não implementado"

echo ""
echo "🤖 Rota API:"
grep -q "orquestradorVendas" app/api/vendas/processar/route.ts && echo "✅ Rota chama orquestrador" || echo "❌ Rota não chama orquestrador"

echo ""
echo "⚙️ Orquestrador:"
grep -q "agente.*triador" lib/orquestradores/vendas.ts && echo "✅ Triador é chamado" || echo "❌ Triador não é chamado"
! grep -q "agente.*pesquisador" lib/orquestradores/vendas.ts && echo "✅ Pesquisador não é chamado (conforme solicitado)" || echo "❌ Pesquisador ainda está sendo chamado"
! grep -q "agente.*redator" lib/orquestradores/vendas.ts && echo "✅ Redator não é chamado (conforme solicitado)" || echo "❌ Redator ainda está sendo chamado"
! grep -q "agente.*revisor" lib/orquestradores/vendas.ts && echo "✅ Revisor não é chamado (conforme solicitado)" || echo "❌ Revisor ainda está sendo chamado"
