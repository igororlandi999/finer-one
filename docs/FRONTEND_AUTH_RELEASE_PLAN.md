# Frontend — plano de publicação da autenticação e do transporte protegido

> **Atualizado a 30/08/2026, ao fim da sessão de consolidação pós-E2.**
> A abertura anterior — *"Nada foi publicado, nada foi enviado. 17 commits à frente"* —
> está **obsoleta e era verdade apenas a 29/08**. Hoje:
>
> | | |
> |---|---|
> | **E2** | **CONCLUÍDO.** Publicado a 30/08/2026, 02:56:56 (−03:00), de `a8bfca0` para `gh-pages 22b0526`. |
> | **E2.1** | **CONCLUÍDO.** Republicado a 30/08/2026, 03:57:40 (−03:00) — o patch do R-34 e a documentação de E3. |
> | **SHA do frontend validado** | `bd615ee` |
> | **`origin/main`** | `bd615ee` — **0 à frente / 0 atrás**, árvore limpa. |
> | **`gh-pages`** | `6e8c0ae` |
> | **Interruptores publicados** | `VITE_AUTH_MODE=supabase` · `VITE_PROTECTED_DATA_TRANSPORT` **vazio** |
> | **E3** | **NÃO INICIADO.** |
> | **BFF** | `74a1e0b` em Production, smoke autenticado concluído. |
>
> *Confirmado a 31/08/2026 pelo fio, não de memória: o site serve `6e8c0ae`, o rebuild
> local de `bd615ee` reproduz os sete ficheiros publicados byte a byte, e os dois
> interruptores foram lidos do bundle servido.*
>
> **R-18 está defendido em produção**, verificado no browser real — ver E2 abaixo.

---

## ⚠️ Duas numerações de etapas, e não são a mesma

Este ficheiro e o `RISK_REGISTER.md` numeram as etapas de maneira **diferente**, e
confundi-las torna o desvio D-1 ininteligível. Fica aqui a tabela de tradução:

| Neste ficheiro | No `RISK_REGISTER.md` | O que é |
|---|---|---|
| **E0** | E1 | publicar o BFF em Produção |
| **E1** | *(não tem número próprio)* | publicar os commits do frontend com os interruptores desligados |
| **E2** | E2 | ligar a autenticação |
| **E3** | E3 | ligar o transporte protegido |
| E4 / E5 | E4 / E5 | observar e desligar o legado *(aqui)* · piloto e escala *(no registo)* |

Quando se disser "E1 foi saltado" (D-1), é **o E1 deste ficheiro**.

---

## O achado que decide a sequência

Esta sessão encontrou, provou e corrigiu um defeito que **muda a resposta** à pergunta
"a autenticação e o transporte protegido devem subir juntos ou em duas etapas?".

**A etapa intermédia — autenticação LIGADA, transporte protegido DESLIGADO — não era
segura.** `FinerDataProvider` passava o `companyId` da empresa **ativa** a `loadFinerData`
sem perguntar que transporte tinha sido resolvido. Com o interruptor desligado, o
transporte é o legado — anónimo, um só conjunto de dados. Então:

```
utilizador troca para a Finer Teste  ->  companyId = "finer-teste"
o legado lê o endpoint anónimo       ->  dados da OVERCEL
o dataset era carimbado              ->  "finer-teste"
resolveCompanyDataScope              ->  LIGADA
AppShell                             ->  monta as páginas
```

Os números **reais** da Overcel sob o nome "Finer Teste", com o guarda de escopo a dizer
que estava tudo bem. Corrigido em `9531cc8`; a mesma classe apareceu na cobertura e na
moeda e foi corrigida em `b99c97d`.

**Consequência para este plano:** a etapa A só é publicável **com estes dois commits
incluídos**. Publicar a autenticação a partir de `origin/main` (`4e8b309`) — ou de
qualquer ponto anterior a `9531cc8` — reintroduz o defeito num utilizador multiempresa
real, que é exatamente o que a Overcel + Finer Teste são hoje.

---

## Etapas, e porquê nesta ordem

### E0 — BFF em Produção · **pré-requisito de tudo**

`BFF_PRODUCTION_PROMOTION.md`. Nada abaixo começa antes de isto estar estável.

**Rollback:** promover o deployment anterior. Não toca no frontend.

---

### E1 — Publicar os commits do frontend **com o interruptor desligado**

> ## ⛔ E1 FOI SALTADO — desvio **D-1**, **ACEITE**. Não voltar atrás para o executar.
>
> **O que aconteceu.** A publicação de 30/08/2026 foi directamente de E2: o `gh-pages`
> saltou do bundle de **18/07/2026** para o bundle com a autenticação ligada. Não houve
> nunca um deploy intermédio com `VITE_AUTH_MODE` vazio. O histórico do `gh-pages`
> tem três publicações em toda a sua vida — 17/07, 18/07 e 30/08 — e nenhuma delas é E1.
>
> **O que se perdeu com isso**, e fica dito para não ser redescoberto: a capacidade de
> **separar o diagnóstico**. Se aparecer agora um defeito, não há como distinguir "foram
> os 27 commits" de "foi o interruptor da autenticação", que é a razão declarada de
> existirem duas etapas. Não é uma perda recuperável — reexecutar E1 hoje significaria
> despublicar E2, que já está validado em produção, para provar uma etapa intermédia que
> já não interessa a ninguém.
>
> **Porque é aceite e não corrigido.** E2 passou integralmente no browser real, incluindo
> o teste que E1 existia para preceder. Voltar atrás trocaria um risco fechado por um
> risco aberto.
>
> **O que continua válido desta secção:** o parágrafo do rollback. `4e8b309` continua a
> ser um alvo de republicação a partir do qual a aplicação funciona com os interruptores
> desligados — só que agora é um ponto do passado de `main`, e não a sua ponta.

O que sobe: os 17 commits *(eram 17 quando isto foi escrito; a cadeia publicada tem 27)*.
O que **não** muda no comportamento: nada de leitura.

- `VITE_PROTECTED_DATA_TRANSPORT` **vazio** → `resolveDataTransport` devolve o legado no
  segundo `if`, antes de olhar para empresa ou token. **Idêntico a hoje, byte a byte** —
  e tem controlo positivo em `transporteProtegido.semLegado.test.js`.
- `VITE_AUTH_MODE` **vazio ou `disabled`** nesta etapa.

O que **melhora já** nesta etapa, sem interruptor nenhum: a corrida multiempresa, o
logout a invalidar leituras em voo, o CSV, a semântica financeira sem DRE, o score, o
fuso do `monthKeyOf`.

**Verificação:** a aplicação carrega, mostra os números da Overcel, e
`transporte === "legado"`.
**Rollback:** `git revert` do deploy no GitHub Pages, ou republicar `4e8b309`.
**Custo do rollback:** minutos. É o passo mais barato de desfazer de todo o plano.

---

### E2 — Ligar a autenticação, ainda com leitura legada · ✅ **CONCLUÍDO**

`VITE_AUTH_MODE=supabase` + `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

⚠️ **Esta é a etapa que o defeito acima tornava perigosa.** É segura **a partir de
`b99c97d`**, e não antes. Foi publicada a partir de `a8bfca0`, que a contém.

| | |
|---|---|
| **Publicado** | 30/08/2026, 02:56:56 (−03:00) |
| **A partir de** | `a8bfca0` |
| **`gh-pages`** | `22b0526` |
| **Bundle servido** | `assets/index-DVG67Kg3.js` |
| **Validado no browser real** | 30/08/2026 |
| **Reprodutibilidade** | `npm run check:predeploy` reconstrói `dist/` **byte a byte igual** ao artefacto publicado |

---

### E2.1 — Republicação com o patch do R-34 · ✅ **CONCLUÍDO**

**Não é uma etapa nova do rollout.** É E2 outra vez, com mais dois commits e **os mesmos
interruptores**. Fica registada em separado porque o artefacto servido mudou, e um
artefacto que muda sem registo é um artefacto que ninguém consegue reconstruir.

| | |
|---|---|
| **Publicado** | 30/08/2026, 03:57:40 (−03:00) |
| **A partir de** | `bd615ee` (= `a8bfca0` + `37f71d2` patch R-34 + `bd615ee` docs) |
| **`gh-pages`** | `6e8c0ae` |
| **Bundle servido** | `assets/index-CllETh7I.js` |
| **Interruptores** | `VITE_AUTH_MODE=supabase` · `VITE_PROTECTED_DATA_TRANSPORT` **vazio** — **inalterados face a E2** |
| **Testes** | **2340** testes, **97** ficheiros (E2 tinha 2337/96; o ficheiro novo é `Login.submitUnico.test.jsx`) |
| **Reprodutibilidade** | verificada a **31/08** por SHA-256 dos **sete** ficheiros: `index.html`, o CSS e os cinco chunks. **Todos idênticos** |

O que **não** mudou, e é o que importa neste passo:

- [x] o transporte protegido continua **DESLIGADO** — `VITE_PROTECTED_DATA_TRANSPORT:""`
      lido do bundle servido, não do `.env`;
- [x] as leituras continuam pelo **legado**; zero chamadas a `/financial-data`;
- [x] a regressão multiempresa de E2 continua a passar;
- [x] a Finer Teste continua a mostrar ausência de dados, com zero números da Overcel;
- [x] nenhum segredo no bundle — só a chave `sb_publishable_*`, pública por desenho.

O que mudou:

- [x] **R-34 mitigado** — guarda síncrona por `ref` contra submissões concorrentes
      (`37f71d2`). A 31/08 fechou-se também a metade **sequencial**: ver
      `RISK_REGISTER.md` §*Sessão autónoma de preparação para E3 — 31/08/2026*;
- [x] documentação da preparação de E3 — R-B e B-04 fechados, R-07 e R-32 aceites.

> **E3 continua NÃO INICIADO.** E2.1 não o aproxima nem o adia: muda o artefacto sem
> mexer no interruptor que define a etapa.

O que se confirmou — **todos passaram**, em browser real com utilizador multiempresa:

- [x] login funciona; sessão, utilizador e empresa ativa corretos;
- [x] **trocar para a Finer Teste mostra "empresa sem dados ligados"** — e **não** os
      números da Overcel. É a verificação direta do defeito corrigido. A UI diz
      literalmente *"Para não apresentar números de outra empresa, nenhuma informação
      financeira é mostrada."*;
- [x] **zero flash** de dados da Overcel sob o nome Finer Teste — provado com um gravador
      (`requestAnimationFrame` + `MutationObserver` em toda a subárvore) que classificou
      cada estado renderizado: a assinatura numérica da Overcel passa de **12/12 a 0/12**
      na mesma amostra em que aparece o estado de ausência, nas **duas** voltas;
- [x] trocar de volta para a Overcel mostra os números da Overcel, e o papel volta de
      `Consulta` a `Proprietário`;
- [x] Overcel → Finer Teste → Overcel, **duas vezes**, sem mistura;
- [x] refresh mantém a sessão e restaura a empresa permitida;
- [x] logout limpa o ecrã **e remove o token** do `localStorage`;
- [x] novo login parte de estado limpo — os alertas são recalculados, não reaproveitados;
- [x] **32/32 leituras financeiras pelo legado; zero chamadas ao transporte protegido**;
- [x] consola sem erros de auth, escopo de empresa ou carregamento financeiro;
- [x] módulos demonstrativos alcançáveis identificam-se como tal.

> ⚠️ **O que este teste NÃO provou, e é importante:** *isolamento forte* entre duas
> empresas. A conta usada é membro **das duas** empresas (`Proprietário` na Overcel,
> `Consulta` na Finer Teste). O que ficou provado é que os dados de A não aparecem sob o
> nome de B para um utilizador multiempresa — que é exatamente o R-18. **Não** ficou
> provado que um utilizador só de B não alcança A. Ver **R-33**.

**Rollback:** repor `VITE_AUTH_MODE` vazio, reconstruir e republicar. A leitura nunca
dependeu da autenticação nesta etapa, por isso o rollback não tem efeito sobre os dados.

---

### E3 — Ligar o transporte protegido · ⛔ **NÃO INICIADO**

`VITE_PROTECTED_DATA_TRANSPORT=true`. **Só depois de E2 estar estável, e nunca no mesmo
dia.**

> **Estado a 30/08/2026: NÃO INICIADO. `VITE_PROTECTED_DATA_TRANSPORT` está vazio**, no
> `.env.local` e no bundle publicado (verificado nos bytes do próprio bundle servido).
>
> **Condições de arranque, todas por cumprir antes de tocar no interruptor:**
>
> | # | Condição | Estado a 30/08/2026 (fim da sessão de preparação) |
> |---|---|---|
> | 1 | E2 estável, e **não no mesmo dia** de E2 | ⏳ E2 publicado a 30/08 — logo, **não antes de 31/08**. Cumpre-se com o calendário. |
> | 2 | **R-07 fechado ou aceite por escrito** | ✅ **ACEITE POR ESCRITO** — `RISK_REGISTER.md` §*R-07 — aceitação por escrito*. Quatro consumidores defendidos, e o Apps Script não consegue emitir outro estado. |
> | 3 | **B-03** — cadeia real de redirects do Apps Script | ✅ **CUMPRIDA — 31/08/2026.** A `GAS_URL` foi fornecida localmente e a sonda mediu a cadeia: **um** salto, `script.google.com` → `script.googleusercontent.com`, `200` final com `application/json`. Nenhum host inesperado. Fecha B-03 **e** dá a lista de hosts que fecha R-06. |
> | 4 | **B-04** — equivalência Preview ↔ Produção nos quatro recursos | ✅ **FECHADO por obsolescência.** `74a1e0b` foi promovido: Preview e Production são o mesmo commit. A baseline de Production dos quatro recursos está registada e é o que se compara **depois** de E3. |
> | 5 | **Isolamento forte entre duas empresas reais** com uma conta de **uma só** empresa | ✅ **CUMPRIDA — 31/08/2026.** Conta `a1a84e5d…` com membership **única** em `finer-teste`: `200` na Finer Teste, **`403` na Overcel**, e **uma** linha de `access.denied` no `audit_log` com `requestedCompanyId = overcel`, `reason = sem_membership` e sem segredo nem valor financeiro. Contra a Production real. Ver `R33_SINGLE_COMPANY_SMOKE.md`. |
> | 6 | **R-32 — token numa origem partilhada** | ✅ **ACEITE, condicional.** Provado em código; **não bloqueia E3** (E3 não muda onde o token vive) e **bloqueia E4**. A decisão de domínio próprio tem de ter dono e data antes de E4. |
>
> A condição 5 não estava neste plano e foi acrescentada a 30/08: a validação de E2
> mostrou que a configuração de contas actual **não consegue** demonstrar isolamento
> forte. A condição 6 foi acrescentada na sessão de preparação, e nasce aceite.
>
> # ⛔ 31/08/2026 (fim do dia) — TENTATIVA DE E3 ABORTADA NO PRÉ-DEPLOY
>
> **E3 NÃO foi ligado e nada foi publicado.** A sessão de rollout parou na validação: o
> artefacto E3, servido em `localhost` antes de publicar, fazia **4 leituras anónimas ao
> legado** a cada carregamento — os números reais da Overcel, antes de a autenticação
> resolver, e também para quem não tem sessão nenhuma.
>
> **Era um P1, e nunca chegou a produção.** Causa, patch, testes e mutation check em
> `RISK_REGISTER.md` §*R-39* e §*Sessão de rollout de E3 — 31/08/2026*.
>
> **Corrigido.** O rollout de E3 recomeça na Fase 3, com o código corrigido. As seis
> condições abaixo continuam cumpridas — o que falhou não era uma condição, era o próprio
> artefacto.
>
> ⚠️ **Mudança permanente ao procedimento de E3:** servir o `dist` em `localhost` e medir
> a rede num browser real **ANTES** de `npm run deploy`. O plano mandava publicar primeiro
> e medir depois; se se tivesse seguido essa ordem, o P1 tinha ido para o ar.

---

> # ✅ 31/08/2026 — AS SEIS CONDIÇÕES ESTÃO CUMPRIDAS
>
> As duas que faltavam caíram no mesmo dia: **B-03** (cadeia de redirects medida) e
> **R-33** (isolamento forte provado com `403` na Overcel e o `audit_log` limpo).
>
> **E3 = GO CONDICIONAL.** Não há bloqueadores. A condição que resta não é uma verificação
> — é o **procedimento** de E3: ligar o interruptor num dia próprio, com o rollback à mão,
> e voltar a correr o smoke do R-33 depois de ligar. Ver a matriz em
> `PROXIMA_SESSAO_DESKTOP.md`.
>
> *O texto abaixo é o registo de 30/08 e fica como estava.*
>
> **Veredito a 30/08/2026: E3 = NO-GO hoje.** Faltam **duas** condições, as 3 e 5 — e
> nenhuma delas é opinião: uma precisa de um valor (`GAS_URL`), a outra de uma conta.
> Nenhuma exige código novo. Assim que ambas passarem, e não antes de 31/08, E3 é **GO**.

A partir daqui o legado passa a ser **proibido**: faltando empresa ou token, o transporte
é `NENHUM` e não o anónimo. Provado ao nível da rede em
`transporteProtegido.semLegado.test.js` (401, 403, 400, 404, 413, 429, 500, 502, 503,
rede em baixo, DNS, JSON inválido, HTML com 200 — nenhum cai no legado).

- [ ] a Overcel mostra os mesmos números que em E2 — **equivalência**, e é o que prova
      que a migração não mudou o dinheiro;
- [ ] a Finer Teste responde `integracao-nao-configurada` e a UI explica a ausência;
- [ ] nenhum pedido a `/api/pedidos/vendas` no separador de rede.

**Rollback:** repor o interruptor vazio e republicar. Volta ao legado, que continua a
existir e a funcionar.

---

### E4 — Observar o legado

Ver `LEGACY_SUNSET` abaixo.

### E5 — Desligar o legado

Só depois de E4 provar zero chamadas.

---

## Juntos ou em etapas?

**Em etapas, e a resposta é agora mais forte do que era antes desta sessão.**

O argumento habitual é o do diagnóstico: três mudanças no mesmo dia tornam impossível
saber qual partiu o quê. Continua a valer. Mas há um segundo argumento, que só apareceu
porque a etapa intermédia foi analisada a sério: **a etapa intermédia tinha um defeito
próprio, que nenhum teste cobria porque nenhum teste a exercia.**
`datasetCarimbaEmpresa.test.js` só exercia o transporte protegido — o par "autenticação
ligada + legado" não existia em teste nenhum.

Isso é um argumento **contra** saltar etapas por acharmos que a intermédia é inofensiva.
Foi precisamente por ser considerada inofensiva que não tinha testes.

---

## Canary — não vale a pena, e porquê

O GitHub Pages serve um único artefacto estático a partir de um branch. **Não há canary
real**: nem percentagem de tráfego, nem divisão por utilizador.

Alternativas consideradas e descartadas:

| Hipótese | Veredito |
|---|---|
| Branch de preview separado | Publicaria num URL diferente, com **origem diferente** — e a origem tem de estar em `ALLOWED_ORIGINS` do BFF. Passa a exigir uma alteração no BFF para testar o frontend: acopla as duas coisas que este plano existe para separar. |
| Flag por query string (`?protected=1`) | Poria a escolha do transporte **nas mãos do visitante**. O interruptor decide se as leituras são autenticadas; um atacante escolheria o legado anónimo. **Inaceitável.** |
| Flag por `localStorage` | Mesma objeção, com um passo a mais. |

**Conclusão:** sem canary. O que substitui é o que já existe — as etapas pequenas e
reversíveis acima, e o facto de E1 e E3 serem desfazíveis em minutos por serem apenas uma
variável de ambiente e uma republicação.

---

## LEGACY_SUNSET — quanto tempo manter o legado

| Fase | Duração | Critério de saída |
|---|---|---|
| **Observar** | ≥ 2 semanas após E3 | zero chamadas a `/api/pedidos/vendas` nos registos |
| **Confirmar** | 1 semana | zero, incluindo um fecho de mês completo — é quando aparecem os utilizadores esporádicos |
| **Desligar** | — | remover a rota do BFF |

Duas semanas não é um número redondo por acaso: cobre o ciclo mensal parcialmente e apanha
quem só abre a aplicação no fecho. Um browser com a página aberta há dias continua a
correr o bundle antigo, e é esse o caso que a fase de observação existe para apanhar.

**Não implementar hoje nenhuma flag de produção para isto.**

### Observabilidade — como saber se ainda há chamadas

Registos da Vercel, sem analytics novo:

```
path:"/api/pedidos/vendas"
```

Últimos 7 dias. **Contar, não amostrar.** Se houver chamadas, ver a origem antes de
concluir: um scraper externo do endpoint anónimo não é um utilizador do produto, e são
duas conclusões opostas sobre se se pode desligar.

Não construir dashboards para isto. É uma pergunta que se faz três vezes e depois deixa de
existir.

---

## Matriz de rollback

| Etapa | Como reverter | Custo | Efeito nos dados |
|---|---|---|---|
| E0 BFF | promover o deployment anterior | minutos | nenhum |
| ~~E1 commits~~ | **saltado (D-1)** — `4e8b309` continua a servir de alvo de republicação, mas é hoje um ponto do passado de `main`, e não a sua ponta (`main` = `a8bfca0`) | minutos | nenhum |
| E2 auth | `VITE_AUTH_MODE` vazio + reconstruir + republicar | minutos | nenhum — a leitura não dependia |
| E3 protegido | interruptor vazio + republicar | minutos | volta ao legado |
| E5 legado desligado | **caro** — exige novo deploy do BFF | horas | é por isso que E4 dura semanas |

**A única etapa cara de desfazer é a última.** Todas as outras são uma variável de
ambiente e uma republicação — e é assim de propósito.

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
