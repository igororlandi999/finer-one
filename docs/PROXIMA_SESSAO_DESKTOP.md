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
2. **R-06 / B-03** — cadeia real de redirects do Apps Script
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
| **R-06 / B-03** | `redirect: "follow"` **medido no fio** pela primeira vez (nunca tinha sido: os duplos ignoram a opção). Sonda escrita e verificada | `finer-one-proxy/test/upstream-redirects.test.mjs`, `scripts/gas-redirect-probe.mjs`, `B03_GAS_REDIRECT_RUNBOOK.md` |
| **R-32** | Levantamento do acoplamento ao GitHub Pages — **é uma linha de código e uma de verificação**, não um refactor — e checklist de 11 passos | `OWN_ORIGIN_MIGRATION_PLAN.md` |
| **R-33** | Runbook completo, com o esquema real e o SQL do `audit_log` corrigido (o do smoke do BFF está desatualizado — R-36) | `R33_SINGLE_COMPANY_SMOKE.md` |
| **R-38** | Proposta concreta: valor por ambiente, mudança mínima, impacto, rollback, verificação | `RISK_REGISTER.md` §31/08 |
| **Segurança pré-E3** | Revisão limitada aos caminhos que mudam com E3. **Nenhum P1/P2 novo.** Confirmado que o preflight de CORS que E3 passa a exigir **já está resolvido e testado** | `RISK_REGISTER.md` §31/08 |
| **Qualidade** | **2349** testes no frontend (97+1 ficheiros), **240** no BFF (235+5). `check:predeploy` verde. `git diff --check` limpo | — |

### Bloqueado — e porquê

| # | Bloqueado | Razão | Desbloqueia com |
|---|---|---|---|
| 1 | **B-03** — cadeia real de redirects | `GAS_URL` é *Sensitive* no Vercel e não é exportável. **Não se tentou obtê-la por meios indiretos** | o valor, localmente, uma vez |
| 2 | **R-33** — smoke de empresa única | Exige **criar um utilizador** e **uma membership** | autorização explícita |
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
| **R-33** | ❌ **por executar** | runbook pronto; ~25 min quando autorizado | **SIM** | criar conta de smoke de empresa única | **SIM** |
| **B-03** | ❌ **por executar** | sonda pronta e verificada; lógica de redirects já medida | **SIM** | correr a sonda com a `GAS_URL` | **SIM** |
| **R-38** | ⚠️ aceite | proposta concreta escrita | **NÃO** | remover `localhost` **durante** o rollout de E3 | **SIM**, depois |
| **Bloqueador novo** | — | **nenhum.** A revisão de segurança pré-E3 não encontrou nenhum P1/P2 por registar causado por ligar o transporte protegido | — | — | — |

### Veredito

# E3 = **GO CONDICIONAL**

**Duas condições, as mesmas de 30/08, e nenhuma exige código novo** — uma precisa de um
**valor**, a outra de uma **conta**:

1. **B-03** — correr a sonda com a `GAS_URL` e confirmar que a cadeia só toca hosts do
   Google;
2. **R-33** — o smoke de isolamento forte com uma conta de empresa única, com `403` na
   Overcel e `200` na Finer Teste.

As outras quatro condições do §E3 estão cumpridas. **A separação temporal cumpre-se desde
31/08.** Nada do que esta sessão fez aproximou ou adiou E3: o interruptor não foi tocado.

---

## QUANDO O IGOR VOLTAR — cinco ações, por ordem

### 1 · Fornecer a `GAS_URL` **localmente** — desbloqueia B-03 (~2 min)

**O que fazer:** no Vercel, copiar o valor de `GAS_URL` de Production. Depois, no terminal:

```powershell
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
$env:GAS_URL = "<colar aqui>"
node scripts/gas-redirect-probe.mjs
Remove-Item Env:GAS_URL
```

**O que NÃO colar na conversa:** a `GAS_URL`. Nem inteira, nem em pedaços, nem o id do
deployment. A sonda foi escrita precisamente para que não seja preciso.

**O que me permite continuar:** colar a **saída** da sonda — em particular a linha
`hosts distintos`. É literalmente a lista de hosts permitidos, e com ela fecho o R-06.

---

### 2 · Autorizar a conta de smoke — desbloqueia R-33 (~25 min)

**O que fazer:** seguir `docs/R33_SINGLE_COMPANY_SMOKE.md`, do passo 1 ao 4. Tudo no
painel do Supabase. É **aditivo**: cria-se uma conta e **uma** membership em `finer-teste`,
e não se toca em nenhuma linha existente.

**O passo 3 não se salta.** Contar as memberships antes de testar é o que impede o teste
de passar por má razão.

**O que NÃO colar na conversa:** a palavra-passe da conta nova, e o `access_token`. O
`user_id` (UUID) pode ser colado — não é credencial.

**O que me permite continuar:** os dois códigos de estado (`overcel` → esperado `403`,
`finer-teste` → esperado `200`) e o resultado da consulta ao `audit_log` **sem a coluna
`metadata` em bruto** — basta dizer se `action`, `actor_user_id` e
`metadata.requestedCompanyId` batem certo.

> ⛔ **Se a Overcel responder `200`, parar tudo e dizer-me.** Isso é dado cruzado entre
> empresas e é uma paragem imediata, não um resultado a registar.

---

### 3 · Decidir o domínio — desbloqueia R-32 / E4 (~5 min de decisão)

**O que fazer:** responder a três perguntas — `finerone.pt` está registado? Por quem? Se
não estiver, compra-se?

**Onde:** no registrar do domínio. **Nada nesta sessão o verificou** e não se assumiu que
existe.

**O que me permite continuar:** a resposta. Com ela transformo
`docs/OWN_ORIGIN_MIGRATION_PLAN.md` de plano em runbook executável, com os valores reais.
**R-32 não bloqueia E3** — esta ação pode ficar para depois das duas primeiras.

---

### 4 · Dar-me um browser — fecha os cenários C e F do R-34 (~10 min, opcional)

**O que fazer:** confirmar que a extensão do Chrome está ligada e autenticada na mesma
conta, ou que o DevTools MCP consegue anexar. **Nenhuma das duas respondeu nesta sessão.**

**O que NÃO fazer:** escrever credenciais reais no formulário. Os testes são com
credenciais **inválidas** e a instrumentação bloqueia o pedido antes de sair para o
Supabase — nem uma tentativa consome o rate limit.

**O que me permite continuar:** com browser, instrumento os eventos de submit e conto os
pedidos com o `Enter` e com o autofill. É a única parte do R-34 que falta, e **não bloqueia
E3**.

---

### 5 · Só DEPOIS de E3 validado: tirar o `localhost` da Production — R-38 (~2 min)

**O que fazer:** no Vercel, editar `ALLOWED_ORIGINS` **no âmbito Production apenas**,
deixando `https://igororlandi999.github.io` e tirando `,http://localhost:5173`.

**Não antes de E3 estar validado.** Antes disso o legado ainda serve a aplicação, e mexer
na lista de origens no mesmo intervalo torna impossível dizer qual das duas mudanças
partiu o quê, se algo partir.

**O que me permite continuar:** a saída do `curl -i -X OPTIONS` com
`Origin: http://localhost:5173` — o objetivo é deixar de vir cabeçalho `Allow-Origin`.
