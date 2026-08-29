# Smoke de pós-produção do BFF

> Curto de propósito. Corre-se **depois** de promover, pela ordem escrita, e **antes** de
> declarar a promoção boa.
>
> **Nenhum comando aqui contém um token, uma chave ou um segredo.** Onde é preciso um,
> diz-se onde vive — nunca qual é.

```bash
BASE="https://finer-one-proxy.vercel.app"
ORIGEM="https://igororlandi999.github.io"
```

---

## 1. Legado + CORS — **o passo que decide**

Hoje o frontend em produção lê por aqui (`VITE_PROTECTED_DATA_TRANSPORT` está vazio). Se
este passo falhar, **rollback imediato**; o resto não interessa.

```bash
# 1.1 o cabeçalho de CORS existe para a origem REAL do frontend
curl -sI "$BASE/api/pedidos/vendas" -H "Origin: $ORIGEM" \
  | grep -i "access-control-allow-origin\|vary"
# esperado: Access-Control-Allow-Origin: https://igororlandi999.github.io

# 1.2 e NÃO existe para uma origem desconhecida
curl -sI "$BASE/api/pedidos/vendas" -H "Origin: https://exemplo.invalid" \
  | grep -i "access-control-allow-origin"
# esperado: NADA

# 1.3 os quatro recursos respondem
for r in "" "?recurso=despesas" "?recurso=recebiveis" "?recurso=ajustes-manuais"; do
  printf "%-28s " "$r"
  curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/pedidos/vendas$r"
done
# esperado: 200 nos quatro
```

## 2. Contagens — equivalência com o que existia antes

```bash
for r in "" "?recurso=despesas" "?recurso=recebiveis"; do
  printf "%-28s " "$r"
  curl -s "$BASE/api/pedidos/vendas$r" | grep -o '"id"' | wc -l
done
```

Comparar com os números anotados **antes** da promoção. Uma diferença **não** é
"provavelmente cache" — é um bloqueio até se explicar.

## 3. Fronteiras do legado

| Pedido | Esperado |
|---|---|
| `?recurso=inexistente` | `400` `RECURSO_DESCONHECIDO` |
| `?dataInicial=2026-02-30` | `400` `DATA_INVALIDA` |
| `?dataInicial=2026-07-31&dataFinal=2026-07-01` | `400` `PERIODO_INVALIDO` |
| `?dataInicial=2026-07-15&dataFinal=2026-07-15` | `200` — o contrapeso: um dia atravessa |
| `OPTIONS` | `204` |
| `DELETE` / `PUT` / `PATCH` | `405` |

```bash
curl -s "$BASE/api/pedidos/vendas?recurso=inexistente"
curl -s "$BASE/api/pedidos/vendas?dataInicial=2026-02-30"
curl -s "$BASE/api/pedidos/vendas?dataInicial=2026-07-31&dataFinal=2026-07-01"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/pedidos/vendas?dataInicial=2026-07-15&dataFinal=2026-07-15"
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS "$BASE/api/pedidos/vendas"
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE  "$BASE/api/pedidos/vendas"
```

## 4. Protegido — sem token

```bash
curl -s "$BASE/api/companies/overcel/financial-data"                          # 401 UNAUTHENTICATED
curl -s "$BASE/api/companies/overcel/financial-data" -H "Authorization: Bearer lixo"  # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/companies/overcel/manual-coverage"  # 401
```

O último tem de deixar **zero** escritas. Confirmar no passo 6.

## 5. Protegido — **com** token

Iniciar sessão no frontend e obter o token das ferramentas de programador.
**Não colar em ficheiro nenhum.** Só numa variável da shell, e fechar a shell no fim.

```bash
read -rs TOKEN            # não ecoa
```

| # | Pedido | Esperado |
|---|---|---|
| 1 | `companies/overcel/financial-data` com token de membro | `200` + `{"data":[...]}` |
| 2 | `companies/finer-teste/financial-data`, mesmo token | `200` com `debug.fonte: "integracao-nao-configurada"` (há membership) |
| 3 | `companies/nao-existe/financial-data` | `403` — **indistinguível** do de uma empresa alheia |
| 4 | `companies/@@@/financial-data` | `400` |
| 5 | `manual-coverage` com token de `viewer` | `403` |

```bash
for c in overcel finer-teste nao-existe @@@; do
  printf "%-14s " "$c"
  curl -s -o /dev/null -w "%{http_code}\n" \
    "$BASE/api/companies/$c/financial-data" -H "Authorization: Bearer $TOKEN"
done
unset TOKEN
```

**O #3 é o que importa mais.** Se `nao-existe` responder algo diferente de uma empresa
alheia, existe um oráculo de ids de empresa.

## 6. Supabase — os factos que não podem mudar

No SQL Editor:

```sql
select count(*) from public.company_coverage;                    -- TEM de ser 0
select company_id, integration from public.company_integration;  -- sem URL nenhuma
select count(*) from public.audit_log;                           -- >= o valor de antes
```

- `company_coverage` **≠ 0** → `COVERAGE_WRITES_ENABLED` ligou. **Rollback.**
- uma URL real em `company_integration` → a referência declarativa foi contornada. **Rollback.**

### Auditoria (R-H) — a prova que exige isolamento

```sql
select occurred_at, capability, reason, metadata->>'requestedCompanyId'
from public.audit_log order by occurred_at desc limit 5;
```

Fazer **uma** recusa autenticada (o #3 acima), **esperar dois minutos sem tráfego
nenhum**, e reconsultar. A linha tem de estar lá.

> Foi exatamente isto que apanhou R-H: sob tráfego o registo funcionava, e falhava na
> sondagem isolada — que é o caso que ele existe para apanhar. Correr esta verificação
> logo a seguir a outros pedidos **não prova nada**.

## 7. Logs

Vercel → Logs, últimos 15 minutos:

- [ ] nenhum `SUPABASE_SERVICE_ROLE_KEY`, `GAS_URL`, URL do Apps Script ou token;
- [ ] nenhum texto livre vindo do cliente;
- [ ] `502` com `UPSTREAM` onde é suposto — e **nunca** `401` reencaminhado do upstream.

---

## Veredito

**Tudo verde** → promoção aceite. Anotar o deployment id e a hora; não mexer em mais nada
hoje.

**Qualquer gatilho** → `BFF_PRODUCTION_PROMOTION.md` §6, sem discussão.
