# Contrato HTTP do backend Apps Script

**Auditado em 23/08/2026** contra o HEAD remoto (`apps-script/Código.js` e afins) e
verificado empiricamente com pedidos reais ao endpoint de produção.

Um único endpoint serve todos os recursos. O caminho é sempre o mesmo — `…/pedidos/vendas`
— e o recurso é escolhido pelo parâmetro `?recurso=`. O nome do caminho é histórico: os
pedidos de venda foram o primeiro recurso e nunca foi renomeado.

```
Bling ERP  →  Apps Script (doGet)  →  proxy Vercel  →  front React
```

O proxy **não transforma nada**: resolve CORS e encaminha. O que este documento descreve
é, portanto, também o que o front recebe.

---

## 1. Encaminhamento, na ordem em que acontece

`doGet(e)` decide por esta ordem exata (`Código.js`):

| # | Condição | Resposta |
|---|---|---|
| 1 | `?code=…` presente | Bloco OAuth (ver §7) |
| 2 | `?recurso=despesas` | `serveDespesas_` |
| 3 | `?recurso=recebiveis` | `serveRecebiveis_` |
| 4 | `?recurso=ajustes-manuais` | `serveAjustesManuais_` |
| 5 | **qualquer outra coisa** | **snapshot de PEDIDOS** |

A linha 5 é um *ramo por omissão*, não um `404`. É a origem do problema descrito em §6.

---

## 2. Pedidos de venda — `(sem parâmetro)`

```jsonc
{
  "data": [ /* pedidos normalizados */ ],
  "meta": {
    "geradoEm": "2026-08-23T04:06:13.794Z",
    "totalPedidos": 1071,
    "totalNovos": 0,
    "totalAtualizados": 1071,
    "totalPreservados": 0,
    "parcial": false
  }
}
```

- **Verificado:** HTTP 200 · `data[]` com 1071 · `meta` presente · sem `debug`.
- **Sem snapshot no Drive:** cai num *fallback ao vivo* que consulta o Bling nos últimos
  `DEFAULT_DAYS` (90) e devolve **`{ data }` sem `meta`** — os pedidos vêm **sem itens**.
  Uma resposta sem `meta` é, portanto, um sinal de que o snapshot não existe.
- Aceita `?dataInicial=` e `?dataFinal=` (só usados no fallback ao vivo).

## 3. Contas a pagar — `?recurso=despesas`

```jsonc
{
  "data": [ /* títulos */ ],
  "meta": { "geradoEm": "…", "hidratadosNestaExecucao": 0, "reaproveitados": 301, "parcial": false }
}
```

- **Verificado:** HTTP 200 · `data[]` com 301 · `meta` presente · sem `debug`.
- **Sem snapshot:** *fallback* à listagem ao vivo, **sem detalhe e sem nomes** de
  categoria — os campos `categoriaNome`, `historico` e `competencia` só existem depois
  do rebuild. A DRE degrada-se em silêncio se isto acontecer.

## 4. Contas a receber — `?recurso=recebiveis`

```jsonc
{
  "data": [ /* títulos */ ],
  "meta":  { "geradoEm": "…", "totalTitulos": 1390, "parcial": false },
  "debug": { "totalItens": 1390, "fonte": "snapshot", "snapshotMeta": { … } }
}
```

- **Verificado:** HTTP 200 · `data[]` com 1390 · `meta` **e** `debug` presentes.
- Único recurso que traz sempre `debug`. O front ignora chaves extra.
- **Contrato LEGADO (Versão 9 e anteriores):** não havia `meta` no topo; a data vivia só
  em `debug.snapshotMeta.geradoEm`. `lerGeradoEm` tolera os dois caminhos, e
  `producao.fixtures.js` mantém o envelope legado em teste para que a tolerância
  continue protegida mesmo depois de produção ter avançado.
- **Ausência estrutural:** `{ "data": [], "debug": { "fonte": "snapshot-vazio", "snapshotMeta": null } }`.
  Um `data: []` aqui **não** é «zero real»: é ausência de snapshot.

## 5. Ajustes manuais — `?recurso=ajustes-manuais`

```jsonc
{
  "data": { "companyId": "overcel", "updatedAt": "…", "months": { "2026-06": { "cmv": { … } } } },
  "debug": { "fonte": "documento", "totalMeses": 1, "documentoMeta": { … } }
}
```

- **Verificado:** HTTP 200 · `data` é um **objeto**, não um array · sem `meta` no topo.
- **Sem documento:** `{ "data": null, "debug": { "fonte": "documento-vazio" } }`.
- É o único recurso cujo `data` não é uma lista — e é isso que permite detetar o
  problema de §6 do lado do cliente.

---

## 6. ⚠️ Recurso desconhecido cai em PEDIDOS

**Comportamento atual, medido em 23/08/2026:**

| Pedido | HTTP | Corpo |
|---|---|---|
| `?recurso=despesass` *(erro de escrita)* | **200** | `data[]` com **1071 pedidos** + `meta` |
| `?recurso=xyz` | **200** | `data[]` com **1071 pedidos** + `meta` |

Um erro de escrita no nome do recurso é **indistinguível de um pedido válido de pedidos**:
mesmo status, mesma forma, mesma `meta`. Não há como o cliente saber que se enganou.

### Como o projeto se defende hoje

- `manualInputsService.js` tem uma **guarda explícita** para este caso concreto: se a
  resposta do recurso de ajustes manuais vier como *array*, trata-a como ausência —
  porque um array só pode significar que o pedido caiu no ramo por omissão.
- `scripts/check-data-pipeline.mjs` faz a mesma verificação e reporta
  *«resposta é uma lista, não um documento — o recurso caiu no ramo por omissão do doGet»*.

Ambas as defesas funcionam **apenas para o recurso de ajustes manuais**, porque só esse
tem forma distinguível. Um `?recurso=despesass` continua invisível.

---

## 7. OAuth — `?code=…`

Se o parâmetro `code` estiver presente, `doGet` responde ao fluxo de autorização do
Bling **antes** de qualquer roteamento de recurso e devolve o `code` recebido para ser
gravado à mão numa Script Property. Não é um recurso de dados e não deve ser chamado
pela aplicação.

## 8. Erros

Qualquer exceção não tratada é apanhada e devolvida como:

```jsonc
{ "error": true, "message": "<sanitizado>", "details": "" }
```

**Sempre com HTTP 200** — o Apps Script não expõe controlo de status no `ContentService`.
Daí a regra do runbook: *nunca assuma que 200 significa sucesso*. `details` fica
deliberadamente vazio, para não vazar stack.

---

## 9. Proposta: erro explícito para recurso desconhecido

*(Projetada e auditada; **não** publicada. Nenhuma alteração remota foi feita.)*

### Contrato proposto

```jsonc
{ "error": true, "code": "RECURSO_DESCONHECIDO", "recurso": "despesass" }
```

Sem stack, sem segredos, sem a query string completa. O `recurso` devolvido é apenas o
valor recebido, que o cliente já conhece.

### Auditoria de compatibilidade

Todos os consumidores dentro deste repositório foram inventariados:

| Consumidor | Envia |
|---|---|
| `blingDataService.js:946` | `recurso: "despesas"` |
| `blingDataService.js:957` | `recurso: "recebiveis"` |
| `manualInputsService.js:143` | `recurso: "ajustes-manuais"` |
| `blingDataService` (pedidos) | *sem parâmetro* |
| `scripts/check-data-pipeline.mjs` | os três, explicitamente |
| `diagnostico/*.mjs` | os três, explicitamente |

**Nenhum consumidor envia um valor inválido, e nenhum depende do fallback.**

### O que a migração NÃO pode quebrar

O pedido **sem** `?recurso` tem de continuar a devolver pedidos. Isso é o **contrato do
recurso principal**, não um fallback — a distinção é a chave da migração:

```javascript
// ANTES: qualquer coisa não reconhecida -> pedidos
// DEPOIS:
if (p.recurso === undefined || p.recurso === null || p.recurso === '') {
  return servePedidos_(p);          // contrato do recurso principal, preservado
}
if (p.recurso === 'despesas')        return serveDespesas_(p);
if (p.recurso === 'recebiveis')      return serveRecebiveis_(p);
if (p.recurso === 'ajustes-manuais') return serveAjustesManuais_(p);
return jsonOut_({ error: true, code: 'RECURSO_DESCONHECIDO', recurso: String(p.recurso) });
```

### Risco por avaliar

**O proxy Vercel é um projeto separado e não está neste repositório.** Não foi possível
auditar se ele injeta, reescreve ou omite `recurso` em alguma rota. Antes de publicar,
é obrigatório confirmar isso — se o proxy tiver uma rota que chame o backend com um
`recurso` que hoje cai no fallback e funciona por acidente, esta mudança parte-a.

### Ordem sugerida

1. Auditar o proxy Vercel (o único ponto por verificar).
2. Publicar como **nova versão do Web App** — não sobrepor a Versão 10, para haver
   rollback imediato.
3. Verificar os quatro recursos válidos e os dois inválidos com `npm run check:data` e
   com os pedidos manuais da tabela de §6.
4. Só então apontar produção para a nova versão.

---

## 10. Atualização de 23/08/2026 — §6 e §9 implementados LOCALMENTE

> `apps-script/Código.js` foi alterado. **Não foi publicado.**
> Enquanto não houver `clasp push` + nova versão, §6 continua a descrever a produção.

### Contrato implementado

```jsonc
{
  "error": true,
  "code": "RECURSO_DESCONHECIDO",
  "message": "Recurso nao reconhecido.",
  "recursosSuportados": ["pedidos", "despesas", "recebiveis", "ajustes-manuais"]
}
```

Sempre com HTTP 200, pela razão de §8 — o `ContentService` não permite escolher o status.

**Divergência face à proposta de §9:** o valor recebido **não** é devolvido. Publicar a
lista de recursos suportados é mais útil ao cliente do que devolver-lhe o que ele já
sabe, e evita refletir entrada do utilizador na resposta. O valor recebido vai para o
log, passado por `sanitize_`.

### Regra de encaminhamento

```js
if (recursoPresente_(p.recurso) && !recursoConhecido_(p.recurso)) { /* erro */ }
```

Só rejeita um recurso **presente e desconhecido**:

| `?recurso=` | Antes | Agora |
|---|---|---|
| *ausente* | pedidos | pedidos |
| `""` ou `"   "` | pedidos | pedidos |
| `pedidos` | pedidos *(por acidente)* | pedidos *(alias explícito)* |
| `despesas` / `recebiveis` / `ajustes-manuais` | o recurso | o recurso |
| `Despesas` *(maiúscula)* | pedidos | **`RECURSO_DESCONHECIDO`** |
| `despesass` *(gralha)* | pedidos | **`RECURSO_DESCONHECIDO`** |
| `xyz` | pedidos | **`RECURSO_DESCONHECIDO`** |

A comparação é **literal**, depois de aparar espaços. Não normaliza acentos nem maiúsculas
de propósito: `?recurso=Despesas` é um erro do cliente que vale a pena ver, não adivinhar.

### O risco do proxy — RESOLVIDO

§9 registava como bloqueio *«não foi possível auditar se o proxy injeta, reescreve ou
omite `recurso`»*. Foi sondado em 23/08/2026, só com GET:

| Através do proxy | Resposta |
|---|---|
| *(sem recurso)* | 1071 pedidos |
| `?recurso=pedidos` | 1071 pedidos |
| `?recurso=despesas` | 301 títulos |
| `?recurso=xyz` | 1071 pedidos *(fallback)* |
| `?recurso=` | 1071 pedidos |
| `?recurso=despesas&extra=1` | 301 títulos |

**O proxy é transparente.** Passa `recurso` verbatim, não injeta valores, não filtra
parâmetros extra. `?recurso=pedidos` **já funciona hoje**, o que torna o alias explícito
retrocompatível por observação e não por dedução.

Risco residual: o proxy pode ter outras rotas não sondadas. A aplicação só chama
`pedidos/vendas`, pelo que nenhum caminho em uso é afetado.

### Do lado do cliente

`normalizeManualInputs` já trata `payload.error === true` como ausência — era
retrocompatível antes de existir este contrato.

`fetchRawSales/Payables/Receivables` **não** tratavam: `res?.data ?? res ?? []` fazia o
objeto de erro passar por lista. Corrigido com `linhasOuFalha()`, que rejeita
explicitamente e devolve o controlo ao `allSettled` — a fonte com erro fica indisponível
sozinha, sem derrubar as outras. Ver `BLING_RATE_LIMIT_E_RESILIENCIA.md` §4.2.

`scripts/check-data-pipeline.mjs` passou a reconhecer o payload e a reportar
*«o backend NÃO reconhece este recurso (RECURSO_DESCONHECIDO) — suporta: …»* em vez do
genérico «payload sem array data».

### Testes

`apps-script/recursoDesconhecido.test.js` — 16 testes, entre eles: compatibilidade dos
quatro recursos em uso, entradas hostis (`../../etc/passwd`, `__proto__`, `toString`,
`hasOwnProperty`), e a garantia de que a guarda vem **depois** de todas as rotas conhecidas
e **antes** do ramo de pedidos, sem interceptar o retorno do OAuth.

---

## 11. Redação de dados pessoais em `?recurso=recebiveis` (local)

A resposta pública deixa de incluir:

| Campo | Estado antes |
|---|---|
| `contato.numeroDocumento` | preenchido em 1389/1390 — **481 CPF, 908 CNPJ** |
| `idTransacao` | sempre vazio |
| `linkQRCodePix` | sempre vazio |
| `linkBoleto` | sempre vazio |

`contato.id`, `contato.nome` e `contato.tipo` mantêm-se. O `numeroDocumento` **do título**
(documento fiscal, nível de topo) mantém-se — é outro campo, usado pelo
`documentNormalizer`.

Nenhum consumidor perde nada: `normalizeReceivable` só transporta `id` e `nome` do
contacto. Ver `APPS_SCRIPT_SEGURANCA.md` §3.
