# Semântica dos códigos de erro — o catálogo único

> Escrito a 28/08/2026, a partir do código, não da memória.
> Fontes: `finer-one-proxy/lib/{protect,authorizationCore,cors,contratoUpstream}.js`,
> `finer-one-proxy/api/**`, `src/services/{api,authorizedApi,dataTransport}.js`,
> `src/services/blingDataService.js`.

## Porque este ficheiro existe

Um código de estado HTTP é uma **afirmação**, e as afirmações deste sistema têm
consequências diferentes umas das outras. `401` não é "correu mal": é "não sei quem és",
e `authorizedApi` responde-lhe **terminando a sessão**. Um código escolhido com
displicência num sítio faz o utilizador ser posto fora da aplicação noutro.

Foi exatamente o que aconteceu antes da auditoria de agosto: o BFF devolvia
`upstream.status` cru, e um `401` do Apps Script — deployment mal publicado, página de
login do Google — chegava ao frontend como `401` do BFF. O utilizador era expulso com
"sessão expirada" por causa de uma avaria do lado de lá, com a sessão perfeitamente boa.

Este catálogo existe para que a próxima escolha de código seja feita a olhar para uma
tabela, e não para o exemplo mais próximo.

---

## A tabela

| Código | Quem o gera | O que AFIRMA | Logout? | Retry? | `availability` |
|---|---|---|---|---|---|
| **200** | qualquer endpoint | a resposta é o contrato | não | — | `real` / `partial` conforme `meta` |
| **204** | `protect`, `vendas` | preflight `OPTIONS` | não | — | n/a |
| **400** | `protect` (`BAD_REQUEST`), `financial-data`, `vendas` | **o pedido não é interpretável** — `companyId` malformado, identidade no payload, `DATA_INVALIDA`, `PERIODO_INVALIDO`, `RECURSO_DESCONHECIDO`, `PARAMETRO_REPETIDO` | **não** | **não** — repetir o mesmo pedido dá o mesmo | `unavailable` |
| **401** | **só** `protect`, e só via `AUTHZ.UNAUTHENTICATED` | **não sabemos quem és**: token ausente, malformado, inválido, expirado ou sem sujeito | **SIM** | não | `unavailable` |
| **403** | `protect` (`AUTHZ.FORBIDDEN`) | **sabemos quem és e não podes**: sem membership, papel insuficiente, capacidade desconhecida, falha a ler memberships, empresa sem linha em `companies` | **NÃO** | não | `unavailable` |
| **404** | só a plataforma (rota inexistente) | o endpoint não existe | não | não | `unavailable` |
| **405** | `protect`, `vendas` | método não permitido | não | não | `unavailable` |
| **413** | `protect` | corpo acima de `CORPO_MAX_BYTES` (32 KB) | não | não | `unavailable` |
| **429** | só a plataforma / upstream | excesso de pedidos | não | com recuo, **não implementado** | `unavailable` |
| **500** | `protect` (exceção do handler), `vendas` (`GAS_URL` em falta) | avaria nossa, mascarada | não | não | `unavailable` |
| **502** | `financial-data`, `vendas` | **avaria do UPSTREAM** — `UPSTREAM`, `UPSTREAM_INVALIDO`, `TIMEOUT` | **NÃO** | manualmente, sim | `unavailable` |
| **503** | `protect` (config ilegível), `financial-data` (`INDISPONIVEL`), `manual-coverage` (escritas desligadas) | avaria de configuração ou funcionalidade desligada | **NÃO** | não | `unavailable` |

---

## As três regras que não se negoceiam

### 1. `401` é exclusivo da autenticação **deste** BFF

Nenhum estado de um terceiro pode sair daqui como `401`. Um `401`, `403` ou `404` do
Apps Script torna-se **`502`**, sempre, e o estado real fica no registo do servidor —
que é onde serve para diagnosticar.

`api/companies/[companyId]/financial-data.js` e `api/pedidos/vendas.js` implementam-no
com `if (!upstream.ok) return 502`, sem exceções por código.

### 2. `403` nunca termina a sessão

A sessão é boa; o que falha é o acesso **a esta empresa**. Terminar a sessão aqui
expulsaria da aplicação um utilizador que ainda tem outras empresas válidas, e faria
parecer que a culpa é das credenciais. Está em `authorizedApi.js`, com o comentário ao
lado da linha.

### 3. "Não existe" e "não é seu" são a mesma resposta

`403` nos dois casos, e o corpo (`safeErrorBody`) **não** inclui o motivo. Distinguir
"sem membership" de "papel insuficiente" diria ao cliente se a empresa existe. Enumerar
clientes de um SaaS financeiro pelo código de estado é uma fuga de informação comercial,
mesmo sem um único número à mistura.

Consequência propositada: uma empresa autorizada mas **sem linha em `companies`** também
responde `403`, e não `404`.

---

## Do estado HTTP ao estado do produto

```
BFF  ──►  api.js (ApiError.status)  ──►  authorizedApi (AuthorizedApiError.code)
                                              │
                                              ▼
                              blingDataService / loadFinerData
                                              │
                                              ▼
                                  source: "api" | "unavailable"
                                              │
                                              ▼
                        AppShell: PageSkeleton | DataUnavailable | páginas
```

| `AuthorizedApiError.code` | Vem de | `onUnauthorized`? |
|---|---|---|
| `SEM_SESSAO` | sem token antes de o pedido sair | não |
| `NAO_AUTENTICADO` | **401** | **sim** |
| `SEM_ACESSO` | **403** | não |
| `EMPRESA_INVALIDA` | `companyId` inválido do nosso lado | não |
| `REDE` | `status === 0` | não |
| `BACKEND` | tudo o resto (500, 502, 503, 429, 413, 405, 400) | não |

**Nenhum destes produz `source: "mock"`.** Com backend configurado, uma falha é sempre
`unavailable`. Provado em `src/services/avariaNuncaViraDemo.test.js`, para os onze modos
de falha do catálogo.

---

## Política de repetição (estado atual: **não há**)

Não existe repetição automática em lado nenhum do frontend. É deliberado enquanto o
catálogo acima não estiver estabilizado, porque uma repetição automática sobre um código
mal escolhido multiplica o erro em vez de o absorver.

O que existe é repetição **manual**: o ecrã `DataUnavailable` tem um botão que chama
`reload`, e cada `reload` incrementa a geração, pelo que uma repetição nunca pode fazer
aterrar o resultado da tentativa anterior.

Se algum dia se acrescentar repetição automática, a tabela acima já diz quais são os
candidatos: **`502` e `REDE`**, e só esses. `401` não (a sessão morreu), `403` não (o
acesso não muda por insistir), `503` de escritas desligadas não (é uma bandeira, não uma
avaria), `400` não (o pedido é o mesmo).

---

## Códigos que este sistema **não** usa, e porquê

- **`404` para empresa inexistente** — seria um oráculo de ids. Ver regra 3.
- **`409`** — não há operação com conflito de concorrência exposta ao cliente.
- **`422`** — `400` já cobre "pedido não interpretável", e ter os dois obrigaria a
  explicar a diferença em cada endpoint.
- **`451`, `418`** — n/a.
