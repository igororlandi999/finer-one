# BFF — RELATÓRIO PRÉ-DEPLOY

**Estado: PUBLICADO.** O BFF está em produção em `https://finer-one-proxy.vercel.app`,
a partir do commit `5b2542d` do repositório **privado** `igororlandi999/finer-one-bff`.
O deployment anterior continua preservado para rollback.

> Atenção ao nome: o repositório público `igororlandi999/finer-one-proxy` é **antigo**,
> tem um commit e **não** é o canónico. O canónico é `finer-one-bff`, privado.

Projeto Vercel: `finer-one-proxy` (`prj_jmUKL3XI5kOQ5L909igi5y1q2wTm`), já ligado em
`.vercel/project.json`. Código em `C:\Users\User\Documents\VS Code\finer-one-proxy`.

Atualizado em 27/08/2026, na sessão da migração 003 (`company_integration`).

---

## 1. O que está verde

| Verificação | Resultado |
|---|---|
| `node --test "test/**/*.test.mjs"` | **179 / 179**, 0 falhas (eram 63) |
| `"type": "module"` | ✅ |
| `engines.node` | `>=18` |
| Efeitos de topo nos módulos | ✅ nenhum — importar não faz rede |
| Frontend | 2069 → **2113** testes (84 ficheiros), build verde, `check:data` SAUDÁVEL |

Os testes acrescentados desde as 63 iniciais cobrem, por ordem de aparecimento: o
**contrato de CORS** (`test/cors.test.mjs`), a **segurança do próprio deploy**
(`test/deploy-safety.test.mjs`), o **interruptor de escrita**
(`test/coverage-flag.test.mjs`) e, agora, a **resolução da integração por empresa** — a
declaração `{provider, envKey}` em `test/companyIntegration.test.mjs` e o comportamento
do endpoint em `test/financial-data.test.mjs`.

---

> **Auditoria de 28/08.** Depois do Preview `6d8c0b0` correu uma sessão longa de
> auditoria que encontrou dois **P0** (transporte protegido a cair para o legado
> anónimo; corrida entre empresas no contexto de dados) e quatro P1/P2 no BFF. Todos
> corrigidos localmente, com regressões. Ver `docs/AUDITORIA_2026-08-28.md`.
>
> As correções do BFF **não estão em nenhum deployment**: o Preview validado é anterior
> a elas.

## 2. Endpoints

| Rota | Ficheiro | Protegida? |
|---|---|---|
| `GET /api/pedidos/vendas` | `api/pedidos/vendas.js` | ❌ anónima (legado, em uso hoje) |
| `GET /api/companies/:id/financial-data` | `api/companies/[companyId]/financial-data.js` | ✅ `protect.js` |
| `POST /api/companies/:id/manual-coverage` | `api/companies/[companyId]/manual-coverage.js` | ✅ `protect.js` |

O frontend continua no endpoint **legado**: `VITE_PROTECTED_DATA_TRANSPORT` está vazia.
A equivalência entre os dois transportes está provada em
`src/services/equivalenciaTransporte.test.js` — o modelo produzido é idêntico, não
apenas parecido.

---

## 3. Variáveis de ambiente

### Públicas

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | `https://bysqekhcyrvtiejcupoa.supabase.co` |
| `SUPABASE_ANON_KEY` | a publishable `sb_publishable_…` (a mesma do `.env.local`) |
| `ALLOWED_ORIGINS` | `https://igororlandi999.github.io,http://localhost:5173` |

### Segredas — só o Igor

| Variável | Onde obter |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → *Secret keys* → `default` → **Reveal** |
| `GAS_URL` | já existe no projeto Vercel; não mexer |

E uma **pública** que decide a escrita:

| Variável | Valor nesta fase |
|---|---|
| `COVERAGE_WRITES_ENABLED` | **`false`** |

> A chave secreta **ignora a RLS por completo**. Só em `process.env` da função
> serverless. Nunca com prefixo `VITE_`, nunca num commit.

---

## 4. CORS — resolvido, com uma condição de migração

Havia **dois contratos** com nomes a distinguir por uma letra:

```
lib/protect.js          ALLOWED_ORIGINS   lista explícita, sem default   → falhava fechado
api/pedidos/vendas.js   ALLOWED_ORIGIN    || "*"                         → falhava ABERTO
```

Quem configurasse só a plural — que é a que a documentação manda — deixava o endpoint
**anónimo**, o que serve hoje os dados financeiros da Overcel, a responder
`Access-Control-Allow-Origin: *` a qualquer página da internet.

**Agora há um só contrato**, em `lib/cors.js`, usado pelos dois:

- variável única **`ALLOWED_ORIGINS`** (lista separada por vírgulas);
- `ALLOWED_ORIGIN` continua aceite como **alias**, com aviso, para a migração não partir
  produção. A plural ganha quando ambas existem;
- sem configuração: **nenhum** cabeçalho `Allow-Origin`. O browser recusa, o `curl`
  continua a funcionar, e um deploy por configurar fica obviamente por configurar;
- `Vary: Origin` é posto **sempre**, inclusive ao negar;
- `*` só aparece se alguém o escrever, e regista aviso.

> ⚠️ **CONDIÇÃO DE MIGRAÇÃO.** O comportamento por omissão do endpoint legado passou de
> **aberto** para **fechado**. Publicar isto sem `ALLOWED_ORIGINS` (ou `ALLOWED_ORIGIN`)
> configurada deixa o frontend em produção sem cabeçalho de CORS — e o GitHub Pages
> deixa de conseguir ler o proxy. **Configurar ANTES de publicar.**

18 testes em `test/cors.test.mjs` cobrem: origem permitida, negada, sem `Origin`,
preflight, endpoint legado, endpoints novos, alias legado, e a regressão do `*`.

---

## 5. Cobertura — o interruptor mudou de sítio

O passo 9 do `ACOES_DO_UTILIZADOR_SUPABASE.md` estava errado: `lerCoberturaAtual` e
`gravarCobertura` **não** estão por implementar. `lib/coveragePersistence.js` traz
`createSupabaseCoverageStore` completo.

### A `service_role` não pode ser o interruptor

Havia um plano para publicar com autenticação e autorização a funcionar mas sem escrita
de cobertura, deixando a `service_role` de fora. Simulado, com token válido:

```
SUPABASE_URL ✅   SUPABASE_ANON_KEY ✅   SERVICE_ROLE ❌
GET  financial-data   ->  403 FORBIDDEN
POST manual-coverage  ->  403 FORBIDDEN      (e não o 503 esperado)
```

A mesma chave lê as memberships. Sem ela o `protect` falha fechado — corretamente — e o
owner é recusado na sua própria empresa. Usar a chave como interruptor desliga a
**autorização**, não a escrita.

### O interruptor explícito

| Variável | Decide |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | memberships, autorização, auditoria, leituras protegidas |
| `COVERAGE_WRITES_ENABLED` | **e só ela** — se se grava em `company_coverage` |

Só a string exata `"true"` liga. Ausente, `"false"`, `"TRUE"`, `"1"`, `"yes"` — nenhuma.
A garantia deixou de ser "a chave não está lá" e passou a ser "há uma trava, e há
20 testes que falham se ela ceder" (`test/coverage-flag.test.mjs`), incluindo um
controlo que liga a flag e exige que a mesma chamada chegue a `company_coverage`.

### Publicar escreve alguma coisa sozinho?

Testado ao nível da **rede**, com `globalThis.fetch` espiado:

| Evento | Escreve? |
|---|---|
| Importar os módulos (arranque da função) | ❌ zero chamadas |
| Construir a loja com a `service_role` | ❌ ter a chave ≠ usar a chave |
| `GET` / `OPTIONS` / `HEAD` / `PUT` / `PATCH` / `DELETE` | ❌ 405 ou 204, zero rede |
| `POST` sem token, ou com token forjado | ❌ em `company_coverage` |
| `POST` de um owner com a flag desligada | ❌ — responde 503 |

**Mas há uma escrita que acontece:**

```
POST sem token  →  HTTP 401 ao chamador
                →  POST https://<projeto>.supabase.co/rest/v1/audit_log
```

É **deliberado** — as recusas são auditadas. `audit_log` é a prova de quem tentou o quê;
`company_coverage` é estado financeiro. Confundi-los levaria a desligar a auditoria
para satisfazer um teste de escrita.

> ⚠️ **RISCO ABERTO — sem limitação de taxa.** Quem souber o URL pode fazer POSTs em
> série e fazer crescer `audit_log` indefinidamente; cada um custa também uma ida ao
> Supabase. No plano Free (500 MB, 27 MB usados) é um vetor de esgotamento real.
> Mitigações, por ordem de esforço: limitar taxa por IP no Vercel; auditar recusas por
> amostragem; ou não auditar recusas sem token, mantendo as recusas *autenticadas*.

---

## 6. `verifyToken.js` — auditoria e veredito

Hoje: `GET {SUPABASE_URL}/auth/v1/user` com o token, cache em memória de **15 s**
chaveada pelo token, máximo 500 entradas, despejo FIFO.

| Dimensão | Como está | Com JWKS local |
|---|---|---|
| **Latência** | 1 ida ao Supabase por token não cacheado. Somam-se a `loadMemberships` (2ª ida) e ao Apps Script. | Poupa **uma** das idas |
| **Disponibilidade** | Auth em baixo → 503 | Sobrevive à auth em baixo — mas `loadMemberships` continua a precisar do Supabase, portanto **a dependência não desaparece** |
| **Segurança** | Autoritativo: pergunta ao emissor | Verifica assinatura e `exp` localmente |
| **Revogação** | Sessão terminada deixa de valer em **≤ 15 s** | Só na expiração do access token — **até 1 h** |
| **Expiração** | `expiresAt: null` de propósito; quem valida é o Supabase. A verificação local em `authorizationCore` fica inerte — documentado, não é defeito | Verificação local passa a valer |
| **Chave de cache** | O token em bruto. Sem colisão entre utilizadores. Credenciais vivem em memória ≤ 15 s | Idem |

### Veredito: **MANTER para o MVP e para o piloto.**

Três razões, por ordem de peso:

1. **Revogação em 15 s contra até 1 h.** Num produto financeiro, o tempo entre "tirei o
   acesso a esta pessoa" e "ela deixou de conseguir ler" é a métrica que interessa. O
   JWKS piora-a em duas ordens de grandeza.
2. **O JWKS não remove a dependência.** As memberships continuam a vir do Supabase a
   cada pedido. Trocar a verificação por local elimina uma ida em duas.
3. **Complexidade de rotação de chaves** que não se justifica antes de haver carga.

Se a latência vier a pesar, a primeira correção **não** é o JWKS — é cachear as
memberships com o mesmo TTL e alinhar a região do Vercel com a do Supabase.

---

## 7. Região — `us-west-2`, e não São Paulo

O projeto está em **AWS us-west-2 (Oregon)**. A recomendação original era São Paulo, por
latência para a Overcel. Não é alterável sem recriar o projeto.

**Impacto real:**

| Caminho | Efeito |
|---|---|
| Login | 1 ida Brasil → Oregon. ~150–200 ms adicionais, uma vez por sessão. Irrelevante. |
| Leitura de memberships | Por pedido protegido. Somada à verificação do token, ~2 idas. **É aqui que se sente.** |
| BFF | A latência que conta é **Vercel → Supabase**, não browser → Supabase. Se a função correr em `iad1` (default), Oregon fica a ~60–70 ms. |
| Dados financeiros | **Não passam pelo Supabase.** Vêm do Apps Script/Drive. A região do Supabase não os afeta. |
| Piloto Brasil | Aceitável. O utilizador sente o login e a troca de empresa, não os relatórios. |
| Futuro Portugal | Oregon é **pior** para Portugal do que São Paulo seria? Não: é semelhante. Se o mercado for Europa, nem São Paulo nem Oregon são a escolha — seria `eu-west`. |

### Recomendação: **MANTER.**

Recriar o projeto custa refazer esquema, utilizadores e memberships, e a única melhoria
mede-se em dezenas de milissegundos num caminho que não serve números financeiros. A
decisão de região só se torna interessante quando houver clientes a sério **e** já se
souber em que continente estão — e nessa altura a resposta pode nem ser São Paulo.

Ganho barato entretanto: fixar a região da função Vercel para perto do Supabase, com um
`vercel.json` (`{"regions": ["sfo1"]}`). Não foi feito — é uma alteração de deploy.

---

## 8. `companies.integration` — desenho antes de lá pôr o `gasUrl`

**Problema.** A política `companies_select_member` devolve a **linha inteira** a qualquer
membro, incluindo a coluna `integration`. Enquanto o Web App do Apps Script for
`ANYONE_ANONYMOUS`, pôr lá o `gasUrl` equivale a **publicar a fonte de dados financeiros
a todos os membros da empresa** — e um `viewer` é um membro.

Hoje está `{}` de propósito, e é por isso que a Overcel foi semeada sem `gasUrl`.

| Opção | Avaliação |
|---|---|
| **A. VIEW pública sem `integration`** | Funciona, mas deixa a tabela original alcançável se alguém lhe der GRANT. Duas superfícies para a mesma coisa. |
| **B. Tabela separada, só para o servidor** | `company_integration(company_id, config jsonb)`, **sem** GRANT para `anon`/`authenticated`, só `service_role`. A separação é física: não há política a escrever, não há coluna a esquecer num `select *`. |
| **C. Coluna inacessível por RLS** | O PostgreSQL **não** faz segurança ao nível da coluna via RLS. Exigiria `GRANT SELECT (col1, col2)` — funciona, mas é frágil: cada coluna nova nasce fora da lista e alguém acrescenta-a por engano. |
| **D. Fora da base de dados** | O `gasUrl` é uma variável de ambiente do BFF, não um dado por empresa. Simples enquanto houver **uma** empresa com integração; não escala para N. |

### Decisão tomada: **B e D ao mesmo tempo** — `docs/sql/003_company_integration.sql`.

A recomendação anterior era "D agora, B quando houver a segunda empresa". Antecipou-se,
por uma razão concreta: com `integration = {}`, as leituras protegidas respondiam
`{"data": [], "debug": {"fonte": "integracao-nao-configurada"}}` a **tudo**, enquanto o
legado anónimo servia 1135 pedidos, 309 despesas e 1452 recebíveis. O caminho seguro
estava, na prática, vazio — e um caminho vazio nunca chega a substituir o inseguro.

E as duas opções não eram alternativas. São camadas:

- **B — a tabela.** `public.company_integration(company_id, config jsonb, …)`, RLS ativa
  e **zero políticas**, `revoke all` para `anon` e `authenticated`, `grant` só para
  `service_role`. Nem o `owner` da empresa a lê. A separação é física: não há política a
  escrever, nem coluna a esquecer num `select *`.
- **D — o valor.** A tabela **não** guarda o `gasUrl`. Guarda
  `{"provider": "gas", "envKey": "GAS_URL"}` — uma **referência**. O endereço continua a
  ser uma variável de ambiente do Vercel, como sempre foi.

O que se ganha por juntar as duas: um dump da tabela não é uma fuga (é uma lista de nomes
de variáveis), não há um segredo duplicado que alguém rode num sítio e esqueça no outro,
e quem decide que a Overcel usa aquela variável passa a ser uma **linha da base de
dados** — que é o que faz a diferença quando houver uma segunda empresa.

O custo assume-se: uma empresa nova exige um deploy (uma variável nova), e não só uma
linha de SQL. Quando as empresas deixarem de se contar pelos dedos, a saída é guardar ali
um segredo **cifrado** — e `config jsonb` já suporta isso sem migração.

**`companies.integration` fica, vazia e desarmada.** Não foi removida: removê-la obrigaria
a coordenar o deploy do BFF com a migração. Em vez disso, o 003 põe-lhe um `check` que
**recusa** qualquer chave de segredo, e o BFF deixou de a pedir sequer no `select`. Não é
lida, e não pode ser preenchida.

**Regra que fica escrita:** nenhuma configuração de integração pode viver numa tabela que
o browser consegue ler. O critério não é "está vazia", é "é alcançável".

---

## 9. Rollback

O BFF **já tem histórico git** — repositório privado `finer-one-bff`. Há agora dois
níveis de rollback, e são independentes:

1. **Vercel → Deployments → o anterior → Promote to Production.** Imediato. O deployment
   pré-`5b2542d` continua preservado.
2. **Migração 003.** O rollback SQL está no fim do próprio ficheiro. Depois dele, as
   leituras protegidas voltam a `integracao-nao-configurada` — o produto fica de pé e
   vazio, que é o estado anterior a esta sessão. Nada de financeiro se perde: a tabela
   guarda o nome de uma variável, não números.
3. Se o problema for de configuração: `COVERAGE_WRITES_ENABLED` para `false` e
   *Redeploy*. A cobertura volta a 503 e o resto continua.
4. Do lado do frontend, o interruptor é `VITE_PROTECTED_DATA_TRANSPORT`: vazia devolve
   tudo ao transporte legado sem tocar no BFF.

> **A ordem entre 1 e 2 importa.** Reverter só o SQL, deixando o BFF novo, dá 503 nas
> leituras protegidas (a tabela deixou de existir — é uma avaria, e é reportada como
> tal). Reverter só o BFF, deixando a tabela, é inofensivo: o BFF antigo não a conhece.
> Se for preciso reverter os dois, reverter **primeiro** o BFF.

---

## 10. Riscos, por gravidade

1. **Apps Script `ANYONE_ANONYMOUS`.** Enquanto for anónimo, o BFF protege o caminho, não
   a fonte. Quem souber o URL do Web App lê tudo sem passar por aqui. É o maior risco de
   segurança do sistema, e não é o BFF que o resolve. A migração 003 estreita-o — o URL
   deixou de ser alcançável por qualquer membro autenticado — mas não o fecha.
2. **`audit_log` sem limitação de taxa** — §5.
3. **Mapeamento `recurso → upstream` duplicado** entre os dois repositórios. Idênticos
   hoje; fixados de cada lado por teste, mas nada os liga.
4. **`verifyToken` no caminho crítico** — §6. Aceitável, medido, com veredito.
5. **Uma empresa nova exige um deploy** — a contrapartida assumida da §8. Enquanto forem
   duas empresas, não custa nada; a partir de meia dúzia, muda para segredo cifrado.

**Fechados nesta sessão:** o proxy sem repositório git (agora privado, com histórico) e a
migração do CORS (§4, confirmada em produção, sem wildcard).

---

## 11. Ordem de publicação — o que já foi feito

1. ✅ `git init` + repositório **privado** (`finer-one-bff`).
2. ✅ `ALLOWED_ORIGINS` na Vercel, antes de publicar o novo CORS.
3. ✅ `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
4. ✅ `COVERAGE_WRITES_ENABLED=false` e `SUPABASE_SERVICE_ROLE_KEY`. A chave é
   **necessária** para a autorização; a flag é que mantém a escrita desligada.
5. ✅ Deploy autorizado, Preview validado e promovido a Produção (`5b2542d`).
6. ⬜ **Migração 003** no SQL Editor — *exige autorização*.
7. ⬜ Linha da Overcel em `company_integration`. A Finer Teste **não** leva linha.
8. ⬜ `npm run check:supabase integration` e `npm run check:supabase membership`.
9. ⬜ Deploy do BFF com o resolver novo — Preview primeiro, *exige autorização*.
10. ⬜ Equivalência protegido × legado (contagens, `meta`, `geradoEm`, totais).
11. ⬜ Só depois de tudo isso: `VITE_PROTECTED_DATA_TRANSPORT=true`.

> O passo 6 vem **antes** do 9. Com o BFF novo e sem a tabela, o PostgREST devolve 404 e
> as leituras protegidas respondem 503 — o que é correto (é uma avaria) mas é uma janela
> de indisponibilidade evitável. Ao contrário, a tabela sem o BFF novo é inofensiva.

---

## 12. O que não foi possível validar localmente

`vercel dev` exige o CLI (não instalado — `npx` pediu para descarregar `vercel@59.9.1`) e
autenticação na Vercel. Ambos são ação do Igor. Em vez disso: 141 testes sobre os
handlers reais, com espia de rede, e a auditoria estática acima.

O que continua a **não** ser verificável por teste unitário, por definição: se a RLS e os
GRANTs de `company_integration` estão mesmo como o SQL diz. Isso pergunta-se ao projeto
real, e é para isso que existe `npm run check:supabase integration` — que interroga a
tabela como `anon`, como **utilizador autenticado real** e como `service_role`, e exige
que só o último leia.
