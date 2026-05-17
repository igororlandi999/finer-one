# Estado do Projeto — Finer One (Front-end)

Documento de referência técnica do protótipo. Atualizado em 16 Mai 2026.

---

## 1. Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Build | Vite | 5.4 |
| UI | React | 18 |
| Estilos | TailwindCSS | 3.x |
| Gráficos | Recharts | 2.x |
| Ícones | lucide-react | última |
| Linguagem | JavaScript (JSX) | ES2022 |

Sem TypeScript, sem state management externo, sem router externo. Decisões intencionais para manter o protótipo simples e rápido de evoluir.

---

## 2. Estrutura de pastas

```
finer-one/
├── docs/                          # Documentação
│   ├── demo-roteiro.md
│   └── estado-do-projeto.md
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx                   # Entry point
    ├── App.jsx                    # Mapa de telas (SCREENS → Componente)
    ├── index.css                  # Tokens Tailwind + utilities customizadas
    │
    ├── config/
    │   └── planConfig.js          # Fonte única: 4 planos × 17 telas
    │
    ├── context/
    │   └── PlanContext.jsx        # State global: plano ativo, tela ativa, navegação
    │
    ├── data/
    │   └── mockData.js            # Todos os dados mockados da Overcel
    │
    ├── lib/
    │   └── format.js              # formatEUR, formatEURCompact, formatNumber (pt-PT)
    │
    ├── layouts/
    │   ├── AppShell.jsx           # Sidebar + main + banner de demo
    │   ├── Sidebar.jsx            # Menu dinâmico baseado no plano ativo
    │   └── PageHeader.jsx         # Cabeçalho padrão (título + subtítulo + ações)
    │
    ├── components/
    │   ├── ui/
    │   │   ├── MetricCard.jsx     # Card de KPI com delta
    │   │   ├── AlertCard.jsx      # Card de alerta por severidade
    │   │   ├── StatusBadge.jsx    # Badge de estado (Saudável/Atenção/Crítico)
    │   │   ├── PlanBadge.jsx      # Selo do plano atual
    │   │   ├── DataTable.jsx      # Tabela com tabs, pesquisa, paginação
    │   │   └── DemoBanner.jsx     # Banner do modo demonstração
    │   ├── charts/
    │   │   ├── ChartCard.jsx
    │   │   └── DonutCategoryCard.jsx
    │   └── diagnostic/
    │       └── DiagnosticGauge.jsx
    │
    └── pages/                     # 17 telas oficiais + Placeholder
        ├── Resumo.jsx
        ├── DiagnosticoFinanceiro.jsx
        ├── Movimentos.jsx
        ├── Receitas.jsx
        ├── Despesas.jsx
        ├── ClientesFornecedores.jsx
        ├── Documentos.jsx
        ├── PerformanceFinanceira.jsx
        ├── PlaneamentoCashflow.jsx
        ├── Indicadores.jsx
        ├── FinerScore.jsx
        ├── BenchmarkingSetor.jsx
        ├── Relatorio.jsx
        ├── Alertas.jsx
        ├── AlertasPreditivos.jsx
        ├── IAFinanceira.jsx
        ├── ChatFinanceiro.jsx
        └── Placeholder.jsx
```

---

## 3. Telas implementadas (17/17)

Todas as 17 telas oficiais estão implementadas, mapeadas em `App.jsx` e acessíveis pela sidebar conforme o plano ativo.

| # | Tela | Plus | Pro | Team | Enterprise |
|---|---|---|---|---|---|
| 1 | Resumo | ✓ | ✓ | ✓ | ✓ |
| 2 | Diagnóstico Financeiro | ✓ | ✓ | ✓ | ✓ |
| 3 | Movimentos | — | ✓ | ✓ | ✓ |
| 4 | Receitas | ✓ | ✓ | ✓ | ✓ |
| 5 | Despesas | ✓ | ✓ | ✓ | ✓ |
| 6 | Clientes e Fornecedores | ✓ | ✓ | ✓ | ✓ |
| 7 | Documentos | ✓ | ✓ | ✓ | ✓ |
| 8 | Performance Financeira | ✓ | ✓ | ✓ | ✓ |
| 9 | Planeamento e Cashflow | — | ✓ | ✓ | ✓ |
| 10 | Indicadores | — | ✓ | ✓ | ✓ |
| 11 | Finer Score | — | — | ✓ | ✓ |
| 12 | Benchmarking do Setor | — | — | — | ✓ |
| 13 | Relatório | — | ✓ | ✓ | ✓ |
| 14 | Alertas | ✓ | ✓ | — | — |
| 15 | Alertas Preditivos | — | — | ✓ | ✓ |
| 16 | IA Financeira | — | — | ✓ | ✓ |
| 17 | Chat Financeiro | ✓ | ✓ | ✓ | ✓ |
| **Total** | | **9** | **13** | **15** | **16** |

---

## 4. Como rodar localmente

Requisitos: **Node 18+** e **npm**.

```bash
# 1. Descompactar / clonar o projeto
cd finer-one

# 2. Instalar dependências
npm install

# 3. Servidor de desenvolvimento (porta 5173)
npm run dev

# 4. Abrir http://localhost:5173 no browser
```

---

## 5. Como fazer build

```bash
# Build de produção (gera /dist)
npm run build

# Pré-visualizar o build localmente
npm run preview
```

O build atual gera:
- `dist/index.html` (~0.66 kB)
- `dist/assets/index-*.css` (~30 kB)
- `dist/assets/index-*.js` (~779 kB / ~203 kB gzip)

Aviso esperado: chunk JS acima de 500 kB (Recharts). Não é bloqueante.

---

## 6. Como publicar

O `/dist` é puramente estático. Pode ser servido por qualquer um destes:

- **Vercel** — `vercel deploy` na raiz do projeto.
- **Netlify** — drag-and-drop do `/dist` ou ligar repositório.
- **Cloudflare Pages** — `npm run build` + servir `/dist`.
- **GitHub Pages** — depois de ajustar `vite.config.js` com `base: '/repo-name/'`.
- **Servidor próprio** — qualquer servidor HTTP estático (nginx, caddy, etc).

Não há variáveis de ambiente, sem secrets, sem backend a configurar.

---

## 7. Convenções do código

- **Língua:** Português europeu em UI e comentários. Identificadores em inglês.
- **Moeda:** Sempre `formatEUR()` ou `formatEURCompact()` de `lib/format.js`. Nunca formatar inline.
- **Dados:** Sempre importar de `data/mockData.js`. Nunca inventar dados locais.
- **Cores:** Apenas via tokens do Tailwind (`brand-*`, `slate-*`, `rose-*`, `amber-*`, `sky-*`). Sem hex inline para identidade da marca.
- **Sem emojis** na UI (exceto sparkles/ícones lucide, que são SVG).
- **Componentes:** Page-specific dentro do próprio ficheiro. Apenas extrair para `components/` se for reutilizado em 2+ páginas.

---

## 8. Pendências técnicas reais

1. **Bundle JS > 500 kB** — Recharts é a maior dependência. Solução futura: `manualChunks` em `vite.config.js` para separar vendor de app, ou code-splitting por rota se passarmos a usar router real.
2. **Sem rotas reais (sem URL por tela)** — A navegação vive em memória via `PlanContext`. Para SEO ou partilha de links será necessário adoptar React Router. Não é prioridade no protótipo.
3. **Acessibilidade ainda básica** — Foco visível ok, mas falta auditoria com leitor de ecrã, labels ARIA em alguns botões de ícone, e contraste em alguns muted text.
4. **Mobile não otimizado** — Os layouts respondem em tablet (≥768px), mas em telemóvel (<640px) algumas tabelas sofrem. Decisão consciente: o público-alvo usa desktop.
5. **Sem testes automatizados** — Protótipo visual. Quando passar a MVP, introduzir Vitest + React Testing Library.
6. **Estado do banner de demo não persiste** — Reaparece em cada refresh. Aceitável para protótipo; trivial de mover para localStorage se for incómodo.

---

## 9. Próximos passos técnicos sugeridos

Quando avançar para MVP real, sugere-se esta ordem:

1. **Adoptar React Router** e dar URL a cada tela.
2. **Migrar para TypeScript** (sem refazer — adoção incremental).
3. **Separar dados mockados em ficheiros por domínio** (`receitas.mock.js`, `cashflow.mock.js`, etc) para preparar a transição para API real.
4. **Camada de serviços** — todos os ecrãs passam a importar de `services/`, não diretamente de `data/`. Trocar `data/` por `services/` que falam com API é trivial nesse momento.
5. **Backend** — Node.js + PostgreSQL + Prisma é a stack mais natural dada esta base.
6. **Open Banking** — SIBS API Market (Portugal) ou Tink/Plaid para mercado europeu mais amplo.
7. **Autenticação** — Auth0, Clerk ou Supabase Auth (qualquer um serve, escolher pelo preço).
8. **Observabilidade** — Sentry para erros + PostHog para analytics de produto desde o dia 1.

---

## 10. Conclusão

O protótipo está num estado **apresentável e estável**, com **17/17 telas funcionais**, navegação por plano validada e build limpo. É adequado para:

- Demonstrações a sócios e potenciais clientes.
- Validação de proposta de valor com PME-alvo.
- Material para conversas com investidores em fase pré-seed.

Não é adequado para:

- Lançamento comercial (faltam todas as componentes server-side).
- Recolha de dados reais (não há persistência).
- Operação como produto pago.
