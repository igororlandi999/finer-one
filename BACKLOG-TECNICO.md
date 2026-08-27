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
---

## C7F.3 — DÍVIDA APURADA NA INVESTIGAÇÃO DO PIPELINE (22/08/2026)

Itens verificados **no código**, não presumidos. Ordem por risco, não por esforço.

### P0 — risco de dado incorreto

**P0.1 · `closedThroughMonth` é mantido à mão e está desatualizado.**
`src/config/company.js` declara `"2026-06"`. Estamos em agosto e julho terminou.
**Auditado em 22/08/2026** com os motores reais sobre dados reais
(`diagnostico/julhoElegibilidade.mjs`). Conclusão: **julho ainda NÃO pode substituir
junho**, e a razão não é o calendário — é o CMV.

Com `closedThroughMonth: "2026-07"`, julho fica assim:

| Linha | Disponibilidade | Julho |
|---|---|---|
| receita bruta | `real` | 172 899,40 |
| total de deduções | `real` | 20 882,02 |
| receita líquida | `real` | 152 017,38 |
| **CMV** | **`unavailable`** | **null** |
| **lucro bruto** | **`unavailable`** | **null** |
| despesas operacionais | `partial` | 12 127,28 |
| **EBITDA** | **`unavailable`** | **null** |
| **resultado líquido** | **`unavailable`** | **null** |

O documento de ajustes manuais tem entrada para `2026-06` e **não tem para `2026-07`**.
Sem CMV não há lucro bruto, e sem lucro bruto não há EBITDA nem resultado líquido — o
motor emite `cmv-indisponivel` e `buildMonthlyClosing` devolve `status: "incomplete"`
com `missingItems: ["cmv"]`. Antecipar o fecho mostraria uma DRE cujas três linhas de
resultado são `null`.

As despesas operacionais saem `partial` por um segundo motivo, menor e resolúvel:
**3 títulos de julho sem categoria reconhecida** ficam fora da DRE. Auditados em
23/08/2026 (`diagnostico/julhoNaoClassificados.mjs`):

| id | valor | categoria no Bling | histórico | natureza |
|---|---|---|---|---|
| 26256508150 | 200,00 | «Custo dos serviços prestados» | «Ref. montagem mesas escritório.» | **lacuna de REGRA** |
| 26319592678 | 236,35 | «Taxas pagas» | «Ref. Encargos PFSP (prefeitura).» | **lacuna de REGRA** |
| 26281773247 | 1 118,00 | «Sem categoria» (`categoriaId: 0`) | «Ref. mão de obra alarme + DVR» | **lacuna de DADO** |

Total **1 554,35** — 12,8 % das despesas operacionais de julho (12 127,28).

**São dois problemas diferentes, com donos diferentes.** Dois títulos têm categoria real
no Bling que `classifyPayable` não reconhece: é lacuna das regras, resolúvel em código.
O terceiro tem `categoriaId: 0` e o rótulo «Sem categoria» — é o marcador do Bling para
ausência: nenhuma regra o pode resolver, só quem lança o título.

**Nenhuma categoria foi atribuída.** Classificar «Taxas pagas» como imposto ou
«Custo dos serviços prestados» como CMV seria inventar contabilidade — e as duas escolhas
mudam linhas diferentes da DRE. A decisão é do utilizador.

**Impacto isolado:** afeta `despesasOperacionais` (→ `partial`), não a cobertura temporal
(`coberturaPayables` continua `real`). Hoje EBITDA e resultado líquido estão
`unavailable` por falta de **CMV**, não por isto; resolvido o CMV, estes 3 títulos
fariam o EBITDA sair `partial` em vez de `real`.

**Ordem correta das operações:** lançar o CMV de julho nos Ajustes Manuais e classificar
os 3 títulos → só então mudar `closedThroughMonth` para `"2026-07"`. A configuração é a
última peça, não a primeira.

✅ **RESOLVIDO NA CAUSA (24/08/2026).** A ordem acima estava certa — e era exatamente o
problema: **o passo 1 era impossível**, porque a Finer One nunca pedia o CMV de julho.
Enquanto julho estava acima de `closedThroughMonth`, a sua receita era `partial`, a
aplicabilidade do CMV ficava indeterminada, e o item saía `pending` em vez de `missing`.
Sem pendência não havia CTA, sem CTA ninguém lançava o CMV, e sem CMV nada justificava
avançar a configuração. O desbloqueio exigia editar código — a inversão que o produto
não pode ter.

A correção separou os dois eixos que `closedThroughMonth` colapsava
(`docs/MONTHLY_CLOSING_CONTRACT.md`):

- `completeThroughMonth` — cobertura da FONTE, deriva do calendário para os pedidos;
- `validatedThroughMonth` — validação HUMANA, informativa e **sem poder de calar nada**.

Julho passou a `incomplete` com `missingItems: ["cmv"]`, aparece em *Dados a completar*
como "1 dado por preencher" e gera alerta `danger`. **E nenhum número mudou:** a âncora
dos KPIs passou a ser o último mês *financeiramente completo* (`latestCompleteMonthKey`),
pelo que junho continua a responder pela rentabilidade enquanto julho não tiver CMV — que
é precisamente o que o aviso «não avançar para `2026-07` como atalho» protegia.

**O que continua por fazer, e agora é a única coisa que falta:** lançar o CMV de julho.
Deixou de ser uma questão de arquitetura e passou a ser uma decisão financeira — que é
onde devia estar. Os 3 títulos por classificar continuam a ser um problema distinto
(§10 do contrato): não são requisito de fecho, e não impedem julho de fechar.

---

**P0.1-bis · `closedThroughMonth: null` NÃO faz o que a documentação promete.** *(novo,
22/08/2026 — corrige uma afirmação errada desta secção)*

`company.js` documenta que deixar o campo a `null` «faz o motor assumir que só o mês
anterior ao atual está fechado». **É falso em produção.** Em `sourceAvailability`:

```js
const limiteFechado = cov.closedThroughMonth || previousMonthKey(monthKeyOf(referenceDate));
```

`monthKeyOf(undefined)` devolve `null`, logo `previousMonthKey(null)` devolve `null`, e
a guarda `if (limiteFechado && mk > limiteFechado)` é **saltada por inteiro**: todos os
meses passam a `real`. O recuo para o mês anterior só existe quando `referenceDate` é
injetada — e `buildSalesDataset` chama `latestUsableFinancialMonth` **sem** a injetar
(`blingDataService.js:720-721`).

Consequência medida: com `null`, o mês âncora da DRE não vai para julho — vai para
**2027-07**, um mês que só existe porque há contas a pagar com vencimento futuro.

Isto **refuta** o que a auditoria anterior registou aqui («com `"2026-07"` **ou com
`null`**, o mês de referência passa a julho»). A ironia registada antes — a de que o
valor manual estaria a ser mais conservador do que a ausência de configuração — não se
verifica: a ausência de configuração é **muito pior**, não melhor.

Duas correções possíveis, ambas por decidir:
1. `buildSalesDataset` passa a injetar `referenceDate` — o `null` passaria a fazer o que
   está documentado;
2. `sourceAvailability` trata `limiteFechado == null` como "nada está fechado" em vez de
   "tudo está fechado" — mais seguro por omissão, mas muda o comportamento de quem
   passa `EMPTY_COVERAGE`.
Enquanto nenhuma for feita, **nunca deixar `closedThroughMonth` a `null`**.

✅ **RESOLVIDO (24/08/2026) — as DUAS correções foram aplicadas**, porque são
complementares e nenhuma sozinha chegava:

- **(2)** `sourceAvailability` devolve `partial` quando não consegue determinar limite.
  O motor passou a ser seguro sozinho, sem depender da cortesia de quem o chama.
- **(1)** `buildSalesDataset` injeta `referenceDate` em todas as âncoras — uma só leitura
  do relógio por dataset. Sem ela, (2) seria conservadora demais: nenhum mês seria real.

Consequência: `completeThroughMonth: null` passou a significar o que a documentação
sempre prometeu — *deriva do calendário* — e é agora o valor **recomendado** para os
pedidos. A frase «nunca deixar a `null`» acima está obsoleta e foi removida de
`company.js`.

Testes: `coverageContract.test.js` (os 5 blocos «DEFEITO» foram invertidos
deliberadamente) e `fechoContratoNovo.test.js`.

**P0.2 · Snapshot parcial e snapshot fresco indistinguíveis na UI.** ✅ **RESOLVIDO
(22/08/2026).**
`src/utils/dataHealth.js` compõe os dois eixos sem os fundir: `freshness`
(fresh/warning/stale/unknown, reutilizado de `dataFreshness.js`) × `completeness`
(complete/partial/unknown, lido de `meta.parcial`). Não há enum combinatório: há uma
`severidade` de apresentação derivada, e a regra que a governa é que **PARTIAL nunca
sai `neutra`**, por mais fresco que o snapshot seja.
`components/ui/DataHealth.jsx` substitui `DataFreshness.jsx` (removido, sem consumidores)
e o `AppShell` passa `sales.meta` inteiro em vez de só `geradoEm` — era essa a raiz do
defeito. 35 testes, incluindo a guarda estrutural que falha se o AppShell voltar a
passar apenas a data.

**P0.3 · «Mês em curso» resolvia para o mês mais TARDIO.** ✅ **CORRIGIDO (23/08/2026).**

A página Resumo exibia, com dados reais: «Mês de referência: 2026-06 · **2027-07 em
andamento**». Onze meses no futuro. `latestUsableFinancialMonth({allowPartial:true})`
percorria os meses do fim para o princípio e aceitava o primeiro `real` **ou** `partial`
— e tudo depois do fecho é `partial`, incluindo meses que só existem por vencimentos
futuros de contas a pagar (o snapshot vai até 2027-07).

**Correção:** `latestUsableFinancialMonth` ganhou um **teto civil** — meses posteriores ao
mês de referência nunca são candidatos. Um mês que ainda não começou não está fechado nem
está em curso: não é utilizável em nenhum dos dois sentidos que a função serve.

**Garantia que autorizou a mudança**, verificada sobre dados reais antes e depois:

| | antes | depois |
|---|---|---|
| `mesFechado` | 2026-06 | **2026-06** (inalterado) |
| `mesEmCurso` | 2027-07 | **2026-08** |

Os restantes 1117 testes da suíte continuaram verdes na primeira execução após a
alteração; falharam **apenas** os 3 caracterizadores que documentavam o defeito, que
foram então atualizados de propósito. Confirmado na app: o Resumo passou a mostrar
«2026-08 em andamento».

Caracterizado e protegido em `src/utils/coverageContract.test.js` e
`src/utils/invariantesFinanceiros.test.js`.

**Auditoria transversal (23/08/2026):** as outras duas derivações de mês do projeto **já
se protegiam** — `closedMonthKeys` deriva do calendário e `latestRevenueMonthAtOrBefore`
filtra por `<= limite`, com o comentário «nunca meses futuros». O padrão certo já existia;
o buraco era a única função que percorria os **dados** em vez do **calendário**. A
consistência entre as três está agora fixada por teste, para que a próxima função que
escolha meses tenha um sítio óbvio onde provar que também se protege.

### P1 — confiabilidade e operação

**P1.1 · Recurso desconhecido cai no ramo por omissão e devolve PEDIDOS.**
`?recurso=despesass` responde `200` com o snapshot de pedidos. Mascara erros de
integração e é uma armadilha para quem depurar.
Contrato proposto: `{ error: true, code: "RECURSO_DESCONHECIDO" }`.
Compatibilidade a provar antes de publicar: o pedido **sem** `?recurso` tem de continuar
a devolver pedidos (é o contrato do recurso principal, não um fallback); o front já
trata `data` não-array como ausência e `manualInputsService` tem guarda explícita para
este caso concreto, o que sugere migração segura — mas exige teste antes de ir a
produção.

**P1.2 · Apps Script sem versionamento efetivo.** **DESTRAVADO (23/08/2026), por
concluir.** A colisão da P1.3 deixou de bloquear o clone. Auditoria de segredos feita:
`.clasp.json` só tem `scriptId`, `appsscript.json` não tem segredos, os únicos literais
de credenciais são placeholders com guarda, e as credenciais reais vivem em Script
Properties — que o `clasp` nunca puxa. **`apps-script/` é seguro para versionar.**
Falta o `git add` e o primeiro `clasp push` deliberado.

**P1.3 · Ficheiro duplicado no Apps Script.** ✅ **RESOLVIDO (23/08/2026).**
`Testecategoriasdespesas.gs` foi removido do remoto pelo editor web; sobreviveu
`TesteCategoriasDespesas.gs`. Antes de remover, confirmado: conteúdo byte-a-byte
idêntico (`sha256:69047e6f32380093…`), **nenhuma escrita**, **nenhum segredo**, e uma só
chamada de rede (`GET /categorias/receitas-despesas`).

Pós-remoção: remoto com **15** ficheiros (era 16), **0** grupos de conteúdo idêntico,
**0** colisões case-insensitive. Os quatro recursos respondem e não há erros de
carregamento nas Execuções. Re-clone limpo: **15 no remoto = 15 em disco**, com os 15
hashes a conferir. `apps-script/` representa agora 100 % do projeto.

Detalhe que valeu a correção: o `clasp pull` **não** basta sozinho — o nome antigo em
minúsculas continuava em disco e o NTFS reescrevia-o. É preciso limpar os fontes antes
de puxar.

Registo completo: `docs/APPS_SCRIPT_SOURCE_OF_TRUTH.md`.

**P1.4 · Limiares de frescura duplicados.** ✅ **PROTEGIDO (23/08/2026).**
A duplicação **mantém-se, de propósito**: a ferramenta de operação tem de correr sem
importar a app — se importasse, deixaria de poder diagnosticar uma app que não arranca,
que é exatamente quando mais faz falta. O que mudou é que a divergência deixou de ser
silenciosa: `src/utils/operacaoContrato.test.js` (14 testes) falha se os limiares, os
nomes dos estados ou a regra de completude deixarem de coincidir entre
`dataFreshness.js` / `dataHealth.js` e `check-data-pipeline.mjs`.
Cobre também as garantias da ferramenta: só GET, nunca imprime a query string, e não se
apresenta como veredito financeiro.

### P2 — arquitetura

**P2.1 · Cobertura histórica é configuração, devia ser derivada.**
`firstCompleteMonth`, `partialMonths` e `closedThroughMonth` são manuais e por empresa:
uma empresa nova exige edição de código, e um ERP diferente exigiria outra semântica.
Evolução mínima ERP-agnóstica proposta:
1. o backend declara `meta.periodo = { de, ate }` por fonte — o rebuild **já** conhece a
   janela e regista-a no log (`Rebuild | pedidos na janela X a Y`);
2. o fecho contabilístico migra de `company.js` para o documento de ajustes manuais no
   Drive, onde já existe manutenção humana mensal — deixa de ser código e passa a ser
   dado operacional;
3. `meta.parcial === true` passa a **vetar** declarar qualquer mês como real.
`sourceAvailability` mantém assinatura e semântica; muda apenas a origem da `coverage`.

**P2.2 · Cobertura por fonte existe mas está por usar.**
`coverage.payables` está previsto e comentado em `company.js`. Os três snapshots têm
janelas e cadências independentes, portanto o modelo correto é por fonte, não global.

### P3 — UX e limpeza

**P3.1 · `resolveManualInputsView` não tem consumidor.** Reconfirmado em 23/08/2026:
zero usos fora do próprio ficheiro e dos seus 12 testes.

*Deliberadamente NÃO removido nesta sessão.* Apagar código que funciona e está testado é
uma decisão de produto, não de limpeza: ou a função é API pública que ainda não tem
cliente, ou é resíduo. Quem sabe isso é quem a escreveu. O que a limpeza mecânica faria
era destruir 12 testes e uma superfície pensada, sem que ninguém tivesse decidido nada.
Fica registado à espera dessa decisão — a dívida é a indefinição, não as linhas.

**P3.2 · ~~`payablesByMonth` não tem consumidor~~ — AFIRMAÇÃO ERRADA, corrigida em
23/08/2026.** A função **tem três consumidores internos** em `expenseCalculations.js`
(linhas 45, 56 e 82). O que é verdade é mais fraco: não é usada **fora** do módulo. Não
há dívida aqui — no máximo, a pergunta de se o `export` ainda se justifica. *Fechado.*

**P3.3 · Ícone de «Dados a completar».** `SlidersHorizontal` foi escolhido quando o ecrã
se chamava «Ajustes Manuais»; o rótulo mudou na C7E e o ícone não. Cosmético.

### Resolvido nesta sessão

- Ausência total de automação dos rebuilds → 3 acionadores diários instalados.
- `meta.geradoEm` não era emitido pelo backend → Versão 10 do Web App.
- `lerGeradoEm` lia um contrato que não existia → passa a tolerar os dois caminhos.
- `UNAVAILABLE` / `LOADING` interpretados como demonstração nas camadas puras.
- `meta.parcial` era deitado fora → transportado (`sales.meta.parcial`).
- Mocks com shape imaginado → `producao.fixtures.js` + testes de contrato.
- Sem ferramenta de diagnóstico → `npm run check:data`.
- Sem runbook → `docs/DATA_PIPELINE_RUNBOOK.md`.

---

## C7F.4 — SESSÃO DE 22/08/2026 (noite)

### Resolvido

- **P0.2** — `dataHealth.js` + `DataHealth.jsx`; a faixa deixou de poder chamar
  «Atualizado agora» a um conjunto incompleto.
- **Instaladores dos 3 acionadores** — auditados contra o HEAD remoto: `everyDays(1)`,
  `atHour(1/2/3)`, `inTimezone(SNAPSHOT_TIMEZONE)`, e idempotência corretamente
  limitada ao próprio handler (`getHandlerFunction() === alvo`). Já estavam no HEAD:
  o clone local é **byte-a-byte idêntico ao remoto**, ao contrário do que se supunha.
- **P1.3** — colisão e duplicação provadas com hash; plano de resolução escrito.
- **P0.1** — auditoria factual de julho concluída (ver acima). Valor **não** alterado.
- **P0.1-bis** — descoberto que `closedThroughMonth: null` não recua para o mês
  anterior; leva a âncora para 2027-07.
- **Runbook, secção 9** — procedimento para provar a origem `Acionador` com um
  acionador one-shot descartável.

### Por fazer, e porquê

- **Instalar os 3 acionadores definitivos.** Exige o editor web: `clasp push` está
  bloqueado pela P1.3 e não há sessão de browser disponível. **Enquanto não forem
  instalados, continua a não existir automação nenhuma.**
- **Provar a origem `Acionador`.** Mesmo bloqueio. Procedimento pronto na secção 9.
- **Acrescentar `SNAPSHOT_TIMEZONE` como dependência documentada:** está declarada
  **só** em `Código.gs` e é usada por `Despesasbackend.gs` e `RecebiveisBackend.gs`.
  Funciona pelo escopo global partilhado, mas é um acoplamento invisível — apagar ou
  renomear `Código.gs` parte os outros dois instaladores.
- **3 títulos de julho sem categoria reconhecida**, a manter as despesas operacionais
  de julho em `partial`.

---

## C7F.5 — SESSÃO DE 23/08/2026 (madrugada) — OPERAÇÃO

### Feito em PRODUÇÃO

- **Os 3 acionadores diários instalados** pelos instaladores definitivos, corridos no
  editor web. Estado inicial encontrado: já existiam 3 (não zero, como se supunha),
  nunca executados. Cada instalador registou `Gatilhos duplicados removidos: 1`, ou
  seja, substituiu o que lá estava por um novo com a configuração garantida.
  Resultado: `runRebuildPedidosSnapshot` ~01:00, `runRebuildDespesasSnapshot` ~02:00,
  `runRebuildRecebiveisSnapshot` ~03:00, `America/Sao_Paulo`.
- **Idempotência provada empiricamente**: seis invocações dos instaladores (3 + 3) e a
  lista continua a mostrar **exatamente 3 acionadores**, um por handler. Nunca 2/2/2.
- **Mecanismo de acionador provado nos três pipelines.** Um one-shot nativo
  («Data e hora específicas») por pipeline, sequencial, sem sobreposição. Todas as
  execuções aparecem com **Tipo: `Baseado no tempo`**:
  `runRebuildPedidosSnapshot` 9,5 s · `runRebuildDespesasSnapshot` 5,8 s ·
  `runRebuildRecebiveisSnapshot` 36,2 s — todas `Concluído`, todas `parcial: false`.
  Recebíveis não precisou de segunda passagem.
  **Integridade:** contagens (1071 / 301 / 1390), hashes de IDs, totais e os meses de
  junho e julho ficaram idênticos ao baseline. O rebuild consolida, não substitui.
- **Descoberta operacional:** o one-shot **não se apaga sozinho** — fica «Desativado» na
  lista. Os três foram removidos à mão; a lista voltou a três em cada passagem.
- **`Testecategoriasdespesas.gs` removido** (ver P1.3).

### Feito localmente

- `apps-script/` re-clonado limpo — 15 = 15, hashes conferidos.
- `src/utils/coverageContract.test.js` — 20 testes **caracterizadores** do defeito
  P0.1-bis. Documentam o comportamento ATUAL sem o alterar, e obrigam qualquer correção
  futura a passar por eles deliberadamente. Inclui o contrato proposto e a recomendação
  (via B: `sourceAvailability` trata limite ausente como «nada fechado»).
- `docs/APPS_SCRIPT_SOURCE_OF_TRUTH.md` reescrito com o estado real pós-correção.

### Por fazer

- **`git add apps-script/`** e o primeiro `clasp push` deliberado (P1.2).
- **CMV de julho** nos Ajustes Manuais — único bloqueio financeiro da P0.1.
- **3 títulos de julho sem categoria**, a manter as operacionais em `partial`.
- **Corrigir a P0.1-bis** — escolher a via A ou B. Enquanto não for feito, o valor
  declarado em `company.js` é a única proteção efetiva.
- **`SNAPSHOT_TIMEZONE` declarada só em `Código.gs`** e usada por outros dois ficheiros.

---

## C7F.6 — PROPOSTAS ARQUITETURAIS (auditadas, NÃO implementadas)

### P2.1-bis · Cobertura POR FONTE em vez de global

**Estado: proposta. Nada foi implementado — mexeria em cálculo financeiro.**

`historyCoverage` é hoje **global**: um `firstCompleteMonth`, um `closedThroughMonth`,
uma lista de `partialMonths` para tudo. Mas as três fontes já declaram metadata própria
(`meta.geradoEm` e `meta.parcial` por fonte) e têm cadências de rebuild independentes
(~01h, ~02h, ~03h). A cobertura global é a última peça que finge que são uma só coisa.

O código **já antecipa** isto em dois sítios: `coverage.payables` existe (comentado em
`company.js`) e `payablesCoverage()` implementa a herança. O que falta é generalizar.

```js
coverage: {
  // Herdado por todas as fontes que não sobreponham.
  firstCompleteMonth: "2026-04",
  closedThroughMonth: "2026-06",
  partialMonths: [],

  orders:       { /* sobrepõe só o que precisar */ },
  payables:     { closedThroughMonth: "2026-05" },
  receivables:  { },
  manualInputs: { /* o fecho contabilístico vive melhor aqui */ },
}
```

**Perguntas que a auditoria levantou e que a proposta tem de responder:**

- *Fontes que começam em datas diferentes.* Hoje `firstCompleteMonth` é único. Os
  pedidos alcançam 2026-03; as contas a pagar alcançam 2026-01. Um `firstCompleteMonth`
  global obriga a escolher o mais restritivo e deita fora histórico real da outra fonte.
- *Meses parcialmente cobertos.* `partialMonths` é uma lista à mão. Com metadata por
  fonte, `meta.parcial === true` deveria **vetar** declarar esse mês como real — o veto
  seria derivado, não mantido.
- *Empresas novas.* Hoje uma empresa nova exige editar código. Com `meta.periodo =
  { de, ate }` emitido por cada rebuild (a janela já é conhecida e já vai para o log),
  a cobertura passaria a ser **derivada** e o ficheiro de configuração encolheria para o
  que é genuinamente humano: o mês de fecho contabilístico.
- *ERP diferente.* Nada acima menciona Bling. É essa a prova de que o modelo é agnóstico:
  o contrato é «cada fonte declara a sua janela e se está completa», não «o Bling
  responde assim».

**Evolução mínima proposta, por ordem de risco:**
1. `meta.periodo = { de, ate }` por fonte — puramente aditivo, não muda cálculo nenhum;
2. `coverage` passa a aceitar sobreposição por fonte (o padrão de `payablesCoverage`,
   generalizado) — muda a origem da cobertura, não a semântica de `sourceAvailability`;
3. o fecho contabilístico migra de `company.js` para o documento de ajustes manuais no
   Drive, onde já existe manutenção humana mensal — deixa de ser código e passa a ser
   dado operacional;
4. `meta.parcial === true` veta declarar o mês como real.

*Hard stop respeitado: nada disto foi implementado. Os passos 2 a 4 alteram números
apresentados e exigem decisão financeira explícita.*

---

### P4.1 · Observabilidade dos acionadores no front

**Estado: proposta. Conclusão da auditoria — a metadata do snapshot JÁ CHEGA.**

A pergunta era: como é que o front sabe se os rebuilds correram? A resposta mais barata
é que, para o que interessa ao utilizador, **já sabe**:

| Pergunta | Resposta hoje | Fonte |
|---|---|---|
| Correu? | sim, se `geradoEm` avançou | `meta.geradoEm` |
| Quando? | `meta.geradoEm` | idem |
| Terminou? | `meta.parcial === false` | `meta.parcial` |
| Está velho? | `dataFreshness` (24 h / 72 h) | derivado |
| Falhou? | inferido: `geradoEm` parado | derivado |

O único sinal genuinamente ausente é a **distinção entre «falhou» e «nunca correu»** —
ambos aparecem como `geradoEm` parado. E a **duração** da execução, que é diagnóstico de
operação, não informação de utilizador.

**Recomendação: não criar dependência dos logs do Apps Script.** Isso exigiria expor um
recurso novo, com permissões próprias, para responder a perguntas que a metadata já
responde. O custo de acoplamento não se justifica.

**Mínimo necessário, se um dia se quiser fechar a lacuna** — aditivo e sem novo recurso:

```jsonc
"meta": {
  "geradoEm": "…",
  "parcial": false,
  "ultimaTentativa": "2026-08-23T04:00:12.000Z",   // ainda que tenha falhado
  "ultimoErro": null                                // código curto, nunca stack
}
```

Com `ultimaTentativa` a par de `geradoEm`, «falhou» e «nunca correu» deixam de ser
indistinguíveis: tentativa recente + `geradoEm` antigo = falha; ambos antigos = parado.

*Nada implementado: exigiria publicar alteração remota no Apps Script.*

---

## C7F.7 — ESTADO DO CONHECIMENTO (23/08/2026)

Separação deliberada entre o que está **provado**, o que é **hipótese** e o que **espera
uma decisão humana**. A confusão entre estas três categorias foi, ela própria, uma das
causas da investigação que originou a C7F.

### PROVADO — com observação direta, não inferência

| Facto | Como foi provado |
|---|---|
| O mecanismo de acionador funciona nos 3 pipelines | 3 one-shots nativos, execuções com Tipo `Baseado no tempo`, todas `Concluído` |
| O acionador **diário** dispara sozinho | Execução natural às 01:06:08, com o one-shot já apagado |
| Os instaladores são idempotentes | 6 invocações (3+3) → continuam exatamente 3 acionadores |
| O rebuild consolida, não substitui | Contagens, hashes de IDs, totais e junho/julho idênticos após 4 rebuilds |
| Os dois ficheiros do Apps Script eram idênticos | SHA-256 igual, lido da API em memória |
| Os 8 símbolos eram os únicos duplicados | Varrimento dos 219 símbolos globais |
| `apps-script/` = 100 % do remoto | 15 = 15, os 15 hashes conferem |
| Recurso desconhecido cai em PEDIDOS | `?recurso=despesass` → HTTP 200 com 1071 pedidos |
| `mesEmCurso` devolvia 2027-07 | Medido com a configuração de produção correta |
| A correção da P0.3 não mexeu na DRE fechada | `financeiro.monthKey` e `financeiro.payables.monthKey` = 2026-06 antes e depois |
| Julho não pode fechar | `buildMonthlyClosing` → `incomplete`, `missingItems: ["cmv"]` |
| 3 títulos de julho sem categoria | Identificados, com valores e naturezas distintas |

### HIPÓTESE — plausível, mas por confirmar

- **Que o proxy Vercel sempre envia `recurso` explícito.** É um projeto separado e não
  foi auditado. É o único risco por avaliar da migração do recurso desconhecido.
- **Que os 2 títulos com categoria não reconhecida se resolvem por regra.** As categorias
  «Custo dos serviços prestados» e «Taxas pagas» *parecem* mapeáveis, mas para onde é
  uma decisão contabilística — e as opções mudam linhas diferentes da DRE.
- **Que `meta.parcial` cobre todos os modos de falha do rebuild.** Só se observou o
  caminho feliz: nas 4 execuções desta sessão nenhuma saiu parcial. O caminho parcial
  continua testado só por fixtures.
- **Que a cobertura por fonte resolve as empresas novas.** A proposta P2.1-bis é
  coerente, mas nunca foi exercitada com uma segunda empresa.

### ESPERA DECISÃO FINANCEIRA — não é trabalho de engenharia

- **CMV de julho.** Sem ele não há lucro bruto, EBITDA nem resultado líquido. Nenhuma
  regra automática pode substituí-lo: não se deriva de contas a pagar, nem de custo
  atual de produto, nem de percentagem histórica.
- **Classificação dos 3 títulos de julho.** Ver acima.
- **Avançar `closedThroughMonth` para `"2026-07"`.** Só depois dos dois pontos acima.
- **Corrigir a P0.1-bis (via A ou B).** A via B é a recomendada, mas muda o
  comportamento de `EMPTY_COVERAGE` e exige revisão dos consumidores.
- **`resolveManualInputsView`: API pública ou resíduo?**

### DÍVIDA CONHECIDA E ACEITE

- `SNAPSHOT_TIMEZONE` declarada só em `Código.gs`, usada por outros dois ficheiros.
- Limiares de frescura duplicados entre app e ferramenta de operação — duplicação
  deliberada, agora protegida por teste contra divergência silenciosa.
- `appsscript.json` declara `ANYONE_ANONYMOUS`: decisão de superfície de ataque que deve
  ser deliberada, não esquecida.

---

## C7F.7 — AUDITORIA DE 23/08/2026 (tarde)

Auditoria longa e contínua a partir das execuções naturais da madrugada. **Nenhum commit,
nenhum push, nenhum `clasp push`, nenhuma implantação, nenhum scope de OAuth novo.**

Testes: **1173 → 1313** (+140 em 8 ficheiros novos), todos verdes. `npm run build` verde. `npm run check:data`
SAUDÁVEL.

### P0 — RESOLVIDO localmente: zero por falha apagava um snapshot bom

Caminho concreto, não hipotético: `blingGet_` devolvia `safeParse_(body)`, que engolia um
corpo ilegível num `null` silencioso. Um HTTP 200 com corpo inválido produzia
`res.data` indefinido → lote vazio → paginação a parar na página 1 → **snapshot inteiro
reescrito com `data: []`**, sem exceção e sem aviso.

Pedidos estava protegido por construção (o snapshot é o merge de histórico + janela).
**Despesas e recebíveis não tinham guarda nenhuma.**

- `safeParse_` endurecido: 2xx ilegível passa a lançar.
- `podeGravarListagemVazia_(recebido, anterior)` — zero só grava se antes também era zero.
- Guardas em `rebuildDespesasSnapshot_` e `rebuildRecebiveisSnapshot_`.
- Do lado do front: `linhasOuFalha()` substitui `res?.data ?? res ?? []`, que fazia um
  `{ error: true }` chegar ao `.map()` **fora** do `allSettled` e derrubar o dataset
  inteiro para `unavailable`.

`apps-script/snapshotIntegridade.test.js` (12) · `loadFinerData.payloadDefeituoso.test.js` (10)

### P0 — RESOLVIDO localmente: 481 CPF num endpoint anónimo

`?recurso=recebiveis` devolvia `contato.numeroDocumento` em 1389 dos 1390 títulos —
**481 CPF de pessoa singular e 908 CNPJ**, sobre 279 contactos. O Web App é
`ANYONE_ANONYMOUS` e o URL do proxy está inlinado no bundle (`grep` em `dist/` confirma).

`normalizeReceivable` **nunca usou** este campo. Era sobre-exposição pura.
Redação à saída em `serveRecebiveis_`, mais `idTransacao` / `linkQRCodePix` / `linkBoleto`
(hoje sempre vazios, mas instrumentos de pagamento por construção).

`apps-script/redacaoPublica.test.js` (15) · `docs/APPS_SCRIPT_SEGURANCA.md`

### P1 — RESOLVIDO localmente: rate limit do Bling

O 429 das 02:05 foi reproduzido na análise: 4 pedidos no mesmo segundo contra um limite de
3/s. `DETAIL_THROTTLE_MS` só cobria o laço de detalhe; listagens e mapas de apoio
disparavam sem pausa. E o laço de detalhe fazia 2 chamadas por `sleep` (detalhe + contacto).

Duas defesas em `blingGet_`, a beneficiar os três pipelines: espaçamento de 350 ms
(≤ 2,85 req/s) e backoff 1100/2200/3300 ms **só em 429**, com teto de 3.

Custo: +2,1 s (pedidos), +2,1 s (despesas), +5,3 s (recebíveis).

**Impacto financeiro do 429 que aconteceu: nenhum.** 299 dos 301 nomes já estavam
resolvidos, os 2 restantes têm `formaPagamento.id === 0`, e o campo não entra em cálculo
nenhum. **O risco real era o vizinho:** `buildCategoriasMap_` corre na mesma rajada e
`categoriaNome` **é** a entrada de `classifyPayable`.

`apps-script/blingRateLimit.test.js` (18) · `docs/BLING_RATE_LIMIT_E_RESILIENCIA.md`

### P1 — RESOLVIDO localmente: recurso desconhecido

Implementada a proposta de `APPS_SCRIPT_API_CONTRACT.md` §9, com uma divergência: devolve
`recursosSuportados` em vez do valor recebido.

**O bloqueio que faltava — auditar o proxy — foi resolvido empiricamente.** Sondado só com
GET: passa `recurso` verbatim, não injeta, não filtra. `?recurso=pedidos` e `?recurso=`
já funcionam hoje, o que torna a mudança retrocompatível **por observação**.

`apps-script/recursoDesconhecido.test.js` (16)

### P1 — RESOLVIDO: `clasp push` levaria os testes para produção

`.clasp.json` tem `scriptExtensions: [".js"]`, `rootDir: ""` e
`skipSubdirectories: false`. Os 4 `*.test.js` importam `vitest` e `node:fs`. Criado
`apps-script/.claspignore`. Checklist completo em `APPS_SCRIPT_SOURCE_OF_TRUTH.md` §8.

### P1 — RESOLVIDO: `dataHealth` afirmava completude a partir de um array

`typeof [] === "object"`: um `meta.parcial = [false, false, false]` saía `COMPLETE`.
Corrigido com `Array.isArray`. Mais 20 testes de fronteira.

### P2 — RESOLVIDO: `check:data` mentia no rodapé

A frase *«snapshots chegaram, são recentes e completos»* era impressa **também** quando o
estado era INDISPONÍVEL — ou seja, exatamente quando não tinham chegado. Reescrita para
descrever o eixo medido, não o veredito. Acrescentado `PRÓXIMO PASSO` por estado, e
reconhecimento do payload `RECURSO_DESCONHECIDO`.

### Achados sem correção — exigem decisão

#### Julho nunca pede o CMV *(o achado mais importante desta sessão)*

Com `closedThroughMonth: "2026-06"`, julho fica `indeterminate` e o item de CMV fica
`status: "pending"`, não `"missing"`. Consequência: **`porPreencher: 0`, nenhum alerta,
nenhum CTA.** O único alerta de fecho existente é `closing-2026-05` — maio, que também
está sem CMV e que, esse, é `incomplete`.

A aplicação não pede o CMV de julho, e mesmo que alguém o lançasse o mês não avançava:
o que o desbloqueia é **editar `company.js`**. `closedThroughMonth` responde a duas
perguntas diferentes — *os dados alcançam este mês?* (técnica) e *uma pessoa validou-o?*
(humana) — e colapsá-las produz este deadlock.

Análise e modelo proposto: **`docs/COVERAGE_AND_CLOSING_ARCHITECTURE.md`**.
Desenvolve a P2.1-bis de C7F.6 com o sintoma medido.

**Confirmado: `closedThroughMonth` deve continuar `"2026-06"`.** Avançar para `"2026-07"`
faria julho substituir junho como mês âncora com lucro bruto, EBITDA e resultado líquido a
`null`.

#### Os 3 títulos de julho, e os 2 de abril que valem 100×

| Mês | Títulos | Valor |
|---|---:|---:|
| 2026-04 | 2 | **200 241,90** |
| 2026-07 | 3 | 1 554,35 |
| 2026-08 | 3 | 347,35 |
| 2026-01 | 1 | 200,00 |

- **A** (200,00, "Custo dos serviços prestados") — regra insuficiente. Categoria diz CMV,
  histórico diz administrativo. Precisa de decisão.
- **B** (1 118,00, `categoriaId: 0`) — dado ausente na origem. **Resolve-se no Bling.**
- **C** (236,35, "Taxas pagas", fornecedor *Simples Nacional*) — o dado existe e a regra
  não lhe chega. ⚠️ **A correção ingénua está errada**: mandar para `IMPOSTOS` põe uma taxa
  municipal a **abater receita de venda**. O destino correto é `ADMINISTRATIVAS`.
- **Abril:** ambos com `categoriaId: 0` e histórico a dizer *"Importação"* e *"insumos"* —
  termos que a regra 3 procura **só na categoria**. Reclassificar não move um único número
  (`COMPRAS_ESTOQUE` e `NAO_CLASSIFICADO` estão ambos fora das linhas), mas tira 200 241,90
  do balde "sem categoria reconhecida".

**Mesmo resolvendo A e C, as operacionais de julho continuam `partial`** — B depende do
Bling. Impacto se A+C entrassem: 12 127,28 → 12 563,63 (+3,6 %).

`src/utils/classificacaoReal.test.js` (31, caracterizadores) ·
`docs/CLASSIFICACAO_DESPESAS_AUDITORIA.md`

#### Sem autenticação nenhuma

`ANYONE_ANONYMOUS` + URL do proxy no bundle = dataset financeiro completo publicamente
legível. Não há vulnerabilidade a explorar — não há controlo de acesso a contornar.
A redação de CPF tira o pior da mesa; não substitui autenticação. Mitigações por ordem de
esforço em `APPS_SCRIPT_SEGURANCA.md` §6. **Nenhuma é possível sem tocar no proxy, que é
um projeto separado.**

#### Recebíveis deixam de convergir a ~5–6× o volume

A listagem de `/contas/receber` é integral — não há filtro de data confirmado. Hoje: 14
páginas em ~27 s (~1,9 s/página). A 139 páginas (10×) a listagem sozinha gasta ~265 s de um
orçamento de 300 s. Pior: **não há cursor de continuação** — cada execução recomeça na
página 1, pelo que o rebuild nunca terminaria.

O front, esse, escala bem: 10× dados → ×10,3 tempo (linear), e a profundidade do histórico
é gratuita (60 meses custam o mesmo que 19). Medido em `diagnostico/_perfEscala.mjs`.

#### Menores, registados

- **Devolução por histórico não emite aviso**, ao contrário da retirada por histórico.
  Um título de `Transferências` sai como `devolucoes` em silêncio. Mexer nisto muda o que a
  DRE reporta.
- **8 regras redundantes** em `classifyPayable` (`"fornecedores"` depois de `"fornecedor"`,
  etc.). Zero impacto. Registadas para não serem redescobertas.
- **11 termos nunca exercitados** contra dados reais (`"folha de pagamento"`, `"encargo"`,
  `"mercadoria"`, …).
- **Corpo de erro do Bling ecoado** na resposta pública via `errorOut_`. `sanitize_` remove
  tokens, não texto descritivo. Mitigação: truncar a ~200 carateres.
- **Ramo `?code=…`** descreve o procedimento interno a quem sondar com `?code=1`.
- **Sem validação de forma antes de gravar** o snapshot. O Drive dá atomicidade de revisão,
  pelo que um ficheiro temporário acrescentaria mais estado do que segurança. Recomendação:
  validar, sem temp file.
- **Observabilidade:** proposta mínima de `durationMs` / `lastSuccessfulRun` / `warnings[]`
  em `meta`. `lastSuccessfulRun` é o campo que torna a guarda P0 **visível**.
- **8 funções exportadas sem consumidor nenhum** (nem em testes):
  `normalizeClient`, `normalizeProduct`, `buildSalesDatasetFromRaw`,
  `buildSalesDiagnostics` (~67 linhas), `totalOrders`, `recentOrders`,
  `latestReceivableMonth`, `receivablesInMonth`. Não removidas: apagar API exportada é
  decisão do dono, e o ganho é nulo.
- **`SNAPSHOT_TIMEZONE`** continua declarada só em `Código.js` e usada por outros dois.

### P1 — RESOLVIDO: dump financeiro real sem regra de .gitignore

`diagnostico/despesas_snapshot.json` — 293 títulos reais com valores, fornecedores e
históricos, gerado em 2026-08-14 — estava **por rastrear e sem qualquer regra a
protegê-lo**, num repositório público. Um `git add .` bastava para o publicar.
Verificado: **não** contém CPF/CNPJ (os números de 11–14 dígitos são IDs de título).

`.gitignore` passou a ter `diagnostico/*.json`. Os `.mjs` de diagnóstico continuam
versionáveis de propósito — são a ferramenta, não os dados.

### Higiene do repositório

Sem `TODO`/`FIXME`/`HACK`. Sem `console.log` em `src/` fora de testes. Datas fixas apenas
em `company.js` (configuração) e `producao.fixtures.js` (fixtures deliberadas).
Sem `doPost`. Sem símbolos globais duplicados entre os ficheiros Apps Script. Sem segredos.

---

## C7F.8 — SESSÃO DE 23/08/2026 (tarde) — P0 PRONTOS, PUBLICAÇÃO BLOQUEADA

### Estado numa linha

**Os três P0 estão corrigidos, testados e verdes localmente. Nenhum está em produção.**
A publicação parou num toggle de conta Google, não em código.

### O bloqueio

`clasp push` falha com:

```
User has not enabled the Apps Script API.
Enable it by visiting https://script.google.com/home/usersettings then retry.
```

Diagnóstico feito: **leituras funcionam, escritas não.** `clasp deployments`,
`clasp versions` e `clasp show-authorized-user` respondem normalmente; só `push` é
rejeitado. A conta autenticada é `igororlandibarros@gmail.com` — **a correta**, portanto
não é caso de conta trocada. Falta apenas ligar a *Google Apps Script API* em
`script.google.com/home/usersettings`.

Passo a passo para retomar: **`docs/PUBLICACAO_P0_CHECKLIST.md`**.

Nada foi publicado, nenhuma versão criada, nenhum deployment alterado — logo, **não houve
rollback nem era necessário**. Confirmado por sonda: produção continua em `@10`, sem a
guarda de recurso desconhecido e com os 1389 documentos expostos.

### Superfície pública — auditada ao vivo, os 4 recursos

| Recurso | Contacto | PII |
|---|---|---|
| pedidos | `id, nome` | nenhuma |
| despesas | `id, nome` | nenhuma — os 20 `numeroDocumento` preenchidos têm 9 chars, zero com forma de CPF/CNPJ |
| ajustes-manuais | — | nenhuma (só CMV) |
| **recebíveis** | `id, nome, numeroDocumento, tipo` | **481 CPF + 908 CNPJ, 278 contactos** |

Recebíveis é o **único** endpoint com PII. Telefone, email e morada **nunca são
recolhidos** — `baseContaReceber_` é whitelist, não chegam sequer ao snapshot.

### Alterado nesta sessão (tudo local)

- **`RecebiveisBackend.js`** — redação de `contato` passou de deny-list a **allow-list**
  (`CAMPOS_PUBLICOS_CONTATO_RECEBIVEL = ['id','nome','tipo']`). Hoje é equivalente;
  amanhã falha fechado se o Bling passar a devolver campos pessoais novos.
- **`Código.js`** — novo `loteDaListagem_`. Corrige um defeito real: com `data` a vir
  objeto em vez de lista, `lote.length` é `undefined`, o `for` não corre **e**
  `undefined < PAGE_LIMIT` é falso — o `break` nunca dispara e o laço gasta as 50 páginas
  de `MAX_PAGES` contra o rate limit sem recolher nada. Ligado nos 3 laços de produção.
- **`Código.js` / `TesteContasPagar.js`** — `mascararDocumentos_` + `safeLogDiagnostico_`.
  `sanitize_` mascara corridas de 24+ alfanuméricos e **não apanha um CPF de 11 dígitos**;
  a amostra crua de contas a pagar gravava documentos de fornecedores nos registos de
  execução. A máscara preserva o comprimento, para o diagnóstico continuar útil.
- **`docs/PUBLICACAO_P0_CHECKLIST.md`** — novo.

### Auditado sem alterar

- **Rebuilds usam `try/finally`, não `try/catch`** — uma exceção propaga e nunca chega ao
  `save`. É isto que faz o P0-2 funcionar para timeout, 429 esgotado, 500 e JSON inválido.
- **Rebuild parcial não trunca** — a linha que preenche o resto da lista com o básico
  garante `data.length === lista.length`. Não grava snapshot menor sobre maior.
- **O caminho automático não regista PII** — os 3 rebuilds logam contagens, datas e
  tempos. Blindado por teste em `logSemPII.test.js`.
- **`@HEAD` exige login Google** — devolve HTML de login, não JSON. Não é superfície
  anónima; depois do push terá o código novo mas continua inalcançável sem autenticação.
- **O proxy aponta exclusivamente para `@10`** — payload byte-idêntico (mesmo SHA-256,
  mesmo `meta.geradoEm`) em recebíveis e despesas.
- **`normalizeClient` é código morto** — exportada, sem chamadores, `taxId` nunca lido.
  É a única função que leria um documento de contacto: prova de que a redação não custa
  funcionalidade. Fixado por teste.
- **`Logger.log(url)` do OAuth** — regista o `client_id`. Não corrigido: o URL tem de ser
  utilizável para o fluxo funcionar, `client_id` não é secreto, e é território OAuth.

### Riscos que continuam abertos

#### R1 — A guarda protege contra zero, não contra queda parcial (o mais relevante)

`podeGravarListagemVazia_(5, 1390)` devolve **`true`**: 5 títulos não é vazio, portanto
grava e destrói os 1390. O cenário é plausível — uma página que devolva menos do que
`PAGE_LIMIT` por falha transitória trunca a paginação em silêncio.

**Não corrigido de propósito.** Um limiar (bloquear quedas acima de X%) é decisão de
negócio: títulos liquidados saem da listagem, e um limiar mal escolhido bloqueia rebuilds
legítimos todas as noites. Fixado como teste em `snapshotIntegridade.test.js` para a
lacuna ficar visível. **Espera decisão.**

#### R2 — Pedidos e despesas ainda consultam o Bling a partir de pedido anónimo

`serveRecebiveis_` foi endurecido: sem snapshot devolve `data:[]` com fonte
`snapshot-vazio` e não chama a API. **Pedidos e despesas mantêm o fallback ao vivo** — com
o snapshot em falta, um GET anónimo faz o backend paginar o Bling, gastando quota
partilhada e podendo provocar os 429 que o P0-3 remedeia. Estender o endurecimento é
plausível, mas o fallback existe para o arranque a frio: é decisão de produto.

#### R3 — Zero legítimo fica preso, e sem alerta

Se a empresa chegar de facto a zero títulos, os rebuilds abortam indefinidamente com
`listagem-vazia-suspeita` e o snapshot envelhece. O tradeoff é o correto; a lacuna é não
haver sinal para abortos repetidos.

#### R4 — `contato.nome` continua público

481 nomes completos de pessoas singulares, legíveis anonimamente. Mantido porque o
separador Clientes precisa dele — mas é dado pessoal, e merece ser decisão consciente.

#### R5 — Nada validado no runtime real do GAS

Todos os testes extraem as funções da fonte e correm-nas em Node. `Array.isArray` e
`hasOwnProperty` são seguros em V8, mas a prova end-to-end só existe depois do deploy.

#### R6 — Estado remoto de 12 dos 15 ficheiros é desconhecido

Só `Código.js` e `RecebiveisBackend.js` foram provados desatualizados (por sonda de
comportamento). Os restantes exigiriam `clasp pull`, que sobrepunha o local.

---

## C7F.9 — ÍNDICE CONSOLIDADO POR PRIORIDADE (23/08/2026, fim de tarde)

Índice único, para não ter de reconstruir o estado a partir das secções por sessão.
Cada item diz **o que decide** — porque a maioria do que resta não é trabalho de
engenharia parado por falta de tempo, é trabalho parado por falta de uma decisão.

### P0 — PUBLICAÇÃO PENDENTE (bloqueada por definição de conta)

| # | Item | Estado |
|---|---|---|
| P0-1 | Redação de PII em recebíveis (allow-list `id,nome,tipo`) | pronto, testado, **por publicar** |
| P0-2 | Guarda de listagem vazia + `blingGet_` endurecido + `loteDaListagem_` | pronto, testado, **por publicar** |
| P0-3 | Espaçamento e backoff de 429 | pronto, testado, **por publicar** |

**Único bloqueio:** *Google Apps Script API* desligada em `script.google.com/home/usersettings`.
Conta do clasp confirmada correta. Passo a passo: `docs/PUBLICACAO_P0_CHECKLIST.md`.
Enquanto não publicar, **481 CPF e 908 CNPJ continuam legíveis anonimamente.**

### P1 — IMEDIATO (fazer a seguir à publicação)

| # | Item | O que decide | Onde |
|---|---|---|---|
| P1.1 | **Experiência D**: registar `Object.keys(res)` de uma chamada a `/contas/pagar` | nada — é uma linha de log; mas o resultado decide todo o P1.2 | `INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md` §3-D |
| P1.2 | **R1** — proteção contra truncagem parcial | qual estratégia (A / A+C / B) | idem §3-4 |
| P1.3 | **R2** — fallback ao vivo em pedidos e despesas | trocar conveniência de arranque a frio por superfície de abuso | idem §6 |
| P1.4 | **R3** — sem alerta para abortos repetidos de rebuild | onde o sinal aparece (log, `meta`, alerta no front) | C7F.8 |
| P1.5 | **R4** — `contato.nome` público (481 nomes de pessoas singulares) | manter (Clientes precisa) ou pseudonimizar | `APPS_SCRIPT_SEGURANCA.md` |

P1.1 é o único que não precisa de decisão nenhuma e destrava o mais importante. **Começar por aí.**

### P2 — ARQUITETURA (muda números; exige decisão financeira)

| # | Item | Passo |
|---|---|---|
| P2.1 | `meta.periodo = { de, ate }` emitido por cada rebuild | passo 1 — **aditivo, sem risco, independente** |
| P2.2 | Cobertura por fonte (generalizar `payablesCoverage`) | passo 2 |
| P2.3 | `meta.parcial === true` veta declarar o mês como real | passo 3 — muda números |
| P2.4 | Fecho contabilístico migra de `company.js` para o documento do Drive | passo 4 — **depende de via de escrita segura, que não existe** |
| P2.5 | Cobertura derivada de `meta.periodo` | passo 5 |
| P2.6 | Estado `aberto` (coberto ∧ não fechado) nas superfícies | passo 6 — resolve o deadlock de julho |

Detalhe completo em `docs/COVERAGE_AND_CLOSING_ARCHITECTURE.md` §5.
**P2.1 é seguro e destrava a medição de todos os outros** — é o análogo do P1.1 neste eixo.

**Sequenciamento verificado nesta sessão:** julho está *tecnicamente coberto por inteiro*
(197 pedidos, 24 dias, 07-01..07-31, `parcial: false`). O rótulo `partial` é puramente
configuracional. Logo P2.6 só resolve julho **depois** de P2.5 — enquanto a cobertura for
declarada por `closedThroughMonth`, julho continua parcial por construção.

### P3 — DÍVIDA TÉCNICA (sem impacto em números)

| # | Item |
|---|---|
| P3.1 | `MAX_PAGES` trunca em silêncio no teto de 5000 (recebíveis a 28 %). A estratégia A do R1 detecta-o de graça |
| P3.2 | `SNAPSHOT_TIMEZONE` declarada só em `Código.js`, usada por outros dois ficheiros |
| P3.3 | 8 funções exportadas sem consumidor (`normalizeClient`, `normalizeProduct`, `buildSalesDatasetFromRaw`, `buildSalesDiagnostics`, `totalOrders`, `recentOrders`, `latestReceivableMonth`, `receivablesInMonth`) |
| P3.4 | `Logger.log(url)` do OAuth regista o `client_id` — não corrigido: o URL tem de ser utilizável e é território OAuth |
| P3.5 | `Código.js:1096` despeja um pedido inteiro por `Logger.log` cru (contém `contato.nome`) |
| P3.6 | Estado remoto de 12 dos 15 ficheiros do Apps Script é desconhecido (exigiria `clasp pull`, que sobrepunha o local) |
| P3.7 | Regra de completude duplicada de propósito entre `dataHealth.js` e `check-data-pipeline.mjs` |

### Resolvido nesta sessão

- **`check:data` dizia SAUDÁVEL com uma fonte em baixo.** `comErro` era filtrado sobre as
  coleções, que excluem `ajustes-manuais`. Exclusão certa para frescura e completude,
  errada para "respondeu?". Corrigido, `calcularConsolidado` extraída e testada (12 testes).
- **CPF nos registos de execução.** `sanitize_` não apanha 11 dígitos. `mascararDocumentos_`
  + `safeLogDiagnostico_`, com máscara que preserva o comprimento.
- **Rotatividade real medida:** 0 títulos saíram da listagem em 9,1 dias. Inverte a
  suposição de que quedas legítimas são comuns — ver `INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md` §2.

---

## Sessão 2026-08-24 (tarde) — separação de "mês completo" e "mês âncora"

### Resolvido

- **Preencher o CMV promovia o mês a âncora dos KPIs, com a DRE ainda parcial.**
  `latestCompleteMonthKey` só olhava para o catálogo de requisitos de fecho, e o catálogo
  tem uma entrada (o CMV). Reproduzido em julho/2026 com dados reais e CMV sintético em
  memória: `closing.status: complete`, `financeiro.monthKey: 2026-07`, com `deducoes`,
  `despesasOperacionais`, `ebitda` e `resultadoLiquido` todos `partial`.
  Corrigido com um eixo novo (`src/utils/financialCompleteness.js`) e o seletor
  `latestAnchorEligibleMonthKey`. Contrato em `docs/FINANCIAL_COMPLETENESS_CONTRACT.md`.
- **Resumo anunciava "Julho de 2026 concluído — os dados necessários estão completos"**
  sobre um mês com EBITDA `partial`. Passa a "com análise parcial", com as causas
  decompostas por linha (cobertura vs. classificação).
- **"Dados a completar" prometia "todos os dados necessários estão disponíveis"** — uma
  garantia sobre a DRE inteira que a página não tem como dar. Passa a "todos os dados
  pedidos foram preenchidos", com ressalva separada quando as **fontes** estão parciais.
- **O alerta do mês desaparecia por inteiro assim que o CMV entrasse.** Passa a existir
  um segundo alerta de fecho, `info` e sem ação, que descreve o mês sem o cobrar.
- **Resumo mostrava a chave crua do mês** (`2026-06`) onde todas as outras páginas
  escrevem "junho de 2026". Passou a usar `monthLongLabel`.
- `metrics.availability.payablesCoverage` exposto (aditivo) para permitir separar
  parcialidade por cobertura de parcialidade por classificação.

### Pendente / a monitorizar

| # | Item |
|---|---|
| P4.1 | **DECISÃO DE NEGÓCIO — materialidade da classificação.** 3 títulos de julho (R$ 1 554,35 = 0,38% do mês) bloqueiam a elegibilidade de julho como âncora. Não existe limiar de materialidade: qualquer título por classificar bloqueia. Manter conservador ou definir limiar? |
| P4.2 | **DECISÃO DE NEGÓCIO — quem declara um mês de contas a pagar fechado.** Auditado: nenhum campo do snapshot permite derivá-lo (`geradoEm` = frescura; `parcial` = rebuild terminou; última competência presente = `2027-07`, um vencimento futuro). `payables.completeThroughMonth` continua manual **por falta de sinal, não por falta de código**. |
| P4.3 | Mês sem atividade: lucro bruto e EBITDA continuam `null` porque o CMV é `null`, mesmo com o requisito `not_applicable`. Torná-los calculáveis exige o `dreEngine` tratar "não aplicável" como zero económico — mudança de semântica da DRE, não corrigida. |
| P4.4 | `monthlyClosing.latestCompleteMonthKey` continua exportada e testada, mas **deprecada como seletor de âncora**. Não voltar a ligá-la a decisões de rentabilidade. |
| P4.5 | `buildResumo` mantém o contrato legado `despesas`/`resultado` (o pseudo-resultado `receita − contas a pagar`), lido pelo `chatEngine`. Migração continua por fazer — não tocada nesta sessão. |

---

## Sessão 2026-08-24 (noite) — fallback da âncora, Chat legado, classificação

### Resolvido

- **O recurso da âncora era silencioso.** `financeiro.monthKey = mesElegivel || mesUsavel`,
  e o segundo termo aceita o último mês com receita real sem olhar às contas a pagar nem ao
  CMV. Medido: com a fonte de contas a pagar **ausente**, a âncora era o mês civil com
  deduções, EBITDA e resultado todos `unavailable` — e `referenciaAtrasada: false`.
  Novo `anchorSource` (`eligible`/`fallback`/`none`) + `anchorEligible` + `anchorFinancial`.
  Matriz A–F em `src/services/financialAnchor.test.js`. Contrato em
  `docs/FINANCIAL_ANCHOR_CONTRACT.md`.
- **Resumo e Performance apresentavam um recurso como fecho.** `buildAnchorNotice` (em
  `performanceView`, partilhado pelas duas páginas) declara "Análise parcial" ou
  "Sem mês completo", com as rubricas em falta nomeadas.
- **O Chat mostrava o pseudo-resultado `receita − contas a pagar` num cartão rotulado
  "Resultado (mês)"** — a métrica que o projeto proíbe, banida do Diagnóstico e do texto do
  Chat, e que continuava a sair pelos cartões com tom verde/vermelho. Migrado: o resultado
  vem agora só da DRE, com o mês âncora e a ressalva de disponibilidade, e **desaparece**
  quando não é calculável. "Despesas (mês)" passou a "Contas a pagar · <mês civil>".
  Nenhum cartão viajava com o seu mês; agora todos o nomeiam.
- **`InlineMetric` pintava de vermelho tudo o que não fosse `success`** (um cartão neutro
  saía como alarme) e ignorava a nota de disponibilidade que o motor emitia.
- **"Sem mês financeiro fechado disponível"** (Performance) afirmava um encerramento
  contabilístico que a Finer One não faz — a mesma palavra que `closingSummaryView` já
  recusava por essa razão.
- **A página Despesas mostrava € numa empresa em BRL.** `lib/format.formatEUR` é fixo em
  pt-PT/EUR; o Resumo e a Performance, já migrados, mostravam R$ para os mesmos títulos.
  Migrada para `lib/currency` (incluindo o cabeçalho do CSV e o formatador do donut).
- **Metadata do snapshot de despesas (Apps Script LOCAL, não publicado):** `paginasLidas`,
  `listagemTruncada` (P3.1 — o teto de `MAX_PAGES` truncava em silêncio), `filtroData: null`
  e `intervalos` (min/max/comValor por campo de data). Aditivo, sem PII, nada renomeado.

### Novo

| Módulo | Papel |
|---|---|
| `utils/classificationCompleteness.js` | factos de materialidade — contagens e montantes, **sem limiar** |
| `utils/coverageDiagnostics.js` | `coverageLagMonths` / `coverageNeedsReview` — contrato interno |
| `docs/FINANCIAL_ANCHOR_CONTRACT.md` | de onde vem a âncora e como a UI a deve tratar |
| `docs/SOURCE_COVERAGE_CONTRACT.md` | freshness ≠ rebuildComplete ≠ dataRange ≠ accountingCoverage |

### Medições

- `buildSalesDataset` sobre produção (1103 pedidos, 301 despesas, 1414 recebíveis):
  **34,8 ms** por chamada, e é chamada **uma vez por carregamento** (`sales` é estado do
  contexto, não recalculado por render). **Nenhuma otimização feita** — a duplicação
  conhecida (a DRE do mês âncora é construída duas vezes) não justifica memoização a este
  custo.
- Títulos por classificar: julho **0,38 %** (3 títulos, R$ 1 554,35); agosto **0,10 %**
  (3 títulos, R$ 347,35).

### Pendente / a monitorizar

| # | Item |
|---|---|
| P5.1 | **DECISÃO DE NEGÓCIO — limiar de materialidade.** Os factos existem (`classificationCompleteness`); a política não. Hoje qualquer título por classificar bloqueia a elegibilidade. |
| P5.2 | **DECISÃO DE NEGÓCIO — quem declara um mês de contas a pagar fechado.** `coverageNeedsReview` já assinala o atraso (lag 1 em 2026-08-24); falta a ação no produto. |
| P5.3 | `lib/format.formatEUR` (EUR fixo) continua em `ClientesFornecedores`, `DiagnosticoFinanceiro`, `AlertasPreditivos`, `Receitas`, `Documentos`, `ActionPlanModal` e no **default** do `DonutCategoryCard`. Migração para `lib/currency` por concluir. |
| P5.4 | `diagnostico.resumoExecutivo` diz "No mês de referência" sem nomear o mês, enquanto os cartões ao lado nomeiam três meses diferentes. Não é falso, é vago. |
| P5.5 | `coverageDiagnostics` é contrato interno: nenhuma tela o mostra. Decidir se e onde aparece. |
| P5.6 | Metadata nova do Apps Script existe **só localmente**. Produção continua na versão 11 e o frontend não depende dela. |
| P5.7 | Validação visual em viewport estreito não foi possível: `resize_window` reporta sucesso mas o viewport mantém-se em 1920. Responsividade da secção nova verificada por padrão de markup (`flex-wrap`, `min-w-0`, `truncate`, `shrink-0`) e ausência de overflow horizontal na página. |

---

## Sessão 2026-08-25 — Chat migrado, queda em massa, auditoria do Plus

Continuação direta da sessão anterior, que terminou a meio de um patch em
`utils/chatEngine.js`. **Nada foi publicado.** Produção continua na versão 11.

### Resolvido

- **O Chat lia `resumo.metrics.despesas`, um campo que já não existe.** O contrato legado
  foi removido do serviço na sessão anterior e a migração do Chat ficou por terminar. As
  contas a pagar passam a sair de `contasPagar`/`contasPagarMonthKey` — mês civil, por
  vencimento — e a resposta nomeia o mês. A fixture dos testes continuava a emitir os
  campos legados, ou seja, testava um dataset que já não existe; foi migrada.
- **Três das nove perguntas do guião caíam no fallback** e uma respondia sobre o mês
  errado sem o dizer: *"porque é que julho não aparece na rentabilidade?"* contém
  "rentabilid", era atendida pelo ramo da DRE e devolvia a margem do **mês âncora**. Com a
  âncora em junho, a resposta a uma pergunta sobre julho era o valor de junho.
  - meses nomeados na pergunta passam a mandar (`mesPerguntado_`, com **fronteiras de
    palavra** — "qual o **maio**r risco", uma das sugestões do próprio Chat, era lida como
    "maio");
  - *"porque é que X não aparece"* explica a ausência a partir de `closings[].financial`,
    na **mesma redação** que o Resumo usa (`descreverBloqueio`, agora exportada);
  - âncora obtida por **recurso** (`anchorSource: fallback`) deixa de ser apresentada como
    mês completo;
  - *"estamos lucrando?"* — a lista tinha "lucro" e "lucrando" não contém "lucro". Passa a
    "lucr", e o **sim/não só se afirma sobre base utilizável**: com `partial`, o resultado
    é um mínimo conhecido que pode ficar negativo ao fechar o mês.
  - *"quanto tivemos de despesas?"* caía no ramo da faturação e devolvia um cartão de
    **receitas**. Passa a dar a linha da DRE e a contrastá-la com as contas a pagar, cada
    uma com o seu mês.
  - *"qual foi o melhor mês?"* responde por **faturação bruta**, com o critério dito e o
    mês em curso excluído.
- **Materialidade nas respostas de ausência** (fase 8): o Chat diz agora quantos títulos
  estão por classificar, quanto pesam e que percentagem são — e diz que **qualquer** título
  bloqueia, para não se inferir um limiar que não existe. Julho: 3 títulos, 0,38%,
  R$ 1 554,35. **Nenhum limiar foi criado.**
- **Queda em massa (P0 do R1).** `podeGravarListagemVazia_` pergunta "veio vazio?" — uma
  listagem de 5 títulos onde ontem havia 1390 passava a guarda e substituía o snapshot bom.
  Implementada a **estratégia A** de `INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md`: sonda de
  página +1 (`terminacaoPrematura_`, pura, **sem limiar nenhum**), só no rebuild, com
  **aborto sem gravar**. Pedidos ficam de fora com razão: consolidam via merge, não
  substituem. A estratégia B (limiar `K`) continua por decidir.
- **Custo da listagem de recebíveis medido** (`meta.listagemMs`, `meta.orcamentoMs`): o teto
  de escala — a listagem é integral e recomeça na página 1 a cada execução — deixa de ser
  invisível até ao dia em que deixa de convergir. Mede, não decide.
- **Quatro defeitos encontrados com o produto a correr no browser**, nenhum deles visível
  nos testes:
  - `4.500 €` numa empresa em BRL, no cartão "Pergunte à Finer" — e **duas das três
    sugestões eram recusadas pelo próprio Chat**. Passa a usar `SUPPORTED_QUESTIONS`, a
    mesma lista que a página do Chat já usa.
  - "Receitas (Mês)" **sem mês**, com "+105,4% vs mês anterior" a dois dedos do alerta "a
    faturação **caiu 56%** face ao mês anterior": meses diferentes, sinais opostos, nenhum
    declarado. O card nomeia o mês e cala a variação quando o mês está em curso — a regra
    que o card ao lado e o motor de alertas já aplicavam.
  - **O Chat recusava tesouraria** com a justificação de que faltavam "recebíveis com datas
    de vencimento, que ainda não estão ligados". Estão — e o cartão "Cashflow previsto" do
    Resumo já desenhava a variação líquida com o mesmo `buildCashflowForecast`. O produto
    contradizia-se; a afirmação falsa era a do Chat. Saldo bancário continua recusado.
  - **"Despesas: −79,44%"** em "Insights inteligentes" e "O que mudou" era a variação de
    **contas a pagar**, e nenhuma linha nomeava o mês. Renomeada, com o mês, e só entre
    períodos comparáveis (`canComparePeriods` sobre a availability dos dois meses).
- **Documentos desenhava as 2316 linhas do catálogo de uma vez**: ~62 800 nós e ~730 ms a
  cada entrada na página. Limitado a 100 com "mostrar mais": ~2 940 nós, **~42 ms**. A
  pesquisa e as tabs continuam a filtrar sobre a lista toda e a contagem é a real.

### Novo

| Módulo | Papel |
|---|---|
| `src/services/planoPlus.auditoria.test.js` | auditoria funcional do Plus — a lista de telas sai de `PLANS.plus.screens`, e o catálogo de perguntas anunciadas tem de ser respondível |
| `apps-script/quedaMassiva.test.js` | a estratégia A: função pura, onde se sonda, onde **não** se sonda, e o aborto antes de qualquer gravação |
| `apps-script/escalaListagem.test.js` | o custo da listagem é medido e publicado — e medir não é decidir |
| `src/pages/Resumo.estrutura.test.js` | cada cartão nomeia o seu mês; não se afirma variação sobre mês em curso |
| `src/pages/Documentos.estrutura.test.js` | o limite é de desenho, nunca de dados |
| `docs/READINESS_PLUS.md` | o veredito do plano Plus, o que bloqueia, e a estimativa de horas |

### Medições

- `buildSalesDataset`, re-medido: **10× dados → ×10,7 tempo** (linear); 60 meses de
  histórico custam o mesmo que 19. O que esta medição **não** cobre é o custo de desenhar
  — que foi onde estava o problema real (Documentos).
- Suite: **1632 testes / 60 ficheiros**, verde. Build verde.
- Browser, dez telas do Plus: zero `€`, zero `undefined`/`NaN`/`Invalid Date`, consola sem
  erros nem avisos.

### Pendente / a monitorizar

| # | Item |
|---|---|
| P6.1 | **DECISÃO DE NEGÓCIO — limiar de materialidade** (era P5.1). Os factos passaram a ser ditos ao utilizador; a política continua por existir. |
| P6.2 | **DECISÃO DE NEGÓCIO — quem declara um mês de contas a pagar fechado** (era P5.2/P4.2). Sem sinal derivável do snapshot. |
| P6.3 | **DECISÃO DE NEGÓCIO — estratégia B da queda em massa** (`K`). A é suficiente para terminação precoce; B cobriria um apagamento em massa no ERP. |
| P6.4 | **Recebíveis não convergem a ~5–6× o volume.** Agora medido em `meta.listagemMs`. Corrigir exige cursor de continuação: mudar esta fonte de *substitui* para *consolida*. |
| P6.5 | **Versão 12 por publicar**: truncamento de paginação, sonda de página +1, medição da listagem. Produção na 11. |
| P6.6 | Sem autenticação (`ANYONE_ANONYMOUS` + URL do proxy no bundle). Exige tocar no proxy, projeto separado. |
| P6.7 | Viewport estreito continua por validar: a ferramenta reporta sucesso mas o viewport mantém-se em 1920 (era P5.7). |
| P6.8 | Documentos usa "mostrar mais" em vez da paginação de `DataTable`. Resolve o custo; não unifica o padrão. |

### Resolvidos de listas anteriores

- **P4.5 / contrato legado no `chatEngine`** — migração concluída.
- **P5.3 / `formatEUR` nas páginas** — nenhuma página real o importa; travado por
  `lib/moedaCentralizada.test.js`.
- **P5.4 / `resumoExecutivo` sem mês** — nomeia o mês.

### Decisões tomadas em 25/08/2026 (fecham P6.1, P6.2, P6.3)

Registo completo em `docs/DECISOES_DE_NEGOCIO.md`.

- **D1 / materialidade (era P6.1): NÃO criar limiar.** Qualquer título relevante por
  classificar continua a impedir a completude da linha de despesas e, por consequência,
  pode impedir a elegibilidade do mês como âncora. A UI mantém os **factos** — quantidade,
  valor, rácio, categoria/origem. Nenhum `1%`, `0,5%`, `R$ X` ou equivalente. A política
  define-se com o que se observar no **piloto**.
- **D2 / cobertura das despesas (era P6.2): confirmação HUMANA, não inferência do
  calendário.** A ação futura chama-se *"Confirmar cobertura das despesas de \<mês\>"* e
  **nunca** "fechar mês", "fecho contabilístico" ou "encerramento contabilístico" — a
  Finer One não faz encerramento contabilístico. **Não implementada nesta publicação**;
  `payables.completeThroughMonth` fica em `"2026-06"`, inalterado.
- **D3 / queda em massa (era P6.3): `K` não é definido; estratégia B ADIADA.** A sonda de
  página +1 resolve deterministicamente a causa conhecida (terminação prematura da
  paginação) sem constante nenhuma. B reabre apenas perante evidência de uma queda
  anormal que passe por todas as proteções determinísticas atuais.

### Publicação — versão 12 do Apps Script (25/08/2026, 20:01–20:05)

Publicada no deployment oficial, **sem rollback**. Registo de execução completo no fim de
`docs/PUBLICACAO_P0_CHECKLIST.md`.

- `clasp push --force`: 15 ficheiros, **nenhum `*.test.js`** (os 9 ficam untracked pelo
  `.claspignore`); `clasp version` → **12**; `update-deployment -V 12` no **mesmo
  Deployment ID e mesma URL**.
- Continuam **2 deployments** — nenhum criado. `appsscript.json` intocado:
  `USER_DEPLOYING` / `ANYONE_ANONYMOUS`, sem bloco `oauthScopes`.
- Antes → depois, pelo mesmo caminho da aplicação: 1103 / 301 / 1421 registos,
  `parcial=false`, `meta.geradoEm` **byte-idêntico** (nenhum snapshot regenerado pelo
  deploy), PII redigida, `?recurso=xyz` → `RECURSO_DESCONHECIDO`, ajustes-manuais como
  documento. `check:data`: **SAUDÁVEL**, `completude: complete`, `algumaParcial: false`.
- Validação visual (Resumo, Despesas, Performance, Alertas, Chat): sem `€`, `NaN`,
  `undefined` ou `[object Object]`; consola sem erros nem avisos.
- **Nota operacional:** o primeiro `clasp deployments` a seguir ao `update-deployment`
  ainda devolveu `@11` — atraso de propagação da listagem, não falha. A chamada seguinte
  devolveu `@12`.

### Pendente — atualizado

| # | Item |
|---|---|
| P6.4 | **Recebíveis não convergem a ~5–6× o volume.** Agora medido em `meta.listagemMs` / `meta.orcamentoMs`. Corrigir exige cursor de continuação: mudar esta fonte de *substitui* para *consolida*. |
| P6.5 | ~~Versão 12 por publicar~~ — **publicada em 25/08/2026.** Falta observar a madrugada seguinte: os campos novos de `meta` só aparecem no primeiro rebuild com a v12 (gatilhos 01:00/02:00/03:00 America/Sao_Paulo), e é nesse rebuild que a sonda de página +1 corre pela primeira vez. |
| P6.6 | Sem autenticação (`ANYONE_ANONYMOUS` + URL do proxy no bundle). Exige tocar no proxy, projeto separado. **É hoje o único bloqueio de venda.** |
| P6.7 | Viewport estreito continua por validar. |
| P6.8 | Documentos usa "mostrar mais" em vez da paginação de `DataTable`. |
| P6.9 | **PRÓXIMA FASE — produto:** *"confirmar cobertura das despesas"* + fluxo de resolução das pendências do mês (D2). |

---

## Sessão 2026-08-26 — produto: confirmar cobertura das despesas

Primeira fase de PRODUTO depois da v12. **Nada publicado, nada commitado.** Produção
corre a versão 12 do Apps Script, que não tem a escrita de cobertura.

Contrato completo em `docs/COBERTURA_CONFIRMADA_CONTRATO.md`.

### O problema

`company.js` tinha `payables.completeThroughMonth: "2026-06"` editado à mão. Todos os
meses alguém teria de abrir o código e mudar uma string para o produto deixar de tratar
o mês anterior como parcial. **Não é configuração: é uma operação mensal disfarçada de
constante.**

### Resolvido

- **A configuração passa a ser o FALLBACK.** `resolveEffectiveCoverage` (puro) sobrepõe
  a cobertura confirmada por uma pessoa; sem confirmação devolve a MESMA referência, e
  nada muda por a função existir.
- **A ordem das duas chamadas em `buildSalesDataset` é a garantia de segurança e não é
  permutável:** `resolveEffectiveCoverage` escreve o limite, `coverageComSnapshotParcial`
  veta por cima. Como `sourceAvailability` testa `snapshotPartial` ANTES de olhar para o
  limite, **não existe caminho** para uma confirmação humana passar por cima de um
  snapshot incompleto. Medido no cenário E.
- **`PerformanceFinanceira` era um SEGUNDO leitor de `ACTIVE_COMPANY.historyCoverage`** e
  passaria a discordar do motor assim que a cobertura pudesse ser confirmada: a DRE veria
  julho como real e a série ao lado continuaria a chamar-lhe fora de cobertura. O dataset
  passou a expor `coverage` e `coverageOrigem` já resolvidos; a página lê de lá.
- **O documento de ajustes manuais ganhou um bloco `coverage`**, ao lado de `months` e
  nunca dentro dele: um CMV e uma cobertura não partilham validação, semântica nem
  histórico. O `confirmedBy` é um PAPEL (`"user"`), nunca uma pessoa — sem PII.
- **Escrita interna no Apps Script** (`salvarCoberturaConfirmada_`), com o mesmo lock,
  backup rotativo, guarda de empresa e resolução de ficheiro do CMV. **Editor-only, não
  publicada** — ver o bloqueio abaixo.
- **UX em "Dados a completar"**, com os dois tipos de pendência separados por desenho:
  INFORMAR um valor (CMV → "Introduzir valor") vs. CONFIRMAR um estado (cobertura →
  "Confirmar cobertura"). Confirmação em DOIS passos: o primeiro clique abre a frase
  exata e o que ela não significa; só o segundo confirma.
- **O Chat passou a distinguir duas coisas que o motor colapsa numa só causa
  (`cobertura`)**: a cobertura por confirmar (o utilizador resolve, e diz-se onde) e a
  leitura do ERP que não terminou (não há nada a fazer, resolve-se na próxima
  atualização). Dizer o mesmo nos dois casos manda o utilizador esperar quando podia agir.
- **A guarda estrutural do ecrã foi REESCRITA, não removida.** Dizia "nenhuma ação de
  escrita, nem sequer desativada" e a página cumpria-a por não ter ação nenhuma. Passa a
  proibir o que continua a ser verdade: nenhum campo de valores, nenhum vocabulário de
  fecho, nenhum botão desativado a fingir funcionalidade futura.

### ⚠️ BLOQUEIO ARQUITETURAL — persistência a partir do browser

O Web App é `ANYONE_ANONYMOUS` e o URL do proxy vai no bundle. **Qualquer endpoint de
escrita alcançável a partir deste frontend é um endpoint de escrita anónimo sobre dados
financeiros**, e um segredo dentro do bundle não é um segredo. Nenhum endpoint inseguro
foi criado.

O que existe: a confirmação é REAL no motor (o dataset é reconstruído e tudo recalcula),
dura a sessão, e a UI **diz** "confirmada nesta sessão" em vez de prometer persistência
que não tem. A persistência definitiva faz-se hoje pelo caminho do CMV — um operador
executa `runConfirmarCoberturaDespesas` no editor, autenticado pela conta Google.

`coberturaConfirmada.test.js` falha se aparecer um `doPost` em qualquer ficheiro do
Apps Script, ou se o `doGet` encaminhar para a escrita.

### Julho de 2026, medido com dados reais (`diagnostico/_coberturaJulho.mjs`)

```
antes : deductions[cobertura] cmv[por_informar] operatingExpenses[cobertura,classificacao] withdrawals[cobertura]
depois:                       cmv[por_informar] operatingExpenses[classificacao]
```

`revenueNet`, `deductions`, `withdrawals` e `payablesCoverage` passam a `real`;
`coverageNeedsReview` cai para false. `cmv` e `operatingExpenses` **não** — e os
3 títulos por classificar (R$ 1 554,35 · 0,38%) continuam visíveis e continuam a
bloquear. Cobertura completa não é classificação completa.

### Novo

| Módulo | Papel |
|---|---|
| `utils/manualCoverage.js` | a regra — normalização, validação, merge, proveniência |
| `utils/coverageConfirmationView.js` | a apresentação — estados do cartão e a copy |
| `apps-script/AjustesManuaisBackend.js` (bloco novo) | escrita interna, editor-only, **não publicada** |
| `diagnostico/_coberturaJulho.mjs` | o antes/depois com dados reais, read-only |
| `docs/COBERTURA_CONFIRMADA_CONTRATO.md` | o contrato e o bloqueio de autenticação |

### Pendente

| # | Item |
|---|---|
| P7.1 | **Autenticação** — 33–56 h, decomposto em `COBERTURA_CONFIRMADA_CONTRATO.md` §6. É o único bloqueio de venda e o que desbloqueia a persistência da confirmação. |
| P7.2 | Confirmação persiste apenas na sessão até P7.1. Persistência real via editor do Apps Script. |
| P7.3 | Bloco de escrita de cobertura **por publicar** (seria a v13). Produção na v12. |
| P7.4 | `payables.completeThroughMonth: "2026-06"` continua em `company.js` como **fallback legado**. Deixou de ser operacional; sai quando a confirmação persistir. |
| P7.5 | Herdados: recebíveis não convergem a ~5–6× o volume (P6.4); viewport estreito por validar (P6.7); Documentos usa "mostrar mais" (P6.8). |

---

## Fundação SaaS — 26/08/2026

Sessão dedicada à transição de aplicação de uma empresa para fundação de SaaS
multiempresa. Documentação em `docs/SAAS_AUTH_ARCHITECTURE.md`, plano de migração em
`docs/MIGRACAO_SAAS_SEM_BIG_BANG.md`, horas em `docs/READINESS_SAAS.md`.

**Nada foi publicado.** Apps Script continua na v12, sem alterações.

### Resolvido

- **Autenticação, sessão e contexto de empresa** — `src/auth/` (12 módulos).
  Provider recomendado: **Supabase** (Auth + Postgres + memberships + RLS num só).
- **Núcleo de autorização** (`authorizationCore.js`) — puro, sem imports, vendorado
  pelo BFF, com teste que falha se as cópias divergirem.
- **BFF protegido** — `finer-one-proxy`: `lib/protect.js`, `lib/verifyToken.js`,
  `lib/memberships.js` e dois endpoints escopados por empresa. Escrito, por publicar.
- **Nome da empresa e nome do utilizador deixaram de vir do `mockData`** na Sidebar,
  no AppShell e no Resumo.

### Defeitos encontrados e corrigidos

1. **`NODE_ENV=test vite build` incluía o adaptador de autenticação simulada no
   bundle.** O Vite deriva `import.meta.env.DEV` de `NODE_ENV` quando ela existe; um CI
   que a defina globalmente publicaria autenticação falsa. Guarda passou a exigir também
   `import.meta.env.MODE !== "production"`. Coberto por um teste que constrói de
   propósito num ambiente contaminado.
2. **Empresa ativa por omissão escolhida por ordem alfabética** — um utilizador
   `member` da sua empresa e `viewer` na de um cliente aterrava na do cliente. Passou a
   ser por senioridade do papel, com desempate estável pelo nome.
3. **Trocar de empresa mostrava os números da Overcel sob o nome de outra** — a leitura
   ainda não é escopada por empresa. O dataset passou a carimbar `companyId` e há um
   gate (`companyDataScope.js`) que recusa apresentar dados de outra empresa.
4. **`userInitials` incluía o domínio do email** — "ana.silva@x.com" dava "AC" em vez
   de "AS", e toda a gente da mesma empresa teria a mesma segunda inicial.

### Aberto

- **`AjustesManuais` não esconde "Confirmar cobertura" a um `viewer`.** O servidor
  recusa (403) e há teste disso; a UI ainda oferece o botão. `sessionCan()` já existe —
  falta ligá-la à página, que tem teste estrutural e merece um passo próprio.
- **Sem Content-Security-Policy.** `docs/THREAT_MODEL_MULTIEMPRESA.md` §11.
- **Resíduo cosmético após logout**: o Recharts deixa um `<span aria-hidden>` fora do
  `#root`, a ~20000 px acima do ecrã, com o último rótulo de eixo (ex.: "-R$ 140 mil").
  A árvore React fica limpa e nenhum valor financeiro persiste. Fixável numa linha se
  incomodar; não se fez para não pôr a camada de autenticação a conhecer internos do
  Recharts.
- **`finer-one-proxy` não é repositório git.** É o único sítio onde o código do BFF
  existe. `git init` antes de o pôr a servir escritas financeiras.
