# R-32 — plano de migração para origem própria

> # ⚠️ AUDITADO A 31/08/2026 — E O PLANO MUDA NUM PONTO DECISIVO
>
> Reauditado contra o código e a infraestrutura **reais**, depois de E3 estar em produção.
> O levantamento técnico continua todo válido. **O alvo, não.**
>
> ## 1. `finerone.pt` NÃO EXISTE
>
> Medido, não suposto:
>
> ```
> nslookup finerone.pt          -> Non-existent domain (NXDOMAIN)
> nslookup finerone.pt 8.8.8.8  -> Non-existent domain (NXDOMAIN)
> nslookup app.finerone.pt      -> Non-existent domain
> ```
>
> ⚠️ **E o que isto prova, exatamente — corrigido a 31/08.** `NXDOMAIN` prova **ausência de
> resolução DNS** e **nada mais**. **NÃO** prova que o domínio está livre para compra: um
> domínio pode estar registado e simplesmente não ter zona publicada, ou estar em período
> de redenção, ou parqueado sem registos.
>
> A versão anterior desta secção deu a entender que `finerone.pt` estava disponível. **Não
> se sabe.** A disponibilidade verifica-se no **registrador**, ou por **WHOIS/RDAP** —
> nunca por `nslookup`.
>
> O que se pode afirmar: **`app.finerone.pt` não resolve hoje**, portanto não há para onde
> apontar nada, e o plano de 11 passos **não pode arrancar** sem essa verificação feita no
> sítio certo.
>
> *(`finerone.com` devolve `SERVFAIL` — que não é sequer `NXDOMAIN`. Não se conclui nada
> sobre ele, em nenhuma direção.)*
>
> ## 2. Há um caminho melhor, e não precisa de domínio nenhum
>
> **O que o R-32 exige é uma ORIGEM PRÓPRIA — não um domínio bonito.** São coisas
> diferentes, e confundi-las é o que fazia este plano depender de uma compra.
>
> O problema real é este: `localStorage` é particionado por **origem**, e
> `igororlandi999.github.io` é partilhado com todos os outros repositórios da conta.
> Confirmado em produção durante a validação de E3 — o `localStorage` da origem tem
> `canton_script_url`, `cf_products`, `cf_suppliers`, `austinMissionBoard`,
> `decoratto:ui-prefs` e `canton_visits` ao lado de `finer-one.empresa-preferida`.
>
> **Qualquer host que dê um subdomínio próprio resolve isso**, porque passa a ser outra
> origem. E o Igor já tem um: o **Vercel**, onde o BFF vive.
>
> ### As três saídas, comparadas outra vez
>
> | | **A · projeto Vercel** `<projeto>.vercel.app` | **B · `app.finerone.pt`** no GitHub Pages | **C · nova conta/org GitHub** `<org>.github.io` |
> |---|---|---|---|
> | Fecha o R-32? | **Sim** — origem distinta, `localStorage` isolado | Sim | Sim |
> | Custo | **zero** | domínio (~15–40 €/ano) | zero |
> | DNS | **nenhum** | registar + configurar + esperar TLS | nenhum |
> | Provider novo? | **não** — o BFF já lá está | não | conta nova |
> | Marca | fraca (`*.vercel.app`) | **forte** | fraca |
> | Quando pode arrancar | **hoje** | só depois de comprar o domínio | depois de criar a conta |
>
> ### ✅ DECIDIDO — 31/08/2026: opção A, com projeto **separado**
>
> O Igor escolheu a **opção A**, com uma precisão arquitetural que fica registada porque
> importa: **o frontend NÃO vai para o projeto Vercel do BFF.** Cria-se um projeto Vercel
> **exclusivo do frontend**, e `finer-one-proxy.vercel.app` fica **separado e intacto**.
>
> Arquitetura alvo temporária:
>
> | | |
> |---|---|
> | Frontend | projeto Vercel novo, com `*.vercel.app` **exclusivo da Finer One** |
> | BFF | `finer-one-proxy.vercel.app` — **separado, e não se lhe toca** |
>
> Mais tarde, `app.finerone.pt` entra como *custom domain* **do mesmo projeto frontend**,
> sem refazer a migração.
>
> ### Recomendação original (mantida)
>
> **A primeiro, B a seguir.** O Vercel fecha o R-32 **hoje**, sem compras e sem DNS; e
> quando `app.finerone.pt` existir, aponta-se para o mesmo projeto Vercel com uma
> alteração de configuração — sem repetir a migração.
>
> Isto inverte a ordem que este documento tinha: **a marca deixa de bloquear a segurança.**
>
> ## 3. O que o Vercel muda no repositório — e é o mesmo patch de sempre
>
> | | |
> |---|---|
> | `vite.config.js:8` | `base: "/finer-one/"` → `base: "/"` |
> | `scripts/predeploy-check.mjs:297` | a asserção de `/finer-one/` acompanha |
> | `package.json` | `deploy` deixa de ser `gh-pages -d dist` |
> | **Tudo o resto** | **não muda** — sem router, sem `redirectTo`, sem service worker, sem canonical/SEO, sem URL absoluta em `src/` |
>
> ## 4. O que continua a ser verdade, medido hoje
>
> | | |
> |---|---|
> | `ALLOWED_ORIGINS` de Production | `https://igororlandi999.github.io` **e** `http://localhost:5173` — sondado pelo fio; qualquer outra origem é recusada, incluindo `https://app.finerone.pt` |
> | Chaves de storage da Finer One | `finer-one.empresa-preferida` (`AuthContext.jsx:34`) e `finerone.chat.pendingQuestion` (`chatEngine.js:30`), mais a do SDK, `sb-bysqekhcyrvtiejcupoa-auth-token` |
> | Redirects de auth | **nenhum** — a autenticação é só palavra-passe. `detectSessionInUrl: true` existe mas não há fluxo que devolva sessão por URL |
> | `CNAME` no `gh-pages` | **não existe** — nunca houve domínio próprio |
> | Service worker · canonical/SEO · router | **nenhum dos três** |
>
> ---
>
> **O plano de 11 passos abaixo continua correto para a opção B.** Para a opção A, os
> passos 1–3 (DNS, custom domain, TLS) desaparecem e o resto mantém-se.

> **Estado: PLANO. Nada foi executado.** Nenhum DNS, nenhum domínio, nenhuma alteração no
> Vercel, no Supabase ou no `gh-pages`. Escrito na sessão autónoma de **31/08/2026**.
>
> O veredito do R-32 não muda com este documento: **não bloqueia E3, bloqueia E4.**
> Ver `RISK_REGISTER.md` §*R-32 — a prova*. O que aqui se acrescenta é a checklist exata
> e — a parte que interessa — **o levantamento do que no código depende mesmo do GitHub
> Pages**, que se revelou muito menor do que o plano de sete passos assumia.

---

## O problema, em três linhas

O token do Supabase vive no `localStorage` de `https://igororlandi999.github.io`. O
`localStorage` é particionado por **origem** — esquema + host + porta — e o *path* não
entra nessa definição. Todos os projetos GitHub Pages desta conta partilham essa origem;
confirmaram-se três vizinhos servidos a 30/08. Em E3 esse token passa a autorizar a
**leitura financeira protegida**: o que hoje abriria "as minhas memberships" passa a abrir
"os números da empresa".

---

## O levantamento — o que no código depende do GitHub Pages

Feito por varrimento a 31/08 sobre `src/`, `scripts/`, `vite.config.js`, `index.html` e
`package.json`. **O resultado é melhor do que se esperava.**

| Área | Depende? | Onde, exatamente |
|---|---|---|
| **`base` do Vite** | **SIM** | `vite.config.js:8` — `base: "/finer-one/"`. É a **única** dependência funcional de todo o código |
| **Verificação de pré-deploy** | **SIM** | `scripts/predeploy-check.mjs:294-298` — exige literalmente `(src\|href)="/finer-one/"` no `index.html`, senão **bloqueia**. É a razão nº 1 pela qual mudar só o `vite.config.js` não chega |
| **Referências absolutas a `igororlandi999.github.io`** | **NÃO** | Uma só ocorrência em todo o código, e é um **comentário** (`vite.config.js:5`). Zero em `src/` |
| **Router / `basename`** | **NÃO** | A aplicação **não usa router nenhum**. Não há `react-router`, `createBrowserRouter`, `history.pushState` nem leitura de `window.location` para navegação. Não há rotas para reescrever |
| **`redirectTo` / `emailRedirectTo`** | **NÃO** | Zero ocorrências. A autenticação é **só palavra-passe**: não há magic link, nem OAuth, nem recuperação de palavra-passe. É por isso que as *Redirect URLs* do Supabase quase não têm trabalho a fazer (ver §5) |
| **`detectSessionInUrl`** | Marginal | `supabaseAuthAdapter.js:81` está a `true`, mas sem fluxo que devolva sessão por URL não há nada a detetar hoje. Fica a **valer no dia em que houver** — e nesse dia as *Redirect URLs* passam a ser obrigatórias |
| **Links internos / assets** | **NÃO** | Tudo passa pelo `base` do Vite. Nenhum caminho absoluto escrito à mão |
| **`VITE_API_BASE_URL`** | **NÃO** | Aponta para o BFF (`finer-one-proxy.vercel.app`), não para a origem do frontend. Não muda |
| **Script de deploy** | **NÃO** | `gh-pages -d dist` publica o conteúdo de `dist`. Indiferente ao domínio — o domínio vive no ficheiro `CNAME`, não no script |
| **BFF — `ALLOWED_ORIGINS`** | **SIM, mas só configuração** | `lib/cors.js` lê a variável a cada pedido, aceita **lista separada por vírgulas** e falha **fechado** sem ela. **Nenhuma linha de código do BFF muda** |

### O que isto significa

**A migração é uma linha de código, uma linha de verificação, e configuração.** Não há
refactor. A frase do `RISK_REGISTER` que dizia *"toca no BFF"* é verdadeira apenas no
sentido de **mudar uma variável de ambiente** — não no de alterar o BFF, que continua
`74a1e0b` e não precisa de novo deploy para aceitar a origem nova.

---

## A decisão que continua por tomar ⛔ HUMANA

**Preferência arquitetural: `app.finerone.pt`.**

**Não se assume que o domínio existe ou está disponível.** Nada nesta sessão o verificou —
verificá-lo exigiria uma consulta de registo e, a seguir, uma compra. As três perguntas
por responder:

1. `finerone.pt` está registado, e por quem?
2. Se sim, quem controla o DNS?
3. Se não, compra-se? (~15–40 €/ano; o GitHub Pages serve domínio próprio **sem custo
   adicional** e com TLS automático.)

Enquanto isto não estiver decidido, a checklist abaixo não arranca. É a razão pela qual
este documento é um plano e não um runbook.

---

## Checklist de migração — 11 passos

Nenhum passo é irreversível até ao **6**. Entre o **5** e o **10** as duas origens
coexistem de propósito: é essa janela que torna a migração segura.

| # | Passo | Onde | Tipo | Reversível |
|---|---|---|---|---|
| 1 | **DNS** — `CNAME` de `app.finerone.pt` para `igororlandi999.github.io` (para subdomínio; os quatro registos `A` só são precisos no apex) | registrar do domínio | **DNS** | sim |
| 2 | **GitHub Pages — domínio próprio**: Settings → Pages → Custom domain. Escreve um ficheiro `CNAME` na raiz do `gh-pages` | GitHub | **Configuração** | sim |
| 3 | **HTTPS**: esperar o certificado e ligar **Enforce HTTPS**. Não avançar antes de estar verde | GitHub | **Configuração** | sim |
| 4 | **`base` do Vite** passa de `/finer-one/` a `/` **e** `predeploy-check.mjs:294-298` passa a aceitar o caminho novo | **Código** (`vite.config.js`, `scripts/predeploy-check.mjs`) | **Código** | sim (git) |
| 5 | **Supabase → Auth → URL Configuration**: acrescentar a origem nova a *Site URL* e *Redirect URLs*, **sem remover a antiga** | Supabase | **Configuração** | sim |
| 6 | **BFF → `ALLOWED_ORIGINS`**: acrescentar a origem nova, **sem remover a antiga**. Lista por vírgulas. Não exige redeploy do código | Vercel | **Vercel** | sim |
| 7 | **CORS — verificar pelo fio**, antes de publicar seja o que for: `curl -i -X OPTIONS` com `Origin: https://app.finerone.pt` tem de devolver `204` com `Access-Control-Allow-Origin` igual à origem nova | — | verificação | — |
| 8 | **Publicar** o `dist` com o `base` novo | `npm run deploy` | **Deploy** | sim (republicar) |
| 9 | **Autenticação e logout** na origem nova: login, troca de empresa, leituras, logout. **A sessão antiga não migra** — o `localStorage` é por origem, e é exatamente isso que se quer | browser | verificação | — |
| 10 | **Smoke completo** na origem nova (ver abaixo) | browser + `curl` | verificação | — |
| 11 | **Só depois:** remover a origem antiga de `ALLOWED_ORIGINS` e das *Redirect URLs*, e deixar o path antigo a redirecionar | Vercel + Supabase | **Configuração** | sim |

### Por tipo de mudança

| Tipo | Passos | Total |
|---|---|---|
| **Código** | 4 (duas linhas: `vite.config.js` + `predeploy-check.mjs`) | 1 |
| **Configuração** (GitHub/Supabase) | 2, 3, 5, 11 | 4 |
| **DNS** | 1 | 1 |
| **Vercel** | 6, 11 | 1 |
| **Supabase** | 5, 11 | 1 |
| **Deploy** | 8 | 1 |

---

## Smoke de aceitação da origem nova

- [ ] `https://app.finerone.pt/` responde `200` e os assets **não** dão 404 (é o `base`);
- [ ] o `index.html` servido referencia os assets no caminho novo;
- [ ] login funciona e cria sessão;
- [ ] **`localStorage` da origem nova tem a chave `sb-bysqekhcyrvtiejcupoa-auth-token`, e
      a origem antiga continua a ter a dela** — a separação é o objetivo, não um defeito;
- [ ] a troca de empresa funciona e a Finer Teste continua a dizer "sem dados ligados";
- [ ] logout limpa a sessão e a aplicação financeira desmonta;
- [ ] as leituras respondem (com E3 desligado, pelo legado);
- [ ] a origem **antiga** continua a funcionar até ao passo 11.

## Rollback

**Até ao passo 7:** nada foi publicado. Reverter é desfazer configuração — e o passo 4
está em git.

**Depois do 8:** republicar com o `base` antigo e apontar o DNS de volta. As duas origens
estão ambas em `ALLOWED_ORIGINS` e nas *Redirect URLs* precisamente para que este rollback
não deixe ninguém sem CORS a meio.

**Depois do 11:** já não há rollback barato — a origem antiga foi removida das listas.
**Não fazer o passo 11 no mesmo dia dos anteriores.**

---

## Quando

**Não no intervalo de E3.** Mudar de origem invalida o `base` do bundle, a lista de
origens do BFF e as *Redirect URLs*: três coisas que E3 também mexe ou de que depende.
Sobrepô-las torna impossível dizer, se algo partir, qual das duas mudanças foi.

A ordem recomendada: **E3 primeiro** (o token já vive nessa origem hoje; E3 aumenta o
valor do token, não a exposição dele), **origem própria a seguir e antes de E4**.

## O paliativo, se alguma vez for preciso reduzir a exposição sem domínio

`settings.storage` é lido por `GoTrueClient.js:240` e o adaptador hoje não o passa — o
ponto de extensão está lá, por usar, e não exige dependência nova. Passar `sessionStorage`
reduz a janela (a sessão morre com o separador) mas **não** separa a origem, que é o
problema real. Fica como paliativo, não como solução; o custo é a persistência do login,
que numa aplicação de consulta diária é fricção a sério.

**Reduzir a superfície custa zero e é imediato:** despublicar os projetos vizinhos de
`igororlandi999.github.io` que já não servem para nada. Não fecha R-32, mas encolhe-o hoje.

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
