# Registo de riscos

> Atualizado a **29/08/2026**, ao fim da segunda sessão de telemóvel (frontend e release
> engineering). Dois riscos **novos** encontrados, provados e fechados — R-18 e R-19.
>
> **Nota de ambiente:** a máquina de desenvolvimento corre em `America/Sao_Paulo` — o mesmo fuso da Overcel. Os testes sensíveis a fuso são executados no fuso que importa, e não num neutro.
> **Estados:** `aberto` · `mitigado` · `fechado` · `aceite` · `bloqueado` (precisa de
> acesso que a sessão não tinha).

## Etapas, para a coluna "bloqueia"

| Etapa | O que é |
|---|---|
| **E1** | publicar o BFF em produção |
| **E2** | ligar autenticação no frontend |
| **E3** | ligar `VITE_PROTECTED_DATA_TRANSPORT` |
| **E4** | primeiro cliente-piloto além da Overcel |
| **E5** | escala (vários clientes, escritas ligadas) |

---

## Resolvidos nesta sessão

| ID | Risco | Sev. | Estado | Onde |
|---|---|---|---|---|
| R-01 | O dataset era etiquetado com a empresa **compilada**, não com a lida. Com o transporte protegido ligado, o guarda de escopo recusaria apresentar dados a **todas** as empresas menos uma. E, mais fundo: uma etiqueta que não depende da leitura nunca pode detetar uma leitura errada. | **P1** | fechado | `7994255` |
| R-02 | Um período de datas invertido (`dataInicial > dataFinal`) atravessava os dois endpoints. Desfecho provável: `{"data":[]}` com 200 — um zero indistinguível de um zero verdadeiro. | **P2** | fechado | `9152ae4` |
| R-03 | Injeção de fórmula no CSV exportado. As colunas incluem `cliente`, `fornecedor`, `title` e `description`, com origem no Bling. Quem abre o ficheiro é quem tem os números todos à frente. | **P2** | fechado | `15f49e8` |
| R-04 | `metadata.requestedCompanyId` entrava no `audit_log` **sem limite de tamanho**. Um titular de conta legítimo podia escrever, por pedido recusado, tanto texto quanto coubesse num URL — em 500 MB sem retenção. | **P3** | fechado | `69935df` |
| R-05 | O score declarava "a empresa atingiu o score máximo" quando uma dimensão não tinha sido avaliada. Em julho/2026, com o CMV ausente, isso é uma afirmação sobre a saúde da empresa a partir da dimensão mais importante, nunca calculada. | **P2** | fechado | `d1b0eff`, `a7c46a4` |
| R-H | **A auditoria autenticada era `void`** — a resposta partia e a escrita ficava a correr sozinha. Numa função serverless a instância congela quando a resposta sai. Medido no Preview: quatro recusas autenticadas, **três linhas**; a perdida foi a última antes do repouso. Funcionava sob tráfego e falhava na sondagem isolada, que é o caso que existe para apanhar. | **P2** | fechado | `74a1e0b` (BFF) |
| R-12 | `monthKeyOf` interpretava uma data de calendário como instante UTC: `"2026-07-01"` devolvia **junho** em `America/Sao_Paulo`. Latente (os três chamadores passam `Date`), e invisível em Lisboa — só apareceria no browser do cliente brasileiro. | **P2** | fechado | `f471c77` |

---

## Encontrados e fechados na sessão de 29/08 (telemóvel, frontend)

| ID | Risco | Sev. | Estado | Onde |
|---|---|---|---|---|
| R-18 | **O dataset era carimbado com a empresa ATIVA mesmo quando a leitura NÃO foi escopada.** `FinerDataProvider` passa `companyId` a `loadFinerData` sem perguntar que transporte foi resolvido. Com autenticação LIGADA e `VITE_PROTECTED_DATA_TRANSPORT` DESLIGADO — a **etapa A do rollout faseado** — o transporte é o legado anónimo: trocar para a Finer Teste lia os dados da **Overcel** e carimbava-os "finer-teste", `resolveCompanyDataScope` devolvia `LIGADA`, e o `AppShell` montava as páginas. Os números reais de uma empresa sob o nome de outra, com o guarda de escopo a dizer que estava tudo bem. | **P1** | **fechado** | `9531cc8` |
| R-19 | **A cobertura e a moeda da configuração atravessavam para outra empresa.** Mesma classe de R-18, nos outros dois campos que `buildSalesDataset` ia buscar a `ACTIVE_COMPANY`: `historyCoverage` (que é o que autoriza tratar um mês como **real** em vez de `partial`) e a moeda do catálogo documental (Overcel BRL, Finer Teste EUR). `PerformanceFinanceira` já se protegia disto, mas prefere `sales.coverage` — a proteção documentada na página era contornada pelo dataset. | **P2** | **fechado** | `b99c97d` |
| R-20 | **`neutralizarFormula` decidia sobre a string crua**, portanto um espaço antes do `=` escondia a fórmula do CSV. Não explorável no momento da importação (com espaço, a folha lê a célula como texto), mas basta um "remover espaços" ou uma reimportação com trim para a fórmula ficar armada. | P3 | **fechado** | `3022fef` |

> **Porque nenhum destes tinha sido apanhado antes:** `datasetCarimbaEmpresa.test.js` só
> exercia o transporte **protegido**, onde a empresa pedida e a lida coincidem por
> construção. O par "autenticação ligada + transporte legado" — que é precisamente o do
> meio da migração — não existia em teste nenhum. Foi por ser considerado a etapa
> inofensiva que não tinha cobertura.

---

## Encontrados e fechados na auditoria de módulos (29/08, telemóvel)

Sessão dedicada às áreas que a auditoria anterior deixou explicitamente por cobrir:
Documentos, Clientes/Fornecedores, Chat, Alertas, rótulos de demonstração,
`Content-Type`, retoma após offline e acessibilidade.

| ID | Risco | Sev. | Estado | Onde |
|---|---|---|---|---|
| R-22 | **Três ecrãs 100% `mockData`, sem qualquer selo, alcançáveis no plano por omissão.** `Indicadores`, `Planeamento e Cashflow` e `Benchmarking do Setor` não importavam sequer `useFinerData`. O `DemoBanner` global só existe FORA do modo API: com dados reais ligados desaparece, e os três ficam indistinguíveis do Resumo e da Performance. `DEFAULT_PLAN` é `team` e os três estão na sua lista de `screens`. O mais grave é o Planeamento — um saldo previsto a 90 dias e um "risco de liquidez" são o tipo de número sobre o qual se decide adiar um pagamento ou pedir crédito. | **P1** | **fechado** | `41059a9` |
| R-23 | **O nome da empresa estava escrito à mão em nove ecrãs.** `formatacaoAtiva.test.js` garantia que nenhuma página IMPORTA `ACTIVE_COMPANY`, mas não cobria o nome a chegar como TEXTO. Com o transporte protegido ligado (E3) e a empresa B ativa, os números são de B e o cabeçalho dizia "Overcel" — o R-18 ao contrário. O pior era o `FinerScore`, cujo subtítulo diz que a nota é "útil também para bancos e investidores". | P2 | **fechado** | `522adf9` |
| R-24 | **Controlos só com ícone, sem nome acessível.** Paginação da `DataTable` (4 botões), campo e botão de envio do Chat, campos de pesquisa. E o `RowActionsButton`, presente uma vez por linha em três tabelas, era um botão ativo, focável, anónimo e **sem `onClick`** — 25 paragens de teclado por página que anunciam "botão" e não fazem nada. | P2 | **fechado** | `ebdfce6` |

---

## Sessão de desktop — 29/08/2026

| ID | Risco | Sev. | Estado | Nota |
|---|---|---|---|---|
| R-A | **A integração Git da Vercel apontava para `igororlandi999/finer-one-proxy`** — público, antigo, com Production Branch `main` e `Ignored Build Step: Automatic`. Um push para lá construía código de junho e ia para `finer-one-proxy.vercel.app`. Não era teoria: a integração já produzira um deployment de produção (`8qeqbaqr6`, 16/jun). | **P1** | **fechado** | Ligação removida. `Connected Git Repository: nenhum`; `Branch Tracking: No branch configuration`; deploy hooks impossíveis. Production, domínio, aliases, envs e os 8 deployments intactos. Deploy do BFF passa a ser **manual por CLI**, por decisão. |
| R-B | **Protection Bypass for Automation** — um segredo permanente que alcança qualquer deployment protegido do projeto. Três builds anteriores a `6d8c0b0` (`gixpv09c7`, `8qeqbaqr6`, `9jm3rl3m4`) devolvem `Access-Control-Allow-Origin: *` e entregariam os dados reais da Overcel a qualquer origem que os pedisse. | **P1** | **aberto — temporariamente aceite para testes** | Mantido só porque é o que dá acesso automatizado aos Previews protegidos. **Remover imediatamente depois do smoke do último Preview e ANTES de qualquer promoção para Production.** Remover fecha os três de uma vez, sem apagar deployment nem perder alvos de rollback. |

**Aliases residuais, removidos na mesma sessão:** `…-git-main-…` (apontava para `8qeqbaqr6`, junho) e `…-igororlandi999-…` (apontava para `gixpv09c7`). Restam dois, ambos da Production atual `kgcs3qugg`, verificados por comportamento. Os builds antigos continuam a existir como alvos de rollback, alcançáveis apenas pelo URL do deployment e atrás de Deployment Protection.

---

## Abertos

| ID | Risco | Sev. | Estado | Bloqueia | Mitigação |
|---|---|---|---|---|---|
| R-06 | **`redirect: "follow"` nos dois endpoints.** Se o upstream for comprometido, um `302` para `169.254.169.254` seria seguido pelo BFF. | P2 | **aceite** | — | É **obrigatório**: o Apps Script responde `302` de `script.google.com` para `script.googleusercontent.com`, e `redirect: "error"` partiria produção. Mitigado por o destino inicial vir só de `process.env` (nenhum input do cliente lhe toca — testado) e por o corpo ter de passar `corpoEhJsonDoContrato`. **Fechar com uma lista de hosts permitidos após confirmar em Preview a cadeia real de redirects do GAS.** |
| R-07 | **`{"error":true}` do Apps Script chega ao BFF com HTTP 200 e sai como 200.** `corpoEhJsonDoContrato` só prova "é um objeto". | P2 | aberto | E3 | Defendido a jusante: `linhasOuFalha` (`blingDataService.js:1224`) rejeita `res.error === true` e transforma-o em fonte indisponível. É uma defesa numa camada só. Endurecer o BFF (recusar `error:true` com 502) é local e testável, mas muda o contrato de um endpoint em produção — **fazer com Preview disponível**. |
| R-08 | **`{ok:false, error:{...}}` passaria a guarda do frontend**, porque `res.error === true` é falso quando `error` é um objeto. | P3 | aberto | E3 | Hoje **não é alcançável**: essa forma é produzida por `erroAjuste_`, que só serve o `doPost`, e o BFF só faz `GET`. Fica registado porque a distância entre "não alcançável" e "alcançável" é uma rota nova. |
| R-09 | **`cobertura.confirmada` não é reposta na troca de empresa.** | P3 | aberto | E4 | Sem impacto visível: o campo é escrito e nunca lido. Ver `CACHE_E_ESTADO_INVENTARIO.md` §C1. |
| R-10 | **Empresa preferida é uma chave global de `localStorage`**, partilhada entre utilizadores do mesmo browser. | P3 | mitigado | — | `sessionContract.js` revalida contra as memberships da sessão; um id sem membership é descartado. Pior caso: preferência ignorada. Nunca acesso concedido. |
| R-11 | **`ALLOWED_ORIGINS="*"` é honrado** (com aviso), em vez de falhar fechado. | P3 | aceite | — | É uma decisão explícita, não um acidente: o `*` só existe se alguém o escrever, nunca por omissão, e é registado em voz alta. Não há `Allow-Credentials` em resposta nenhuma, pelo que `*` não expõe sessões — expõe o endpoint **legado anónimo**, que já é anónimo. |
| R-17 | **`parseLocalISODate` só trata pelos componentes o que é exatamente `AAAA-MM-DD`.** Uma chave de mês (`"2026-07"`) cai no `new Date` e recua um mês em fusos negativos. | P3 | aberto (latente) | E4 | **Sem chamador demonstrado — reconfirmado a 29/08** por varrimento de **todos** os ~50 chamadores de `toDate`/`monthKey`/`monthKeyOf`/`parseLocalISODate`: cada um recebe um campo de data de registo (`o.date`, `p.vencimento`, `r.vencimento`, `comp.date`, `payableDate`, `receivableDate`) ou um objeto `Date` (`referenceDate`, `now`). Nenhum recebe uma chave de mês. É o ponto único de conversão de datas de todo o motor financeiro; alargá-lo sem um chamador seria mudar a fundação para um problema que ninguém tem. Declarado com teste que falha **nas duas direções** em `src/utils/monthKeyFuso.test.js`. |
| R-13 | **`npm audit`: 5 vulnerabilidades** (1 baixa, 2 moderadas, 2 altas) — `@babel/core`, `esbuild`/`vite`, `nanoid`, `postcss`. | P3 | aceite | — | **Todas em ferramentas de build**, nenhuma no bundle de produção. A do `esbuild` é do servidor de desenvolvimento. Corrigir exige `vite@8` (mudança maior). Reavaliar quando houver janela para a atualização. **Reconfirmado a 29/08: exatamente as mesmas 5, sem alteração.** |
| R-14 | **Apps Script continua `ANYONE_ANONYMOUS`** e o URL do proxy vai no bundle. | **P1** | aceite (conhecido) | E4 | É o motivo de existir o endpoint legado e de as escritas de cobertura estarem desligadas. Nada a fazer sem tocar no Apps Script — fora do âmbito desta sessão por decisão explícita. |
| R-15 | **Sem política de retenção no `audit_log`.** | P3 | aberto | E5 | R-04 limitou o tamanho de cada linha; não limita o número. Exige DDL — migração `004` a desenhar, **não executar**. |
| R-16 | **Sem limitação de taxa em lado nenhum.** | P2 | aberto | E5 | Fora do âmbito local: exige Redis ou o produto da plataforma. Documentar antes de E5. |
| R-25 | **`Movimentos`, `Relatorio` e `Alertas Preditivos` são 100% `mockData` e não têm selo** — o mesmo defeito de R-22. | P3 | aberto (latente) | E4 | **Inalcançáveis.** Não estão na lista de `screens` de plano nenhum (`plus`, `pro`, `team`), não têm entrada na barra lateral e nenhum `navigateTo` aponta para eles; o `App.jsx` mapeia-os mas o ecrã ativo só é escolhido a partir do plano. O `Movimentos` é o mais notável: mostra `saldoLiquido` = entradas − saídas, que é a métrica pseudo-resultado que este projeto baniu. **No dia em que qualquer um entrar num plano, o teste `mockAlcancavelTemSelo.test.js` falha** — a regressão está armada, não depende de alguém se lembrar. |
| R-26 | **Não há retoma automática depois de a rede voltar.** | P3 | **aceite** | — | Comportamento **determinado**, não suposto: não existe `addEventListener("online")`, `navigator.onLine`, polling nem `setInterval` em lado nenhum. Consequências: (1) offline com a app parada não acontece nada — os dados no ecrã continuam a ser reais e a sua idade é declarada por `resolveDataHealth` a partir de `meta.geradoEm` (aviso às 24 h, `stale` às 72 h), portanto não são apresentados como mais frescos do que são; (2) qualquer leitura que FALHE leva a `unavailable`, o `AppShell` desmonta as páginas e mostra `DataUnavailable` com botão de repetir — nunca dados antigos sob um estado novo; (3) a recuperação exige esse clique. Não se implementou retoma automática: seria acrescentar comportamento sem um defeito demonstrado. |
| R-27 | **`{ ...mock, ...real }`: as métricas do mock são a BASE e as reais são sobrepostas** em `Resumo`, `Despesas` e `ClientesFornecedores`. Uma chave que o construtor real não forneça fica silenciosamente com o valor do mock. | P3 | aberto (latente) | E4 | **Seguro hoje, verificado por enumeração de todos os pontos de render.** Cada sítio onde uma chave preenchida pelo mock poderia aparecer está guardado por `source === "api"` (o "Saldo Disponível" do Resumo mostra "—, integração bancária não configurada") ou por um `demo=` próprio; e os deltas que o motor não sabe calcular são `null` EXPLÍCITO — não ausentes — pelo que o spread os sobrepõe e o `MetricCard` esconde-os (`typeof delta === "number"`). A fragilidade é estrutural: **a segurança depende de o construtor real fornecer todas as chaves que a página lê**, e um KPI novo que leia uma chave só-do-mock apareceria como real, sem selo. Não corrigido por não haver defeito demonstrado; registado porque a próxima pessoa a acrescentar um KPI não vai saber disto. |
| R-21 | **`Documentos.jsx:433` constrói um `href` a partir de `d.file.url`, sem validar o esquema.** Um `javascript:` vindo da fonte executaria no clique. | P3 | aberto (latente) | E4 | **Não alcançável hoje** — reconfirmado na auditoria de módulos por leitura do construtor, e não só do consumidor: `makeDocument` recebe `file` e **nenhuma** das três fontes (`documentsFromOrders`, `documentsFromPayables`, `documentsFromReceivables`) lho passa, pelo que cai sempre em `EMPTY_FILE` (`url: null`), `documentStatus` devolve `metadata_only`, `temFicheiro` é falso e o `<a>` nunca é renderizado. Já tem `rel="noopener noreferrer"`. Fica registado pela mesma razão de R-08: a distância entre "não alcançável" e "alcançável" é uma fonte nova. **Quando o ficheiro real existir, são 3 linhas** — permitir só `https:` (e `http:` se necessário) e cair no botão desativado em tudo o resto. Não se faz agora porque acrescentar código para um problema que ninguém tem é como o R-17 chegou a este registo. |
| R-28 | **O `ActionPlanModal` não era um diálogo, e continua sem contenção.** O painel do Plano de Ação era um `<div>` liso dentro do véu: sem `role`, sem nome acessível, sem `aria-modal`, sem armadilha de foco, sem fecho por `Escape`, sem foco inicial e sem devolução do foco ao fechar. Para quem usa leitor de ecrã, o plano de ação — com valores de impacto em dinheiro — aparecia no meio da página anterior sem nada indicar que era outra coisa. | P2 | **parcialmente fechado** | E4 | **Fechado o que é provável estaticamente:** `role="dialog"` no PAINEL (não no véu, que fecha ao clique) e `aria-labelledby` ligado ao `<h2>` "Plano de Ação", com regressão que MONTA o componente e verifica que o `id` apontado existe mesmo — `ActionPlanModal.dialogo.test.jsx`. **Fica aberto o que muda comportamento em tempo de execução e precisa de teclado real num browser:** armadilha de foco, `Escape`, foco inicial, devolução do foco ao elemento que abriu, e `inert`/`aria-hidden` no fundo. **`aria-modal` fica DELIBERADAMENTE de fora até lá** — declarar a contenção sem a construir esconde o fundo do leitor de ecrã enquanto o `Tab` continua a ir lá parar, o que é pior do que não a declarar; há um teste que falha se alguém o acrescentar sozinho. Único diálogo da aplicação (o outro `fixed inset-0` é o véu da barra lateral em mobile, que não é diálogo). |

---

## FASE H — mutation testing dos guardas recentes (29/08, telemóvel)

Um guarda sem regressão que o defenda é um guarda com data de validade. Esta fase não
procurou defeitos no produto: procurou saber **quais das correções recentes sobreviveriam
a serem desfeitas em silêncio**. Cada mutação foi aplicada isoladamente, corrida, e o
ficheiro restaurado imediatamente com `git checkout --` e `git diff` confirmado vazio
antes da seguinte. Nunca duas ao mesmo tempo.

| # | Guarda | Mutação aplicada | Resultado |
|---|---|---|---|
| M1 | R-23 | `Alertas.jsx`: subtítulo volta a `"…na Overcel hoje…"` escrito à mão | **morreu** — `nomeDaEmpresaNaCopy` (1 de 2) |
| M2 | R-23 | `Resumo.jsx`: subtítulo deixa de usar `company?.name` (o contrapeso) | **morreu** — `nomeDaEmpresaNaCopy` (o outro 1 de 2) |
| M3 | R-18 | `blingDataService`: `companyId: transporte.protegido === true ? companyId : undefined` → `companyId` | **morreu** — `carimboComTransporteLegado` (2 asserções) |
| M4a | R-19 | `historyCoverage` da configuração passa a atravessar para qualquer empresa | **morreu** — `carimboComTransporteLegado` |
| M4b | R-19 | moeda documental da configuração passa a atravessar para qualquer empresa | **morreu** — `carimboComTransporteLegado` |
| M5 | R-22 | `Indicadores.jsx` perde o `DemoTag` e o `import` | **morreu** — `mockAlcancavelTemSelo` |
| M6 | R-25 | `RELATORIO` entra na lista de `screens` do plano `team` | **morreu** — `mockAlcancavelTemSelo`, com a mensagem exata: *"relatorio (Relatorio.jsx) — falta: useFinerData e DemoTag"*. A regressão armada do R-25 está **provada**, não suposta. |
| M7 | R-24 | **todos** os `aria-label` e o `aria-live` da `DataTable` removidos de uma vez | **SOBREVIVEU à suite inteira** — 2329 testes, 95 ficheiros, todos verdes. Ver R-29. |
| M7-bis | R-24 | a mesma mutação, alargada ao Chat e aos Documentos, **depois** da regressão nova | **morreu** — 8 de 8 |
| M8 | R-24 | só o `aria-live` do indicador "página X / Y" | **morreu** — 2 de 8 (o `aria-live` é coberto por si próprio, e não por arrasto) |
| M9 | R-28 | o `ActionPlanModal` volta ao ficheiro em `HEAD` (sem `role` nem `aria-labelledby`) | **morreu** — 7 de 8 |

### O achado

| ID | Risco | Sev. | Estado | Onde |
|---|---|---|---|---|
| R-29 | **O R-24 foi fechado sem uma única linha de regressão.** Não é uma suspeita: removeram-se de uma vez os seis `aria-label` e o `aria-live` da `DataTable` — o componente onde vivem as receitas, as despesas e os movimentos — e a suite inteira ficou verde. A correção estava certa e ficou indefesa: qualquer refactor futuro podia desfazer o R-24 por completo sem que nada o dissesse. É um defeito sobre a QUALIDADE DA REGRESSÃO, não sobre o produto — e a doutrina desta auditoria manda corrigir o teste antes de assumir que o código está errado. | P3 | **fechado** | `DataTable.nomesAcessiveis.test.jsx` |

A regressão nova **monta** a `DataTable` em vez de ler a fonte, e a regra que aplica é
generalizada: *todos* os botões desenhados têm de ter nome (`aria-label`, texto visível ou
`title`) e *todos* os campos têm de ter nome — com `placeholder` explicitamente recusado,
porque desaparece assim que se escreve. Apanha o quinto botão sem nome que ainda não
existe, e não só os quatro que existem hoje.

---

## Bloqueados — precisam de desktop com sessão iniciada

Nenhum destes é uma falha conhecida. São **verificações que não foi possível fazer**, e
não fazer uma verificação não é o mesmo que passá-la.

| ID | O que falta verificar | Bloqueia |
|---|---|---|
| B-01 | Smoke test do Preview **com token válido**: `200` com membership, `403` sem, e o isolamento entre duas empresas | E1 | **verificado** 29/08 com conta de smoke dedicada |
| B-02 | Que a cadeia `Apps Script 401 → BFF 502 → sem logout` se comporta assim **em rede real**, e não só nos duplos | E1 | **verificado** 29/08 — upstream 401 real → BFF 502 |
| B-03 | A cadeia real de redirects do Apps Script em Preview (quantos saltos, para que hosts) — fecha R-06 | E1 |
| B-04 | Equivalência entre o Preview e a produção para os quatro recursos do caminho legado | E1 |
| B-05 | Que `ALLOWED_ORIGINS` está configurada no Vercel **antes** de publicar (⚠️ o legado passou de aberto a fechado por omissão) | E1 | **verificado** 29/08 |
| B-06 | Estado real das variáveis de ambiente de produção e da Deployment Protection | E1 | **verificado** 29/08 |
| B-07 | Estado real das políticas de RLS no Supabase — a matriz documentada vem do **SQL versionado**, não da base de dados | E2 | **verificado** 29/08 contra a base de dados |
| B-08 | Que `company_coverage` tem mesmo 0 linhas e `company_integration` não guarda nenhuma URL | E2 | **verificado** 29/08 — 0 linhas; a integração guarda `{provider, envKey}` |
| B-09 | Comportamento de `HEAD` **no runtime da Vercel** (a plataforma pode convertê-lo em `GET`). O handler rejeita-o com 405; o que a plataforma faz antes não é verificável localmente | E1 | **verificado** 29/08 — 405 nos três endpoints, sem ida ao upstream |
