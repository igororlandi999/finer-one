# HANDOFF — VIAGEM · 2026-09-03

> Checkpoint criado antes de o desenvolvimento passar do **desktop** para o **notebook**.
> Este ficheiro é o ponto de entrada: abre-o primeiro no notebook.
>
> **Não contém — e nunca deve conter — um único valor secreto.** Só nomes de variáveis,
> caminhos e onde os valores vivem. Ver §*Variáveis de ambiente* e
> §*O que tens de levar*.

---

## Estado geral da Finer One

| | |
|---|---|
| **Data do checkpoint** | 2026-09-03 |
| **Repositório principal** | `finer-one` — `https://github.com/igororlandi999/finer-one` |
| **Branch** | `main` |
| **Último commit em `main`** | `a2de8aa` — *merge: correcao de integridade do catalogo documental (notaFiscalId=0)*, mais o commit deste checkpoint |
| **Branch com trabalho por terminar** | `wip/oauth-callback-automatico` — `31909cc` |
| **Repositório do BFF** | `finer-one-proxy` → `https://github.com/igororlandi999/finer-one-bff` |
| **Branch / commit do BFF** | `main` — `d7ffe61` |

### Estágio atual

O produto está na transição de **instalação única (Overcel)** para **fundação SaaS
multiempresa**. A régua interna vai por etapas `E1…E4`; hoje está **em E3, com E4 por
abrir**.

O que aconteceu nas últimas sessões, por ordem:

- **R-32 — origem própria.** A aplicação deixou de viver no GitHub Pages partilhado e
  passou a ter origem própria: `https://finer-one-app.vercel.app`. O `localStorage` da
  origem nova tem **uma** chave; o da antiga tinha 13, 12 delas de outros projetos.
- **Cutover completo.** O GitHub Pages passou a ser uma **página de encaminhamento sem
  um único script** (branch `gh-pages`, `04c6847`). A origem antiga já não monta a
  aplicação nem permite iniciar sessão.
- **R-38** — `localhost` saiu do CORS de Production.
- **R-06** — o BFF deixou de seguir redirects cegamente (lista de hosts permitidos).
- **R-07** — um `200` do Apps Script que diz `{"error":true}` passou a ser `502`.
- **Pipeline determinístico.** Auto-deploy OFF e variáveis de sistema fora do build; o
  artefacto servido reproduz-se byte a byte a partir do repositório.
- **Integridade do catálogo documental.** `notaFiscalId=0` é a sentinela do Bling e não
  um documento fiscal: 2481 → 2277 documentos, 245 falsos removidos, 13 duplicados
  colapsados.

### O que está a funcionar

- Frontend em produção na origem própria, com autenticação Supabase real.
- BFF em produção na Vercel, com leitura protegida por empresa e autorização por
  *membership*.
- Os quatro recursos financeiros do Apps Script → Bling: `pedidos`, `despesas`,
  `recebiveis`, `ajustes-manuais`.
- **Medido neste checkpoint:** `finer-one` em `main` **2408/2408 testes a passar**,
  build de produção verde, `check:predeploy` verde. `finer-one-proxy` **295/295**,
  `check:predeploy` verde.

### O que ainda está incompleto

- **Callback OAuth automático do Bling** — implementado, com testes, **por terminar**.
  Vive em `wip/oauth-callback-automatico`, não em `main`. Um teste vermelho, de uma
  linha (§*Pendências* #1).
- **Revogar as sessões já emitidas no Supabase.** Substituir a página do GitHub Pages
  **não** invalida tokens: um JWT vale até expirar. Passo a passo em
  `docs/RISK_REGISTER.md` §*OPÇÃO B*.
- **Escrita de cobertura desligada em produção** (`COVERAGE_WRITES_ENABLED`) — depende
  de a `SUPABASE_SERVICE_ROLE_KEY` estar posta no painel do BFF.
- **E4 por abrir.**

---

## finer-one

**Estado:** `main` sincronizada com `origin/main`, árvore de trabalho limpa depois deste
checkpoint. **2408/2408 testes**, build verde.

### Áreas alteradas recentemente

| Área | O que mudou |
|---|---|
| `src/auth/` | fundação SaaS: `authMode`, adaptadores Supabase e dev, `ProtectedRoute` |
| `src/services/` | transporte de dados protegido vs. legado (`VITE_PROTECTED_DATA_TRANSPORT`) |
| `vite.base.mjs`, `vite.config.js` | o `base` do build passa a sair do ambiente (`VITE_BASE`) |
| `scripts/predeploy-check.mjs` | guardrails locais antes de publicar |
| `apps-script/` | integridade do catálogo documental; **e o callback OAuth, na branch WIP** |
| `docs/` | `RISK_REGISTER.md` é o registo vivo; `PROXIMA_SESSAO_DESKTOP.md` é o diário |
| `gh-pages-redirect/` | a página de encaminhamento servida na origem antiga |

### A branch `wip/oauth-callback-automatico` (`31909cc`)

Contém, e **só** contém, o trabalho por terminar do OAuth:

- `apps-script/Código.js` — `doGet` deixa de imprimir o *authorization code* no browser
  e passa a trocá-lo por tokens no próprio callback (`serveOauthCallback_`). O code do
  Bling vive **60 segundos** e o caminho manual não cabia nesse prazo.
  Guardas, por ordem: **lock** → **state** (aleatório, guardado, com prazo, uso único) →
  **marca por hash** (anti-reenvio) → **troca**.
- `apps-script/DiagnosticoNfe.js` + `nfeProbe.test.js` — sonda de leitura de `GET /nfe/{id}`.
- `apps-script/DiagnosticoOAuth.js` + `oauthProbe.test.js` — prova do code sem o exibir.
- `apps-script/oauthCallback.test.js` — testes do callback. **Um deles falha**
  (§*Pendências* #1). Na branch: 2498 a passar, 1 a falhar.

Nada de Sicredi, de *scopes*, de envs ou do contrato dos quatro recursos foi tocado.
Produção do Apps Script continua na **versão 12**.

### Próximos passos

1. Fechar o teste vermelho da branch WIP e fundi-la em `main` — §*Próxima tarefa*.
2. Revogar as sessões Supabase já emitidas (`docs/RISK_REGISTER.md` §*OPÇÃO B*).
3. Abrir E4.

---

## finer-one-proxy

**Estado:** `main` = `d7ffe61`, sincronizada com `origin/main`, árvore limpa.
**295/295 testes a passar**, `npm run check:predeploy` verde.
**Não tem dependências** — `node --test` puro, sem `node_modules`.

### Endpoints atuais

| Endpoint | Papel |
|---|---|
| `GET /api/pedidos/vendas?recurso=…` | **Legado, anónimo.** Proxy Vercel → Apps Script → Bling. Existe para servir a instalação atual até a migração terminar. |
| `GET /api/companies/:companyId/financial-data?recurso=…` | **Leitura protegida.** Exige `Bearer`. `401` sem token ou token inválido; `403` sem *membership* **e também** para empresa inexistente (indistinguível, de propósito); `200` só com os dados daquela empresa. |
| `POST /api/companies/:companyId/manual-coverage` | **Escrita protegida** da confirmação de cobertura. Exige token + *membership*. Governada por `COVERAGE_WRITES_ENABLED`. |

`recurso` ∈ `pedidos` · `despesas` · `recebiveis` · `ajustes-manuais`.

Módulos de fronteira em `lib/`: `cors.js`, `protect.js`, `verifyToken.js`,
`memberships.js`, `upstreamRedirect.js` (lista de hosts — R-06),
`contratoUpstream.js` (o `200` mentiroso — R-07), `companyIntegration.js`
(resolução da fonte por empresa; `envKey` limitado a `^GAS_URL(_[A-Z0-9]+)*$`).

### Próximos passos

1. Pôr a `SUPABASE_SERVICE_ROLE_KEY` no painel da Vercel — é o que falta para ligar a
   escrita de cobertura.
2. Manter `COVERAGE_WRITES_ENABLED` desligado até isso estar feito e verificado.

---

## Infraestrutura

| Serviço | Papel hoje |
|---|---|
| **GitHub** | `igororlandi999/finer-one` (frontend + Apps Script + docs + SQL) · `igororlandi999/finer-one-bff` (o proxy) · `igororlandi999/finer-one-site` (site institucional). A branch `gh-pages` do repo principal serve apenas a página de encaminhamento. |
| **Vercel** | Dois projetos **separados**: `finer-one-app` (frontend, origem oficial `https://finer-one-app.vercel.app`) e `finer-one-proxy` (o BFF). **Auto-deploy desligado de propósito** — publicar é uma decisão, não um efeito secundário de um push. É também onde vivem TODOS os segredos do servidor. |
| **Supabase** | Autenticação (JWT) e base de dados multiempresa com RLS. Esquema em `docs/sql/001_saas_foundation.sql`, `002_grants.sql`, `003_company_integration.sql` — **versionados**, portanto reproduzíveis. A `service_role` ignora a RLS e vive **só** no painel da Vercel. |
| **Google Apps Script** | O Web App que fala com o Bling e segura o OAuth. A fonte está versionada em `apps-script/`; o `scriptId` **não** (`.clasp.json` é ignorado). Implantação ANYONE_ANONYMOUS — daí o endurecimento do callback. |
| **Bling** | ERP, fonte financeira. OAuth2 com `client_id` / `client_secret` / `refresh_token` guardados em **Script Properties** do Apps Script — nunca no repositório, nunca no browser. O *authorization code* expira em **60 segundos**. |

---

## Variáveis de ambiente

**Só nomes.** Os valores vêm dos painéis (Vercel, Supabase, Bling). Referência canónica
no repositório: `.env.example` — atualizado neste checkpoint com o que faltava.

### `finer-one` — `.env.local` (públicas: vão LITERALMENTE para o bundle)

```
VITE_API_BASE_URL
VITE_AUTH_MODE
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_PROTECTED_DATA_TRANSPORT
```

Variável de **build**, passada na linha de comando e **não** lida de um ficheiro `.env`:

```
VITE_BASE          (ausente -> /finer-one/ ; "/" -> raiz, é o caso do Vercel)
```

`VERCEL_OIDC_TOKEN` aparece no `.env.local` deste PC — é **gerado pela CLI da Vercel**,
é efémero e **não precisa de ser transportado**.

### `finer-one-proxy` — painel da Vercel, `process.env` (SEGREDOS)

```
GAS_URL                      (e GAS_URL_<SUFIXO> por empresa)
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ALLOWED_ORIGINS              (ALLOWED_ORIGIN é a forma legada)
COVERAGE_WRITES_ENABLED
COMPANY_INTEGRATION_FIXTURE  (só desenvolvimento; recusada em produção)
```

### Apps Script — Script Properties (SEGREDOS, nunca em ficheiro)

```
BLING_CLIENT_ID
BLING_CLIENT_SECRET
BLING_REDIRECT_URI
BLING_ACCESS_TOKEN
BLING_REFRESH_TOKEN
BLING_TOKEN_EXPIRES_AT
BLING_OAUTH_STATE            (novo, na branch WIP)
BLING_OAUTH_STATE_AT         (novo, na branch WIP)
BLING_AUTH_CODE              (só no caminho manual de recurso)
```

> ⚠️ Uma `service_role` numa variável `VITE_*` vai para o bundle e **anula a RLS por
> completo**. É a falha mais grave possível nesta arquitetura. Duas guardas automáticas
> já existem: `npm run check:supabase env` e `segredosNoBundle.test.js`.

---

## Passos no notebook

### 1. Clonar (ou atualizar) os repositórios

```bash
mkdir -p ~/dev && cd ~/dev

git clone https://github.com/igororlandi999/finer-one.git
git clone https://github.com/igororlandi999/finer-one-bff.git finer-one-proxy
```

Se já existirem:

```bash
cd ~/dev/finer-one       && git fetch --all --prune && git checkout main && git pull
cd ~/dev/finer-one-proxy && git fetch --all --prune && git checkout main && git pull
```

Para retomar o OAuth:

```bash
cd ~/dev/finer-one && git checkout wip/oauth-callback-automatico
```

### 2. Instalar dependências

```bash
cd ~/dev/finer-one && npm ci
# finer-one-proxy NÃO tem dependências — nada a instalar.
```

### 3. Recriar o `.env.local` do frontend

```bash
cd ~/dev/finer-one
cp .env.example .env.local
```

Depois preencher, com valores tirados dos painéis (**não** de memória):

| Variável | Onde ir buscar | Valor atual em produção |
|---|---|---|
| `VITE_API_BASE_URL` | — | `https://finer-one-proxy.vercel.app/api` |
| `VITE_AUTH_MODE` | — | `supabase` |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → *Project URL* | (do painel) |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API Keys → *publishable / anon* | (do painel) |
| `VITE_PROTECTED_DATA_TRANSPORT` | — | `true` |

> ⚠️ **O `.env.local` tem de existir ANTES de correr os testes**, e não só antes do
> `npm run dev`. Sem `VITE_API_BASE_URL`, **14 testes falham** —
> `src/services/authorizedApi.test.js` (8) e `coverageWriteClient.test.js` (6) — com
> `Sem backend configurado (VITE_API_BASE_URL vazio)`. Medido num clone limpo a
> 2026-09-03. Não é uma avaria: é o suite a exigir configuração.

### 4. Correr o frontend

```bash
cd ~/dev/finer-one
npm run dev            # http://localhost:5173
npm test               # esperado em main: 2408 a passar
npm run build
```

> Nota já medida: `localhost` **não** está no `ALLOWED_ORIGINS` de Production (R-38).
> O `npm run dev` **não fala com o BFF de Production** — é intencional. Para medir contra
> o BFF, usar `vercel dev` no proxy ou a origem publicada. `curl` e os testes não são
> afetados.

### 5. Correr / testar o proxy

```bash
cd ~/dev/finer-one-proxy
npm test                    # esperado: 295/295
npm run check:predeploy     # esperado: tudo verde
```

### 6. Validar que está tudo a funcionar

```bash
cd ~/dev/finer-one       && npm test && npm run build && npm run check:predeploy
cd ~/dev/finer-one-proxy && npm test && npm run check:predeploy

cd ~/dev/finer-one       && git status -sb
cd ~/dev/finer-one-proxy && git status -sb
```

Verde nos dois `check:predeploy` = ambiente reconstruído com sucesso.

### 7. Apps Script (só quando for preciso publicar)

`.clasp.json` **não** está versionado (tem o `scriptId`). No notebook:

```bash
cd ~/dev/finer-one/apps-script
clasp login
clasp clone <SCRIPT_ID>     # ou copiar o .clasp.json deste PC
```

O `SCRIPT_ID` obtém-se em `script.google.com` → o projeto → *Definições do projeto*.

---

## Pendências conhecidas

Já existiam antes deste checkpoint; nenhuma foi introduzida por ele.

| # | Pendência | Onde |
|---|---|---|
| 1 | **Um teste vermelho** na branch WIP: `apps-script/oauthCallback.test.js:386` — `expect(b).not.toContain("finerone_' + Date.now()")`. **O código está correto**: a única ocorrência dessa string em `Código.js` está no **comentário explicativo** que descreve o que a implementação deixou de fazer. A asserção apanha a sua própria documentação. Correção esperada: uma linha. | branch `wip/oauth-callback-automatico` |
| 2 | **Revogar as sessões Supabase já emitidas.** Substituir a página do GitHub Pages não invalida tokens. | `docs/RISK_REGISTER.md` §*OPÇÃO B* |
| 3 | **`SUPABASE_SERVICE_ROLE_KEY` por configurar** no painel do BFF — é o que falta para a escrita de cobertura. | `docs/ACOES_DO_UTILIZADOR_SUPABASE.md` |
| 4 | **Aviso de build do Vite:** `blingDataService.js` é importado estática **e** dinamicamente; o chunk não se separa. Cosmético, não bloqueia. | `src/context/FinerDataContext.jsx` |
| 5 | **Ficheiro-lixo versionado** com um nome partido — `, payables, cashflow and operational alerts`. É o *output* de um `git diff --stat` redirecionado por engano. Inofensivo, mas está no repositório. **Não foi removido de propósito**: apagar um ficheiro versionado é destrutivo e não pertence a uma sessão de checkpoint. | raiz do repo |
| 6 | **Dois ZIPs históricos versionados** — `handoff-fase4.zip` (101 KB) e `fase5-complemento.zip` (18 KB). Já estão no histórico; removê-los agora não recupera espaço. Deixados como estão. | raiz do repo |
| 7 | **`finer-one-site` diverge do remoto.** Ver a nota no fim deste ficheiro. | repo separado |
| 8 | **`npm audit` reporta vulnerabilidades** nas dependências de desenvolvimento (visto no `npm ci` do clone de verificação). Não foi tocado: `npm audit fix --force` traz *breaking changes* e não pertence a uma sessão de checkpoint. | `package.json` |

---

## Prova de reprodutibilidade — feita, não presumida

A 2026-09-03 os dois repositórios foram **clonados de raiz a partir do GitHub**, para um
diretório limpo, e reconstruídos do zero. Não é uma opinião sobre o estado: é a medição.

| Passo | Resultado |
|---|---|
| `git clone` dos dois repos | ✅ |
| `HANDOFF`, `docs/sql/*.sql`, `.env.example` presentes no clone | ✅ |
| `finer-one-proxy` — `npm test`, sem instalar nada | ✅ **295/295** |
| `finer-one` — `npm ci` a partir do lockfile | ✅ |
| `finer-one` — `npm run build` sem `.env.local` | ✅ |
| `finer-one` — `npm test` no clone **tal como veio** | ❌ **15 a falhar**, e só 2384 testes em vez de 2408 |
| `finer-one` — `npm test` depois das duas correções abaixo | ✅ **2408/2408** |

O clone falhou por **duas** razões, ambas encontradas e ambas fechadas:

**1. Finais de linha (CORRIGIDO neste checkpoint).**
O repositório não tinha `.gitattributes`. Em Windows, com o `core.autocrlf=true` que o
Git for Windows põe por omissão, um clone limpo recebia **CRLF** — enquanto a árvore onde
o código foi escrito tem LF. As *blobs* sempre foram LF; só o **checkout** divergia.

Vários testes deste projeto leem o código-fonte **como texto** e afirmam coisas sobre ele.
Para esses, o final de linha é dado de entrada, não cosmética:

- `scripts/supabase-check.test.js` e `scripts/check-data-pipeline.test.js` — nem chegavam
  a ser lidos: `SyntaxError: Invalid or unexpected token`. São os 24 testes em falta;
- `apps-script/snapshotIntegridade.test.js` — o fatiador de funções procura uma linha que
  seja exatamente `}`; com CRLF é `}\r`, a fatia passa o fim da função e engole a seguinte.

Foi adicionado um `.gitattributes` com `* text=auto eol=lf`. **Não muda uma única blob** —
verificado: `git add --renormalize .` é um no-op neste repositório.

**2. `.env.local` em falta (documentado, não corrigível por commit).**
Os restantes 14 (`authorizedApi.test.js` 8, `coverageWriteClient.test.js` 6) exigem
`VITE_API_BASE_URL`. É configuração local por desenho — nunca pode ser versionada. Está
no passo 3 dos §*Passos no notebook*, com o aviso de que tem de vir **antes** do `npm test`.

Com as duas fechadas, um clone limpo dá **2408/2408** e um build verde. Ou seja: **sim,
o ambiente reconstrói-se a partir do GitHub mais as credenciais dos painéis.**

---

## Próxima tarefa recomendada

> **Fechar o teste vermelho da branch `wip/oauth-callback-automatico` e fundi-la em `main`.**

No notebook:

```bash
cd ~/dev/finer-one
git checkout wip/oauth-callback-automatico
npx vitest run apps-script/oauthCallback.test.js
```

Abrir `apps-script/oauthCallback.test.js:386`. A asserção quer provar que
`buildAuthUrl_` deixou de derivar o `state` do relógio — e isso **já é verdade**: a única
ocorrência de `finerone_' + Date.now()` em `Código.js` está no bloco de comentário que
explica o que mudou. A asserção tem de olhar para o **código**, não para o comentário —
por exemplo, retirando os comentários da fatia antes de comparar, ou asserindo sobre a
atribuição `var state =`.

Depois: `npm test` (2499 a passar), `npm run check:predeploy` (tem de deixar de
bloquear), e só então fundir em `main`.

**Porquê esta primeira:** é a única coisa vermelha em todo o projeto, é o que bloqueia o
`check:predeploy` do frontend, e é uma correção de uma linha. E4 e a revogação de sessões
ficam para depois de a árvore estar verde.

---

## O que tens de levar / reconfigurar

Nada disto é recuperável a partir do GitHub — **de propósito**. Quase tudo é recuperável
a partir dos **painéis dos serviços**; as duas exceções estão marcadas.

| O quê | Onde está hoje | Como recuperar no notebook |
|---|---|---|
| `finer-one/.env.local` | só neste PC (ignorado) | recriar de `.env.example` com os valores do painel Supabase |
| Segredos do BFF (`GAS_URL`, `SUPABASE_*`, `ALLOWED_ORIGINS`, …) | painel da Vercel | já lá estão — nada a transportar; o BFF em produção continua a funcionar |
| Script Properties do Bling (`BLING_*`) | Apps Script, no Google | já lá estão — nada a transportar |
| `apps-script/.clasp.json` (`scriptId`) | só neste PC (ignorado) | `clasp clone <SCRIPT_ID>`, com o id tirado de *Definições do projeto* |
| `.vercel/project.json` (ambos os repos) | só neste PC (ignorado) | `vercel link` — reconstrói-se sozinho |
| Sessão do `clasp` / login Google | só neste PC | `clasp login` |
| `diagnostico/despesas_snapshot.json` | só neste PC (ignorado — **dados financeiros reais**) | regenerável com `diagnostico/_dumpSnapshots.mjs`. **Não versionar.** |
| ⚠️ `diagnostico/opexJunho.mjs` | só neste PC (ignorado — números reais da Overcel, incluindo pró-labore) | **só existe aqui.** É a referência da reconciliação de 2026-06. Se fizer falta, copiar por canal privado (pen, drive privado). **Nunca versionar.** |
| ⚠️ `finer-one-foundation/`, `finer-one-codigo-minimo/` | só neste PC, **não são repositórios git** | rascunhos antigos (9 e 6 ficheiros), aparentemente superados por `finer-one`. Se tiverem valor, copiar à mão. |

### Nota sobre `finer-one-site`

O repositório do site institucional tem **duas histórias sem ancestral comum**: a local
(2026-08-07, 2 commits) e a do GitHub (2026-08-10 a 08-16, 7 commits — a que está
publicada, com domínio próprio, SEO e PT/EN). A local tem ficheiros que a remota **não**
tem: `FeatureTabs.tsx`, `FeatureShowcase.tsx`, `features/visuals/*`, `FAQCategories.tsx`,
`decisions/visuals/*`.

Para não perder nada e não tocar em `origin/main`, a lineagem local foi empurrada
**intacta** para a branch `backup/desktop-2026-09-03`
(`f8c57a8`, em `igororlandi999/finer-one-site`). Nada foi fundido, reposto nem apagado —
a decisão de aproveitar, ou descartar, fica para ti.

### Cópias antigas do repo principal (sem risco)

`finer-one - Copia/` e `finer-one-backup-antes-etapa1/` apontam para o mesmo remoto e
estão em commits antigos (`8577126` de 2026-08-13 e `a2175a4` de 2026-06-12), ambos já
contidos no histórico de `origin/main`. Não há nada a salvar neles.

---

*Checkpoint gerado com Claude Code. Sem segredos neste ficheiro — verificado por scan
antes do commit.*
