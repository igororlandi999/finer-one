# Backlog Técnico — Finer One MVP Plus

Estado do backlog após o fechamento da fase: os quatro itens técnicos mapeados nas auditorias foram resolvidos. Restam apenas ações secundárias de UX, opcionais futuros registrados e riscos a monitorar. Nenhuma pendência é bloqueante.

---

## Resolvidos nesta fase

### 1. Consolidação de helpers duplicados — RESOLVIDO
As 7 duplicações (`eur` x3, `startOfDay` x3, `pct` x2, `prevMonthKey`/`prevKeyOf` x2) foram consolidadas em exports canónicos de `financialCalculations.js`, com corpos copiados byte a byte e imports trocados em `alertsEngine`, `diagnosticsEngine`, `chatEngine` (via alias `prevMonthKey as prevKeyOf`), `expenseCalculations` e `blingDataService`. Saída idêntica provada pelos testes. Nota mantida: `formatEUR` de `lib/format` (camada de UI) permanece separado de propósito; unificação futura exigiria prova de formatação idêntica.

### 2. Alerta G — categoria de despesa em forte subida (d-cat-mom) — RESOLVIDO
Implementado em `buildExpenseAlerts` (bloco G): compara despesas por categoria no mês analisado vs anterior; ignora "Sem categoria"; exige valor anterior > 0 e atual ≥ 500 €; dispara com crescimento ≥ 50%; um único alerta warning citando a categoria de maior crescimento. Coberto por 3 testes dedicados. Aparece automaticamente em Alertas, CSV, IA Financeira e Chat (todos consomem `sales.alertas.list`).

### 3. Testes automatizados — RESOLVIDO (base mínima criada)
Vitest + happy-dom instalados; scripts `npm test` / `npm run test:watch`; **36/36 testes verdes** em 5 arquivos: `csvExport` (formato, escaping, BOM, CRLF), `diagnosticsEngine` (guardas, clamp do score, scorePrevious null, ações sem € inventado), `alertsEngine` (quebra de faturação, vencidas, a vencer, d-cat-mom), `chatEngine` (score com penalizações, limitações honestas, fallback sem números) e `blingDataService` (gating de payables, campos mortos ausentes). Datas simuladas fixas garantem determinismo. Rotina recomendada: `npm test` antes de todo commit.

### 4. Code splitting do bundle — RESOLVIDO
`manualChunks` (forma de função) no `vite.config.js` separando o grafo do Recharts (recharts + d3-* + victory-vendor, ~434 kB) e o runtime do React (~142 kB) do chunk da aplicação (~257 kB). O aviso de chunk > 500 kB desapareceu sem tocar em `chunkSizeWarningLimit`; cache entre deploys melhorou (hashes das libs só mudam quando elas mudarem); `dist/index.html` referencia os chunks com o base `/finer-one/` correto e `modulepreload`.

---

## Pendente

### 5. Ações secundárias de UX / vitrine (baixa)
Deixadas conscientemente sem ação, decisões documentadas:
- "Ver plano" por alerta em Alertas Preditivos — vitrine demo Team; não desativar para não degradar a apresentação.
- Ações de linha na tabela de Documentos ("Descarregar", "Mais opções") — cobertas pelo selo Demo da listagem.
- Redesenho honesto do bloco "Fatores que impactam o score" no Finer Score — as barras 0-100 por dimensão não têm equivalente no modelo real; hoje mock + DemoTag.

---

## Opcionais futuros (registrados, não planejados)

- **React.lazy por página** no `App.jsx` para reduzir o carregamento inicial. Ressalvas: ganho limitado porque a home (Resumo) já usa Recharts; exige fallback de `Suspense` (mudança de comportamento visual sutil na primeira visita a cada tela); avaliar apenas se o tempo de primeiro carregamento virar problema real medido.
- **Unificação `eur` ↔ `formatEUR`** — só com prova de saída byte a byte idêntica.
- **Promover smoke visual da demo a rotina** — o fluxo de teste de ponta a ponta (checklist da demo) pode virar roteiro fixo de release.

---

## Riscos conhecidos (monitorar)

- **Dependência do Apps Script**: limites de execução/cota do Google e rate limit do Bling (3 req/s); o snapshot em Drive mitiga, mas o primeiro carregamento do dia pode ser mais lento.
- **Divergência de mês de referência**: "Despesas (Mês)" do Resumo (mês âncora das receitas) pode diferir do "Total Despesas" da tela Despesas (último mês com despesas) quando os meses divergem. Documentado em código; é o preço de um Resultado coerente.
- **Contagem de alertas**: a tela Alertas mostra reais + mock não-comercial; Chat, IA e CSV usam só os reais. Intencional e selado, mas pode gerar pergunta de usuário.
- **Alerta de vencidas com histórico completo**: títulos antigos em aberto contam como vencidos (correto, mas a contagem pode ser alta até sanear a base).
- **CSV em formato pt-PT** (`;` + vírgula decimal): perfeito para Excel PT; ferramentas em formato US podem ler decimais como texto. Trade-off consciente.
- **CRLF/LF mistos nos fontes**: a maioria é CRLF; `chatEngine.js` e `expenseCalculations.js` são LF. Scripts de edição automatizada devem respeitar o line ending de cada arquivo.
- **Sessão de handoff**: pergunta sugerida clicada antes dos dados carregarem dispara na próxima visita ao Chat na mesma aba (one-shot preservado; aceitável e documentado).
