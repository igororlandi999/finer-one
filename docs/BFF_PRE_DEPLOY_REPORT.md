# BFF — RELATÓRIO PRÉ-DEPLOY

**Estado: NÃO PUBLICADO.** Nenhum deploy foi feito. Este documento existe para que a
decisão de publicar seja tomada com a informação toda à frente.

Projeto Vercel: `finer-one-proxy` (`prj_jmUKL3XI5kOQ5L909igi5y1q2wTm`), já ligado em
`.vercel/project.json`. Código em `C:\Users\User\Documents\VS Code\finer-one-proxy`.

Atualizado em 27/08/2026, depois da sessão de fecho de riscos locais.

---

## 1. O que está verde

| Verificação | Resultado |
|---|---|
| `node --test "test/**/*.test.mjs"` | **92 / 92**, 0 falhas (eram 63) |
| `"type": "module"` | ✅ |
| `engines.node` | `>=18` |
| Efeitos de topo nos módulos | ✅ nenhum — importar não faz rede |
| Frontend | 2069 → **2107** testes (83 ficheiros), build verde, `check:data` SAUDÁVEL |

Os 29 testes novos cobrem duas coisas que não estavam cobertas: o **contrato de CORS**
(`test/cors.test.mjs`) e a **segurança do próprio deploy** (`test/deploy-safety.test.mjs`).

---

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

## 5. Cobertura — persistência e segurança da escrita

O passo 9 do `ACOES_DO_UTILIZADOR_SUPABASE.md` estava errado: `lerCoberturaAtual` e
`gravarCobertura` **não** estão por implementar. `lib/coveragePersistence.js` traz
`createSupabaseCoverageStore` completo. Falta configuração, não código.

### Publicar com a `service_role` escreve alguma coisa sozinho?

Testado ao nível da **rede**, com `globalThis.fetch` espiado
(`test/deploy-safety.test.mjs`):

| Evento | Escreve? |
|---|---|
| Importar os módulos (arranque da função) | ❌ zero chamadas |
| Construir a loja com a `service_role` | ❌ ter a chave ≠ usar a chave |
| `GET` / `OPTIONS` / `HEAD` / `PUT` / `PATCH` / `DELETE` | ❌ 405 ou 204, zero rede |
| `POST` sem token | ❌ em `company_coverage` |
| `POST` com token forjado | ❌ em `company_coverage` |

**Mas há uma escrita que acontece, e é preciso sabê-la:**

```
POST sem token  →  HTTP 401 ao chamador
                →  POST https://<projeto>.supabase.co/rest/v1/audit_log
```

É **deliberado** — `protect.js` audita as recusas, e um registo de tentativas negadas é
exatamente o que se quer num sistema financeiro. Mas responde à pergunta com uma
nuance: sim, pedidos que ninguém autenticou provocam escritas em `audit_log`.

> ⚠️ **RISCO ABERTO — sem limitação de taxa.** Quem souber o URL pode fazer POSTs em
> série e fazer crescer `audit_log` indefinidamente; cada um custa também uma ida ao
> Supabase. No plano Free (500 MB, 27 MB usados) é um vetor de esgotamento real.
> Mitigações possíveis, por ordem de esforço: limitar taxa por IP no Vercel; auditar
> recusas por amostragem em vez de todas; ou não auditar recusas sem token (mantendo a
> auditoria das recusas *autenticadas*, que são as que dizem alguma coisa).

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

### Recomendação: **B, com D como passo intermédio.**

- **Agora (uma empresa real):** o `gasUrl` fica onde já está — `GAS_URL` no ambiente do
  Vercel. Zero risco de exposição, zero trabalho. `integration` permanece `{}`.
- **Quando houver a segunda empresa com dados reais:** criar
  `public.company_integration`, sem GRANT para `anon` e `authenticated`, lida só pela
  `service_role` em `lib/companyIntegration.js`. A coluna `companies.integration` é então
  removida — não deixada vazia, removida, para não voltar a ser preenchida por engano.

**Regra que fica escrita:** nenhuma configuração de integração pode viver numa tabela que
o browser consegue ler. O critério não é "está vazia", é "é alcançável".

---

## 9. Rollback

O proxy **não tem histórico git**. O rollback é o da Vercel, não o do código:

1. **Vercel → Deployments → o anterior → Promote to Production.** Imediato.
2. Se o problema for de configuração: remover `SUPABASE_SERVICE_ROLE_KEY` e *Redeploy*.
   A cobertura volta a 503 e o resto continua.
3. Do lado do frontend, o interruptor é `VITE_PROTECTED_DATA_TRANSPORT`: vazia devolve
   tudo ao transporte legado sem tocar no BFF.

> **Risco de rollback:** o único sítio onde este código existe é este disco. Ver §10.1.

---

## 10. Riscos, por gravidade

1. **Sem repositório git no proxy.** 2695 linhas, 16 ficheiros, incluindo o núcleo de
   autorização. Perda de disco = perda total. Nenhum backup encontrado
   (`C:\Users\User\Downloads\finer-one-proxy` existe mas está **vazia**).
2. **`audit_log` sem limitação de taxa** — §5.
3. **Apps Script `ANYONE_ANONYMOUS`.** Enquanto for anónimo, o BFF protege o caminho, não
   a fonte. Quem souber o URL do Web App lê tudo sem passar por aqui. É o maior risco de
   segurança do sistema, e não é o BFF que o resolve.
4. **Migração do CORS** — §4. Configurar antes de publicar.
5. **Mapeamento `recurso → upstream` duplicado** entre os dois repositórios. Idênticos
   hoje; fixados de cada lado por teste, mas nada os liga.
6. **`verifyToken` no caminho crítico** — §6. Aceitável, medido, com veredito.

---

## 11. Ordem de publicação sugerida

1. `git init` + repositório **privado** no proxy. *(exige autorização)*
2. Configurar `ALLOWED_ORIGINS` na Vercel — **antes** de publicar o novo CORS.
3. Configurar `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
4. Decidir se a `SUPABASE_SERVICE_ROLE_KEY` entra já (liga a escrita de cobertura) ou
   depois.
5. `vercel deploy` — **exige autorização explícita**.
6. `npm run check:supabase membership` com `API_BASE_URL` a apontar para o deploy.
7. Só depois: `VITE_PROTECTED_DATA_TRANSPORT=true`.
8. O `gasUrl` **nunca** vai para `companies.integration` sem o desenho da §8.

---

## 12. O que não foi possível validar localmente

`vercel dev` exige o CLI (não instalado — `npx` pediu para descarregar `vercel@59.9.1`) e
autenticação na Vercel. Ambos são ação do Igor. Em vez disso: 92 testes sobre os
handlers reais, com espia de rede, e a auditoria estática acima.
