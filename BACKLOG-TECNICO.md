# Backlog Técnico — Finer One MVP Plus

Itens conhecidos, classificados por prioridade. Nenhum é bloqueante para a demo; todos foram identificados nas auditorias desta fase.

---

## 1. Consolidação de helpers duplicados (baixa, mecânica)
Funções privadas idênticas repetidas entre módulos:
- `eur` — 3 cópias (alertsEngine, diagnosticsEngine, chatEngine)
- `startOfDay` — 3 cópias (expenseCalculations, alertsEngine, diagnosticsEngine)
- `pct` — 2 cópias (diagnosticsEngine, chatEngine)
- `prevMonthKey` (blingDataService) ≡ `prevKeyOf` (diagnosticsEngine)

Plano já mapeado: exportar as quatro de `financialCalculations.js` copiando byte a byte uma implementação (garante saída de texto idêntica) e trocar as cópias por imports em 6 arquivos. Nota: não unificar com `formatEUR` de `lib/format` sem verificar igualdade de formatação (risco de alterar textos).

## 2. Alerta G — crescimento de categoria de despesa vs mês anterior (baixa)
Ficou fora dos alertas A-F por exigir helper novo de "despesas por categoria por mês". Especificação: disparar quando uma categoria subir ≥ +50% MoM com valor relevante; excluir "Sem categoria". Entrar em `alertsEngine.buildExpenseAlerts` com id `d-cat-mom`.

## 3. Code splitting do bundle (baixa)
Aviso permanente do build: chunk > 500 kB (Recharts). Opções: `manualChunks` no rollup separando Recharts, ou lazy-load das telas com gráficos. Sem impacto funcional; melhora o primeiro carregamento.

## 4. Ações secundárias restantes (baixa, UX)
Deixadas conscientemente sem ação:
- "Ver plano" por alerta em Alertas Preditivos (vitrine demo Team — decisão: não degradar a apresentação).
- Ações de linha na tabela de Documentos ("Descarregar", "Mais opções") — cobertas pelo selo da listagem.
- Redesenho honesto do bloco "Fatores que impactam o score" no Finer Score (as barras 0-100 por dimensão não têm equivalente no modelo real; hoje mock + Demo).

## 5. Testes (média, estrutural)
- Não existem testes automatizados; a qualidade é sustentada por smoke tests de sessão (engines) e pelo teste manual de ponta a ponta (ver `DEMO-CHECKLIST.md`).
- Recomendação para a próxima fase: transformar os smoke tests dos engines (diagnostics, alerts, chat, resumo, csv) em testes de unidade permanentes — os cenários já foram escritos durante o desenvolvimento e estão descritos nos históricos das missões.
- Teste manual obrigatório após cada mudança: `npm run build` + fluxo Diagnóstico → pergunta → Chat.

## 6. Riscos conhecidos (documentar, monitorar)
- **Dependência do Apps Script**: limites de execução/cota do Google e rate limit do Bling (3 req/s); o snapshot em Drive mitiga, mas o primeiro carregamento do dia pode ser mais lento.
- **Divergência de mês de referência**: "Despesas (Mês)" do Resumo (mês âncora das receitas) pode diferir do "Total Despesas" da tela Despesas (último mês com despesas) quando os meses divergem. Documentado em código; é o preço de um Resultado coerente.
- **Contagem de alertas**: a tela Alertas mostra reais + mock não-comercial; Chat, IA e CSV usam só os reais. Intencional e selado, mas pode gerar pergunta de usuário.
- **Alerta de vencidas com histórico completo**: o snapshot cobre todo o passado; títulos antigos em aberto contam como vencidos (correto, mas a contagem pode ser alta até sanear a base).
- **CSV em formato pt-PT** (`;` + vírgula decimal): perfeito para Excel PT; ferramentas configuradas para formato US podem ler decimais como texto. Trade-off consciente.
- **CRLF**: os fontes usam CRLF; scripts de edição automatizada devem usar `\r\n` explícito (lição operacional da fase).
- **Sessão de handoff**: se o usuário clicar numa pergunta sugerida e sair do Chat antes dos dados carregarem, a pergunta dispara na próxima visita ao Chat na mesma aba (one-shot preservado; comportamento aceitável e documentado).
