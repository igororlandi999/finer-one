> # ✅ 31/08/2026 — R-38 FECHADO. `localhost` saiu do CORS de Production.
>
> `ALLOWED_ORIGINS` = `https://igororlandi999.github.io,https://finer-one-app.vercel.app`.
> Verificado no endpoint protegido **e no legado** — era o par `localhost` + legado que
> dava substância ao risco.
>
> ⚠️ **Muda o método:** o `Passo 0` do rollout (servir o `dist` em `localhost:5173` e medir
> a rede) **já não fala com o BFF de Production**. Foi assim que o R-39 foi apanhado antes
> de ir para o ar — arranjar o substituto **antes** de fazer falta: `vercel dev` no BFF, ou
> medir contra a origem nova. `curl` e os testes não são afetados.
>
> **Antes de E4, por ordem:** cutover · **R-06** (lista de hosts no BFF) · **R-07**.

> # ✅ 31/08/2026 — R-32 FECHADO. A Finer One tem origem própria.
>
> `https://finer-one-app.vercel.app` — projeto Vercel **separado** do BFF. O
> `localStorage` da origem nova tem **uma** chave (o token); o da antiga tinha **13**, com
> 12 de outros projetos. Detalhe em `RISK_REGISTER.md` §*R-32 FECHADO*.
>
> **O GitHub Pages continua a servir E3** e a origem antiga continua autorizada no CORS —
> as duas coexistem de propósito, e é isso que torna a migração reversível.
>
> **Antes de E4, por ordem:** cutover para a origem nova · remover `localhost` do CORS
> (**R-38**) · lista de hosts permitidos no BFF (**R-06**) · endurecer o contrato do
> upstream (**R-07**). O domínio `app.finerone.pt` é questão de **marca**, já não de
> segurança.

# Próxima sessão — o que exige desktop

> # ✅ OS PASSOS 1 A 5 DESTE FICHEIRO FORAM EXECUTADOS
>
> **Atualizado a 30/08/2026**, ao fim da sessão de consolidação pós-E2.
>
> A versão de 29/08 descrevia trabalho **por fazer**. Esse trabalho está feito: o BFF foi
> promovido e validado, e o frontend publicou E2. **Os passos 1 a 5 abaixo ficam como
> registo do que se fez, não como instruções por executar** — não os voltar a correr.
>
> O que resta deste ficheiro para o futuro são duas secções, e só essas:
> **"O que NÃO se consegue fechar sem browser/desktop"** e **"Se sobrar tempo"**.

---

## Estado real — 31/08/2026

*A tabela abaixo foi reverificada pelo fio na sessão autónoma de 31/08. Os registos
históricos de E2 (`a8bfca0` → `gh-pages 22b0526`) não foram reescritos — vivem em
`FRONTEND_AUTH_RELEASE_PLAN.md` §E2, ao lado da nova entrada de E2.1.*

| | |
|---|---|
| **BFF** | `74a1e0b` **em Production**, smoke autenticado concluído. `0/0` face a `origin/main`, árvore limpa. **235** testes. **Não se lhe tocou nesta sessão.** |
| **Frontend — HEAD** | `bd615ee` |
| **Frontend — `origin/main`** | `bd615ee` — **0 à frente / 0 atrás**, árvore limpa (só o `.mcp.json`, fora do stage). |
| **`gh-pages`** | `6e8c0ae` — o deploy de **E2.1**, de 30/08 03:57:40. **Inalterado desde então** (E2 foi `22b0526`). |
| **Site** | `https://igororlandi999.github.io/finer-one/` · HTTP 200 · `assets/index-CllETh7I.js` — o `index.html` servido é **idêntico** ao do `gh-pages` |
| **Interruptores publicados** | `VITE_AUTH_MODE=supabase` · `VITE_PROTECTED_DATA_TRANSPORT` **vazio** |
| **Testes / build** | **2340** testes, **97** ficheiros no artefacto publicado. A 31/08, com o trabalho da sessão autónoma: ver o fim deste ficheiro. |
| **Reprodutibilidade** | o rebuild local de `bd615ee` reproduz os **sete** ficheiros publicados **byte a byte** (SHA-256 de cada um) — reverificado a 31/08 |
| `.mcp.json` | modificado localmente, **fora do stage**. Não versionar a alteração. |
| Vercel ↔ Git | **desligado** (R-A fechado). Deploy manual por CLI. |
| **E2 / E2.1** | **CONCLUÍDO** — E2 validado no browser real a 30/08; E2.1 republicou o patch do R-34 com os **mesmos** interruptores |
| **E3** | **NÃO INICIADO** |

Se os números divergirem, **parar e perceber porquê** antes de continuar.

> ~~**Uma coisa que este ficheiro afirmava e que esta sessão NÃO confirmou:** o Protection
> Bypass (R-B).~~ ✅ **RESOLVIDO a 30/08/2026, na sessão de preparação para E3.** O bypass
> **saiu** — foi removido na sessão de promoção do BFF (`protectionBypass` ficou `{}`, o
> segredo antigo passou de `200` a `302`) e a remoção foi **reconfirmada pelo fio**, sem
> tocar na Vercel: os quatro deployments antigos respondem `302` sem cabeçalho de bypass,
> e a Production oficial responde `200`. **R-B está FECHADO.** A tabela de evidência está
> em `RISK_REGISTER.md`, logo a seguir à entrada.
>
> Fica a lição, que é a parte que interessa: o risco esteve aberto durante uma sessão
> inteira **não por estar aberto, mas por a sessão seguinte não ter olhado.** "Não
> verificado aqui" não é "por fazer" — são duas afirmações diferentes e devem ser escritas
> de forma diferente.

---

## 0. Reposicionar (5 min)

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
git status --short && git log --oneline -3
npm test                    # esperado: 235
npm run check:predeploy     # esperado: tudo verde

cd "C:\Users\User\Documents\VS Code\finer-one"
git status --short && git log --oneline -5
npm run check:predeploy     # corre testes E build — esperado: 2349 (97+1 ficheiros), tudo verde
```

O `check:predeploy` do frontend **imprime os interruptores**. Olhar para eles: dizem em
que etapa do rollout a máquina está configurada, e é isso que seria publicado.

---

## 1. Remover o Protection Bypass (R-B) — **primeiro, e sozinho**

`BFF_PRODUCTION_PROMOTION.md` §1. O smoke que o exigia terminou.

Confirmar pelo fio que um Preview responde `401` **sem** cabeçalho de bypass. Se responder
`200`, o bypass não saiu.

**Não avançar para a promoção no mesmo minuto.** Se algo partir a seguir, quer-se saber se
foi o bypass ou o deploy.

---

## 2. Ler o ambiente de Produção — **só ler** (10 min)

`BFF_PRODUCTION_PROMOTION.md` §2. As duas leituras que mais importam:

- [ ] **`ALLOWED_ORIGINS` existe em Production?** É o risco de promoção nº 1. Sem ela, o
      endpoint legado — que é o que serve a aplicação hoje — fica sem CORS e a aplicação
      inteira mostra "indisponível";
- [ ] **o SHA de `kgcs3qugg`.** Anotar. Fecha `BFF_PRODUCTION_DELTA.md`, que hoje é
      inferência e passa a ser facto:

```bash
git log --oneline <SHA-de-kgcs3qugg>..74a1e0b     # isto É o delta
```

Se `ALLOWED_ORIGINS` faltar: **configurá-la e parar por hoje.**

---

## 3. Promover o BFF (15 min)

`BFF_PRODUCTION_PROMOTION.md` §3–4. Anotar o deployment **anterior** antes de promover —
é o alvo do rollback.

## 4. Smoke de pós-produção (30 min)

`BFF_POST_PRODUCTION_SMOKE.md`, inteiro e pela ordem escrita.

O §6 tem uma verificação que **exige isolamento**: fazer uma recusa autenticada, esperar
dois minutos **sem tráfego nenhum**, e só então consultar o `audit_log`. Foi assim que R-H
foi apanhado — sob tráfego o registo funcionava.

**Depois disto, parar.** O frontend não se mexe no mesmo dia.

---

## 5. (Sessão seguinte) Frontend

`FRONTEND_AUTH_RELEASE_PLAN.md`. Três etapas, uma de cada vez:

| | | | Estado |
|---|---|---|---|
| **E1** | publicar os 27 commits com os interruptores **desligados** | comportamento de hoje, byte a byte | ⛔ **SALTADO** — desvio **D-1**, aceite. Não voltar atrás. |
| **E2** | ligar `VITE_AUTH_MODE=supabase`, leitura ainda legada | ⚠️ ver abaixo | ✅ **CONCLUÍDO** 30/08, `a8bfca0` → `gh-pages 22b0526` |
| **E3** | ligar `VITE_PROTECTED_DATA_TRANSPORT=true` | nunca no mesmo dia de E2 | ⛔ **NÃO INICIADO** — condições em `FRONTEND_AUTH_RELEASE_PLAN.md` §E3 |

> ⚠️ **E2 só é segura a partir de `9531cc8` + `b99c97d`.** Esta sessão encontrou e provou
> um **P1** (R-18) que vivia exatamente nessa etapa: com autenticação ligada e transporte
> legado, trocar para a Finer Teste mostrava os números **reais da Overcel** sob o nome da
> Finer Teste. Publicar a autenticação a partir de `origin/main` reintroduzia-o.
>
> O teste de aceitação de E2 é literalmente esse: **trocar para a Finer Teste tem de
> mostrar "empresa sem dados ligados"**, e não números.

---

## O que **não** fazer

- ~~**Não** enviar os commits do frontend antes do BFF estar em produção e estável.~~
  *Cumprido: o BFF entrou em Production primeiro; os 27 commits só foram enviados a 30/08,
  depois de E2 estar validado.*
- **Não** ligar `VITE_PROTECTED_DATA_TRANSPORT` (E3) — nem no mesmo dia de E2, nem antes
  de as cinco condições do §E3 do `FRONTEND_AUTH_RELEASE_PLAN.md` estarem cumpridas.
- **Não** voltar atrás para executar E1 (D-1). Está saltado e aceite.
- **Não** republicar o `gh-pages`: **`6e8c0ae`** é o que está validado (E2.1). `22b0526` era o de E2 e já não é a ponta.
- **Não** ligar `COVERAGE_WRITES_ENABLED`.
- **Não** tocar no Apps Script nem em `ANYONE_ANONYMOUS` (R-14).
- **Não** executar migrações SQL.
- **Não** versionar a alteração local do `.mcp.json` (o `check:predeploy` bloqueia se
  estiver em stage).
- **Não** apagar o utilizador de smoke `smoke-fb99be3@example.com` — está ativo de
  propósito.

---

## Se sobrar tempo, por ordem de valor

1. **R-07** — endurecer o contrato do upstream no BFF: recusar `{"error":true}` com `502`
   em vez de o reencaminhar com `200`. Local e testável; precisa do Preview só para
   confirmar que nenhuma resposta legítima do GAS tem essa forma.
2. ~~**R-06 / B-03**~~ ✅ **fechado a 31/08** — cadeia real de redirects do Apps Script
   (`curl -sIL "$GAS_URL"`). Se for sempre `script.google.com → script.googleusercontent.com`,
   R-06 fecha com uma lista de hosts permitidos em vez de `redirect: "follow"` cego.
3. **R-15** — desenhar `004_audit_log_retention.sql`. **Escrever, não executar.**
4. **R-09** — repor `cobertura.confirmada` na troca de empresa. Sem impacto visível hoje
   (o campo é escrito e nunca lido), mas é a última aresta da mesma família de R-18/R-19.

---

## Veredicto de prontidão — 30/08/2026

Substituem qualquer versão anterior. Nenhum depende de memória de conversa.

| Etapa | Veredicto | Fundamento |
|---|---|---|
| **BFF → Production** | ✅ **CONCLUÍDO** | `74a1e0b` promovido e validado em Production; smoke autenticado concluído. `0/0`, árvore limpa, 235 testes. ✅ **Ressalva levantada a 30/08:** a remoção do Protection Bypass (R-B) está **confirmada pelo fio** — R-B fechado. |
| **E2 — autenticação ligada** | ✅ **CONCLUÍDO** | Publicado a 30/08 a partir de `a8bfca0` (que contém `9531cc8` + `b99c97d`) para `gh-pages 22b0526`. Validado no browser real: os 12 pontos do teste de aceitação passaram, incluindo **zero flash** provado por gravador de alta frequência, **32/32 leituras pelo legado** e **zero chamadas ao transporte protegido**. **R-18 defendido em produção.** |
| **E3 — transporte protegido** | ⛔ **NÃO INICIADO · NO-GO hoje** | **Atualizado a 30/08 ao fim da sessão de preparação. Duas condições em falta, de seis.** ✅ (1) separação temporal — cumpre-se a partir de 31/08; ✅ (2) **R-07 aceite por escrito**; ❌ (3) **B-03** — `GAS_URL` é *Sensitive* no Vercel e não é exportável; ✅ (4) **B-04 fechado por obsolescência** — `74a1e0b` foi promovido, Preview e Production são o mesmo commit, e a baseline de Production ficou registada; ❌ (5) **isolamento forte** — estratégia desenhada e aditiva, por executar (**R-33**); ✅ (6) **R-32 aceite** — não bloqueia E3, bloqueia E4. Nenhuma das duas em falta exige código novo: uma precisa de um valor, a outra de uma conta. |

---

## O que NÃO se consegue fechar sem browser/desktop

Análise estática não é substituto de teclado. Isto é a lista completa do que ficou por
verificar, e cada linha diz **porquê é que só ali se verifica**.

| # | O que falta | Porquê exige browser | Onde |
|---|---|---|---|
| 1 | **`ActionPlanModal`: `Escape`, foco inicial, devolução do foco, armadilha de foco, `inert` no fundo, scroll do fundo** | São comportamento em tempo de execução com teclado e rato reais. Nenhum existe hoje; declarar `aria-modal` antes de os construir seria pior do que não o declarar. | **R-28** |
| 2 | **Que o clique no véu fecha e o clique no painel não** | A propagação está travada no código (`stopPropagation`), o que torna o comportamento *provável* — mas não foi exercido com rato. | R-28 |
| 3 | **Anúncio real num leitor de ecrã** (NVDA/VoiceOver) da paginação, do `aria-live` e do diálogo | O DOM está provado; o que a tecnologia de apoio faz com ele, não. `happy-dom` não é um leitor de ecrã. | R-24 / R-28 |
| 4 | ~~Smoke autenticado do BFF~~ · **cadeia de redirects do GAS** · ~~equivalência Preview↔Produção~~ | Atualizado a 30/08: o smoke autenticado **está feito**; a equivalência **B-04 fechou por obsolescência** (Preview e Production são o mesmo commit e nenhum Preview é alcançável sem bypass). Resta **B-03**, e o que lhe falta **não é browser** — é o valor de `GAS_URL`, que o Vercel guarda como *Sensitive*. | **B-03** — bloqueia E3 |
| 5 | ~~**O teste de aceitação de E2**~~ | ✅ **FEITO a 30/08/2026** em browser real. Passou integralmente. Ver `FRONTEND_AUTH_RELEASE_PLAN.md` §E2. | R-18 — **defendido em produção** |
| 6 | **Isolamento FORTE entre duas empresas** — que um utilizador de B não alcança A | *Novo, descoberto ao validar E2.* A conta usada é membro **das duas** empresas, portanto o teste de 30/08 não podia provar isto. Exige uma conta que pertença a **uma só** empresa. **30/08: a sequência exata, o rollback e o teste de aceitação estão escritos** em `RISK_REGISTER.md` §*R-33 — a saída menos invasiva*. É aditivo: cria-se uma conta, não se toca em nenhuma membership existente. | **R-33** — bloqueia E3 |

---

## Nota de recuperação — a interrupção da segunda sessão

A segunda sessão foi cortada a meio da **FASE H** (mutation testing), logo depois de
aplicar uma mutação em `src/pages/Alertas.jsx` e antes de a reverter. A terceira sessão
encontrou a árvore assim e recuperou-a:

- `Alertas.jsx` tinha, de facto, a mutação do R-23 (`subtitle` de volta a "Overcel"
  escrito à mão). Restaurado com `git restore` **só desse ficheiro**;
- `ActionPlanModal.jsx` tinha uma alteração **não commitada e não esperada** — não era
  mutação, era trabalho a meio (a semântica de diálogo). Foi mantida, completada com
  regressão e commitada em `6e62a3b`;
- `.mcp.json` continua modificado e fora do stage, como deve.

**A lição operacional, para quem correr mutações a seguir:** aplicar uma → correr →
confirmar que morre → restaurar **imediatamente** → `git diff` vazio antes da seguinte.
Nunca duas ao mesmo tempo, e nunca uma mutação a atravessar o fim de uma sessão.

E uma lição sobre o método: **correr a mutação contra o ficheiro de teste errado dá um
falso sobrevivente.** Aconteceu com a M10, que parecia sobreviver a
`availabilityPropagacao.test.js` e morria em `dreEngine.test.js`. Em caso de dúvida,
correr a suite inteira: são 8 segundos.

---

## Sessão autónoma de 31/08/2026 — o que ficou feito e o que ficou bloqueado

Sessão sem operador. **Nada foi publicado, promovido, ligado ou criado.** E3 continua
NÃO INICIADO, o BFF continua `74a1e0b`, o `gh-pages` continua `6e8c0ae`.

### Feito

| Área | O que se fez | Onde |
|---|---|---|
| **Estado real** | E2.1 confirmado pelo fio: site = `gh-pages 6e8c0ae`, rebuild de `bd615ee` reproduz os 7 ficheiros **byte a byte**, interruptores lidos **do bundle servido** | `RISK_REGISTER.md` §31/08 |
| **R-34** | A metade **sequencial** fechada: N pedidos === N eventos `submit`, provado dos dois lados, mais a prova de que o SDK não repete pedidos | `Login.submitSequencial.test.jsx` (9 testes) |
| **R-06 / B-03** | ✅ **B-03 FECHADO a 31/08** com a `GAS_URL` fornecida localmente: 1 salto, `script.google.com` → `script.googleusercontent.com`, `200` `application/json`. Antes disso, `redirect: "follow"` **medido no fio** pela primeira vez (nunca tinha sido: os duplos ignoram a opção) | `finer-one-proxy/test/upstream-redirects.test.mjs`, `scripts/gas-redirect-probe.mjs`, `B03_GAS_REDIRECT_RUNBOOK.md` |
| **R-32** | Levantamento do acoplamento ao GitHub Pages — **é uma linha de código e uma de verificação**, não um refactor — e checklist de 11 passos | `OWN_ORIGIN_MIGRATION_PLAN.md` |
| **R-33** | Runbook completo, com o esquema real e o SQL do `audit_log` corrigido (o do smoke do BFF está desatualizado — R-36) | `R33_SINGLE_COMPANY_SMOKE.md` |
| **R-38** | Proposta concreta: valor por ambiente, mudança mínima, impacto, rollback, verificação | `RISK_REGISTER.md` §31/08 |
| **Segurança pré-E3** | Revisão limitada aos caminhos que mudam com E3. **Nenhum P1/P2 novo.** Confirmado que o preflight de CORS que E3 passa a exigir **já está resolvido e testado** | `RISK_REGISTER.md` §31/08 |
| **Qualidade** | **2349** testes no frontend (97+1 ficheiros), **240** no BFF (235+5). `check:predeploy` verde. `git diff --check` limpo | — |

### Bloqueado — e porquê

| # | Bloqueado | Razão | Desbloqueia com |
|---|---|---|---|
| 1 | ~~**B-03**~~ ✅ **FECHADO 31/08** | resolvido: a `GAS_URL` foi fornecida localmente, a sonda correu, e a `GAS_URL` não foi impressa nem guardada | — |
| 2 | ~~**R-33**~~ ✅ **FECHADO 31/08** | resolvido: conta criada e membership inserida pelo Igor; smoke corrido de ponta a ponta | — |
| 3 | **R-32** — origem própria | Exige decidir e possivelmente comprar um domínio, e mexer em DNS | decisão de produto |
| 4 | **R-38** — tirar `localhost` da Production | Alteração a Production | autorização, e só **durante** o rollout de E3 |
| 5 | **R-34** — cenários C (`Enter`) e F (autofill) | **A automação de browser não respondeu nesta sessão** — nem a extensão do Chrome, nem o DevTools MCP. O `happy-dom` não implementa submissão implícita por `Enter` | um browser real com gestor de palavras-passe |

---

## Matriz de prontidão para E3 — 31/08/2026

| Item | Estado | Evidência | Bloqueia E3? | Próxima ação | Precisa do Igor? |
|---|---|---|---|---|---|
| **E2.1 estável** | ✅ estável | site = `6e8c0ae`; rebuild de `bd615ee` byte a byte; interruptores lidos do bundle servido | **NÃO** | nenhuma | **NÃO** |
| **R-B** | ✅ fechado | bypass removido, reconfirmado pelo fio a 30/08 | **NÃO** | nenhuma | **NÃO** |
| **R-07** | ✅ aceite por escrito | `RISK_REGISTER.md` §*R-07* | **NÃO** | patch depois de E3 estabilizar | **NÃO** |
| **B-04** | ✅ fechado por obsolescência | Preview e Production são o mesmo commit; baseline registada | **NÃO** | nenhuma | **NÃO** |
| **R-34** | ✅ mitigado; causa externa por determinar | 12 testes (3 concorrentes + 9 sequenciais); mutação mata 4; SDK não repete pedidos | **NÃO** (P3) | cenários C/F num browser real — opcional | opcional |
| **R-32** | ⚠️ aceite, condicional | prova completa + plano de migração de 11 passos | **NÃO** (bloqueia **E4**) | decidir o domínio | **SIM** |
| **R-33** | ✅ **FECHADO 31/08** | conta `a1a84e5d…`, membership única em `finer-teste`: **`200`** na Finer Teste, **`403`** na Overcel, **1** linha de `access.denied` com `requestedCompanyId = overcel`, `reason = sem_membership`, sem segredo nem valor financeiro | **NÃO** | manter a conta para E3/E4 | **NÃO** |
| **B-03** | ✅ **FECHADO 31/08** | cadeia medida: **1 salto**, `script.google.com` → `script.googleusercontent.com`, `200` `application/json`. Nenhum host inesperado | **NÃO** | nenhuma | **NÃO** |
| **R-38** | ⚠️ aceite | proposta concreta escrita | **NÃO** | remover `localhost` **durante** o rollout de E3 | **SIM**, depois |
| **Bloqueador novo** | — | **nenhum.** A revisão de segurança pré-E3 não encontrou nenhum P1/P2 por registar causado por ligar o transporte protegido | — | — | — |

### Veredito

# E3 = **GO CONDICIONAL**

> **Atualizado a 31/08/2026, ao fim da sessão do runbook.** ✅ **B-03 FECHOU** — a cadeia
> foi medida com a `GAS_URL` fornecida localmente: **um** salto,
> `script.google.com` → `script.googleusercontent.com`, `200` com `application/json`.
> Nenhum host inesperado.

**AS SEIS CONDIÇÕES ESTÃO CUMPRIDAS.** As duas que faltavam caíram a 31/08:

1. ~~**B-03**~~ ✅ cadeia de redirects medida — 1 salto, dois hosts do Google.
2. ~~**R-33**~~ ✅ isolamento forte provado — **`403` na Overcel** com um token real de uma
   conta que só pertence à Finer Teste, e o `audit_log` com exatamente uma linha, limpa.

**Não há bloqueadores.** O que resta não é uma verificação — é o **procedimento** de E3.
Nada do que estas sessões fizeram ligou ou adiou E3: o interruptor não foi tocado.

---

## O QUE FALTA — e já não é verificação nenhuma

> *Substitui a lista "QUANDO O IGOR VOLTAR" de 31/08 de manhã. As duas primeiras ações
> dessa lista — fornecer a `GAS_URL` e autorizar a conta de smoke — **estão feitas**, e
> fecharam B-03 e R-33. O que resta é o rollout.*

**Não há bloqueadores.** As seis condições do §E3 do `FRONTEND_AUTH_RELEASE_PLAN.md` estão
cumpridas. O que falta é **executar E3**, e isso é um procedimento, não uma investigação.

---

> ⛔ **31/08, fim do dia: a primeira tentativa de E3 foi abortada no pré-deploy.** O
> artefacto E3 fazia 4 leituras anónimas ao legado a cada carregamento (**R-39**, P1).
> Corrigido e defendido por testes; **nada foi publicado**. O passo 1 abaixo continua
> válido, com uma adição obrigatória: **o passo 0**.

### 0 · ANTES de publicar: servir o `dist` e medir a rede (obrigatório)

Foi isto que impediu o R-39 de chegar a produção, e passa a ser parte do procedimento.

```bash
npx vite preview --port 5173 --strictPort   # serve o dist, não o código-fonte
```

No browser, com DevTools → Network, **hard reload** e contar:

- `pedidos/vendas` (legado) → **tem de ser 0**;
- `companies/:id/financial-data` (protegido) → tem de ser > 0 depois de a sessão resolver.

Repetir três vezes, e uma vez **sem sessão** (janela anónima ou contexto isolado): sem
sessão o esperado é **zero pedidos financeiros**, não zero legado apenas.

Se aparecer **um** pedido ao legado, parar. É o R-39 outra vez ou um parente dele.

> ✅ **31/08 — E3 PUBLICADO E VALIDADO EM PRODUCTION.** `gh-pages 3d668e1`, bundle
> `index-DVBYao2b.js`, `PROTECTED_DATA_TRANSPORT=true`. **28 leituras protegidas, 0 ao
> legado**, em dois ciclos separados por 4 minutos. Overcel com dados reais; Finer Teste sem
> um único número da Overcel; A→B→A duas vezes; CORS a falhar fechado para origem estranha.
> Detalhe em `RISK_REGISTER.md` §*E3 VALIDADO EM PRODUCTION*.
>
> **Duas verificações residuais, ambas tuas e de minutos:** (1) `logout` → `login`, que
> exige as credenciais da conta principal; (2) o `403` da conta de smoke na Overcel em E3 —
> recriar `~/.finer-smoke.json` e correr `node scripts/r33-smoke.mjs`.
>
> **Antes de E4:** R-32 (origem própria) passa a **obrigatório**.
>
> *(A caixa abaixo é o registo da publicação e fica como estava.)*

> ✅ **31/08, 20:30 — E3 FOI PUBLICADO.** `gh-pages 3d668e1`, bundle
> `index-DVBYao2b.js`, `VITE_PROTECTED_DATA_TRANSPORT=true`. O Passo 0 correu limpo
> (3 reloads, legacy 0) e o R-39 não reapareceu.
>
> ⚠️ **Mas a validação está INCOMPLETA:** a sessão de produção estava expirada, por isso o
> smoke com dados reais, a troca de empresa e o R-33 em E3 **ficaram por fazer**. Ver
> `RISK_REGISTER.md` §*E3 PUBLICADO*. **Duas ações, ambas tuas:**
>
> 1. **entrar na aplicação** em `https://igororlandi999.github.io/finer-one/` — depois
>    disso posso medir Overcel, Finer Teste, A→B→A, refresh e as contagens de rede;
> 2. **recriar `~/.finer-smoke.json`** (email + password da conta de smoke) para o R-33 em
>    E3. Não colar credenciais na conversa.
>
> Se alguma coisa correr mal antes disso: rollback é republicar o `dist` de `bd615ee`
> (`gh-pages 6e8c0ae`). O BFF não muda.

### 1 · ~~Ligar E3~~ — FEITO a 31/08. O que resta é validar

`VITE_PROTECTED_DATA_TRANSPORT=true` no `.env.local`, `npm run check:predeploy`,
`npm run deploy`.

**Duas coisas que o `check:predeploy` faz e que valem o tempo de olhar:** imprime os
interruptores que vão ser compilados — é a última oportunidade de ver `true` antes de ele
existir em produção — e reconstrói o `dist/`, que se compara com o publicado.

**Não fazer mais nada nesse dia.** É a mesma regra que separou E2 de E3, e existe para que,
se algo partir, se saiba o que foi.

**Rollback:** repor o interruptor a vazio e republicar. O `gh-pages` anterior é `6e8c0ae` —
está identificado, reproduz byte a byte a partir de `bd615ee`, e é para onde se volta.

### 2 · Depois de ligar: repetir o smoke do R-33 — agora pelo produto

A conta `a1a84e5d…` **existe de propósito** e não foi apagada. Com E3 ligado, o teste passa
a ter uma segunda metade que hoje não tinha: as leituras do **frontend** passam a ir por
`/financial-data`.

- [ ] `node scripts/r33-smoke.mjs` — `200`/`403` têm de continuar iguais;
- [ ] login na aplicação com a conta de smoke: o seletor mostra **só** a Finer Teste, e ela
      diz "sem dados ligados" — que agora vem do transporte protegido, e não do legado;
- [ ] login com a conta principal: a Overcel mostra os números **pelo caminho novo**;
- [ ] trocar de empresa nos dois sentidos, e confirmar **zero** números da Overcel sob o
      nome Finer Teste. É o R-18, que muda de camada com E3;
- [ ] `audit_log`: nenhuma linha nova de `access.denied` para a conta principal.

### 3 · Só depois de E3 validado: tirar o `localhost` da Production — R-38 (~2 min)

`ALLOWED_ORIGINS` no âmbito **Production apenas**, deixando
`https://igororlandi999.github.io` e tirando `,http://localhost:5173`. Nenhuma linha de
código muda; não exige redeploy, exige uma nova invocação. Proposta completa, com
verificação e rollback, em `RISK_REGISTER.md` §31/08.

### 4 · Fechar o R-06 — o endurecimento que a medição destrancou (~15 min)

A lista de hosts permitidos é conhecida e tem dois elementos:
`script.google.com` e `script.googleusercontent.com`.

Trocar `redirect: "follow"` cego por seguir com verificação de host, em
`api/companies/[companyId]/financial-data.js` e `api/pedidos/vendas.js`. **É código do
BFF** — implica deploy, portanto não é para o dia de E3.

`test/upstream-redirects.test.mjs` avisa sozinho: o teste de caracterização
`SEGUE PARA OUTRO HOST` **passa a falhar**, e é esse o sinal de que o endurecimento entrou.
Trocar a expectativa por `502` e apagar o aviso do cabeçalho.

### 5 · Decidir o domínio — R-32, antes de **E4** (~5 min de decisão)

`finerone.pt` está registado? Por quem? Se não, compra-se?

**Não bloqueia E3** — o token já vive nessa origem hoje, e E3 aumenta o valor do token, não
a exposição dele. **Bloqueia E4.** Com a resposta,
`OWN_ORIGIN_MIGRATION_PLAN.md` passa de plano a runbook: o levantamento já mostrou que a
migração é **uma linha de código** (`vite.config.js:8`), **uma de verificação**
(`predeploy-check.mjs:297`) e configuração.

---

### Duas coisas para não fazer

- **Não apagar a conta de smoke** (`a1a84e5d…`). E4 volta a precisar exatamente desta forma
  de conta. Quando deixar de servir, **desativa-se** em vez de se apagar;
- **Não apagar `src/auth/companyDataScope.js` no intervalo de E3.** O cabeçalho do ficheiro
  diz que o módulo "desaparece" com o transporte protegido. É quase verdade — as outras duas
  camadas sobrevivem — mas apagá-lo no dia em que o transporte muda é remover uma defesa
  contra R-18 no pior dia possível. Se for para remover, é depois de E3 estabilizar.

### Higiene, se ainda não foi feita

```powershell
Remove-Item $HOME\.finer-smoke.json
```

O ficheiro vive **fora** do repositório de propósito, mas não tem razão para continuar a
existir entre testes.

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
