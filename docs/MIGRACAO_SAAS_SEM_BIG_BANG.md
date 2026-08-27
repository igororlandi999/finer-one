# Plano de migração — de uma empresa para SaaS multiempresa

> ## ⚠️ ESTADO REAL — 27/08/2026
>
> Este documento foi escrito **antes** de existir um projeto Supabase. Já existe, e
> grande parte do que ele pede está feito. O que continua verdadeiro é a arquitetura;
> o que mudou são os passos.
>
> | | |
> |---|---|
> | Projeto Supabase | ✅ criado — `finer-one`, ref `bysqekhcyrvtiejcupoa`, região **us-west-2** |
> | Esquema | ✅ 5 tabelas, RLS, 7 políticas, trigger — `001` + `002_grants` |
> | Autenticação | ✅ Email/password; signup público **desligado**; confirm email desligado |
> | Utilizador, profile, Overcel, membership owner | ✅ criados e verificados |
> | Segunda empresa (`finer-teste`, viewer) | ✅ criada — multiempresa validada |
> | SDK `@supabase/supabase-js` | ✅ **já instalado** |
> | Login real local | ✅ validado ponta a ponta, com logout e zero resíduo |
> | Formato das chaves | ⚠️ o projeto usa as **novas** `sb_publishable_` / `sb_secret_`, não as JWT legadas |
> | `SUPABASE_SERVICE_ROLE_KEY` no Vercel | ❌ **por configurar** — é o que falta |
> | BFF publicado | ❌ **não** |
>
> Ver `docs/BFF_PRE_DEPLOY_REPORT.md` para o estado do proxy.

> ### Estado das etapas
>
> | Etapa | Estado |
> |---|---|
> | A — Sessão e interface | ✅ feito e agora exercido contra o Supabase real |
> | B — `companies` / `memberships` reais | ✅ **feito** — deixou de ser ação do utilizador |
> | C — Verificação do token no BFF | ✅ código e testes (92); ❌ por publicar |
> | D — Leituras protegidas | ⚠️ preparadas; equivalência com o legado provada em `src/services/equivalenciaTransporte.test.js`; `VITE_PROTECTED_DATA_TRANSPORT` continua vazia |
> | E — Escrita protegida da cobertura | ⚠️ código feito, falta a `service_role` |
> | F — CMV | inalterado, continua no Drive (decisão mantida) |
> | G — Auditoria visível | ❌ por fazer (a tabela existe e já recebe escritas) |
> | H — Remover `ACTIVE_COMPANY` | ❌ por fazer |
> | I — Fechar o Apps Script anónimo | ❌ por fazer — **é o maior risco aberto** |
> | J — Segunda empresa piloto | ✅ `finer-teste` criada e validada (viewer) |


Dez passos. Cada um é publicável sozinho, cada um tem um critério de conclusão
verificável, e **em nenhum deles a Overcel deixa de funcionar**.

O princípio: cada passo acrescenta uma barreira ou uma fonte de verdade, e só o passo
seguinte remove a antiga. Nunca as duas coisas ao mesmo tempo.

---

### A — Sessão e interface de autenticação ✅ *feito nesta sessão*

`AuthProvider`, `CompanyContext`, `ProtectedRoute`, `Login`, `CompanySwitcher`,
modo dev com três barreiras contra produção.

**Concluído quando:** não autenticado → Login; autenticado → aplicação; logout → Login;
autenticado sem empresa → acesso não configurado; o adaptador simulado não existe no
bundle de produção.
**Estado:** ✅ verificado no Chrome e por 2014 testes.

---

### B — `users` / `companies` / `memberships` reais 🔒 *AÇÃO DO UTILIZADOR*

Criar o projeto Supabase, executar `docs/sql/001_saas_foundation.sql`, semear a Overcel,
`npm i @supabase/supabase-js`, `VITE_AUTH_MODE=supabase`.

**Concluído quando:** o Igor entra com o email real, a barra lateral diz "Overcel" vindo
da **base de dados**, e `VITE_AUTH_MODE=dev` deixa de ser usado no dia a dia.
**Depende de:** `docs/ACOES_DO_UTILIZADOR_SUPABASE.md`, passos 1–7.
**Risco:** baixo. Falhar aqui não afeta a Overcel — basta voltar a `VITE_AUTH_MODE=`.

---

### C — Verificação do token no BFF

Publicar `lib/verifyToken.js` + `lib/memberships.js` + `lib/protect.js` na Vercel, com as
variáveis de ambiente. Nenhum endpoint muda ainda.

**Concluído quando:** `curl` sem token → 401; com token válido de A para a empresa B →
403; para a empresa A → 200. Testado **com `curl`, não com o browser** — o browser não
prova nada sobre autorização.
**Risco:** baixo. `/api/pedidos/vendas` continua a servir a aplicação.

---

### D — Leituras protegidas

O frontend passa de `apiGet("pedidos/vendas")` para
`createAuthorizedApi(...).get("financial-data")`. `blingDataService.loadFinerData`
recebe um cliente injetado em vez de importar `apiGet` diretamente.

**Concluído quando:** a app corre inteiramente sobre `/api/companies/overcel/*`,
`check:data` continua saudável, e `/api/pedidos/vendas` pode ser desligado sem que nada
quebre.
**Bónus:** `companyDataScope.js` deixa de ter razão de ser — o dataset passa a ser da
empresa ativa por construção.
**Risco:** médio. É o passo que toca no caminho dos dados reais. Mitigação: manter o
endpoint antigo vivo até o novo estar validado com `check:data --json`.

---

### E — Escrita protegida da cobertura

Implementar `lerCoberturaAtual` / `gravarCobertura`; ligar `coverageWriteClient` a
`FinerDataContext.confirmarCobertura`; a UI deixa de dizer "apenas nesta sessão".

**Concluído quando:** confirmar julho persiste, sobrevive a uma recarga, aparece em
`audit_log` com o autor certo, e um `viewer` recebe 403.
**Isto é o desbloqueio da funcionalidade que ficou por acabar.**
**Risco:** baixo. É estado novo, não migra nada.

---

### F — Escrita protegida do CMV

**Só quando houver razão própria** — duas pessoas da mesma empresa a introduzir CMV, ou
a segunda empresa. Ver `docs/PERSISTENCIA_ESTADO_SAAS.md`.

**Concluído quando:** o CMV é introduzido na aplicação em vez do editor do Apps Script,
com autor e histórico.
**Risco:** médio-alto — o CMV entra diretamente na DRE. **Não se faz junto com nenhum
outro passo.**

---

### G — Registo de auditoria visível

`auditLog.js` já constrói as entradas; o BFF já as escreve. Falta a página.

**Concluído quando:** um `owner` vê quem confirmou o quê e quando, e um `member` não vê
a página.
**Risco:** nenhum. Só leitura.

---

### H — Remover a dependência operacional de `ACTIVE_COMPANY`

Migrar página a página: `formatMoney(v)` → `formatMoney(v, formatting)`;
`ACTIVE_COMPANY.currency` → `company.currency`. `companyProfile.js` já dá as duas.

**Concluído quando:** `grep -rn ACTIVE_COMPANY src/` só devolve `config/company.js`,
`companyProfile.js` e testes. O ficheiro fica como fallback de desenvolvimento.
**Risco:** baixo por página, e cada página é verificável isoladamente.

---

### I — Fechar o acesso direto ao Apps Script

Ver `docs/THREAT_MODEL_MULTIEMPRESA.md` §7. Três degraus, do mais barato ao definitivo:

1. **Segredo partilhado** — o GAS exige um cabeçalho que só o BFF conhece.
2. **`ANYONE_WITH_GOOGLE` + conta de serviço** — fecha o anónimo de verdade.
3. **Retirar o GAS do caminho de leitura** — escreve snapshots para armazenamento
   privado; o BFF lê de lá. O Web App deixa de ser um endpoint público.

**Concluído quando:** chamar o URL do Web App sem credenciais devolve 401/403.
**Risco:** alto — é o único passo que toca em produção do Apps Script. Exige nova
versão e validação com `check:data`. **Não nesta sessão.**

---

### J — Segunda empresa piloto

Criar `companies` + `memberships` reais para um cliente externo com a sua própria
integração. Papel `viewer` para o contabilista.

**Concluído quando:** dois clientes reais entram, cada um vê a sua empresa, e um `curl`
com o token de um contra a empresa do outro devolve 403.
**É este o momento em que a Finer One passa a ser um SaaS.**

---

## Ordem e paralelismo

```
A ✅ ──► B 🔒 ──► C ──► D ──┬──► E ──► G
                            └──► H  (independente, página a página)
                                 I  (independente, exige publicação do GAS)
                                 F  (só com razão própria)
                                 J  (exige B, C, D, E)
```

- **B é o único bloqueador duro.** Sem projeto Supabase, C a J não avançam.
- **H e I são independentes** de tudo o resto e podem correr em paralelo.
- **F não tem pressa** e não deve andar junto com nada.
