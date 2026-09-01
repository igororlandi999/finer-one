# Registo de riscos

> **Atualizado a 30/08/2026**, na sessão de **preparação para E3** — que não iniciou E3,
> não ligou `VITE_PROTECTED_DATA_TRANSPORT` e não publicou nada. Fechou **R-B** (com
> prova pelo fio), **R-34** (metade, com patch e teste) e **B-04** (por obsolescência);
> aceitou **R-07** por escrito; deu veredito a **R-32**; desenhou a saída de **R-33**; e
> deixou **B-03** aberto por uma razão concreta e registada. Entrada nova: **R-38**.
>
> *Anterior: 30/08/2026, sessão de consolidação pós-E2. Sete entradas novas (R-31 a
> R-37), todas vindas da validação de E2 em browser real ou de factos conhecidos que
> ainda não tinham sítio. **Nenhuma abriu trabalho novo** — eram registo.*
>
> *Anterior: 29/08/2026, ao fim da segunda sessão de telemóvel. Dois riscos novos
> encontrados, provados e fechados — R-18 e R-19.*
>
> **Nota de ambiente:** a máquina de desenvolvimento corre em `America/Sao_Paulo` — o mesmo fuso da Overcel. Os testes sensíveis a fuso são executados no fuso que importa, e não num neutro.
> **Estados:** `aberto` · `mitigado` · `fechado` · `aceite` · `bloqueado` (precisa de
> acesso que a sessão não tinha).

## Etapas, para a coluna "bloqueia"

| Etapa | O que é | Estado a 30/08/2026 |
|---|---|---|
| **E1** | publicar o BFF em produção | ✅ **concluído** — `74a1e0b` em Production, smoke concluído |
| **E2** | ligar autenticação no frontend | ✅ **concluído** — 30/08, `a8bfca0` → `gh-pages 22b0526` |
| **E3** | ligar `VITE_PROTECTED_DATA_TRANSPORT` | ⛔ **não iniciado** |
| **E4** | primeiro cliente-piloto além da Overcel | não iniciado |
| **E5** | escala (vários clientes, escritas ligadas) | não iniciado |

> ⚠️ **Atenção à numeração.** Aqui `E1` = *publicar o BFF*. Em
> `FRONTEND_AUTH_RELEASE_PLAN.md`, `E1` = *publicar os commits do frontend com os
> interruptores desligados* — e é **esse** o E1 que foi saltado (desvio **D-1**). A
> tabela de tradução entre as duas numerações está no topo desse ficheiro.

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
| R-18 | **O dataset era carimbado com a empresa ATIVA mesmo quando a leitura NÃO foi escopada.** `FinerDataProvider` passa `companyId` a `loadFinerData` sem perguntar que transporte foi resolvido. Com autenticação LIGADA e `VITE_PROTECTED_DATA_TRANSPORT` DESLIGADO — a **etapa A do rollout faseado** — o transporte é o legado anónimo: trocar para a Finer Teste lia os dados da **Overcel** e carimbava-os "finer-teste", `resolveCompanyDataScope` devolvia `LIGADA`, e o `AppShell` montava as páginas. Os números reais de uma empresa sob o nome de outra, com o guarda de escopo a dizer que estava tudo bem. | **P1** | **fechado — e VALIDADO EM PRODUÇÃO a 30/08/2026** | `9531cc8` · verificado no browser real: trocar para a Finer Teste mostra *"ainda não tem dados ligados"* e **zero** números da Overcel, com ausência de flash provada por gravador de alta frequência nas duas voltas |
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
| R-B | **Protection Bypass for Automation** — um segredo permanente que alcança qualquer deployment protegido do projeto. Três builds anteriores a `6d8c0b0` (`gixpv09c7`, `8qeqbaqr6`, `9jm3rl3m4`) devolvem `Access-Control-Allow-Origin: *` e entregariam os dados reais da Overcel a qualquer origem que os pedisse. | **P1** | **fechado** — 30/08/2026 | Removido na sessão de promoção do BFF: `protectionBypass` ficou `{}`, o segredo antigo passou de `200` a `302` e os builds protegidos deixaram de abrir. **Reconfirmado pelo fio a 30/08**, sem tocar na Vercel — ver a nota abaixo. |

> ### A prova de R-B, refeita a 30/08/2026 — leitura apenas
>
> A sessão de consolidação pós-E2 escreveu que "não teve como verificar se o bypass foi
> removido" e deixou R-B aberto. Isso era verdade sobre **aquela** sessão, não sobre o
> mundo: a remoção já tinha acontecido na sessão de promoção. Um risco não fica aberto
> por a sessão seguinte não ter olhado.
>
> Refeita aqui **sem tocar na Vercel** — quatro `GET` anónimos, sem cabeçalho de bypass:
>
> | Deployment | Sem bypass |
> |---|---|
> | `4exxus4x8` (o Preview validado do candidato) | **302** |
> | `gixpv09c7` | **302** |
> | `8qeqbaqr6` | **302** |
> | `9jm3rl3m4` | **302** |
> | `finer-one-proxy.vercel.app` (Production) | **200**, com `Access-Control-Allow-Origin` correto |
>
> Os três builds antigos que motivaram o risco **já não abrem**, e a Production oficial
> continua funcional. É exatamente a assinatura que a remoção do bypass produz.
>
> **Sobre o `302` onde `BFF_PRODUCTION_PROMOTION.md` §1 previa `401`:** é a mesma coisa
> dita de outra maneira. A Deployment Protection da Vercel redireciona para o SSO em vez
> de responder `401` seco. O que o passo queria provar — *o deployment protegido não
> entrega o corpo sem autenticação* — está provado. **O critério de aceitação escrito
> naquele ficheiro está desatualizado; o comportamento não.**
>
> **Efeito colateral, e é real:** sem bypass, nenhum Preview é alcançável por automação.
> É o que fecha B-04 por obsolescência (ver abaixo) e o que impede B-03 de ser medido
> pelo caminho que estava planeado.

**Aliases residuais, removidos na mesma sessão:** `…-git-main-…` (apontava para `8qeqbaqr6`, junho) e `…-igororlandi999-…` (apontava para `gixpv09c7`). Restam dois, ambos da Production atual `kgcs3qugg`, verificados por comportamento. Os builds antigos continuam a existir como alvos de rollback, alcançáveis apenas pelo URL do deployment e atrás de Deployment Protection.

---

## Abertos

| ID | Risco | Sev. | Estado | Bloqueia | Mitigação |
|---|---|---|---|---|---|
| R-06 | **`redirect: "follow"` nos dois endpoints.** Se o upstream for comprometido, um `302` para `169.254.169.254` seria seguido pelo BFF. | P2 | **fechado (evidência) — endurecimento por aplicar** · 31/08/2026 | — | É **obrigatório**: o Apps Script responde `302` de `script.google.com` para `script.googleusercontent.com`, e `redirect: "error"` partiria produção. Mitigado por o destino inicial vir só de `process.env` (nenhum input do cliente lhe toca — testado) e por o corpo ter de passar `corpoEhJsonDoContrato`. **Fechar com uma lista de hosts permitidos após confirmar a cadeia real de redirects do GAS.** ⚠️ **30/08:** a medição foi tentada e **não foi possível** Ver B-03. Continua aceite. ⚠️ **31/08: o comportamento passou de suposto a MEDIDO** — `test/upstream-redirects.test.mjs` prova, com o `fetch` real contra servidores locais, que um `302` para outro host **É seguido** e o corpo de lá é servido como o documento financeiro. ✅ **31/08: FECHADO.** A cadeia real foi medida com a `GAS_URL` fornecida localmente e é exatamente a esperada: **um** salto, `script.google.com` → `script.googleusercontent.com`, `200` final com `application/json`. **A lista de hosts permitidos é conhecida e tem dois elementos.** O desconhecido que mantinha este risco aberto desapareceu. ⚠️ **Fica um endurecimento por aplicar, e diz-se que fica:** o código continua com `redirect: "follow"` cego, e `test/upstream-redirects.test.mjs` prova que um `302` para outro host seria seguido. Trocar por seguir com verificação de host contra esses dois nomes é uma alteração pequena, **de código do BFF**, e por isso não se fez nesta sessão. Quando for feita, o teste de caracterização `SEGUE PARA OUTRO HOST` passa a falhar — é esse o sinal de que o endurecimento entrou. |
| R-07 | **`{"error":true}` do Apps Script chega ao BFF com HTTP 200 e sai como 200.** `corpoEhJsonDoContrato` só prova "é um objeto". | P2 | **aceite por escrito** — 30/08/2026 | **já não bloqueia E3** | A aceitação está justificada por extenso na secção *"R-07 — aceitação por escrito"*, mais abaixo. Resumo: a defesa não é de uma camada só (são quatro consumidores, todos verificados), o Apps Script **não consegue** emitir outro estado, e o endurecimento — que continua a ser a coisa certa a fazer — obrigaria a re-promover o BFF na véspera de E3. **Patch redigido e por autorizar; a fazer depois de E3 estabilizar.** |
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

## AjustesManuais, Relatório e ActionPlanModal — o que a análise estática alcança (29/08)

Os três módulos que a auditoria de módulos tinha deixado por cobrir. O que aqui se afirma
foi lido no código; o que precisa de browser está dito como tal e não como conclusão.

### AjustesManuais ("Dados a completar")

**A página é READ-ONLY, e isso responde a metade da lista de perguntas.** Não há campo,
não há "Guardar", "Editar", "Adicionar" nem "Remover" — nem sequer desativados. Logo, as
perguntas sobre validação de entrada, duplicação, edição e remoção **não se colocam nesta
camada**: não há entrada nenhuma. A autoridade sobre o que é um valor manual aceitável é
`valorManualValido` em `manualInputsService.js`, sobre o documento que o backend serve.

| Eixo | Veredito | Prova |
|---|---|---|
| Isolamento por empresa | **triplo, e independente** | (1) `normalizeManualInputs` rejeita o documento INTEIRO se `doc.companyId !== companyId` — não filtra, rejeita; (2) o dataset é carimbado e `resolveCompanyDataScope` recusa apresentá-lo sob outro nome (`AppShell.jsx:47`); (3) `envelopeManualInputs` só expõe `document` e `coverage` depois da guarda de empresa. Mutações M3/M4a/M4b mataram. |
| Isolamento por utilizador | **não aplicável** | O documento é por EMPRESA, não por utilizador. Não há armazenamento por utilizador nesta página. A única chave global de `localStorage` do projeto é a empresa preferida — R-10, já mitigada por revalidação contra as memberships. |
| Troca de utilizador / logout / login | **coberto por construção** | `sessaoId = status:user.id` está nas dependências de `load` **de propósito** (ver o bloco A IDENTIDADE DA SESSÃO em `FinerDataContext.jsx`): muda no login, no logout e na troca de utilizador, e o contador de geração impede uma leitura anterior de aterrar. |
| Troca de empresa a meio | **coberto** | `companyId` está nas dependências de `load`; o contador de geração descarta a leitura obsoleta; `FinerDataContext.corrida.test.jsx` exerce a corrida. |
| Pedidos antigos + `confirmarCobertura` | **mitigado, por outra camada** | `confirmarCobertura` NÃO participa no contador de geração: uma confirmação em voo durante uma troca de empresa faria `setSales` com o dataset da empresa anterior. Não é alcançável de forma observável — o `await` é um `import()` de um módulo já no grafo (é importado estaticamente no mesmo ficheiro), portanto um microtask, enquanto a leitura nova é rede. E se aterrasse, `rebuildComCobertura` **preserva `dataset.companyId`** (linha explícita, com o porquê), pelo que o guarda de escopo recusaria. Fica registado porque a segurança está numa camada que não é a desta função. |
| Persistência | **nenhuma, e declarada** | A confirmação de cobertura vive só na sessão: nenhum caminho do browser escreve. `coverageWriteClient.js` existe e **não está ligado a nada** — nenhum importador fora do seu próprio teste. É infraestrutura à espera de E-auth, não código morto por acidente. |
| Zero / NaN / Infinity / string numérica | **fechado** | `valorManualValido`: só `typeof number` **finito**. `0` é valor real e nunca colapsa em ausência (`availabilityPropagacao.test.js` tem um teste só para isso). `NaN`, `Infinity`, `"500"` e booleanos são recusados. |
| `unavailable` a passar por real | **fechado, e provado por mutação** | O CMV manual é `availability: "manual"` e as linhas derivadas ficam `mixed`, nunca `real`. Mutação **M11** (`dispCmv` → `"real"`) matou **25 testes em 5 ficheiros**; **M10** (`manual` puro → `real`) matou 2. O Resumo escreve-o em português: "Valor manual" / "Inclui valor manual". |
| Datas | **fechado** | `formatUpdatedAt` devolve `null` para ISO ausente ou inválido, e a UI omite em vez de mostrar "Invalid Date". `new Date(iso)` só é usado sobre valores com fuso explícito — a armadilha de `"aaaa-mm"` é R-17 e não passa por aqui. |
| Moeda | **fechado** | `formatMoney(valor, formatting)` com o `formatting` da empresa ATIVA passado explicitamente, e não pelo registo global. Era aqui que estavam três `toLocaleString("pt-BR")` escritos à mão. |

### Relatório

**Primeiro provar se continua inalcançável — e continua.** Não está em `screens` de plano
nenhum, não tem entrada na barra lateral, e nenhum `navigateTo` lhe aponta. **Provado por
mutação (M6):** pôr `RELATORIO` no plano `team` faz `mockAlcancavelTemSelo.test.js` falhar
com o nome do ficheiro na mensagem. A regressão do R-25 está armada, não é uma promessa.

Não foi redesenhado nem convertido. Confirmado o resto, sem lhe tocar: 100% `mockData`;
**zero** `fetch`, `href`, `window.*`, `document.*`, `localStorage`, `Blob` ou `download` —
não há sink nenhum; nome da empresa em lado nenhum (a varredura do R-23 cobre `pages/`);
moeda por `formatMoney`, portanto seguiria a empresa ativa. **O que apareceria no dia em
que fosse ativado**, e que fica aqui escrito para não ser redescoberto: os seis KPIs, o
forecast, o budget e os "níveis de confiança" são inventados; a frase do rodapé afirma
"dados atualizados até 31/05/2026 às 09:30" **escrita à mão**; o `<select>` de período e
os seis botões de secção não têm `onChange`/`onClick` — são a mesma classe do
`RowActionsButton` do R-24, e o `<select>` não tem nome acessível. Nada disto se corrige
hoje: seria acrescentar código a um ecrã que ninguém alcança.

### ActionPlanModal

Ver **R-28**. Separado em três, de propósito: o que está **provado** (o DOM montado tem um
diálogo com nome que resolve, o botão de fechar é nomeado, `aria-modal` está ausente), o
que é **provável** (o clique no véu fecha e o clique no painel não — a propagação está
travada, mas o comportamento do rato não foi exercido), e o que **precisa de browser**
(armadilha de foco, `Escape`, foco inicial, devolução do foco, `inert` no fundo, e o
scroll do fundo enquanto o diálogo está aberto).

| ID | Risco | Sev. | Estado | Bloqueia | Mitigação |
|---|---|---|---|---|---|
| R-30 | **Quem ESCREVE o CMV é mais estrito do que quem o LÊ.** `salvarAjusteManual_` (Apps Script) recusa `value` negativo, não-finito e não-numérico. `valorManualValido` (frontend) só exige **número finito** — aceita negativos. Um CMV negativo aumentaria o lucro bruto em vez de o reduzir, e apareceria marcado apenas como "Valor manual", que é a marca correta para um valor errado. | P3 | aberto (latente) | E4 | **Sem caminho pelo produto:** o único escritor alcançável é `salvarAjusteManual_`, que já recusa. Chegar lá exige editar o JSON no Drive à mão, fora do caminho sancionado. Não se acrescenta guarda sem caminho demonstrado — é como o R-17 chegou a este registo. **Quando houver escrita a partir do browser, é uma linha** (`v >= 0`) e o sítio é `valorManualValido`. Números finitos extremos (`Number.MAX_VALUE`) passam nos dois lados; produzem absurdos visíveis, não plausíveis. |

---

## Validação de E2 em browser real — 30/08/2026

E2 foi publicado a 30/08/2026 02:56:56 (−03:00) a partir de `a8bfca0` para
`gh-pages 22b0526`, e validado em browser real no mesmo dia. **Os doze pontos do teste de
aceitação passaram** — ver `FRONTEND_AUTH_RELEASE_PLAN.md` §E2 para a lista.

**O que a validação provou, e o que não provou.** Provou o **R-18**: com autenticação
ligada e transporte legado, trocar de empresa não mostra os números de uma empresa sob o
nome de outra, e não há sequer um fotograma em que isso aconteça. Provou também que as
leituras continuam todas pelo legado (32/32) e que o transporte protegido não foi ativado
por acidente (0 chamadas). **Não** provou isolamento forte — ver **R-33**.

As sete entradas abaixo são o que ficou por registar. Nenhuma foi corrigida nesta sessão,
por decisão: a sessão era de consolidação, não de correção.

| ID | Risco | Sev. | Estado | Bloqueia | Mitigação / nota |
|---|---|---|---|---|---|
| R-31 | **A leitura anónima legada continua a partir em E2, em dois momentos em que não seria preciso.** (1) Quatro pedidos a `/api/pedidos/vendas` saem **antes de qualquer autenticação**, ainda no ecrã de login; (2) outros quatro saem ao trocar para a **Finer Teste**, uma empresa sem integração configurada. Nos dois casos os dados reais da Overcel atravessam o fio. | P3 | **aceite para E2** | fecha em **E3** | **O resultado é corretamente descartado** — o guarda de escopo (`9531cc8`) recusa carimbá-lo e o `AppShell` não monta as páginas; foi isso que o browser confirmou. Não é regressão: é a natureza do endpoint legado, que é anónimo por construção (R-14) e não sabe o que é uma empresa. **É precisamente o que E3 fecha:** com o transporte protegido, faltando empresa ou token o transporte é `NENHUM` e não o anónimo. Não se corrige antes disso — seria acrescentar uma guarda a um caminho que vai desaparecer. |
| R-32 | **O token de sessão do Supabase vive numa origem partilhada com outros projetos.** `sb-bysqekhcyrvtiejcupoa-auth-token` (1942 bytes, com `access_token` **e** `refresh_token`) é guardado no `localStorage` de `https://igororlandi999.github.io`. Essa origem tem 14 chaves, e **12 são de outros projetos publicados na mesma conta de GitHub Pages** (`ml_orders_cache_v1` com 1,6 MB, `austinMissionBoard`, `cf_products`, `canton_*`, `decoratto:ui-prefs`). O GitHub Pages serve **todos** os repositórios de uma conta na mesma origem, portanto qualquer JavaScript em qualquer dessas páginas consegue ler o token da Finer One. | **P2** | **aberto — provado, com veredito** | E4 · **CONDICIONAL para E3** | **Provado em código a 30/08 — ver a secção *"R-32 — a prova"*.** **O mecanismo da aplicação está correto** e foi verificado: o logout remove o token integralmente, sem resíduo. O problema é o **alojamento**, não o código. **E2 foi o que introduziu isto** — antes não existia token nenhum nessa origem, e é por isso que aparece agora e não antes. Agrava-se em E3, que dá a esse mesmo token poder de leitura financeira no BFF. Saídas possíveis, nenhuma para hoje: domínio próprio para a Finer One (separa a origem e resolve na raiz); ou sessão em memória em vez de `localStorage` (custa a persistência entre separadores e o refresh); ou não publicar outros projetos nesta conta. **Veredito de 30/08: NÃO bloqueia E3 por si só — bloqueia E4.** E3 não muda onde o token vive; muda o que ele alcança. A condição para E3 é registar a aceitação e não deixar a decisão de domínio próprio sem dono. **Decidir antes de E4**, que é quando deixa de haver só um utilizador. |
| R-33 | **Isolamento FORTE entre duas empresas não é demonstrável com a configuração de contas actual.** A conta usada na validação (`Proprietário` na Overcel, `Consulta` na Finer Teste) é membro **das duas** empresas. O que se provou foi o R-18 — que os dados de A não aparecem sob o nome de B para um utilizador multiempresa. **Não** se provou o que é uma pergunta diferente e mais forte: que um utilizador que pertença **só** a B não consegue alcançar A. | **P2** | **bloqueado** | **E3** (condição 5) · E4 | Não é uma falha conhecida — é uma **verificação que não foi possível fazer**, e não fazer uma verificação não é passá-la. Exige uma conta que pertença a **uma só** empresa. As políticas de RLS foram verificadas contra a base de dados a 29/08 (B-07), o que é evidência do lado do servidor; falta a evidência do lado do produto montado. **30/08: a estratégia está desenhada** — conta de smoke dedicada a **uma só** empresa, aditiva, sem tocar em nenhuma membership existente. Sequência, rollback e teste de aceitação na secção *"R-33 — a saída menos invasiva"*. **Continua a bloquear E3 até ser executada.** |
| R-34 | **Comportamento inconsistente do autofill no primeiro login.** Um único clique em "Entrar" produziu **quatro** `POST` a `/auth/v1/token?grant_type=password` — três `400` e depois um `200` — e o `200` ocorreu **sem novo clique**. Entre a falha e o sucesso, o campo de email mudou sozinho de uma conta guardada para outra. | P3 | **mitigado** — a metade nossa está fechada; a causa continua por determinar | **não bloqueia E3** | ⚠️ **A hipótese que aqui estava é FALSA e foi retirada.** Dizia que o formulário "não tem `<label for>` nem `id`/`name`". Tem, e já tinha: `a8bfca0:src/pages/Login.jsx` traz `htmlFor`, `id`, `name`, `type` e `autoComplete` nos dois campos, e o bundle **efetivamente servido** (`index-DVG67Kg3.js`, o de `gh-pages 22b0526`) contém `id:"current-password",name:"password",autoComplete:"current-password"`. Os avisos de consola observados vinham de outro formulário da página, não deste. **O que se provou a 30/08:** o formulário aceitava submits concorrentes — dois eventos no mesmo tick produziam **dois** `POST /auth/v1/token`. `disabled={signingIn}` não o impedia, porque é estado do React (há uma janela antes do commit) e porque um submit programático — o que um gestor de palavras-passe dispara — nem passa pelo botão. Fechado com uma guarda síncrona por `ref` e três testes (`src/pages/Login.submitUnico.test.jsx`). **O que continua por determinar:** a troca automática de email entre tentativas não nasce na aplicação, e por isso o patch **não** é apresentado como a causa dos quatro pedidos. Determiná-lo exigiria abrir corpos com credenciais — que se continua a não fazer. **31/08: a metade SEQUENCIAL também fechou.** Provou-se que N pedidos === N eventos `submit` (o SDK não repete: `signInWithPassword` emite um só `_request`, e o único `retryable()` do SDK está no caminho do `grant_type=refresh_token`), e que nenhum caminho da aplicação gera um submit a mais. `Login.submitSequencial.test.jsx` (9 testes) defende-o, e uma mutação em `Login.jsx` mata 4 deles — enquanto o ficheiro antigo fica verde, que era exatamente a lacuna. Ver a sessão de 31/08. |
| R-35 | **O relógio da máquina de desenvolvimento está atrasado.** Medido a 30/08/2026 contra o cabeçalho `Date` do GitHub: **−48 s**. | P3 | **aceite** | — | Sem impacto observado. Fica registado porque desloca carimbos temporais locais (mtimes, horas de commit) face aos do servidor, e porque **48 s é ruído suficiente para confundir uma reconstrução forense** — foi por comparar mtimes com horas de commit que se reconstruiu a queda de energia de 30/08. Não afeta a validade de tokens: o Supabase valida do lado do servidor. |
| R-36 | **O SQL do `BFF_POST_PRODUCTION_SMOKE.md` refere colunas do `audit_log` que já não correspondem ao esquema.** | P3 | **aberto** | — | Não corrigido nesta sessão por decisão explícita — a sessão não abria trabalho novo e o ficheiro pertence ao fluxo do BFF, que estava congelado. **Consequência prática:** quem correr o smoke tal como está escrito recebe um erro de SQL, não um resultado errado — falha ruidosamente, que é o modo de falhar aceitável. Corrigir na próxima sessão que toque no BFF. |
| R-37 | **A RLS de escrita não foi testada em Production.** | P3 | **aceite (decisão deliberada)** | E5 | Não é um esquecimento. As escritas estão desligadas (`COVERAGE_WRITES_ENABLED` off, `coverageWriteClient.js` sem importador fora do próprio teste), portanto não há caminho pelo produto que exercite a RLS de escrita. Testá-la exigiria ligar a escrita em Production para a testar — que é precisamente o que não se quer fazer. **Fica para quando as escritas forem ligadas**, e faz parte dessa decisão, não desta. |
| R-38 | **`ALLOWED_ORIGINS` de Production inclui `http://localhost:5173`.** Lido a 30/08: `https://igororlandi999.github.io,http://localhost:5173`. Uma página servida em `localhost:5173` na máquina de alguém recebe cabeçalho de CORS do BFF — incluindo do endpoint **legado anónimo**, que serve os números reais da Overcel. | P3 | **aceite** | — | Não acrescenta superfície ao que já existe: o endpoint legado é anónimo por construção (R-14) e responde a qualquer `curl` sem Origin nenhuma — o CORS só restringe browsers. E chegar a `localhost:5173` da vítima exige já estar a correr código na máquina dela. Fica registado por duas razões: é uma origem de **desenvolvimento** numa variável de **produção**, e **E3 é o momento certo para a remover** — depois de E3 o legado deixa de servir a aplicação, e a lista devia passar a ter uma entrada só. **31/08: a proposta concreta está escrita** — valor por ambiente, mudança mínima, impacto nos testes locais, rollback e verificação pelo fio. Ver a sessão de 31/08. |
| R-39 | **A janela de arranque caía no legado ANÓNIMO com E3 ligado.** `AuthContext` arranca com `mode = null` e resolve-o num efeito assíncrono; nessa janela `modeRequiresAuthentication(null)` é `false`, e `resolveDataTransport` lia esse `false` como *"a autenticação está desligada"* — devolvendo o transporte anónimo. Medido em browser real: **4 leituras dos números reais da Overcel a cada carregamento**, antes de se saber quem está ao teclado, e também para quem não tem sessão nenhuma. | **P1** | **fechado** — 31/08/2026, **antes de qualquer publicação** | ~~E3~~ | **Encontrado no pré-deploy de E3 e nunca chegou a produção.** A causa é semântica: `requiresAuth: false` fundia *"está desligada"* com *"ainda não sei"*. Fechado com `authResolved`, passado por `AuthContext` e lido em `resolveDataTransport` **antes** da guarda de `requiresAuth` e **depois** da do interruptor — com E3 desligado nada muda face a E2.1. Defendido por `transporteNaJanelaDeArranque.test.jsx` (12 testes), que falhava antes do patch e cujas duas mutações morrem. Ver a sessão de 31/08 mais abaixo. |

---

## Bloqueados — precisam de desktop com sessão iniciada

Nenhum destes é uma falha conhecida. São **verificações que não foi possível fazer**, e
não fazer uma verificação não é o mesmo que passá-la.

| ID | O que falta verificar | Bloqueia |
|---|---|---|
| B-01 | Smoke test do Preview **com token válido**: `200` com membership, `403` sem, e o isolamento entre duas empresas | E1 | **verificado** 29/08 com conta de smoke dedicada |
| B-02 | Que a cadeia `Apps Script 401 → BFF 502 → sem logout` se comporta assim **em rede real**, e não só nos duplos | E1 | **verificado** 29/08 — upstream 401 real → BFF 502 |
| B-03 | A cadeia real de redirects do Apps Script (quantos saltos, para que hosts) — fecha R-06 | E1 | ✅ **FECHADO 31/08/2026.** *(o texto abaixo é o registo de como esteve aberto)* **continua ABERTO** — tentado a 30/08 e **impossível com o acesso desta sessão**. Ver a nota abaixo. **31/08: tudo o que NÃO exige a `GAS_URL` está feito** — sonda escrita e verificada ponta a ponta (`scripts/gas-redirect-probe.mjs`) e a lógica de redirects medida contra servidor local. ✅ **31/08: FECHADO.** A `GAS_URL` foi fornecida localmente, a sonda correu, e a cadeia é **um salto**: `script.google.com` → `script.googleusercontent.com`, `200` final, `application/json`. **B-03 deixa de bloquear E3.** Ver `B03_GAS_REDIRECT_RUNBOOK.md` §resultado. |
| B-04 | Equivalência entre o Preview e a produção para os quatro recursos do caminho legado | E1 | **fechado por OBSOLESCÊNCIA** — 30/08. Ver a nota abaixo. |
| B-05 | Que `ALLOWED_ORIGINS` está configurada no Vercel **antes** de publicar (⚠️ o legado passou de aberto a fechado por omissão) | E1 | **verificado** 29/08 |
| B-06 | Estado real das variáveis de ambiente de produção e da Deployment Protection | E1 | **verificado** 29/08 |
| B-07 | Estado real das políticas de RLS no Supabase — a matriz documentada vem do **SQL versionado**, não da base de dados | E2 | **verificado** 29/08 contra a base de dados |
| B-08 | Que `company_coverage` tem mesmo 0 linhas e `company_integration` não guarda nenhuma URL | E2 | **verificado** 29/08 — 0 linhas; a integração guarda `{provider, envKey}` |
| B-09 | Comportamento de `HEAD` **no runtime da Vercel** (a plataforma pode convertê-lo em `GET`). O handler rejeita-o com 405; o que a plataforma faz antes não é verificável localmente | E1 | **verificado** 29/08 — 405 nos três endpoints, sem ida ao upstream |

---

## Sessão de preparação para E3 — 30/08/2026

Nada foi ligado, publicado nem promovido. O que se segue é o que a sessão **provou**, e
onde a prova está.

### B-03 — porque continua aberto, e o que exatamente falta

A medição planeada é uma linha: `curl -sIL "$GAS_URL"`. Ela **não pôde ser feita**, e a
razão é boa:

`GAS_URL` está marcada como variável **Sensitive** no Vercel. `vercel env pull
--environment=production` devolveu-a como `[SENSITIVE]` — a plataforma recusa-se a
exportá-la, tal como recusou `SUPABASE_SERVICE_ROLE_KEY`. As restantes vieram todas.
E não existe cópia local: o `.env.local` do `finer-one-proxy` tem **uma só** linha
(`VERCEL_OIDC_TOKEN`), e nenhum dos dois repositórios contém a URL, nem no histórico.

Ou seja: **a impossibilidade de fechar B-03 é uma consequência direta de uma boa decisão
de segurança.** Fica registado como tal, e não como negligência.

**O que a fecha, e é um minuto:** com a `GAS_URL` à mão, correr

```bash
curl -sIL "$GAS_URL" | grep -iE '^HTTP/|^location:'
```

Se a cadeia for sempre `script.google.com → script.googleusercontent.com` e mais nada,
**R-06 fecha** com uma lista de hosts permitidos em vez de `redirect: "follow"` cego.
Nenhum outro risco depende disto.

> **B-03 continua a bloquear E3** (condição 3). Não é uma formalidade: `redirect:
> "follow"` é a única parte do BFF que segue um endereço que ninguém verificou.

### B-04 — fechado por obsolescência, com a baseline no lugar

B-04 perguntava se o **candidato em Preview** se comportava como a **produção**, antes de
o promover. A pergunta consumiu-se: `74a1e0b` **foi** promovido. Preview e Production são
hoje o mesmo commit, e a comparação seria de um artefacto consigo próprio.

E deixou de ser executável: sem Protection Bypass (R-B, fechado), nenhum Preview é
alcançável por automação. Mantê-la aberta significaria **recriar o bypass que se acabou
de remover** para responder a uma pergunta que já não tem conteúdo. Isso não se faz.

**O que fica no lugar** — a baseline de Production, medida a 30/08 por leitura, sem
publicar corpos:

| Pedido | HTTP | Forma | Contagem |
|---|---|---|---|
| `recurso=pedidos` | 200 | `{data, meta}` · `parcial=false` | `data.len = 1159` |
| `recurso=despesas` | 200 | `{data, meta}` · `parcial=false` | `data.len = 309` |
| `recurso=recebiveis` | 200 | `{data, meta, debug}` · `debug.fonte = snapshot` | `data.len = 1474` |
| `recurso=ajustes-manuais` | 200 | `{data, debug}` · `debug.fonte = documento` | `data = {companyId, updatedAt, months}` |
| `recurso=inexistente` | **400** | `{error, code, message}` | `code = RECURSO_DESCONHECIDO` |
| `dataInicial=2026-02-30` | **400** | `{error, code, message}` | `code = DATA_INVALIDA` |
| `dataInicial=2026-07-31&dataFinal=2026-07-01` | **400** | `{error, code, message}` | `code = PERIODO_INVALIDO` |

Carimbos de origem: pedidos `2026-08-30T04:06:14Z`, despesas `2026-08-30T05:05:55Z`,
recebíveis `2026-08-30T06:05:19Z`. Nenhum recurso `parcial`.

Fronteiras, na mesma leitura:

- `Access-Control-Allow-Origin: https://igororlandi999.github.io` nas respostas `200`;
- `Cache-Control: private, no-store` nas respostas `200`;
- origem não permitida → resposta **sem** `Access-Control-Allow-Origin`, com `Vary: Origin`;
- `OPTIONS` → `204`; `HEAD` → `405` (reconfirma B-09);
- `/api/companies/<uuid>/financial-data` sem token → **401** (a guarda protegida está viva
  em Production, e é o caminho que E3 vai usar).

**É esta a tabela a comparar depois de ligar E3.** Se as quatro contagens forem as mesmas
pelo transporte protegido, a migração não mudou o dinheiro — que é a única coisa que E3
tem de provar.

### R-07 — aceitação por escrito

**Decisão: ACEITE. Não bloqueia E3.**

**1. O Apps Script não consegue fazer outra coisa.** `jsonOut_` usa
`ContentService.createTextOutput(...)`, que **não permite escolher o código de estado**.
Está escrito no próprio código (`apps-script/Código.js`, junto à guarda de recurso
desconhecido): *"O corpo mantém HTTP 200 porque o ContentService do Apps Script não
permite escolher o código de estado; o erro viaja no payload."* Não é um descuido do
upstream — é um limite da plataforma. Qualquer erro dele chega como `200` + `{error:true}`.

**2. A defesa não é de uma camada só.** O registo dizia "uma defesa numa camada só,
`linhasOuFalha`". São **quatro** consumidores e **todos** rejeitam:

| Recurso | Guarda | Onde |
|---|---|---|
| pedidos | `linhasOuFalha` | `blingDataService.js:1282` |
| despesas | `linhasOuFalha` | idem |
| recebiveis | `linhasOuFalha` | idem |
| **ajustes-manuais** | `normalizeManualInputs` | `manualInputsService.js:93` — `if (payload.error === true) return undefined;` |

Não há um quinto consumidor do caminho legado. **Não existe recurso descoberto.**

**3. O caso mais provável nem chega ao upstream.** O `error:true` mais fácil de produzir
é `RECURSO_DESCONHECIDO` — e o BFF recusa recursos fora da lista com `400` **antes** de
contactar o Apps Script (`legacy-vendas.test.mjs`: *"um recurso fora da lista é 400 e NÃO
chega ao Apps Script"*). O que sobra é `errorOut_`, ou seja, avaria real do backend.

**4. O comportamento observado é o correto, mesmo assim.** Um `error:true` que chegue
vira, no cliente, "fonte indisponível" — não zero, não lista vazia, não número errado.
É a regra do projeto: um zero indistinguível de ausência é a pior falha possível, e não
é esta.

**5. Porque não se corrige agora.** O endurecimento (`error:true` → `502`) é correto,
pequeno e de baixo risco — verificou-se que o frontend trata `502` exatamente como já
trata a `ApiError` de `linhasOuFalha`, logo a mudança é observacionalmente equivalente
a jusante. Mas obriga a **re-promover o BFF**, e `74a1e0b` é o artefacto que a promoção
validou em Production. Fazê-lo na véspera de E3 é empilhar duas mudanças no mesmo
intervalo, exatamente o que `BFF_PRODUCTION_PROMOTION.md` §7 proíbe.

**Condição da aceitação:** o patch fica agendado para a **primeira sessão de BFF depois
de E3 estabilizar**, junto com R-36 e a limpeza de R-38. Se alguma vez existir um cliente
do BFF que não seja este frontend, a aceitação **caduca** — a defesa vive toda no
cliente, e um cliente novo não a herda.

### R-32 — a prova

Objetiva, tirada do código e da rede, sem ler nem imprimir token nenhum.

**Onde a sessão é guardada.** `supabaseAuthAdapter.js:72-83` constrói o cliente com
`persistSession: true` e **não passa `storage`**. Em `@supabase/auth-js` (2.112.4,
`GoTrueClient.js:239-247`), sem `settings.storage` e com `persistSession`, o cliente usa
`globalThis.localStorage`. Não é configuração nossa — é o caminho por omissão.

**O nome da chave.** `supabase-js` deriva-a do host do projeto, em
`dist/umd/supabase.js`:

```js
let i = `sb-${r.hostname.split(`.`)[0]}-auth-token`
```

Com `VITE_SUPABASE_URL = https://bysqekhcyrvtiejcupoa.supabase.co`, a chave é
**`sb-bysqekhcyrvtiejcupoa-auth-token`** — exatamente a observada no browser. Lá dentro
vive a sessão do GoTrue, que inclui `access_token` **e** `refresh_token`.

**Se outro path da mesma origem a consegue ler: sim, tecnicamente.** O `localStorage` é
particionado por **origem** — esquema + host + porta. O *path* não entra na definição.
`https://igororlandi999.github.io/finer-one/` e `https://igororlandi999.github.io/<outro>/`
são a **mesma origem**, e partilham um `localStorage`. Confirmado a 30/08 que a origem é
mesmo partilhada — três projetos vizinhos servidos, todos `200`:
`/austin-mission-board/`, `/overwine-pedidos/`, `/ml-dashboard-overwine/`.

Não é uma falha da aplicação. É a definição de origem, aplicada a um alojamento que põe
todos os repositórios de uma conta debaixo do mesmo host.

**Se o adaptador permite trocar de storage: sim, e sem dependência nova.**
`settings.storage` é lido em `GoTrueClient.js:240`. Existe ainda `settings.userStorage`,
que separa os dados do utilizador dos tokens. Hoje `supabaseAuthAdapter.js` não passa nem
um nem outro — o ponto de extensão está lá, por usar.

**Impacto em E2 (hoje):** baixo. O token não abre dados financeiros — em E2 as leituras
vão todas pelo legado anónimo, que não olha para tokens. O que um token roubado alcança é
o Supabase sob RLS: as memberships e o perfil do próprio. Nenhum número da Overcel.

**Impacto em E3:** é aqui que muda. Em E3 esse mesmo token passa a ser a chave de
`/api/companies/:id/financial-data`. O que era "ler as minhas memberships" passa a ser
**ler os números da empresa**. O risco não nasce em E3 — foi E2 que o introduziu — mas é
E3 que lhe dá valor.

#### As três saídas, comparadas

| | **A · domínio próprio** (`app.finerone.pt`) | **B · storage custom / memória** | **C · `sessionStorage` + `userStorage`** |
|---|---|---|---|
| **Segurança** | **Resolve na raiz.** Origem só da Finer One; o `localStorage` deixa de ser partilhado com o que quer que seja. | Memória pura resolve por remoção — não há nada em disco para ler. Mas o token continua alcançável em runtime por qualquer script **da mesma página**; só deixa de sobreviver ao fecho. | Reduz a janela e o alcance, não a origem. Um script vizinho continua na mesma origem. Melhoria parcial. |
| **Custo** | Domínio (~15-40 €/ano). GitHub Pages suporta domínio próprio **sem custo** e com TLS. | Zero. | Zero. |
| **Complexidade** | Média: DNS, `CNAME`, TLS, `base` do Vite deixa de ser `/finer-one/`, `ALLOWED_ORIGINS` do BFF muda, `redirectTo` do Supabase muda. **Toca no BFF.** | **Baixa** — passar `storage` em `supabaseAuthAdapter.js`. Uma opção que o SDK já lê. | Baixa, igual a B. |
| **Persistência de login** | Inalterada. | **Perde-se.** Refresh e novo separador exigem login outra vez. Numa aplicação financeira que se consulta ao longo do dia, é fricção a sério. | Sobrevive ao refresh, morre com o separador. Meio-termo honesto. |
| **GitHub Pages** | Continua a servir. Muda o host, não o alojamento. | Sem efeito. | Sem efeito. |
| **Impacto no rollout** | **Não cabe antes de E3.** Mudar de origem invalida `ALLOWED_ORIGINS`, o `base` do bundle e o `redirectTo` — e obriga a mexer no BFF, que é o que esta fase não quer. | Cabe. Uma linha, testável, reversível. | Cabe. |
| **Reversibilidade** | Média — o domínio antigo pode ficar a redirecionar, mas os utilizadores perdem a sessão na mudança de origem. | **Total** — remover o argumento. | Total. |

#### Veredito

**R-32 é CONDICIONAL para E3, e bloqueante para E4.**

- **Não bloqueia E3** porque E3 não muda o problema: o token já vive nessa origem hoje, e
  já lá viveria amanhã. E3 aumenta o valor do token, não a exposição dele. Adiar E3 não
  torna a origem menos partilhada — só atrasa.
- **A condição** é que a aceitação fique escrita (está, aqui) **e** que a decisão de
  domínio próprio tenha dono e data antes de E4. Um risco aceite sem prazo é um risco
  esquecido.
- **A recomendação é A, o domínio próprio**, e não B. B compra segurança com a
  persistência do login, que é uma troca má para uma aplicação de consulta diária, e
  continua a não separar a origem — que é o problema real. **B fica como paliativo** se
  alguma vez for preciso reduzir a exposição sem ter domínio ainda.
- **Reduzir a superfície custa zero e é imediato:** despublicar os projetos vizinhos de
  `igororlandi999.github.io` que já não servem para nada. Não fecha R-32, mas encolhe-o
  hoje.

#### Plano mínimo de migração — **NÃO executar nesta sessão**

Sete passos, pela ordem. Cada um verificável; nenhum irreversível até ao 5.

1. **registar o domínio** e apontar DNS ao GitHub Pages (`A` para os quatro IPs de
   Pages, ou `CNAME` para `igororlandi999.github.io`);
2. **`CNAME` no `gh-pages`** com o domínio; esperar o TLS do GitHub (*Enforce HTTPS*);
3. **`base` do Vite** passa de `/finer-one/` a `/` — e `predeploy-check.mjs` verifica o
   caminho dos assets, portanto **a verificação tem de acompanhar**;
4. **Supabase → Auth → URL Configuration**: acrescentar a origem nova a *Redirect URLs*
   **sem remover a antiga**;
5. **BFF → `ALLOWED_ORIGINS`**: acrescentar a origem nova **sem remover a antiga**. É a
   única alteração no BFF, e é aditiva — nenhum utilizador fica sem CORS a meio;
6. **publicar e validar** na origem nova: login, troca de empresa, leituras, logout. A
   sessão antiga **não migra** — o `localStorage` é por origem, e é isso mesmo que se
   quer;
7. **só depois:** remover a origem antiga de `ALLOWED_ORIGINS` e das *Redirect URLs*, e
   deixar o path antigo a redirecionar.

**Rollback** até ao passo 6: apontar o DNS de volta e republicar com o `base` antigo. As
duas origens coexistem por desenho entre o 5 e o 7 — é essa a janela que torna isto
seguro. **Não fazer isto no mesmo intervalo de E3.**

### R-33 — a saída menos invasiva

**Recomendação: opção 2 — uma conta de smoke dedicada a UMA SÓ empresa.**

Porque não as outras:

| Opção | Veredito |
|---|---|
| 1 · remover temporariamente uma membership da conta de smoke | **Não.** Escreve numa linha que já existe e que dá acesso real. Se a reposição falhar ou a sessão cair a meio, fica-se com um utilizador sem o acesso que tinha — e o rollback depende de alguém se lembrar do `role` exato. Muda o estado de um utilizador real para responder a uma pergunta de teste. |
| 2 · **conta de smoke dedicada a uma só empresa** | **Sim.** Puramente **aditiva**: nenhuma linha existente é tocada. Rollback = apagar o que se criou. E responde exatamente à pergunta. |
| 3 · terceira empresa de teste sem dados | Resolve, mas são mais peças — empresa **e** membership **e**, para o teste ser completo, integração. Mais superfície criada para a mesma resposta. Fica como alternativa se a 2 não for possível. |
| 4 · outra | Nenhuma melhor encontrada. Simular no BFF já está feito e é o que **não** basta: `protect.test.mjs` cobre a negação com duplos, e o que falta é a evidência no produto montado. |

**A conta pertence à Finer Teste, não à Overcel.** A pergunta é "um utilizador de B
alcança A?" — e é preferível que o utilizador novo viva na empresa **sem dados**. Assim,
se algo correr mal, o pior caso é uma conta a ver uma empresa vazia.

#### Sequência exata

Tudo no painel do Supabase. **Nenhum passo toca no BFF, no frontend ou em dados
financeiros.**

1. **Authentication → Users → Add user**: `smoke-b@finerone.local` (ou domínio à escolha),
   com palavra-passe forte, *Auto Confirm User* **ligado**. Anotar o `user_id`;
2. **anotar o `company_id` da Finer Teste** e o **da Overcel** — o segundo é o alvo que
   tem de ser recusado;
3. **uma linha** em `public.memberships`: `user_id` = o novo, `company_id` = Finer Teste,
   `role` = `viewer`. **Uma só.** É a linha inteira do teste;
4. confirmar por consulta que o novo `user_id` tem **exatamente uma** membership.

#### Teste de aceitação

Duas metades. As duas têm de passar.

**a) No produto montado** — com E3 ainda desligado, é o que se pode observar hoje:

- login com a conta nova → o seletor de empresas mostra **só a Finer Teste**;
- não existe caminho na interface que chegue à Overcel — nem por preferência guardada:
  `sessionContract.js` descarta um `companyId` sem membership (R-10);
- nenhum nome, número ou rótulo da Overcel no DOM. `limparResiduoDeGraficos` já é
  exercido nos testes; aqui confirma-se no browser.

**b) Ao nível da rede** — é esta a metade que prova isolamento **forte**, e é o caminho
que E3 vai usar:

```bash
# com o access_token da conta nova, contra Production (leitura apenas)
BFF=https://finer-one-proxy.vercel.app/api/companies

curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_SMOKE_B" \
  "$BFF/<COMPANY_ID_OVERCEL>/financial-data?recurso=pedidos"
# esperado: 403

curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_SMOKE_B" \
  "$BFF/<COMPANY_ID_FINER_TESTE>/financial-data?recurso=pedidos"
# esperado: 200, ou o erro de integração não configurada — NUNCA 403
```

Um `403` no primeiro é a prova que falta. `401` **não** serve: significaria token
inválido, e responderia a outra pergunta.

> Verificado já a 30/08 que o endpoint protegido responde **401 sem token** em Production.
> A guarda está viva; falta exercê-la com um token real sem membership.

#### Rollback

Duas linhas, por esta ordem: apagar a membership; apagar o utilizador em
Authentication → Users. **Nada mais foi tocado**, portanto não há mais nada a repor. Se
a conta for para reutilizar em E4, não se apaga — desativa-se.

#### Risco

**Baixo, e limitado ao que se criou.** O único cenário mau é dar por engano à conta nova
uma membership na **Overcel** — o que a tornaria mais uma conta multiempresa e faria o
teste passar por má razão. Mitiga-se com o passo 4: contar as memberships antes de testar.
Uma conta a mais no Supabase não altera dados financeiros, não passa pelo BFF e não afeta
nenhum utilizador existente.

#### Dados necessários

`company_id` da Overcel · `company_id` da Finer Teste · credenciais da conta nova ·
`access_token` dela (de `POST /auth/v1/token?grant_type=password`, ou lido da sessão no
browser). **Nenhum token é para imprimir nem guardar.**

---

## Sessão autónoma de preparação para E3 — 31/08/2026

Nada foi ligado, publicado, promovido nem criado. **E3 continua NÃO INICIADO** e
`VITE_PROTECTED_DATA_TRANSPORT` continua vazio, no repositório e no artefacto servido.
O que se segue é o que a sessão **provou**, e onde a prova está.

### E2.1 — a publicação, confirmada pelo fio

| | |
|---|---|
| Frontend `HEAD` = `origin/main` | `bd615ee` — 0 à frente / 0 atrás, árvore limpa |
| `gh-pages` | `6e8c0ae`, de 30/08 03:57:40 |
| Site | `https://igororlandi999.github.io/finer-one/` · `200` · `assets/index-CllETh7I.js` |
| **Reprodutibilidade** | o rebuild local de `bd615ee` reproduz os **sete** ficheiros publicados **byte a byte** (SHA-256 de cada um, incluindo o `index.html`) |
| Interruptores **no bundle servido** | `VITE_AUTH_MODE:"supabase"` · `VITE_PROTECTED_DATA_TRANSPORT:""` — lidos do artefacto, não do `.env` |
| Segredos no bundle | nenhum. Só a chave `sb_publishable_*`, pública por desenho |
| BFF | `74a1e0b`, árvore limpa, 0/0. **Não se lhe tocou** |
| `.mcp.json` | modificado localmente, **fora do stage** |

### R-34 — a metade sequencial, fechada do nosso lado

A sessão anterior fechou os submits **concorrentes**. Faltava a pergunta que a assinatura
observada exige — três `400` e depois um `200` em eventos **separados no tempo**: *existe
algum caminho da aplicação capaz de gerar um submit a mais?*

**Auditado:** `Login.jsx`, o adaptador Supabase, `AuthContext`, o formulário, os handlers,
o `StrictMode`, os efeitos, os listeners globais, os atributos de gestor de palavras-passe
e a propagação de eventos.

**O que se apurou:**

| Facto | Onde |
|---|---|
| `submeter` é o **único** handler de submit da aplicação. Há **um só `<form>`** em todo o `src/` | varrimento |
| A aplicação **nunca** chama `requestSubmit()`, `form.submit()` nem `.click()` num botão de submit | varrimento — o único `.click()` é o do download de CSV |
| Nenhum efeito, nenhum re-render e nenhuma notificação de `onAuthStateChange` chama `signIn` | `AuthContext.jsx:131` é o único chamador |
| **`signInWithPassword` emite UM pedido e mais nenhum** — não há retry nem backoff em `_request`/`_handleRequest` | `@supabase/auth-js@2.112.4`, `GoTrueClient.js:927,939`; `lib/fetch.js:99,119` |
| **O único `retryable()` do SDK está no caminho do `grant_type=refresh_token`** — outro `grant_type`. A renovação automática **não pode** aparecer como `grant_type=password` | `GoTrueClient.js:4012,4017` |
| `form.submit()` **não emite evento de submit** (é a norma) — logo não chama `submeter`, logo não faz `POST`. O que faria era uma **navegação** do formulário | medido |

**Conclusão, e só até onde ela vai:** N pedidos `POST /auth/v1/token?grant_type=password`
=== N chamadas a `signInWithPassword` === N chamadas a `adapter.signIn` === N eventos
`submit`. **Os quatro pedidos observados foram quatro submissões, e nenhuma nasceu do
código desta aplicação.** Isto **não** identifica quem as gerou — não absolve nem acusa o
gestor de palavras-passe, porque nada nesta sessão observou um. Fixa a **fronteira**: de
que lado dela a causa não está.

**A defesa:** `src/pages/Login.submitSequencial.test.jsx`, 9 testes, com o invariante
`nº de pedidos === nº de eventos submit` medido nos **dois** lados. Cobre os cenários B
(clique), D (`requestSubmit`), E (dois eventos espaçados), G (re-render com o pedido em
voo), H (erro → nova tentativa, três vezes), o `StrictMode`, a mutação do campo de email
entre tentativas, e `form.submit()`.

**Verificado que os testes têm força:** uma mutação em `Login.jsx` — um `useEffect` que
resubmete ao aparecer o erro — **mata 4 dos 9**. O ficheiro antigo,
`Login.submitUnico.test.jsx`, **fica verde com a mesma mutação**: era exatamente a lacuna.
Mutação restaurada de imediato; `git diff` de `Login.jsx` vazio.

**O que continua por determinar, e continua a não se fingir que não:** a troca automática
do campo de email entre tentativas. Não nasce na aplicação, e separar browser de gestor de
palavras-passe de pessoa exigia um browser real com gestor instalado. **A automação de
browser não respondeu nesta sessão** (nem a extensão, nem o DevTools MCP), pelo que os
cenários C (`Enter`) e F (autofill) ficam por cobrir. O `happy-dom` **não implementa
submissão implícita por `Enter`** — medido, não suposto —, mas num browser o `Enter` emite
**um** evento `submit`, que é o mesmo caminho de B e D.

**R-34 continua P3 e continua a não bloquear E3.**

### B-03 / R-06 — o que se mediu sem a `GAS_URL`

Runbook completo: `B03_GAS_REDIRECT_RUNBOOK.md`.

**Não se tentou obter a `GAS_URL` por meios indiretos.** Continua *Sensitive* no Vercel.

Duas coisas passaram de inferência a facto:

1. **As opções que o BFF passa ao upstream**, verificadas no fio: `GET`,
   `redirect: "follow"`, `Accept: application/json` e **mais nada** — em particular
   **o `Authorization` de quem pede NÃO é propagado** para o Apps Script;
2. **O que `redirect: "follow"` faz mesmo.** Isto **nunca tinha sido exercido por teste
   nenhum**: todos os outros testes do upstream injetam `fetchImpl`, e um duplo ignora a
   opção `redirect` porque não é um cliente HTTP. A opção que decide o comportamento mais
   sensível do proxy estava documentada e **não estava medida**.

`finer-one-proxy/test/upstream-redirects.test.mjs` fecha isso com o `fetch` real do Node
contra servidores locais. **Cinco testes, todos verdes.** O que mostram:

- uma cadeia dentro do mesmo host é seguida até ao fim — é a forma da cadeia real do GAS;
- **um `302` para um host DIFERENTE é seguido, o host é mesmo contactado, e o corpo que
  vem de lá é servido como o documento financeiro** desde que tenha a forma do contrato.
  **É o R-06, medido em vez de suposto;**
- uma cadeia infinita não pendura o proxy: vira `502 UPSTREAM`;
- um redirect que acaba em HTML — o Apps Script sem autorização — é `502
  UPSTREAM_INVALIDO`, nunca `200`;
- o endereço não aparece nos registos.

**O tamanho real do R-06, dito com honestidade:** para redirecionar o upstream é preciso
já controlar o Apps Script — e quem controla o Apps Script já controla os dados. O que
isto mede não é a probabilidade, é a **amplitude**. Continua **P2 aceite**.

**Falta um valor e mais nada.** `finer-one-proxy/scripts/gas-redirect-probe.mjs` está
escrito e **verificado ponta a ponta** contra `script.google.com` com um id inventado:
mede a cadeia e não imprime a `GAS_URL`, nem querystrings, nem cabeçalhos, nem o corpo.

### R-38 — proposta concreta para tirar o `localhost` da Production

**Não executada.** Production não foi tocada.

**Porque é que o `localhost` lá está:** foi configurado quando o desenvolvimento local
precisava de falar com o BFF de Production — não há ambiente de Preview alcançável (o
Protection Bypass saiu, R-B), portanto `localhost:5173` contra Production era a única
forma de exercer o caminho autenticado a partir do browser.

**Se continua a ser preciso depois de E3: não.** Depois de E3 o legado deixa de servir a
aplicação e a lista devia passar a ter **uma entrada só**. O desenvolvimento local que
precise do BFF pode usar `vercel dev`, que corre o BFF na própria máquina com
`ALLOWED_ORIGINS` local — sem depender da lista de Production.

**Como separar dev/preview/prod:** `ALLOWED_ORIGINS` é uma variável por ambiente no
Vercel. A separação já existe na plataforma e não está a ser usada:

| Ambiente | Valor proposto |
|---|---|
| **Production** | `https://igororlandi999.github.io` — uma entrada, mais nada |
| **Preview** | `https://igororlandi999.github.io,http://localhost:5173` |
| **Development** (`vercel dev`) | `http://localhost:5173` |

**A mudança mínima:** editar `ALLOWED_ORIGINS` **apenas no âmbito Production**, tirando
`,http://localhost:5173`. **Nenhuma linha de código muda** — `lib/cors.js` lê a variável a
cada pedido. **Não exige redeploy**, mas exige uma **nova invocação** para apanhar o valor.

**Impacto nos testes locais:** um `npm run dev` em `localhost:5173` deixa de conseguir ler
respostas do BFF de Production **no browser**. Não afeta `curl` nem os testes automatizados
(o CORS é uma regra que só o browser aplica), e não afeta a aplicação publicada. É
exatamente a fricção pretendida.

**Quando:** **durante o rollout de E3, depois de E3 estar validado** — não antes. Antes de
E3 o legado ainda serve a aplicação, e mexer na lista de origens no mesmo intervalo
tornaria impossível dizer, se algo partisse, qual das duas mudanças foi.

**Rollback:** repor o valor anterior — `https://igororlandi999.github.io,http://localhost:5173`
— e forçar uma invocação. Segundos, e sem deploy.

**Verificação, antes e depois:**

```bash
curl -i -X OPTIONS "https://finer-one-proxy.vercel.app/api/pedidos/vendas" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
# antes:  204 com Access-Control-Allow-Origin: http://localhost:5173
# depois: sem cabecalho Allow-Origin  <- e este o objetivo
```

R-38 continua **P3 aceite**, agora com a mudança desenhada e datada.

### Revisão de segurança pré-E3 — o que muda de risco ao ligar o transporte protegido

Limitada, de propósito, aos caminhos que **mudam** com E3: token, `companyId`, membership,
`/financial-data`, CORS, `Authorization`, logout, troca de empresa, cache, armazenamento do
browser, registos, `audit_log` e os erros `401`/`403`.

**Não foi encontrado nenhum risco P1 ou P2 por registar que seja provocado por ligar o
transporte protegido.** O que foi verificado, e onde:

| Caminho | Estado |
|---|---|
| **Preflight de CORS** — E3 acrescenta o cabeçalho `Authorization`, o que torna o pedido *não-simples* e passa a **exigir um `OPTIONS` de preflight** que o caminho legado nunca precisou | **já resolvido.** `lib/cors.js:101` emite `Access-Control-Allow-Headers: Content-Type, Authorization`; `protect.js:219` responde `204` a `OPTIONS`; há testes (`test/cors.test.mjs:220`) |
| Token em URL, query ou registo | **nunca.** `api.js` só o recebe por `headers`; `buildUrl` só monta `params`. Zero `console.*` em `src/services/` e `src/auth/` |
| Token em cache no cliente | **não.** `getAccessToken` é pedido ao adaptador **no momento** de cada chamada |
| `401` vs `403` | `401` chama `onUnauthorized` → logout; **`403` NÃO faz logout** — a sessão é boa, o que falha é a empresa. Expulsar aqui tiraria da aplicação quem ainda tem outras empresas válidas |
| Identidade enviada pelo cliente | bloqueada nos dois lados: `assertPayloadSemIdentidade` no cliente (alarme) e no servidor (barreira) |
| Dados cruzados na troca de empresa | **três camadas, todas vivas:** contador de geração (uma leitura obsoleta não aterra), `source` volta a `LOADING`, e `resolveCompanyDataScope`. Sob transporte protegido o dataset é carimbado com o `companyId` pedido (`blingDataService.js:1481`) |
| Resíduo de gráficos | limpo no logout **e** na troca de empresa |
| Cache da resposta protegida | `Cache-Control: private, no-store` no BFF |
| `audit_log` | só o caminho da **recusa** e só com identidade; a escrita é **esperada** (não `void`), o `requestedCompanyId` é truncado, e não leva segredo nem valor financeiro |

**Uma observação menor, que não é novidade nem bloqueia:** `signOut` não remove
`finer-one:empresa-preferida` do `localStorage`. É um id de empresa, não um segredo, e
`sessionContract.js` revalida-o contra as memberships (R-10). Fica como nota, não como
risco novo.

⚠️ **Uma armadilha de documentação, a única coisa nova que esta revisão encontrou.** O
cabeçalho de `src/auth/companyDataScope.js` diz que o módulo *"desaparece"* quando a
leitura passar a ser `/financial-data`. É **quase** verdade — as outras duas camadas
sobrevivem — mas quem o apagar durante E3 remove uma defesa contra R-18/R-19 no mesmo dia
em que muda o transporte, que é o pior dia possível para o fazer. **Não apagar
`companyDataScope.js` no intervalo de E3.** Se for para remover, é depois de E3 estabilizar
e com os testes de R-18 a correr antes e depois.

---

## Sessão do runbook R-33 — 31/08/2026 (segunda sessão do dia)

Mandato: fechar B-03 com a evidência fornecida e **executar apenas** o runbook do R-33.
Nada mais foi tocado. **E3 continua NÃO INICIADO.**

### ✅ B-03 — FECHADO

A `GAS_URL` foi fornecida **localmente** pelo Igor e a sonda
(`finer-one-proxy/scripts/gas-redirect-probe.mjs`) mediu a cadeia real:

```
salto 0  host inicial: script.google.com
salto 1  302 -> script.googleusercontent.com
salto 2  200 (final)

redirects seguidos : 1
host final         : script.googleusercontent.com
hosts distintos    : script.google.com, script.googleusercontent.com
estado final       : 200
content-type final : application/json
```

**É exatamente a cadeia que se supunha — e a diferença entre supor e medir é a razão de
B-03 ter existido.** Um salto, dois hosts, ambos do Google, `200` com `application/json`
(se o deployment tivesse perdido autorização viria `text/html`).

**A `GAS_URL` não foi impressa, não foi guardada e não entrou em commit nenhum.** A sonda
foi escrita para que não fosse preciso.

**B-03 deixa de bloquear E3.**

### R-06 — evidência completa, endurecimento por aplicar

A lista de hosts permitidos que faltava é conhecida e tem dois elementos:

```
script.google.com
script.googleusercontent.com
```

**O desconhecido que mantinha R-06 aberto desapareceu.** O que fica é uma alteração de
código, pequena e localizada, em dois ficheiros do BFF: trocar `redirect: "follow"` cego
por seguir com verificação de host contra esses dois nomes.

**Não se fez nesta sessão** porque o mandato era correr o runbook do R-33, e código do BFF
está fora dele. Quando for feita, `test/upstream-redirects.test.mjs` avisa sozinho: o teste
de caracterização `SEGUE PARA OUTRO HOST` passa a falhar, **e é esse o sinal de que
entrou**.

Registar isto como "fechado" sem a mitigação seria fazer o registo mentir, e por isso o
estado é **fechado (evidência) — endurecimento por aplicar**.

### ⛔ R-33 — autorizado, tentado, bloqueado. Nada foi criado

A autorização foi explícita e completa. **O que faltou foi um meio, não uma permissão.**

**Não existe `SUPABASE_SERVICE_ROLE_KEY` acessível a esta sessão:**

| Onde se procurou (e só aqui) | Resultado |
|---|---|
| `finer-one-proxy/.env.local` | existe, mas tem **uma só** linha — `VERCEL_OIDC_TOKEN`. Nenhuma chave do Supabase |
| Variáveis de ambiente do processo | **nenhuma** variável `SUPABASE_*` definida |

Sem ela não há Admin API; e sem Admin API não há como criar um utilizador nem escrever em
`public.memberships`. A chave `anon` é travada pela RLS — que é exatamente o que ela deve
fazer, e é bom sinal que assim seja.

**Não se procurou o segredo em mais lado nenhum** — nem em históricos de shell, nem em
ficheiros de browser, nem em gestores de palavras-passe.

**Estado remoto: intacto.** Nenhum utilizador criado, nenhuma membership escrita, nenhuma
linha alterada. A Overcel e a Finer Teste estão como estavam. Nenhuma configuração remota
foi tocada.

**O que se conseguiu confirmar sem a chave** — as duas metades da pré-condição:

| Pedido | Resultado |
|---|---|
| `GET /api/companies/finer-teste/financial-data` **sem token** | **`401`** |
| `GET /api/companies/overcel/financial-data` **sem token** | **`401`** |

A guarda está viva nas duas empresas. **Falta exercê-la com um token real sem
membership** — e essa é, por construção, a única metade que a conta nova consegue provar.

> ✅ **ATUALIZADO — R-33 FECHOU nesta mesma data.** O bloco acima é o registo de como
> esteve bloqueado. A conta foi criada pelo Igor, a membership inserida no SQL Editor, e o
> smoke correu integralmente. Ver a secção seguinte.

**R-33 estava por fechar neste ponto da sessão:** o `200`/`403` e o `audit_log` ainda não
tinham sido provados.

**O que desbloqueia** está em `R33_SINGLE_COMPANY_SMOKE.md`, no cabeçalho: ou a conta é
criada no painel (três cliques) e chega o `user_id`, ou a `service_role` é fornecida
localmente numa shell. A primeira é preferível — a `service_role` ignora a RLS por completo
e não tem de existir nesta máquina para se criar uma conta que se cria em três cliques.


---

## ✅ R-33 FECHADO — 31/08/2026

**Isolamento FORTE entre empresas está provado contra a Production real.** Era a última
condição de E3 por cumprir. Runbook e evidência completa em
`R33_SINGLE_COMPANY_SMOKE.md`.

**A conta:** `a1a84e5d-99cf-4612-a187-93c676492c42` · `igororlandi12@gmail.com` ·
membership **única** em `finer-teste` (`viewer`), **nenhuma** em `overcel`.

| Metade | Resultado |
|---|---|
| Pré-condição | uma membership, em `finer-teste`. Nenhuma em `overcel` |
| **TESTE 1** — `GET finer-teste/financial-data` | **`200`**, `debug.fonte: integracao-nao-configurada`, 58 bytes |
| **TESTE 2** — `GET overcel/financial-data` | **`403 FORBIDDEN`**, corpo sem motivo |
| **TESTE 3.C** — `audit_log` | `total_linhas = 1` · `delta_exatamente_1` · `company_id_null` · `action_ok` · `month_key_null` · `requested_overcel` · `decision_ok` · `reason_ok` · `capability_ok` — **todos `true`** |
| **TESTE 3.D** — higiene | `parece_credencial`, `parece_url`, `parece_financeiro` — **todos `false`**. `chaves_metadata` = exatamente `capability, decision, reason, requestedCompanyId` |
| **TESTE 3.E** — estado | `memberships = 1`, `empresas = ["finer-teste"]` |

**Porque é que isto é a prova e o resto não era.** `protect.test.mjs` já cobria a negação
com duplos, e a validação de E2 já mostrava a Finer Teste sem dados. Nenhuma das duas podia
responder à pergunta, porque a conta usada em E2 era membro das **duas** empresas — com ela,
um `200` na Overcel é o comportamento correto, e portanto não havia resposta errada possível
para observar. Foi preciso um **negativo**: uma conta que só pertence a B, e a prova de que
A lhe é recusada. É isso que está feito.

**Três coisas que o `audit_log` confirmou de passagem**, e que não eram o objetivo:

1. **A correção do R-H funciona.** Uma recusa isolada, sem tráfego à volta, produziu a sua
   linha. Era exatamente o caso em que o registo falhava quando a escrita era `void` e a
   instância serverless congelava antes de ela assentar;
2. **`reason = sem_membership`** e não `membership_insuficiente` — a recusa foi pela razão
   certa, e não por acaso;
3. **O registo forense não vaza.** Sem token, sem palavra-passe, sem `GAS_URL`, sem números
   da Overcel. Quatro chaves e mais nada.

**A conta NÃO foi apagada, deliberadamente.** E4 volta a precisar exatamente desta forma de
conta, e repetir o smoke durante o rollout de E3 só é barato enquanto ela existir. Quando
deixar de servir, desativa-se em vez de se apagar — a linha do `audit_log` sobrevive de
qualquer forma, porque não há FK para `auth.users` (`001_saas_foundation.sql:138`).

**Estado do sistema:** nenhuma membership existente alterada · `overcel` e `finer-teste`
intactas · BFF `74a1e0b` intacto, sem deploy · **E3 continua OFF**.


---

## Sessão de rollout de E3 — 31/08/2026 · **abortada no pré-deploy, e ainda bem**

**E3 NÃO foi ligado. Nada foi publicado.** A sessão parou na validação e o que saiu dela
foi um **P1** que teria ido para produção.

### O que aconteceu

A sessão seguiu o plano até à Fase 6 (publicar). Antes de publicar, o artefacto E3 foi
servido em `localhost:5173` e aberto num browser real. Cada carregamento produziu, de
forma determinística:

```
GET /api/pedidos/vendas                     <- LEGADO ANÓNIMO
GET /api/pedidos/vendas?recurso=despesas    <- LEGADO ANÓNIMO
GET /api/pedidos/vendas?recurso=recebiveis  <- LEGADO ANÓNIMO
GET /api/pedidos/vendas?recurso=ajustes…    <- LEGADO ANÓNIMO
GET /rest/v1/memberships                       (a autenticação resolve aqui)
GET /api/companies/overcel/financial-data   <- protegido, já tarde
```

**protected = 4 · legacy = 4.** A Fase 9 exige `legacy = 0`. Foi condição de paragem, e a
publicação não se fez.

### A causa — semântica, não descuido

`AuthContext.jsx:58` arranca com `mode = null`, resolvido num efeito assíncrono.
`modeRequiresAuthentication(null)` é `false` (`authMode.js:167`). Em
`resolveDataTransport`, com o interruptor ligado e `requiresAuth !== true`, caía-se em
`AUTENTICACAO_DESLIGADA` → **legado anónimo**.

O `false` significava duas coisas incompatíveis:

| | |
|---|---|
| **A** · a autenticação está **desligada por configuração** | o legado é a resposta certa, e é E2.1 |
| **B** · o modo **ainda não foi resolvido** | não há veredito nenhum — e um transporte anónimo não pode ser o default |

Fundir *"não"* com *"ainda não sei"* é o erro que este projeto já nomeou noutros eixos:
`unavailable` nunca vira zero, e *"sessão em LOADING não concede nada — ausência de
veredito não é autorização"*. Faltava aqui.

**O comentário do próprio ficheiro já descrevia este perigo** — mas fechara só o caso do
`companyId` nulo (→ NENHUM). O caso do `mode` nulo passava antes, na guarda anterior.

### Porque era P1

O legado é **anónimo**: serve os números reais da Overcel sem token e sem membership. Com
E3 ligado, isso acontecia **a cada carregamento**, para toda a gente — incluindo quem não
é membro da Overcel, e incluindo **quem não tem sessão nenhuma**. É a família do R-18, na
camada de transporte, e contradizia a promessa de E3.

### Porque os testes não a apanharam

Todo o harness de `transporteProtegido.semLegado.test.js` passa `requiresAuth: true`. **A
janela em que ele ainda não é `true` nunca era exercida** — e é a única em que o defeito
existe. Lacuna real de cobertura, não descuido dos testes existentes.

### O patch

Três ficheiros, 56 linhas (quase todas comentário):

- `services/dataTransport.js` — aceita `authResolved` (default `true`, para não mudar o
  significado de nenhuma chamada existente) e, com o interruptor ligado e o modo por
  resolver, devolve **NENHUM** com motivo `autenticacao_por_resolver`. A guarda entra
  **depois** da do interruptor — com E3 desligado, E2.1 não muda — e **antes** da de
  `requiresAuth`;
- `auth/AuthContext.jsx` — expõe `authResolved: mode !== null`;
- `context/FinerDataContext.jsx` — lê-o, passa-o, e **põe-no nas dependências** do
  `useMemo`: é a transição de "ainda não sei" para o veredito que tem de recalcular o
  transporte. Sem ela, a janela fechava e nunca mais reabria.

### A defesa

`src/services/transporteNaJanelaDeArranque.test.jsx` — 12 testes. **Falhava antes do
patch**, com 6 vermelhos, e a mensagem do teste de integração era literalmente *"saíram 4
leituras anónimas na janela de arranque"*: a mesma assinatura observada no browser.

Cobre os cinco contratos, incluindo os que **não** mudam (interruptor desligado → legado,
esteja o modo resolvido ou não), e monta a **árvore real** — `AuthProvider` +
`CompanyProvider` + `FinerDataProvider` — com só o SDK do Supabase substituído.

**Mutation check — as duas morrem:**

| Mutação | Resultado |
|---|---|
| `resolveDataTransport` volta a devolver o legado quando o modo está por resolver | **6 testes vermelhos** |
| `FinerDataContext` deixa de passar `authResolved` | **3 testes vermelhos** — são os de integração, e é isso que guarda a ligação que o default `true` deixaria em aberto |

### A prova no artefacto E3, em browser real

Build com `VITE_PROTECTED_DATA_TRANSPORT=true`, servido em `localhost:5173`:

| Execução | legacy | protected |
|---|---|---|
| hard reload 1 | **0** | 4 |
| hard reload 2 | **0** | 4 |
| hard reload 3 | **0** | 4 |
| **sem sessão** (contexto isolado) | **0** | **0** — e `localStorage` vazio, ecrã de login, zero menções à Overcel |
| sem sessão · reload | **0** | **0** |

Antes do patch, o caso "sem sessão" era o pior de todos: **4 leituras anónimas**. Passou a
zero pedidos.

Consola: só os dois avisos de campo de formulário já conhecidos (vêm de outro formulário,
não do Login — ver R-34) e um `404` do `favicon.ico` do preview local.

### O que isto não fecha

**E3 continua NÃO INICIADO.** O patch remove o bloqueador; não liga o transporte. O rollout
recomeça na Fase 3 do plano, com este código.

E fica uma lição operacional, que é a parte que interessa: **a validação foi feita em
`localhost` antes de publicar, e foi isso que impediu o P1 de chegar a produção.** O plano
original mandava publicar primeiro (Fase 6) e só depois medir a rede (Fase 9). Se se
tivesse seguido essa ordem, o defeito teria ido para o ar e o rollback seria a descoberta,
não a prevenção. **Servir o `dist` localmente antes de `npm run deploy` passa a ser parte
do procedimento de E3.**

---

## E3 PUBLICADO — 31/08/2026, 20:30 (−03:00) · **validação INCOMPLETA**

> ⚠️ **E3 NÃO está declarado concluído.** O artefacto está em produção e os interruptores
> estão ligados, mas o smoke com sessão real **não foi feito**: a sessão de produção estava
> expirada e não há credenciais da conta principal nesta sessão. Ver *"O que falta"*.

### O que foi publicado

| | |
|---|---|
| Frontend | `66682a4` |
| `gh-pages` | **`3d668e1`** (anterior: `6e8c0ae`) |
| Bundle | `assets/index-DVBYao2b.js` |
| Publicado | 31/08/2026, 20:30:19 (−03:00) |
| `VITE_AUTH_MODE` | `supabase` |
| `VITE_PROTECTED_DATA_TRANSPORT` | **`true`** |
| Verificação | o bundle **servido** é **byte a byte igual** ao `dist/` local (SHA-256 `fb454871…`) e traz `VITE_PROTECTED_DATA_TRANSPORT:"true"` |
| BFF | `74a1e0b` — **não foi tocado** |

### Passo 0 — o pré-deploy que passou a ser obrigatório

Artefacto E3 servido em `localhost:5173` e medido em browser real **antes** de publicar:

| Execução | legacy | protected |
|---|---|---|
| hard reload 1 | **0** | 4 |
| hard reload 2 | **0** | 4 |
| hard reload 3 | **0** | 4 |
| sem sessão (contexto isolado) | **0** | **0** |

Foi este passo que apanhou o R-39 na tentativa anterior. Correu limpo desta vez.

### O que já está provado EM PRODUÇÃO

| Verificação | Resultado |
|---|---|
| Interruptores no artefacto servido | `supabase` + `true` ✅ |
| Reprodutibilidade | bundle servido idêntico ao `dist` local ✅ |
| **Sem sessão: zero pedidos financeiros** | **legacy 0 · protected 0** ✅ — e é precisamente o caso que, antes do patch do R-39, disparava **4 leituras anónimas** dos números da Overcel |
| Sem sessão · hard reload | legacy 0 · protected 0 ✅ |
| Ecrã sem sessão | formulário de login, **zero menções à Overcel**, zero números ✅ |
| **CORS · preflight origem oficial** | `204` · `Allow-Origin: https://igororlandi999.github.io` · `Allow-Headers: Content-Type, Authorization` · `Vary: Origin` ✅ |
| **CORS · preflight origem estranha** | `204` **sem `Allow-Origin`** — o browser bloqueia. Falha fechada ✅ |

### O que FALTA, e porquê

A sessão de produção estava **expirada** — `POST /auth/v1/token?grant_type=refresh_token`
devolveu `400`. A aplicação reagiu corretamente (ecrã de login, zero leituras), mas sem
sessão não há como exercer o caminho dos dados.

**Não se pediram nem se usaram credenciais da conta principal.** Fica por fazer:

- [ ] Overcel com dados reais, pelo endpoint protegido, com zero legado;
- [ ] Finer Teste: "sem dados ligados", zero números da Overcel;
- [ ] Overcel → Finer Teste → Overcel, sem mistura;
- [ ] refresh com sessão válida;
- [ ] logout → login;
- [ ] **R-33 revalidado em E3** — precisa de `~/.finer-smoke.json`, que não existe;
- [ ] contagem final de legado/protegido nos fluxos com sessão.

### Rollback, se for preciso

`gh-pages 6e8c0ae` — o artefacto de E2.1, reproduzível **byte a byte** a partir de
`bd615ee`. Repor é publicar esse `dist` outra vez; o BFF não muda, porque nunca mudou.

### R-32 — visto em concreto, e continua aceite

Ao ler o `localStorage` da origem de produção apareceram chaves de **outros projetos** que
partilham `igororlandi999.github.io`: `canton_script_url`, `cf_products`, `cf_suppliers`,
`cf_device_id`, `austinMissionBoard`, `decoratto:ui-prefs`, `canton_visits`, ao lado de
`finer-one.empresa-preferida`.

Não é um achado novo — é o R-32, agora com a prova à vista em vez de inferida. **Continua
ACEITE TEMPORARIAMENTE** e **obrigatório resolver antes de E4 / primeiro cliente-piloto**.

---

## E3 VALIDADO EM PRODUCTION — 31/08/2026

> Substitui a caixa *"E3 PUBLICADO … validação INCOMPLETA"* acima, que era verdade no
> momento em que foi escrita. A validação **está feita**, com a conta principal, em browser
> real, contra Production. Ficam **duas verificações residuais**, nomeadas no fim.

### O artefacto

| | |
|---|---|
| Frontend | `66682a4` |
| `gh-pages` | **`3d668e1`** (rollback: `6e8c0ae`) |
| Bundle | `assets/index-DVBYao2b.js` — servido, e byte a byte igual ao `dist/` local |
| Publicado | 31/08/2026, 20:30:19 (−03:00) |
| Interruptores **no bundle servido** | `VITE_AUTH_MODE:"supabase"` · `VITE_PROTECTED_DATA_TRANSPORT:"true"` |
| BFF | `74a1e0b` — **não foi tocado** |

### Contagem de rede — a afirmação central de E3

Conta principal (`igororlandibarros`, *Proprietário*), Production, dois ciclos completos
separados por quatro minutos:

| Fluxo | protegidas | **legado** |
|---|---|---|
| Carga inicial | 4 | **0** |
| Overcel → Finer Teste | 4 | **0** |
| Finer Teste → Overcel | 4 | **0** |
| Refresh (hard) | 4 | **0** |
| *(4 min depois)* carga | 4 | **0** |
| Overcel → Finer Teste | 4 | **0** |
| Finer Teste → Overcel | 4 | **0** |
| **Total** | **28** | **0** |

Mais, antes de publicar: conta de smoke em Production, Finer Teste — 4 protegidas, 0 legado;
e sem sessão nenhuma — **0 pedidos financeiros**, que é o caso que o R-39 partia.

**`legacy = 0` em todos os fluxos financeiros.** É a promessa de E3, cumprida e medida.

### Overcel — dados reais pelo caminho novo

Todas as leituras em `/api/companies/overcel/financial-data`. O ecrã mostra os números
reais (receitas do mês, contas a pagar, DRE, cashflow, faturas em atraso com nomes e
valores), 20 valores monetários em **R$**, e o papel correto (*Proprietário*).

O que **não** aparece disfarçado de dado: `SALDO BANCÁRIO —` com *"Integração bancária não
configurada"*, e os blocos demonstrativos com selo `DEMO`. A doutrina *ausência ≠ zero*
mantém-se sob o transporte protegido.

### Finer Teste — a prova de isolamento, agora em E3

Trocar de empresa dispara **novas** leituras protegidas para `finer-teste`, e o ecrã passa a:

| Verificação | Resultado |
|---|---|
| Assinatura numérica da Overcel (`421.262,97`, `445.682,09`, `136.789,61`, …) | **nenhuma** |
| Nomes de clientes/fornecedores da Overcel | **nenhum** |
| A palavra "Overcel" no DOM | **ausente** |
| Valores em `R$` | **0** — a moeda passa a `€`, que é a da Finer Teste |
| Chamadas ao legado durante a troca | **0** |

**R-18 continua defendido, agora na camada de transporte.** Em E2 a defesa era
`companyDataScope` a recusar um dataset de outra empresa; em E3 o dataset **é** da empresa
pedida, por construção, e as três camadas continuam todas de pé.

### Voltar à Overcel

Os mesmos valores regressam, 20 em `R$`, zero em `€`, sem qualquer resíduo da Finer Teste.
Feito **duas vezes**, com quatro minutos de intervalo. Sem regressão intermitente.

### CORS

| | |
|---|---|
| Preflight no browser real | `OPTIONS …/financial-data` → **`204`**, nos quatro recursos |
| Preflight por `curl`, origem oficial | `204` · `Allow-Origin: https://igororlandi999.github.io` · `Allow-Headers: Content-Type, Authorization` · `Vary: Origin` |
| Preflight por `curl`, origem estranha | `204` **sem `Allow-Origin`** — o browser bloqueia. Falha fechada |

`Cache-Control: private, no-store` na resposta protegida — **confirmado manualmente** com
*Disable cache*, com `X-Vercel-Cache: BYPASS`. A suspeita de cache público (levantada num
cabeçalho de `304`) **não se confirmou**.

### Consola

Três entradas, todas pré-existentes e nenhuma ligada a E3: dois avisos de campo de
formulário (vêm de outro formulário, não do Login — ver R-34) e um `404` do `favicon.ico`.

### As duas verificações residuais

Nenhuma bloqueia a operação, e as duas são de minutos:

1. **`logout` → `login`.** Não foi exercido: sair da sessão de Production exigia credenciais
   da conta principal para voltar a entrar, e essas não se pedem nem se usam nesta sessão.
   É um teste de ciclo de sessão, não de isolamento de dados;
2. **R-33 revalidado em E3 ao nível da rede** (`403` na Overcel com token da conta de
   smoke). O ficheiro de credenciais foi removido, por decisão. **O que já se observou em
   E3:** a conta de smoke entrou em Production, viu **só** a Finer Teste, **sem seletor de
   empresas**, com 4 leituras protegidas e **0** ao legado. Falta a metade de rede — e E3
   **não altera a autorização**, que vive no BFF e não mudou.

### Riscos, sem alterações

- **R-32** — origem partilhada. **ACEITE TEMPORARIAMENTE.** Visto em concreto: o
  `localStorage` da origem de Production tem chaves de outros projetos (`canton_script_url`,
  `cf_products`, `austinMissionBoard`, `decoratto:ui-prefs`, …) ao lado da nossa.
  **OBRIGATÓRIO resolver antes de E4 / primeiro cliente-piloto;**
- **R-38** — `localhost:5173` continua em `ALLOWED_ORIGINS` de Production. **Não foi
  removido hoje**, por decisão: não se empilha essa mudança no mesmo rollout;
- **R-06** — evidência completa, endurecimento por aplicar (dois ficheiros do BFF);
- **R-39** — **fechado**, e a correção está **verificada no ar**.

### Rollback

`gh-pages 6e8c0ae`, reproduzível byte a byte a partir de `bd615ee`. **Não foi necessário.**

---

## ✅ R-33 REVALIDADO EM E3 — 31/08/2026 · e E3 fecha

Última verificação residual de E3. **Fechada com valores reais.**

### Rede — `node scripts/r33-smoke.mjs` contra Production com E3 ligado

```
user_id:      a1a84e5d-99cf-4612-a187-93c676492c42
memberships:  [{"company_id":"finer-teste","role":"viewer"}]

PRE-CONDICAO   finer-teste true · overcel false · total 1        OK
TESTE 1        GET finer-teste/financial-data  -> 200            OK
               debug.fonte: integracao-nao-configurada · 58 bytes
TESTE 2        GET overcel/financial-data      -> 403 FORBIDDEN  OK
               corpo: {"error":true,"code":"FORBIDDEN",
                       "message":"Sem acesso a este recurso."}
```

### `audit_log` — corrido no SQL Editor pelo Igor

| Verificação | Valor |
|---|---|
| `total_linhas` | **2** (uma de manhã, uma em E3) |
| `delta_foi_1` | `true` — **uma recusa, uma linha** |
| `company_id_null` | `true` |
| `action_ok` | `true` — `access.denied` |
| `month_key_null` | `true` |
| `requested_overcel` | `true` |
| `decision_ok` | `true` — `forbidden` |
| `reason_ok` | `true` — `sem_membership`, e não `membership_insuficiente` |
| `capability_ok` | `true` — `read_financial_data` |
| `chaves_metadata` | `["capability","decision","reason","requestedCompanyId"]` — **quatro, e mais nenhuma** |

**Higiene, nas duas linhas (`id 34` e `id 35`):** `parece_credencial` `false` ·
`parece_url` `false` · `parece_financeiro` `false`. Sem token, sem palavra-passe, sem
`GAS_URL`, sem um único número da Overcel.

### O que isto acrescenta ao que já se sabia

O `403` já tinha sido provado de manhã, **antes** de E3. Repeti-lo **depois** de o
transporte protegido estar ligado responde à única pergunta que faltava: *ligar E3 mudou
alguma coisa na autorização?* **Não mudou** — E3 alterou o cliente, e a barreira continua
onde sempre esteve, no BFF.

E o `delta_foi_1` fecha a outra metade: **uma recusa produziu exatamente uma linha.** Sem
duplicação, e sem se perder — que era o R-H, verificado agora numa sondagem isolada.

---

# E3 = FECHADO DEFINITIVAMENTE — 31/08/2026

| | |
|---|---|
| Frontend | `66682a4` · `gh-pages 3d668e1` · bundle `index-DVBYao2b.js` |
| Interruptores | `VITE_AUTH_MODE=supabase` · `VITE_PROTECTED_DATA_TRANSPORT=true` |
| BFF | `74a1e0b` — não foi tocado em nenhum momento |
| **Zero legado** | **32 leituras protegidas · 0 ao legado**, em todos os fluxos medidos |
| Isolamento | Finer Teste sem um único valor, nome ou menção da Overcel |
| `logout` → `login` | sessão nova, Overcel normal, sem mistura |
| R-33 em E3 | `200` / `403` / `audit_log` — **as três metades** |
| CORS | origem oficial permitida; origem estranha **sem `Allow-Origin`** |
| Cache | `private, no-store` confirmado à mão com *Disable cache* |
| Rollback | `gh-pages 6e8c0ae` — **não foi necessário** |

**R-39**, o P1 apanhado no pré-deploy, está fechado **e verificado no ar**.

**Riscos que transitam para antes de E4:** **R-32** (origem própria — agora
**OBRIGATÓRIO**, e em curso), **R-38** (`localhost` no CORS de Production), **R-06**
(lista de hosts permitidos no BFF), **R-07** (endurecimento do contrato do upstream).

---

# ✅ R-32 FECHADO — 31/08/2026

**A Finer One passou a ter origem própria.** O token do Supabase deixou de partilhar
`localStorage` com projetos que nada têm a ver com ela.

## A prova, e é a única que interessa

Mesmo browser, mesmo perfil, mesmo instante:

| Origem | Chaves em `localStorage` |
|---|---|
| `https://igororlandi999.github.io` | **13** — `sb-bysqekhcyrvtiejcupoa-auth-token` ao lado de `cf_products`, `cf_suppliers`, `cf_device_id`, `cf_script_url`, `canton_script_url`, `canton_visits`, `austinMissionBoard` (+2 cópias), `decoratto:ui-prefs`, `cf_device_name` |
| `https://finer-one-app.vercel.app` | **1** — `sb-bysqekhcyrvtiejcupoa-auth-token`, e mais nada |

Antes do login a origem nova tinha **zero** chaves. **Nada atravessou**: a sessão nasceu
ali, por login natural. Não se copiou token nenhum entre origens — e não se podia, que é
precisamente o ponto.

## A arquitetura escolhida, e porquê

**Projeto Vercel separado, exclusivo do frontend.** O BFF continua em
`finer-one-proxy.vercel.app`, noutro projeto, intocado.

A decisão que destrancou isto foi separar duas coisas que estavam confundidas: **o R-32
exigia uma ORIGEM própria, não um DOMÍNIO próprio.** O plano anterior começava por
"registar o domínio" e por isso não arrancava — `finerone.pt` nem sequer resolve. Um
subdomínio `*.vercel.app` é uma origem distinta tanto quanto um domínio comprado é, e
custou zero, sem DNS e sem provider novo.

`app.finerone.pt` continua a ser o destino final desejável — por **marca**, não por
segurança — e entra como *custom domain* deste mesmo projeto quando existir, **sem repetir
a migração**.

## O que mudou no repositório

Um patch, e é tudo (`916e3b4`):

| | |
|---|---|
| `vite.base.mjs` | **novo** — `resolveBase()`, fonte única do `base` |
| `vite.config.js` | `base: resolveBase(process.env)` |
| `scripts/predeploy-check.mjs` | deixa de ter `/finer-one/` à mão; importa o mesmo módulo |
| `src/config/viteBase.test.js` | **novo** — 21 testes |

Sem `VITE_BASE`, o build reproduz o artefacto do GitHub Pages **byte a byte**. O patch é
inerte para a origem antiga — e é isso que permite as duas coexistirem.

## Infraestrutura

| | |
|---|---|
| Projeto Vercel | `finer-one-app` · deployment `dpl_GnYtnw2eqU4u3fyctL3Nhz3Up3gw` · SHA `901209b` |
| Variáveis | as seis, âmbito Production, **não-Sensitive** (auditáveis) |
| `ALLOWED_ORIGINS` | `https://igororlandi999.github.io,http://localhost:5173,https://finer-one-app.vercel.app` |
| BFF | redeploy do deployment canónico existente para reler a variável. **Identidade Git histórica não comprovável** — o deployment não tem metadados de Git, por ter sido publicado por CLI (R-A) |
| Supabase | **nenhuma alteração** — o fluxo é só palavra-passe, sem `redirectTo` |

## Validação na origem nova

| | |
|---|---|
| Overcel | dados reais, 21 valores em `R$`, 0 em `€` |
| Finer Teste | 0 em `R$`, 5 em `€`, **zero** assinatura numérica, nomes ou menções da Overcel |
| A → B → A | Overcel restaurada por inteiro |
| refresh | sessão preservada, 4 protegidas |
| **protected / legacy** | **12 / 0** |
| cache | `private, no-store` · `application/json; charset=utf-8` |
| CORS | origem nova permitida · antiga permitida · `localhost` permitido · estranha **recusada** |
| R-33 | `finer-teste` **200** · `overcel` **403 FORBIDDEN** · membership única |
| consola | sem erro crítico |

### O fail-closed, observado antes do CORS

Entre publicar o frontend e autorizar a origem no BFF houve uma janela em que a
autenticação funcionava e as leituras eram **bloqueadas por CORS**. O que se viu nessa
janela vale registar:

```
POST /auth/v1/token  -> 200        autenticação funciona
GET  .../financial-data -> ERR_FAILED  ×4   bloqueado por CORS
chamadas ao legado: 0        valores no ecrã: 0        estado: indisponível
```

**CORS bloqueado não provocou fallback para o legado.** É o R-39 a segurar numa falha de
rede real, e não num teste.

## O que NÃO mudou, de propósito

- **GitHub Pages continua a servir E3** em `gh-pages 3d668e1`. Não foi desligado;
- **a origem antiga continua no `ALLOWED_ORIGINS`.** As duas coexistem — é essa janela que
  torna a migração reversível;
- **`localhost:5173` continua na lista** — é o **R-38**, e continua separado.

## Rollback

Nada a reverter: a origem antiga nunca deixou de funcionar. Se a nova tiver de sair, basta
removê-la do `ALLOWED_ORIGINS`. O deployment anterior do BFF
(`dpl_HFeYpXmESePdfZk32ZKXB3ttiq76`) continua a existir e é o alvo de rollback do redeploy.

## O que falta para o R-32 ficar completo em espírito, e não só em risco

O risco está fechado. Fica por fazer, **e não é urgente**:

1. **decidir e registar `app.finerone.pt`** — verificação de disponibilidade no
   **registrador/WHOIS/RDAP**, nunca por `nslookup`. `NXDOMAIN` prova ausência de
   resolução, não disponibilidade;
2. **cutover** do GitHub Pages para a origem nova, quando houver confiança;
3. **só depois**: remover a origem antiga do CORS e despublicar o GitHub Pages.

---

# ✅ R-38 FECHADO — 31/08/2026

`http://localhost:5173` saiu das origens permitidas de Production. Uma origem de
**desenvolvimento** deixou de estar numa variável de **produção**.

## A alteração

```
ANTES:  https://igororlandi999.github.io,http://localhost:5173,https://finer-one-app.vercel.app
DEPOIS: https://igororlandi999.github.io,https://finer-one-app.vercel.app
DIFF:   remover ",http://localhost:5173"
```

Lido do valor **real** antes e depois — não inferido. Nenhuma outra variável tocada, e a
`ALLOWED_ORIGINS` continua **não-Sensitive**, portanto auditável.

## O redeploy

| | |
|---|---|
| Deployment de origem | `dpl_5EHxCP6rXyMmULU7599x1A7R1D5K` (`8gt9gx91f`) |
| Deployment novo | `finer-one-proxy-4bbi3pf7a` · Ready em 11s · 22:03 (−03:00) |
| Rollback | `dpl_HFeYpXmESePdfZk32ZKXB3ttiq76` (`81cthzdak`), o canónico de 29/08, ainda existente |
| Método | **redeploy do deployment canónico existente**; identidade Git histórica não comprovável |

Sem `vercel --prod`, sem *working tree* local, sem push, sem alteração de código.

## A prova

| Origem | Endpoint protegido | Endpoint legado |
|---|---|---|
| `https://finer-one-app.vercel.app` | **permitida** | **permitida** |
| `https://igororlandi999.github.io` | **permitida** | — |
| `http://localhost:5173` | **SEM `Allow-Origin`** ✅ | **SEM `Allow-Origin`** ✅ |
| `https://atacante.example.com` | SEM `Allow-Origin` ✅ | — |

**Verificou-se também no endpoint LEGADO**, e é o que mais importava: era ele que servia
os números reais da Overcel **sem token** (R-14). Era o par `localhost` + legado que dava
substância ao R-38, e é esse par que deixou de existir.

## Comportamento além do CORS: idêntico

| sonda | antes | depois |
|---|---|---|
| protegido sem token | 401 | 401 |
| `OPTIONS` | 204 | 204 |
| legado `GET` | 200 | 200 |
| `HEAD` | 405 | 405 |
| corpo do 401 | `UNAUTHENTICATED` | idêntico |

## Smoke na origem oficial nova

`https://finer-one-app.vercel.app` — sessão válida, Overcel com dados reais (21 valores em
`R$`), **4 protegidas · 0 legado**, sem indisponibilidade, consola sem erro crítico (só os
dois avisos de formulário pré-existentes do R-34 e o `404` do favicon).

E a origem antiga **continua a funcionar**: `github.io` responde `200` e continua
autorizada no CORS. As duas coexistem, como planeado.

## A consequência, dita em voz alta

**O desenvolvimento local em `localhost:5173` deixa de conseguir ler o BFF de Production
a partir do browser.** É a fricção pretendida, não um efeito colateral.

Duas coisas que isto muda no método:

1. **O `Passo 0` do rollout** — servir o `dist` em `localhost:5173` e medir a rede — deixa
   de funcionar contra o BFF de Production. Foi assim que o **R-39** foi apanhado antes de
   ir para o ar, e por isso o substituto tem de existir antes de fazer falta:
   **`vercel dev`** no BFF (com `ALLOWED_ORIGINS` local), ou medir contra a origem nova já
   publicada;
2. `curl` e os testes automatizados **não são afetados** — o CORS é uma regra que só o
   browser aplica.

## Rollback

Repor `,http://localhost:5173` na variável e redeployar. Ou promover o deployment
`8gt9gx91f`, que continua a existir com o valor anterior já compilado.

---

# ✅ R-06 FECHADO — 31/08/2026, 22:20 (−03:00)

O BFF deixou de seguir redirects cegamente. **Em Production.**

## Antes e depois

| | |
|---|---|
| **antes** | `fetch(url, { redirect: "follow" })` nos dois endpoints. O `follow` do Node segue para onde o `Location` mandar, sem olhar para o host |
| **depois** | `redirect: "manual"`, saltos dados à mão, cada destino validado **antes** de ser contactado (`lib/upstreamRedirect.js`) |

**O tamanho real do risco, sem o inflacionar:** para redirecionar o upstream é preciso já
controlar o Apps Script — e quem o controla já controla os dados. Isto não fechou uma
porta aberta; **limitou a amplitude** se ela for arrombada. Passou de *"qualquer host da
internet"* para *"o que o Google serve"*.

## A política

| | |
|---|---|
| **Hosts permitidos** | `script.google.com` · `script.googleusercontent.com` |
| De onde vem a lista | **a medição da sonda do B-03** com a `GAS_URL` real — um salto, dois hosts — e não uma suposição sobre como o Apps Script funciona |
| Mesmo host do pedido inicial | também passa: um redirect interno não amplia nada, porque quem controla esse host já controlava a resposta |
| **Limite de redirects** | **5** (a cadeia real tem **1**) |
| **Protocolo** | não pode descer. `https → http` é recusado **mesmo para um host da lista** |
| **`Authorization`** | **nunca** propagado ao upstream, em nenhum salto |
| Comparação de hosts | **igualdade exata**, nunca por sufixo — um `endsWith("google.com")` deixaria passar `atacante-google.com` |

## Semântica de erro (e o que NÃO é)

A recusa cai no `catch` que já existia e vira **`502`**. O registo leva **só o hostname** —
nunca a `Location` inteira, que carrega a query string do upstream.

**Isto não é o R-07.** O tratamento de `{"error":true}` com `200` → `502` **não foi
tocado** e continua aceite e pendente.

## O caminho: Preview → smoke → Production

| | |
|---|---|
| **Preview** | `finer-one-proxy-oe1qj2a6s` · HEAD `7ee20e5` · 22:16 |
| Alcançabilidade | o Preview está atrás de *Deployment Protection* (`302`) desde que o bypass saiu no R-B. **Não se reabriu.** Usou-se `vercel curl`, que faz o bypass pela autenticação da própria CLI, sem tocar em definição nenhuma |
| **Production** | `dpl_EYAYpYLtspxxHAkN9dt3TsWDSn1r` (`k7d5onnjn`) · 22:20:21 |
| Deployment anterior | `finer-one-proxy-4bbi3pf7a` — **é o rollback** |
| Rollback mais antigo | `dpl_HFeYpXmESePdfZk32ZKXB3ttiq76` (`81cthzdak`), o canónico de 29/08 |

## A prova de que não houve regressão

O endpoint legado exerce a cadeia **real** do Apps Script a cada pedido. Comparado nos
três estados:

```
Production ANTERIOR (follow cego)  ->  595493 bytes  ·  sha256 e9c39bd640a1ce7e9970…
Preview    (política)              ->  595493 bytes  ·  sha256 e9c39bd640a1ce7e9970…
Production NOVA   (política)       ->  595493 bytes  ·  sha256 e9c39bd640a1ce7e9970…
```

**Byte a byte idêntico.** O payload financeiro não mudou — mudou o caminho por onde se
recusa ir.

## As provas negativas, ao nível do fio

Com o `fetch` real e servidores locais:

| | |
|---|---|
| redirect para host de terceiros | **recusado** — e o host **nunca foi contactado**. A mensagem **não expõe** a `Location` |
| `https → http` em host permitido | **recusado** |
| cadeia sem fim | parou ao **6.º** pedido (limite 5) |

## Smoke de Production

| | |
|---|---|
| legado (cadeia real) | `200`, 595493 bytes |
| protegido sem token | `401` |
| `OPTIONS` | `204` · `HEAD` `405` |
| CORS | `finer-one-app` ✅ · `github.io` ✅ · `localhost` **recusado** ✅ · estranha **recusada** ✅ |
| cache (protegido, autenticado) | **`private, no-store`** |
| Frontend `finer-one-app.vercel.app` | sessão válida · Overcel com dados reais (21 valores em `R$`) · **protected 5 · legacy 0** · sem erro crítico |

## Testes

**269 no total.** 29 novos de política (`test/upstreamRedirect.test.mjs`) mais os 5 no fio
(`test/upstream-redirects.test.mjs`), onde o teste de caracterização `SEGUE PARA OUTRO
HOST` foi **convertido em regressão** — exatamente como o seu próprio cabeçalho previa.

**Três mutações, três mortas:** permitir qualquer hostname mata 10; acrescentar um host
atacante à lista mata 3; voltar ao `follow` cego mata 2.

### Uma nota sobre o harness, porque a razão interessa

O duplo dos testes no fio ignorava o URL e devolvia sempre o mesmo destino. Isso bastava
enquanto o `follow` era interno ao Node — o duplo era chamado **uma** vez. Com o R-06 é o
nosso código que dá cada salto, e um duplo que ignora o URL faz a cadeia andar em círculo.
O servidor local passou a **fingir-se dos hosts do Google**, preservando caminho e query:
as `Location` relativas resolvem-se no espaço de nomes onde se resolvem a sério.

## Rollback

`npx vercel promote finer-one-proxy-4bbi3pf7a…` — ou redeploy desse deployment. Continua a
existir e traz o código anterior. **Não foi necessário.**

---

# ✅ R-07 FECHADO — 31/08/2026, 22:32 (−03:00)

Um `200` do Apps Script que diz `{"error":true}` deixou de ser tratado como um `200`.
**Em Production.**

## O problema, e porque era real mesmo não sendo explorável

O Apps Script **não consegue** devolver outro estado HTTP — o `ContentService` não expõe
controlo de status. Toda a exceção dele sai como:

```
HTTP 200   { "error": true, "message": "<sanitizado>", "details": "" }
```

O BFF reencaminhava isso com `200` e `Content-Type: application/json`, porque
`corpoEhJsonDoContrato` só provava **forma** — *"é um objeto JSON"* — e um objeto de erro
é um objeto JSON.

**O frontend já rejeitava `res.error === true`** (`blingDataService.js:1284`). Ou seja, o
defeito não estava explorável — estava **dependente do cliente**. É outra coisa: uma
afirmação sobre o estado de um terceiro não pode viajar como se fosse nossa, e um
consumidor novo — uma app móvel, um script, outro proxy — **não herda a defesa de um
cliente antigo**. Quem sabe que o upstream falhou é o BFF.

## Antes e depois

| | |
|---|---|
| **antes** | upstream `200` + `{"error":true}` → BFF **`200`**, corpo reencaminhado |
| **depois** | upstream `200` + `{"error":true}` → BFF **`502`** |

Corpo devolvido, no padrão do projeto e mais nada:

```json
{ "error": true, "code": "UPSTREAM_ERRO", "message": "A fonte de dados devolveu um erro." }
```

**A mensagem do Apps Script não atravessa a fronteira** — nem no corpo, nem no registo,
que também não leva o endereço do upstream.

## A regra, e o falso positivo que ela evita

**`error === true` no TOPO, booleano estrito.** Não é *"tem a palavra error algures"*:

| | |
|---|---|
| `{"data":[{"error":true}]}` | passa — é um item com um campo, não uma falha da resposta |
| `{"debug":{"error":true}}` | passa — é diagnóstico, não veredito |
| `{"error":""}` · `{"error":0}` · `{"error":null}` · `{"error":false}` | passam — valores falsos não afirmam nada |
| `{"ok":false,"error":{...}}` | passa **de propósito** — é o **R-08**, tem outra causa (`erroAjuste_`, que só serve o `doPost`, e o BFF só faz `GET`) e não se fecha por arrasto |

**Medido antes de escrever uma linha**, contra a Production real e nos quatro recursos: a
chave `"error"` aparece **zero** vezes e os quatro corpos começam por `{"data"`.

## Três causas de `502`, e continuam distinguíveis

| código | causa |
|---|---|
| `UPSTREAM` | o upstream devolveu um estado mau (4xx/5xx) |
| `UPSTREAM_INVALIDO` | `200` mas o corpo não é o contrato (HTML, JSON truncado) |
| `UPSTREAM_ERRO` | `200` e o corpo **declara** erro ← **novo** |

Colapsá-las num código só faria o registo dizer menos do que sabe. Há um teste que exige
que as três continuem distintas.

## Escopo: os dois endpoints

Aplicado ao protegido **e** ao legado. Corrigir só o primeiro deixaria o legado a servir a
avaria como se fosse dado — e o legado é o que serve **hoje** os números reais da Overcel,
sem token. Partilham `analisarCorpoDoUpstream`, mas partilhar a função não prova que ambos
a usam: há testes para cada um.

`analisarCorpoDoUpstream` faz **uma** análise e devolve as duas respostas
(`ehContrato`, `declaraErro`); `corpoEhJsonDoContrato` passa a derivar dele, com a
semântica de sempre — para não mover uma fronteira que já tinha testes seus.

## Preview → Production

| | |
|---|---|
| **Preview** | `finer-one-proxy-k4g0u2l6e` · `c71a39d` · 22:31 · alcançado com `vercel curl`, **sem reabrir o bypass do R-B** |
| **Production** | `dpl_4D1KbT3NEGodWWb6fx8xGpSe1UqK` (`p94sdahu1`) · 22:32:36 |
| Deployment anterior | `dpl_EYAYpYLtspxxHAkN9dt3TsWDSn1r` (`k7d5onnjn`) — **é o rollback** |

**O cenário artificial `{"error":true}` não é alcançável no Preview** sem mexer no Apps
Script real: o BFF valida `recurso` contra a lista e devolve `400` **antes** de chamar o
upstream, por isso nem o `RECURSO_DESCONHECIDO` lá chega. Fica coberto por injeção
controlada nos testes — nos dois endpoints.

## A prova de que o dado não mudou

O endpoint legado exerce a cadeia real do Apps Script a cada pedido:

```
Production antes do R-06   595493 bytes   sha256 e9c39bd640a1ce7e9970…
Preview R-06               595493 bytes   sha256 e9c39bd640a1ce7e9970…
Production com R-06        595493 bytes   sha256 e9c39bd640a1ce7e9970…
Preview R-07               595493 bytes   sha256 e9c39bd640a1ce7e9970…
Production com R-07        595493 bytes   sha256 e9c39bd640a1ce7e9970…
```

**Byte a byte idêntico em cinco estados.** Dois endurecimentos seguidos, e o documento
financeiro não mudou um byte.

## Smoke de Production

| | |
|---|---|
| legado | `200`, 595493 bytes |
| protegido sem token | `401` · `OPTIONS` `204` · `HEAD` `405` |
| CORS | `finer-one-app` ✅ · `github.io` ✅ · `localhost` recusado ✅ · estranha recusada ✅ |
| cache (protegido autenticado) | **`private, no-store`** |
| Frontend `finer-one-app.vercel.app` | sessão válida · Overcel com dados reais (21 valores em `R$`) · **protected 4 · legacy 0** · sem erro crítico |

## Testes

**295 no total.** 26 novos (`test/upstreamErroDeclarado.test.mjs`), cobrindo os dois
endpoints. O caso latente que estava em `contratoUpstream.test.mjs:35` —
`'{"error":true,"code":"RECURSO_DESCONHECIDO"}'` marcado como *"o Apps Script responde
assim, com 200"* — deixou de ser uma aceitação e passou a ter guarda.

**Três mutações, três mortas:** voltar a aceitar `error:true` mata 10; decidir só pelo
status mata 9; devolver a mensagem do upstream mata o teste de não-vazamento.

## Rollback

Promover ou redeployar `finer-one-proxy-k7d5onnjn`. Continua a existir. **Não foi
necessário.**

---

# ✅ CUTOVER — 31/08/2026, 22:39 (−03:00)

**A origem oficial da Finer One passou a ser `https://finer-one-app.vercel.app`.**

## O que mudou

```
ALLOWED_ORIGINS
  antes:   https://igororlandi999.github.io,https://finer-one-app.vercel.app
  depois:  https://finer-one-app.vercel.app
  diff:    remover "https://igororlandi999.github.io,"
```

Lido do valor real antes e depois. Nenhuma outra variável tocada; continua **não-Sensitive**
e auditável.

| | |
|---|---|
| Deployment anterior | `dpl_4D1KbT3NEGodWWb6fx8xGpSe1UqK` (`p94sdahu1`) |
| Deployment novo | `dpl_EiYuqDnGbFZcVwbNqBAyNFurvBVQ` (`3ekip0i10`) · 22:39:08 |
| Método | **redeploy do deployment existente** — só env, sem código novo |
| Rollback | `dpl_EYAYpYLtspxxHAkN9dt3TsWDSn1r` (`k7d5onnjn`), pré-R-07 |

## A prova do cutover

| Origem | Endpoint protegido | Endpoint legado |
|---|---|---|
| `https://finer-one-app.vercel.app` | **permitida** | **permitida** |
| `https://igororlandi999.github.io` | **SEM `Allow-Origin`** | **SEM `Allow-Origin`** |
| origem estranha | SEM `Allow-Origin` | — |

**Nada além do CORS mudou:** protegido sem token `401`, `OPTIONS` `204`, `HEAD` `405`,
legado `200` com **595493 bytes** e `sha256 e9c39bd640a1ce7e9970…` — o mesmo payload de
sempre.

## Smoke final na origem oficial

| | |
|---|---|
| sessão | válida |
| Overcel | dados reais, 21 valores em `R$`, assinatura e nomes presentes |
| Finer Teste | 0 em `R$`, 5 em `€`, **zero** assinatura, nomes ou menções da Overcel |
| A → B → A | Overcel restaurada por inteiro |
| refresh | sessão preservada |
| **protected / legacy** | **15 / 0** |
| cache | `private, no-store` |
| consola | sem erro crítico (só os avisos de formulário do R-34 e o `404` do favicon) |

## A origem antiga, depois do cutover

| | |
|---|---|
| HTTP | `200` — o estático continua a ser servido |
| chamadas ao BFF | **4 × `ERR_FAILED`**, bloqueadas por CORS |
| chamadas ao legado | **0** — sem fallback |
| dados financeiros no ecrã | **nenhum**; zero valores monetários, zero assinatura da Overcel |
| estado | **indisponível** — falha fechado |

**A origem antiga deixou de funcionar como Production.**

---

# ⚠️ MAS O R-32 NÃO FECHA SÓ COM CORS — E ISTO É NOVO

Medido na origem antiga **depois** do cutover:

```
sessão Finer One ainda viva nessa origem:  SIM   (expira 2026-09-01T01:57:41Z)
total de chaves no localStorage:           14
de outros projetos:                        canton_script_url · cf_products · cf_suppliers
                                           cf_device_id · cf_script_url · cf_device_name
                                           austinMissionBoard (+3 cópias) · decoratto:ui-prefs
                                           canton_visits
```

**O CORS só protege o browser.** Um token roubado do `localStorage` partilhado de
`igororlandi999.github.io` — por um script de qualquer projeto vizinho da mesma origem —
**funciona contra o BFF a partir de `curl`**, onde não há CORS nenhum a aplicar. O BFF
autoriza por JWT, e o JWT continua válido.

Ou seja: enquanto a aplicação antiga continuar a **conseguir iniciar sessão**, continua a
**fabricar tokens numa origem partilhada** — e o cutover de CORS não fecha esse caminho,
apenas o fecha para o browser.

**Consequência para a decisão do GitHub Pages:** manter o site antigo funcional (opção A)
**não é neutro**. É a opção que deixa o R-32 vivo pela porta de trás. As opções B (página
que aponta para a origem nova) e C (despublicar) fecham-no, porque removem a capacidade de
criar sessões naquela origem.

**Esta decisão fica em aberto e é do Igor.** Nada foi despublicado.

## Rollback do cutover

Repor `https://igororlandi999.github.io,` no `ALLOWED_ORIGINS` e redeployar o deployment
existente. Segundos, e sem tocar em código. O GitHub Pages nunca foi despublicado, portanto
não há nada a repor do lado dele.

---

# ✅ OPÇÃO B EXECUTADA — 31/08/2026, 22:51 (−03:00)

A origem antiga deixou de servir a aplicação. `https://igororlandi999.github.io/finer-one/`
passou a ser uma **página estática de encaminhamento**.

| | |
|---|---|
| `gh-pages` antes | `3d668e1` — a aplicação React |
| `gh-pages` depois | **`04c6847`** — um único ficheiro, `index.html` |
| Fonte versionada | `gh-pages-redirect/index.html`, commit `e45161c` |
| Rollback | `gh-pages 3d668e1`, reproduzível a partir de `bd615ee` — republicar `dist/` |

## Porque é que isto não era arrumação

O CORS já não autorizava a origem antiga, **mas o CORS só governa o browser**. Um token
roubado do `localStorage` partilhado de `github.io` funciona a partir de `curl`, onde não
há CORS a aplicar. Enquanto a aplicação lá conseguisse **iniciar sessão**, continuava a
**fabricar tokens numa prateleira** que qualquer script de um projeto vizinho consegue ler.

Fecha-se por **remoção**, não por configuração. É o que esta página faz.

## O que a página não carrega — verificado, não prometido

Com os comentários HTML removidos, para a prova ser sobre o que a página **faz** e não
sobre o que ela **diz**:

```
<script>                          0
bundle / assets                   0
supabase                          0
BFF / /api/                       0
localStorage / sessionStorage     0
auth / token / login / password   0
financial-data / pedidos-vendas   0
fetch / XHR / import              0
qualquer host que não o novo      0

único URL no ficheiro:  https://finer-one-app.vercel.app/
```

**Nem um script.** O encaminhamento é um `meta refresh`, que o browser executa sem correr
código — por isso a ausência é verificável a olho. Sem tipos de letra externos: um `<link>`
para o Google Fonts seria um pedido a terceiros numa página cuja razão de ser é não fazer
pedidos. Redirect automático de 4 s **mais** link manual visível.

## Prova em produção

O branch `gh-pages` tem **um** ficheiro — o bundle antigo desapareceu. Servido:
`<title>Finer One mudou de endereço</title>`, zero referências a `assets/`. Aberto em
contexto isolado, encaminhou para a origem nova, que montou a aplicação normalmente.

**A origem antiga já não monta a aplicação, não oferece login e não pode criar sessões.**

## A origem oficial, depois disto

`https://finer-one-app.vercel.app` — sessão válida, Overcel com dados reais (21 valores em
`R$`), **4 protegidas · 0 legado**, sem indisponibilidade.

---

# ⚠️ DOIS ACHADOS DESTA RONDA, E NENHUM ERA ESPERADO

## 1. O `git push` disparou um deploy automático do frontend

`vercel link` imprimiu *"Connecting GitHub repository… Connected"* e **reativou a
integração Git** que estava deliberadamente desligada. O push de `e45161c` produziu
`dpl_FYmGZphYc68zVtiapFrK8KfaEfio` (`lq75pba3j`) **em Production**, sem ninguém o pedir.

O artefacto que ficou está **correto** — `VITE_AUTH_MODE:"supabase"`,
`VITE_PROTECTED_DATA_TRANSPORT:"true"`, API certa, `base` na raiz, sem segredos, sem source
maps — e a aplicação foi verificada a funcionar. **Não houve estrago.** Mas a disciplina
que este projeto manteve o rollout inteiro — *publicar é uma decisão, não um efeito
secundário* (R-A) — foi quebrada por uma ferramenta.

**Por decidir:** voltar a desligar a integração Git no projeto `finer-one-app`, ou aceitar
o auto-deploy e passar a tratá-lo como o mecanismo oficial. **Não é neutro:** com ele
ligado, qualquer commit em `main` que toque no frontend publica.

## 2. O artefacto servido não reproduz a partir do repositório

O bundle em produção é `index-CeG_Zjzp.js`, **415 553 bytes**. O build local do **mesmo
commit** (`e45161c`) com o **mesmo `VITE_BASE=/`** dá `index-aYqIssvv.js`, e os `sha256`
**diferem**.

O que foi verificado e **não** explica a diferença:

| | |
|---|---|
| `src/`, `vite.config.js`, `index.html`, `package.json` entre `901209b` e `e45161c` | **sem alterações** |
| `package-lock.json` | **versionado**, e o `node_modules` local bate certo com ele — **zero pacotes com deriva** |
| Metadados de Git no deployment | **nenhuns** — não há commit de origem para comparar |

**A causa é desconhecida e não se inventa uma.** O que se sabe: o artefacto tem os
interruptores certos, o `base` certo, nenhum segredo, nenhum source map, e a aplicação
funciona.

**O que isto custa:** a propriedade *"o rebuild local reproduz o artefacto publicado byte a
byte"* — usada como prova em E2.1, em E3 e no Passo 0 — **deixa de valer para a origem
nova**. É uma perda real de capacidade de auditoria, e fica registada como tal em vez de
ser arredondada.

**A investigar quando houver janela:** comparar `npm ci` contra `npm install` no build do
Vercel, e fixar a versão do Node do projeto.

---

# PRÉ-E4 — o que falta

## Sessões já emitidas ⛔ EXIGE AÇÃO HUMANA

**Substituir o GitHub Pages NÃO invalida tokens já emitidos.** Um `access_token` do
Supabase é um JWT assinado: vale até expirar, independentemente de a origem que o criou
ainda existir. E o `refresh_token` que ficou no `localStorage` da origem antiga continua a
poder renová-lo.

Foi medido a 31/08, **depois** do cutover de CORS e antes desta página: havia uma sessão
Finer One viva em `igororlandi999.github.io`, com expiração `2026-09-01T01:57:41Z`, ao lado
de 12 chaves de outros projetos.

### O passo a passo, sem imprimir tokens

1. **Supabase → Authentication → Users.** A lista mostra `Last sign in at` por utilizador.
   Nenhum token é exibido;
2. para cada conta que tenha entrado na aplicação **antes de 31/08/2026 22:51**, usar
   **Sign out user** (ou *Revoke sessions*). Isso invalida os `refresh_token` do lado do
   servidor;
3. os `access_token` já emitidos **continuam válidos até expirarem** — pela configuração
   observada, cerca de uma hora. É uma janela curta e conhecida, e não há forma de a
   encurtar sem rodar o segredo de assinatura do projeto;
4. confirmar depois, entrando de novo **na origem nova**, que a sessão volta a formar-se
   normalmente.

**Não se revogam contas sem autorização**, e nada foi revogado nesta sessão.

### Quem precisa

Duas contas conhecidas usaram a origem antiga: a **principal** e a de **smoke**
(`a1a84e5d-99cf-4612-a187-93c676492c42`). A lista de utilizadores do painel é a fonte
autoritativa.

## Estado

| | |
|---|---|
| Origem oficial | `https://finer-one-app.vercel.app` |
| GitHub Pages | apenas página de migração |
| Origem antiga | **incapaz de iniciar sessão nova** |
| CORS | só a origem nova |
| **R-32** | **fechado estruturalmente** — a origem nova é exclusiva, e a antiga já não produz sessões |
| **Pré-E4** | pendente da **revogação das sessões já emitidas**, mais a decisão sobre o auto-deploy |

---

# ✅ PIPELINE DETERMINÍSTICO — 31/08/2026, 23:05 (−03:00)

Os dois achados da ronda anterior estão fechados.

## 1 · Auto-deploy — OFF

**Estado anterior, medido nos logs e não inferido:**

```
Cloning github.com/igororlandi999/finer-one (Branch: main, Commit: e45161c)
  -> dpl_FYmGZphYc68zVtiapFrK8KfaEfio  ·  Production  ·  automático

Cloning github.com/igororlandi999/finer-one (Branch: gh-pages, Commit: 04c6847)
  -> Error: "vite: command not found" (exit 127)  ·  Preview
```

**Causa:** o `vercel link --yes` imprimiu *"Connecting GitHub repository… Connected"* e
ligou o repositório. Não foi uma definição mudada à mão — foi a ferramenta, ao ligar a
pasta local ao projeto.

**Duas consequências, e a segunda só apareceu ao ler os logs:** um `push` em `main`
publicava em Production; e um `push` em **`gh-pages`** — que a página de encaminhamento usa
— gerava um **build vermelho de cada vez**, porque esse branch não tem `package.json`.

**Resolvido:** integração Git **desconectada** no painel. O projeto e o histórico ficam; os
deploys voltam a ser `vercel --prod`, exatamente como no `finer-one-proxy`. A política volta
a valer: **publicar é uma decisão, não um efeito secundário de um push.**

## 2 · Reprodutibilidade — restaurada

**Causa:** o Vercel expunha as suas variáveis de sistema ao build com prefixo `VITE_VERCEL_*`,
e a Vite inlina **tudo** o que começa por `VITE_`. Eram **19**, inlinadas duas vezes:
**+4 414 bytes**.

Não era só um problema de reprodutibilidade — **era metadado interno servido a qualquer
visitante** de uma aplicação financeira:

```
VITE_VERCEL_DEPLOYMENT_ID · VITE_VERCEL_URL · VITE_VERCEL_GIT_COMMIT_SHA
VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME · VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN
VITE_VERCEL_PROJECT_ID · VITE_VERCEL_GIT_REPO_ID · VITE_VERCEL_GIT_REPO_SLUG  … +11
```

E como `DEPLOYMENT_ID` e `URL` são **únicos por deployment**, dois deploys do mesmo commit
também nunca coincidiriam. A reprodutibilidade estava estruturalmente impossível.

**Resolvido:** *"Enable access to System Environment Variables"* desligado no painel. As
seis variáveis explícitas da Finer One ficaram intactas — verificado, **6/6, e nenhuma a
mais**.

### O que sobrou, e porque não é um problema

Uma só: `VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG` — endpoints de analytics, `+640 bytes`.
Duas coisas a tornam inofensiva:

1. **é estável.** O mesmo hash (`4790bcf463235ddc`) nos deployments antes e depois da
   alteração — é do **projeto**, não do deployment. Logo **Vercel → Vercel é determinístico**;
2. **é inerte.** Nada no código importa `@vercel/analytics`; o smoke confirma que **nenhum
   script de analytics é carregado**. É dado morto no bundle.

## A prova

Build local com as **mesmas** variáveis que o projeto tem:

```
local :  index-DmNrQQYn.js   411 779 bytes   sha256 60acdd737d06d2101ddaba3c3e77aa42…
vercel:  index-DmNrQQYn.js   411 779 bytes   sha256 60acdd737d06d2101ddaba3c3e77aa42…
                                             IDÊNTICO BYTE A BYTE
```

Mesmo nome de ficheiro — o hash da Vite é função do conteúdo, portanto o nome coincidir já
é meia prova. E os outros cinco ficheiros do artefacto também: `index.html`, o CSS,
`react`, `recharts` e o chunk lazy — **todos idênticos**.

### A receita, para quem repetir

```bash
MSYS_NO_PATHCONV=1 VITE_BASE=/ VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG='<o valor do projeto>' npm run build
```

Mais as cinco variáveis do `.env.local`. O valor de observabilidade lê-se do próprio bundle
servido — não é segredo, são endpoints.

**Nota:** `VITE_BASE` tem de ser variável de ambiente **a sério**. No `.env.local` não
funciona — a Vite carrega os `.env` para `import.meta.env`, não para `process.env`, e o
`base` é decidido pelo processo de build.

## Deployment

| | |
|---|---|
| Novo | `dpl_DSAxFHY6RVjR7NuH5owT1fHmYTej` (`fgt7cs80i`) · 23:05 · **manual**, `vercel --prod` |
| Anterior (rollback) | `dpl_FYmGZphYc68zVtiapFrK8KfaEfio` (`lq75pba3j`) |
| Smoke | sessão válida · Overcel com dados reais, 21 valores em `R$` · protegidas `200`, preflights `204` · **legacy 0** · sem erro crítico |

**Nada de código foi alterado.** Duas definições de painel, um deploy manual, e uma
comparação. `main` continua em `e4e30a6`.
