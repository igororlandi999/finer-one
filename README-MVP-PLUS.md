# Finer One — MVP Plus

CFO digital inteligente para PME. Este documento descreve o estado do MVP Plus: o que funciona com dados reais, o que é demonstração, e como executar o projeto.

---

## O que o MVP faz hoje

Ligado ao Bling ERP da Overcel (empresa piloto), o Finer One entrega:

- **Visão financeira real**: receitas, despesas e resultado do mês, com variações honestas (ocultas quando não há base de comparação).
- **Alertas reais**: contas vencidas, pagamentos a vencer em 7 dias, despesas em forte subida, muitas contas pendentes, concentração em categoria/fornecedor, quebra de faturação, dependência de cliente, produto em queda.
- **Diagnóstico Financeiro real**: Finer Score determinístico (0-100) com penalizações documentadas, estado da empresa, problemas identificados, ações recomendadas com prazos e resumo executivo.
- **Plano de Ação**: modal com os passos priorizados derivados do diagnóstico.
- **Chat Financeiro**: assistente que responde 10+ perguntas com os números reais da empresa (motor determinístico, sem IA externa), incluindo a explicação ponto a ponto do score. Perguntas fora do repertório e temas sem base (cashflow, saldo bancário, IVA) recebem resposta de limitação honesta.
- **IA Financeira**: painel proativo com os alertas mais graves, problema principal, recomendações e perguntas que abrem o chat já respondidas.
- **Exportação CSV real**: Receitas, Despesas, Fornecedores em aberto e Alertas (Excel pt-PT: BOM UTF-8, separador ";").
- **Recalcular real**: Diagnóstico e Finer Score recarregam os dados do Bling ao vivo.

Princípio central do produto: **todo número exibido é real ou está marcado com o selo "Demo"**. Nenhum histórico, variação, previsão, saldo bancário ou impacto financeiro é inventado.

## Dados reais vs Demo (resumo)

- **Reais**: pedidos de venda e contas a pagar do Bling (com categorias de despesa reais), e tudo que deriva deles: KPIs, alertas, score, diagnóstico, respostas do chat, exports.
- **Demo (selado)**: saldo bancário e cashflow previsto (exigem Open Banking), recebíveis de clientes com vencimento, histórico de score, demonstrações contábeis (DRE/balanço/fluxos), documentos, e as telas de vitrine dos planos Pro/Team (Movimentos, Planeamento, Indicadores, Relatórios, Benchmarking, Alertas Preditivos).

O detalhe tela a tela está em `MAPA-REAL-DEMO.md`.

## Como rodar localmente

```
npm install
npm run dev
```

Abre em `http://localhost:5173/finer-one/` (ou porta seguinte livre). Com o backend acessível, o app carrega os dados reais e mostra o banner "Dados reais conectados ao Bling"; sem backend, degrada para modo demonstração com o banner correspondente.

## Build

```
npm run build
```

Saída em `dist/`. Aviso conhecido e aceito: o chunk do Recharts excede 500 kB (ver `BACKLOG-TECNICO.md`).

## Deploy

```
npm run deploy
```

Publica no GitHub Pages. O `vite.config.js` usa `base: "/finer-one/"` — manter esse caminho se o repositório mudar de nome.

## Integrações existentes

Fluxo de dados: **Front (React) → Vercel Proxy → Google Apps Script → Bling API v3**

1. **Bling ERP v3** — fonte dos pedidos de venda e contas a pagar.
2. **Google Apps Script** — backend de integração: OAuth 2.0 com refresh tokens rotativos, paginação, resolução de categorias e contatos, e snapshot em Google Drive para hidratação dos títulos.
3. **Vercel Proxy** — resolve CORS entre o front e o Apps Script.

## Arquitetura do front (para desenvolvedores)

- `src/services/blingDataService.js` — **única fronteira** entre dados crus do Bling e o formato Finer One. `buildSalesDataset` monta `sales` (receitas, despesas, clientes, fornecedores, resumo, alertas, diagnostico).
- `src/utils/` — lógica pura: `financialCalculations`, `expenseCalculations`, `alertsEngine`, `diagnosticsEngine`, `chatEngine`, `csvExport`. Nenhum cálculo de negócio vive em JSX.
- `src/context/FinerDataContext.jsx` — expõe `{ sales, loading, source, reload }`. `source === "api"` indica dados reais; `reload` alimenta os botões Recalcular.
- `src/data/mockData.js` — fallback demo; nunca é modificado.
- Contrato de fallback: cada dataset real é `null` quando indisponível → a tela usa mock e o selo Demo aparece automaticamente.
- Convenção de código: arquivos com CRLF; UI em português europeu; sem emojis.
