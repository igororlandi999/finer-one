# Próxima sessão — o que exige desktop

> Escrito a 28/08/2026, no fim de uma sessão em que o utilizador estava no telemóvel.
> Tudo o que aqui está precisa de **browser, login, ou consola de um serviço**. Nada
> disto era possível fazer na sessão anterior, e por isso ficou por fazer — não por estar
> bem, mas por não ter sido verificado.

**Ordem importa.** Cada passo assume os anteriores.

---

## 0. Reposicionar (5 min)

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
git status && git log --oneline -8
npm test                    # esperado: 222 a passar
npm run check:predeploy     # esperado: tudo verde exceto o aviso de "ahead"

cd "C:\Users\User\Documents\VS Code\finer-one"
git status && git log --oneline -10
npm test                    # esperado: 2272 a passar, 90 ficheiros
npm run build
```

Estado esperado no início: BFF **ahead 4**, frontend **ahead 9**, `.mcp.json`
modificado e **não** versionado. Nada publicado, nada enviado.

Se os números divergirem, **parar e perceber porquê** antes de continuar.

---

## 1. Ler o estado real da Vercel (10 min) — **só ler**

O que confirmar, sem alterar nada:

- [ ] o projeto do BFF está ligado a `igororlandi999/finer-one-bff` **e não** ao
      `finer-one-proxy` público antigo;
- [ ] `ALLOWED_ORIGINS` existe em **Production** e o valor é exatamente a origem do
      frontend (⚠️ o endpoint legado passou de "aberto por omissão" a "fechado por
      omissão": sem esta variável, o frontend fica sem cabeçalho de CORS);
- [ ] `GAS_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
      presentes;
- [ ] `COVERAGE_WRITES_ENABLED` **ausente** ou diferente de `true`;
- [ ] Deployment Protection ativa nos Previews;
- [ ] qual é o deployment de **Production** atual (SHA), para saber a que voltar.

Fecha **B-05** e **B-06** do registo de riscos. **Não alterar nada nesta sessão.**

---

## 2. Ler o estado real do Supabase (10 min) — **só ler**

No SQL Editor, e sem executar DDL:

```sql
-- Políticas em vigor (a matriz documentada vem do SQL versionado, não da BD)
select schemaname, tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- RLS ligada, e onde está FORCE
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';

-- Grants por role
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
order by table_name, grantee;

-- search_path das funções SECURITY DEFINER
select p.proname, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;

-- Os factos que a sessão anterior assumiu e não pôde confirmar
select count(*) from public.company_coverage;                 -- esperado: 0
select company_id, integration from public.company_integration; -- esperado: sem URL nenhuma
select count(*) from public.audit_log;
```

Comparar com `docs/sql/001..003`. **Qualquer divergência é um bloqueio**, não uma nota.
Fecha **B-07** e **B-08**.

---

## 3. Publicar um Preview do BFF (15 min)

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
npm run check:predeploy     # tem de estar verde; se bloquear, resolver — não contornar
vercel                      # NUNCA --prod
```

O Preview desta sessão contém quatro alterações que a produção não tem:
`PERIODO_INVALIDO` nos dois endpoints, e o corte do `requestedCompanyId` no registo de
auditoria.

Anotar o URL. **Não promover.**

---

## 4. Smoke test sem token (10 min)

Os dez pedidos da tabela em `docs/RUNBOOK_BFF_DEPLOY.md` §3. Os quatro novos desta
sessão:

```bash
# 400 PERIODO_INVALIDO — o teste que prova a alteração desta sessão
curl -s "$PREVIEW/api/pedidos/vendas?dataInicial=2026-07-31&dataFinal=2026-07-01"

# 200 — o contrapeso: um período de um dia continua a atravessar
curl -s "$PREVIEW/api/pedidos/vendas?dataInicial=2026-07-15&dataFinal=2026-07-15" | head -c 200

# 400 DATA_INVALIDA — e não PERIODO_INVALIDO
curl -s "$PREVIEW/api/pedidos/vendas?dataInicial=2026-02-30"

# sem Allow-Origin para uma origem desconhecida
curl -sI -H "Origin: https://exemplo.invalid" "$PREVIEW/api/pedidos/vendas" | grep -i "access-control\|vary"
```

---

## 5. Smoke test **com** token (20 min) — o que a sessão anterior não pôde fazer

Iniciar sessão no frontend com uma conta real e obter o token de acesso das ferramentas
de programador. **Não colar o token em ficheiro nenhum**; usar só na variável de ambiente
da shell, e fechá-la no fim.

| # | Pedido | Esperado | Fecha |
|---|---|---|---|
| 1 | `GET /api/companies/overcel/financial-data` com token de membro | `200` + `{"data":[...]}` | B-01 |
| 2 | `GET /api/companies/finer-teste/financial-data` com o mesmo token | `403` **se** não houver membership; `200` com `debug.fonte: "integracao-nao-configurada"` se houver | B-01 |
| 3 | `GET /api/companies/nao-existe/financial-data` | `403` — **indistinguível** do anterior | B-01 |
| 4 | `GET /api/companies/@@@/financial-data` | `400` | B-01 |
| 5 | período invertido, **com** token | `400 PERIODO_INVALIDO` | — |
| 6 | `POST /api/companies/overcel/manual-coverage` com token de `viewer` | `403` | B-01 |

**O passo 3 é o que importa mais.** Se `nao-existe` responder algo diferente de
`nao-e-minha`, existe um oráculo de ids de empresa.

---

## 6. A cadeia do 502, em rede real (15 min) — fecha B-02

O defeito que já existiu: um `401` do Apps Script chegava ao frontend como `401` do BFF,
e o utilizador era expulso com "sessão expirada" com a sessão perfeitamente válida.

Provar que já não acontece:

1. no Preview, apontar temporariamente `GAS_URL` para um endpoint que devolva `401`
   (**variável do Preview, nunca a de produção**);
2. fazer o pedido protegido com token válido;
3. **esperado: `502`, código `UPSTREAM`.** Nunca `401`;
4. no frontend, confirmar que a sessão **não** cai;
5. repor a variável do Preview.

Se aparecer `401`, é regressão e bloqueia E1.

---

## 7. Cadeia de redirects do Apps Script (10 min) — fecha B-03 / R-06

```bash
curl -sIL "$GAS_URL" | grep -iE "^HTTP|^location"
```

Registar quantos saltos e para que hosts. Se for sempre
`script.google.com → script.googleusercontent.com`, então **R-06 pode ser fechado** com
uma lista de hosts permitidos em vez de `redirect: "follow"` cego. Sem esta observação,
apertar seria adivinhar — e adivinhar aqui parte produção.

---

## 8. Equivalência com produção (10 min) — fecha B-04

Para os quatro recursos, comparar Preview e produção:
número de registos em `data`, `meta.geradoEm`, `debug.fonte`.

Uma diferença **não** é "provavelmente cache". É um bloqueio até se explicar.

---

## 9. Decisão de produção — **e só aqui**

Todos os pré-requisitos estão em `docs/RUNBOOK_BFF_DEPLOY.md` §5. Nenhum é dispensável.

**Uma mudança de cada vez.** Publicar o BFF e ligar
`VITE_PROTECTED_DATA_TRANSPORT` no mesmo dia torna impossível saber qual delas partiu o
quê.

---

## O que **não** fazer nesta sessão

- Enviar os commits do frontend (nesta altura, **9** por enviar). São locais de
  propósito: nada foi verificado contra um backend real.
- Ligar `VITE_PROTECTED_DATA_TRANSPORT`. Depende de E1 estar fechado.
- Ligar `COVERAGE_WRITES_ENABLED`.
- Tocar no Apps Script ou mudar `ANYONE_ANONYMOUS`.
- Executar qualquer migração SQL.
- Versionar o `.mcp.json`.

---

## Se sobrar tempo

Por ordem de valor:

1. **R-07** — endurecer o contrato do upstream no BFF: recusar `{"error":true}` com `502`
   em vez de o reencaminhar com `200`. Local e testável; só precisa do Preview para
   confirmar que nenhuma resposta legítima do GAS tem essa forma.
2. **R-12** — fixar o contrato de `monthKeyOf` com um teste que force o ramo de string
   antes de alguém lhe passar uma. Puro, sem rede, sem risco.
3. **R-15** — desenhar a migração `004_audit_log_retention.sql`. **Escrever, não
   executar.**
