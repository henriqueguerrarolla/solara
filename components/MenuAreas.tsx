'use client'

import Link from 'next/link'

interface MenuAreasProps {
  areas: string[]
  isAdmin: boolean
}

const AREAS_CONFIG = [
  {
    id: 'vendas',
    nome: 'Vendas',
    descricao: 'Processamento de pedidos de orçamento',
    ativo: true,
    href: '/vendas',
    emoji: '🛍️',
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Conciliação de extratos bancários',
    ativo: true,
    href: '/financeiro',
    emoji: '💰',
  },
  {
    id: 'rh',
    nome: 'RH',
    descricao: 'Gestão de recursos humanos',
    ativo: false,
    emoji: '👥',
  },
  {
    id: 'juridico',
    nome: 'Jurídico',
    descricao: 'Análise de contratos e documentos',
    ativo: false,
    emoji: '⚖️',
  },
  {
    id: 'operacoes',
    nome: 'Operações',
    descricao: 'Planejamento operacional',
    ativo: false,
    emoji: '⚙️',
  },
]

export default function MenuAreas({ areas, isAdmin }: MenuAreasProps) {
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Áreas</h2>
      <div style={styles.grid}>
        {AREAS_CONFIG.map((area) => {
          const temAcesso = areas.includes(area.id)
          const podeAcessar = area.ativo && temAcesso

          if (podeAcessar) {
            return (
              <Link
                key={area.id}
                href={area.href || '/'}
                style={{ ...styles.card, ...styles.cardAtivo } as any}
              >
                <div style={styles.emoji}>{area.emoji}</div>
                <h3 style={styles.cardTitle}>{area.nome}</h3>
                <p style={styles.cardDesc}>{area.descricao}</p>
              </Link>
            )
          } else if (area.ativo) {
            return (
              <div
                key={area.id}
                style={{ ...styles.card, ...styles.cardInativo }}
                title="Você não tem acesso a esta área"
              >
                <div style={styles.emoji}>{area.emoji}</div>
                <h3 style={styles.cardTitle}>{area.nome}</h3>
                <p style={styles.cardDesc}>{area.descricao}</p>
                <div style={styles.badge}>Sem acesso</div>
              </div>
            )
          } else {
            return (
              <div
                key={area.id}
                style={{ ...styles.card, ...styles.cardEmBreve }}
              >
                <div style={styles.emoji}>{area.emoji}</div>
                <h3 style={styles.cardTitle}>{area.nome}</h3>
                <p style={styles.cardDesc}>{area.descricao}</p>
                <div style={styles.badge}>Em breve</div>
              </div>
            )
          }
        })}
      </div>

      {isAdmin && (
        <Link href="/admin" style={{ textDecoration: 'none' }}>
          <a style={styles.adminLink}>⚙️ Administração</a>
        </Link>
      )}
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '20px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '30px',
    color: '#1f2937',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  } as React.CSSProperties,
  card: {
    padding: '20px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textDecoration: 'none',
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    border: '2px solid transparent',
  } as React.CSSProperties,
  cardAtivo: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
  } as React.CSSProperties,
  cardInativo: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    opacity: 0.7,
  } as React.CSSProperties,
  cardEmBreve: {
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  } as React.CSSProperties,
  emoji: {
    fontSize: '32px',
    marginBottom: '12px',
  } as React.CSSProperties,
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
    color: '#1f2937',
  } as React.CSSProperties,
  cardDesc: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '12px',
    flex: 1,
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.1)',
    color: '#374151',
  } as React.CSSProperties,
  adminLink: {
    display: 'inline-block',
    padding: '12px 20px',
    backgroundColor: '#1f2937',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
  } as React.CSSProperties,
}
