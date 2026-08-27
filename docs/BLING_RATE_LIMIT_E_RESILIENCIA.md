# Bling — rate limit, resiliência e integridade dos snapshots

> Auditoria de 2026-08-23, a partir das execuções naturais da madrugada.
> As correções descritas foram aplicadas **localmente** em `apps-script/`.
> **Nada foi publicado.** Enquanto não houver `clasp push` + nova versão do Web App,
> a produção continua com o comportamento antigo.

---

## 1. O 429, medido

Duas execuções de `runRebuildDespesasSnapshot` no mesmo dia, o mesmo código, a mesma
sequência de chamadas. Uma passou, a outra não:

| Execução | Duração | 429 em `/formas-pagamentos` |
|---|---|---|
| 00:48:57 | 5,836 s | **não** |
| 02:05:50 | 5,259 s | **sim** |

Os registos, com granularidade de segundo:

```
02:05:51  contas/pagar pagina 1: 100 titulos.
02:05:52  contas/pagar pagina 2: 100 titulos.
02:05:52  contas/pagar pagina 3: 100 titulos.
02:05:52  contas/pagar pagina 4: 1 titulos.
02:05:52  Rebuild despesas | titulos na listagem: 301
02:05:52  Aviso: nao foi possivel listar formas de pagamento
          (Bling GET /formas-pagamentos falhou (HTTP 429): TOO_MANY_REQUESTS,
           "limit": 3, "period": "second"). Usando fallback.
```

Quatro pedidos dentro do segundo `:52`, com o limite publicado do Bling a **3 pedidos por
segundo**. A execução das 00:48 fez exatamente a mesma coisa e escapou por uma fração de
segundo. Não é um erro intermitente do Bling: é uma **rajada determinística que passa por
sorte**.

### 1.1 A causa: `DETAIL_THROTTLE_MS` só protege metade do caminho

`DETAIL_THROTTLE_MS = 500` é aplicado com `Utilities.sleep()` **dentro do laço de
detalhe**, uma vez por título. Tudo o resto corre sem pausa nenhuma:

| Bloco | Chamadas | Pausa entre elas |
|---|---|---|
| `fetchContasPagarLista_` | 4 páginas (301 títulos) | **nenhuma** |
| `buildFormasPagamentoMap_` | 1+ páginas | **nenhuma** |
| `buildCategoriasMap_` | 1+ páginas | **nenhuma** |
| laço de detalhe | 1–2 por título | 500 ms por *iteração* |

A rajada de arranque é de **6+ pedidos consecutivos sem qualquer espaçamento**, ou seja
muito acima de 3/s. E há um segundo ponto, mais subtil: o laço de detalhe faz **duas**
chamadas por iteração no pior caso (`/contas/pagar/{id}` e `/contatos/{id}`) e dorme
**uma** vez — 2 pedidos por 500 ms = **4 req/s**. Está mascarado hoje porque os 301
títulos vêm todos do cache (`reaproveitados: 301`, `chamadasDetalhe: 0`), mas volta a
existir assim que entrar um lote de títulos novos.

### 1.2 Impacto real do fallback: nenhum, desta vez

`buildFormasPagamentoMap_` devolve `{}` no `catch`. A partir daí:

```js
// ramo de reaproveitamento — a guarda !nome protege o que já estava resolvido
if (reuse.formaPagamento.id != null && !reuse.formaPagamento.nome) {
  reuse.formaPagamento.nome = formasMap[String(reuse.formaPagamento.id)] || null;
}
```

Medido no snapshot servido depois dessa execução:

```
301 títulos · 301 com formaPagamento.id · 299 com nome resolvido
os 2 sem nome têm formaPagamento.id === 0  (ausência real, não falha)
```

Ou seja: **nenhum nome foi perdido**. A guarda `!nome` impede a degradação, e os dois
casos por resolver não são resolúveis (id 0 = sem forma de pagamento no Bling).

E, mais importante — `formaPagamento` **não entra em cálculo nenhum**:

| Pergunta | Resposta |
|---|---|
| Muda só o rótulo? | **Sim.** Alimenta `metodo` na lista de Despesas e mais nada |
| Muda a classificação? | Não. `classifyPayable` lê `categoriaNome` e `historico` |
| Muda a disponibilidade? | Não |
| Muda a DRE / EBITDA / totais? | Não |
| Quantos títulos afetados? | 0 nesta ocorrência; no limite, os que ainda não têm nome |

Fixado como invariante em `src/utils/invariantesFinanceiros.contaminacao.test.js`.

### 1.3 O risco que este 429 revelou não é este 429

`buildCategoriasMap_()` é chamada **imediatamente a seguir**, na mesma rajada, e tem a
mesma estrutura de `try/catch` com fallback silencioso. Mas `categoriaNome` **é** a
entrada de `classifyPayable`. Se o 429 tivesse calhado a essa chamada:

- títulos **novos** seriam gravados com `categoriaNome: "Sem categoria"` → classificados
  como `NAO_CLASSIFICADO` → fora das linhas da DRE, e as despesas operacionais do mês a
  descerem para `partial`;
- títulos **reaproveitados** ficariam intactos, graças a `precisaResolverCategoria_`.

O defeito seria **auto-curável** no rebuild seguinte (`"Sem categoria"` é retentado), mas
por um dia os números estariam errados sem que nada o dissesse. Foi por isto que a
correção foi feita — não pelo campo que falhou, mas pelo que estava ao lado.

---

## 2. Correção aplicada (local)

Duas defesas independentes, ambas em `blingGet_` (`Código.js`), a beneficiar **todos** os
pipelines de uma vez:

### 2.1 Espaçamento — evita a rajada

```js
var BLING_MIN_INTERVAL_MS = 350;   // 1000/3 = 333 ms; 350 dá margem ao relógio
```

Cada chamada espera o que falte para completar 350 ms desde a anterior. Garante
≤ ~2,85 req/s **em todo o lado**, incluindo listagens e mapas de apoio, que até aqui não
tinham throttle nenhum.

### 2.2 Backoff — recupera se acontecer à mesma

```js
var BLING_RATE_LIMIT_MAX_RETRIES = 3;
var BLING_RATE_LIMIT_BACKOFF_MS  = 1100;   // >1 s: a janela do Bling é por segundo
```

Espera 1100 / 2200 / 3300 ms e repete. **Só em 429** e **só até ao teto** — qualquer
outro código de estado continua a rebentar imediatamente, com a mensagem original.
Mascarar um 401, um 404 ou um 500 atrás de tentativas seria pior do que não ter backoff.
Pior caso por chamada: 6,6 s, contra um orçamento de execução de 5 minutos.

O espaçamento é a defesa principal; o backoff existe porque o relógio do Bling não é o
nosso e podem existir outras integrações na mesma conta.

### 2.3 Custo

| Pipeline | Páginas | Custo acrescentado |
|---|---|---|
| Pedidos | 7 | ~2,1 s |
| Despesas | 4 + mapas | ~2,1 s |
| Recebíveis | 14 + mapas | ~5,3 s |

O laço de detalhe não fica mais lento: já dormia 500 ms, que é mais do que 350.

**Testes:** `apps-script/blingRateLimit.test.js` — 18 testes sobre as funções puras de
decisão, extraídas da fonte real (se forem renomeadas ou apagadas, os testes falham em
vez de passarem contra uma cópia).

---

## 3. Inventário de rate limit — todas as chamadas ao Bling

| Endpoint | Pipeline | Máx. chamadas (hoje) | Throttle antes | Throttle depois | Risco 429 antes | Impacto se falhar |
|---|---|---|---|---|---|---|
| `/pedidos/vendas` (listagem) | Pedidos | 7 páginas (681 na janela) | **nenhum** | 350 ms | **alto** (rajada) | Rebuild aborta; snapshot preservado pelo merge |
| `/pedidos/vendas/{id}` | Pedidos | até 681 | 500 ms | 500 ms | baixo | Pedido fica sem itens; retentado depois |
| `/contas/pagar` (listagem) | Despesas | 4 páginas (301) | **nenhum** | 350 ms | **alto** | Rebuild aborta; snapshot preservado |
| `/contas/pagar/{id}` | Despesas | até 301 | 500 ms *(partilhado)* | 500 ms | **médio** — 2 chamadas por sleep | Título fica sem detalhe |
| `/contatos/{id}` | Despesas + Recebíveis | até 33 / 279 | **nenhum próprio** | 350 ms | **médio** | Fornecedor sem nome; `catch` local, não aborta |
| `/formas-pagamentos` | Despesas + Recebíveis | 1+ páginas | **nenhum** | 350 ms | **alto** — foi este | Só rótulo. Zero impacto financeiro |
| `/categorias/receitas-despesas` | Despesas + Recebíveis | 1+ páginas | **nenhum** | 350 ms | **alto** | **Classificação da DRE** — auto-curável no rebuild seguinte |
| `/contas/receber` (listagem) | Recebíveis | 14 páginas (1390) | **nenhum** | 350 ms | **alto** | Rebuild aborta; snapshot preservado pela guarda P0 |
| `/contas/receber/{id}` | Recebíveis | até 1390 | 500 ms *(partilhado)* | 500 ms | **médio** — 2 chamadas por sleep | Título fica só com a listagem |

### Inconsistências encontradas

1. **`DETAIL_THROTTLE_MS` era a única pausa e cobria só o laço de detalhe.** As listagens
   e os mapas — a maioria das chamadas do arranque — não tinham throttle nenhum.
   *Resolvido pelo espaçamento em `blingGet_`.*
2. **Duas chamadas por `sleep` no laço de detalhe** de despesas e recebíveis
   (detalhe + contacto), ou seja 4 req/s no pior caso.
   *Resolvido: o espaçamento aplica-se por chamada, não por iteração.*
3. **`resolverContatoNome_` não tinha throttle próprio** e é chamada de dentro de dois
   laços diferentes. *Resolvido pelo mesmo mecanismo.*
4. **`buildFormasPagamentoMap_` e `buildCategoriasMap_` correm em ambos os pipelines**
   (despesas e recebíveis), duplicando o custo. Não foi alterado: seria cache entre
   execuções, que é otimização, não correção.

---

## 4. Resiliência dos rebuilds, por modo de falha

`blingGet_` lança em qualquer resposta fora de 2xx. A exceção sobe, o `finally` liberta o
lock, e **nenhuma gravação acontece**. É este o mecanismo que protege os três pipelines
da maioria das falhas.

| Falha | Pedidos | Despesas | Recebíveis |
|---|---|---|---|
| 400 / 403 / 404 / 500 / timeout | aborta, snapshot preservado | idem | idem |
| 401 | refresh automático + 1 repetição; falha 2× aborta | idem | idem |
| **429** | **backoff ×3, depois aborta** | idem | idem |
| **HTTP 200 com JSON inválido** | **antes: lote vazio silencioso** → agora rebenta | idem | idem |
| **Listagem legitimamente vazia** | merge preserva histórico | **antes: gravava `data: []`** → agora aborta | idem |
| Snapshot anterior ausente | trata como primeiro rebuild | idem | idem |
| Snapshot anterior corrompido | copia para `.corrompido.json` e continua | devolve `null`; trata como ausente | devolve `null`; serve `snapshot-vazio` |
| `LockService` ocupado | aborta com `motivo: 'lock'` | idem | idem |
| Execução > 5 min | grava **parcial** com `parcial: true` | idem | idem |

### 4.1 P0 corrigido — zero por falha nunca substitui um snapshot bom

O caminho era concreto, não hipotético:

```
HTTP 200 + corpo ilegível
  -> safeParse_ devolve null
  -> blingGet_ devolve null            (não lançava)
  -> res.data indefinido -> lote = []
  -> laço de paginação pára na página 1
  -> data = []
  -> saveDespesasSnapshot_({ data: [] })   <-- 301 títulos perdidos, sem aviso
```

Pedidos estava protegido **por construção** — o snapshot é
`mergePedidosSnapshot(historico, janela)`, e uma janela vazia não apaga nada. Despesas e
recebíveis substituem a lista inteira e não tinham guarda nenhuma.

Duas correções:

```js
// 1) Um 2xx com corpo ilegível é FALHA, não resposta vazia.
var parsed = safeParse_(body);
if (parsed === null) throw new Error('… devolveu HTTP ' + code + ' com corpo ilegivel …');

// 2) Zero só substitui o snapshot quando antes também era zero.
function podeGravarListagemVazia_(totalRecebido, totalAnterior) {
  if (Number(totalRecebido) > 0) return true;
  return !(Number(totalAnterior) > 0);
}
```

Havendo histórico, uma listagem vazia aborta o rebuild **sem gravar** e regista
`ABORTADO: … Snapshot anterior PRESERVADO`. Preferimos um snapshot de ontem a um snapshot
vazio de hoje: o primeiro está velho, o segundo está errado, e só o segundo é
irrecuperável. Uma empresa que chegue legitimamente a zero títulos continua a poder fazê-lo
— exige apagar o snapshot à mão, que é uma ação deliberada, como uma perda total de dados
deve exigir.

**Testes:** `apps-script/snapshotIntegridade.test.js` — 12 testes.

### 4.2 O mesmo defeito, do lado do front

`fetchRawSales/Payables/Receivables` extraíam as linhas com `res?.data ?? res ?? []`.
Perante `{ error: true }`, `data` é indefinido, o `??` caía para o **objeto de erro**, e o
`.map()` seguinte rebentava com `TypeError` — **fora** do `allSettled`, apanhado só pelo
`catch` global. Uma falha em despesas derrubava o dataset inteiro para `unavailable`,
anulando o best-effort por fonte.

Passou a haver `linhasOuFalha(res, rotulo)`, que rejeita explicitamente. Uma rejeição
dentro do `allSettled` é o que o desenho já sabe tratar: aquela fonte fica indisponível,
as outras seguem. `[]` continua a ser resposta válida — zero é um facto.

**Testes:** `src/services/loadFinerData.payloadDefeituoso.test.js` — 10 testes.

---

## 5. Atomicidade da escrita dos snapshots

Os três gravam do mesmo modo:

```js
file.setContent(JSON.stringify(obj));
```

| Pergunta | Resposta |
|---|---|
| Escreve diretamente por `setContent`? | Sim, nos três |
| Há risco de ler durante a escrita? | **Baixo.** `setContent` cria uma **nova revisão** no Drive; o leitor obtém a revisão antiga ou a nova, nunca meia |
| Existe ficheiro temporário? | Não |
| Existe backup? | Não explícito — mas o **histórico de revisões do Drive** guarda as versões anteriores e permite recuperar à mão |
| O `LockService` protege a leitura? | **Não.** Protege apenas rebuilds concorrentes entre si. `doGet` lê sem lock |
| O snapshot antigo sobrevive a um crash antes da escrita? | **Sim** — é o comportamento normal em toda a tabela da §4 |
| Há janela de JSON truncado? | Não observada. `JSON.stringify` completa antes de `setContent`; um crash a meio da serialização não chega a escrever |

**Lacuna real:** não há **validação antes de gravar**. Nada impede escrever um objeto
malformado se um bug o produzir. A guarda da §4.1 fecha o caso mais grave (lista vazia),
mas não é uma validação de forma.

### Proposta (não implementada): temp → validar → substituir

```
1. serializar
2. validar:  data é array  ∧  (length > 0 ∨ o anterior também era 0)  ∧  meta.geradoEm é ISO
3. gravar num ficheiro .tmp
4. reler o .tmp e confirmar que faz JSON.parse com a mesma contagem
5. só então setContent no ficheiro definitivo
```

Custo: duas operações de Drive extra por rebuild (~1 s). Benefício sobre o estado atual:
marginal — o Drive já dá atomicidade de revisão, e o passo 2 (a parte que realmente
protege) pode ser feito **sem** ficheiro temporário. **Recomendação: implementar só o
passo 2**, e deixar o resto. Um ficheiro temporário acrescenta um estado a limpar e um
modo de falha novo, para resolver um problema que o Drive já resolve.

---

## 6. Observabilidade do snapshot (proposta)

`meta.geradoEm` prova **quando** o snapshot foi gerado. Não diz nada sobre **como correu**:
duração, avisos, se houve fallback, se houve retries. Hoje isso vive só nos registos do
Cloud, que expiram e que ninguém consulta sem uma suspeita prévia.

Mínimo proposto — aditivo, sem quebrar contrato nenhum:

```jsonc
"meta": {
  "geradoEm": "2026-08-23T05:05:54.246Z",
  "parcial": false,
  "totalTitulos": 301,

  "durationMs": 5259,
  "lastSuccessfulRun": "2026-08-23T05:05:54.246Z",
  "warnings": [
    { "code": "RATE_LIMIT_FALLBACK", "endpoint": "/formas-pagamentos", "tentativas": 3 }
  ]
}
```

Regras para não transformar o snapshot num log:

- `warnings` é um array de **códigos**, com no máximo ~10 entradas e sem texto livre;
- nada de payloads, corpos de resposta ou identificadores do Bling;
- `lastSuccessfulRun` distingue-se de `geradoEm` exatamente num caso — quando o rebuild
  abortou e o snapshot anterior foi preservado. É o campo que torna a guarda da §4.1
  **visível** em vez de silenciosa.

**Vale a pena?** `durationMs` e `warnings`: sim, custam três linhas e respondem a
perguntas que hoje exigem abrir a consola do Apps Script. `lastSuccessfulRun`: sim, pelo
motivo acima. Um histórico de execuções dentro do snapshot: **não** — isso é um log, e o
sítio dos logs é o Cloud Logging.

---

## 7. Escala — onde isto deixa de caber

Medido em `diagnostico/_perfEscala.mjs` (sem rede, melhor de 3):

| Cenário | `buildSalesDataset` |
|---|---|
| 1× real (1071 / 301 / 1390) | 22,7 ms |
| 2× | 43,0 ms (×1,9) |
| 5× | 117,7 ms (×5,2) |
| 10× | 234,8 ms (×10,3) |
| 10× + 5 anos de histórico | 238,4 ms |

**O front escala linearmente e a profundidade do histórico é gratuita** (a janela de fecho
é fixa em 3 meses). Não há nada a otimizar.

**O que não escala é o rebuild de recebíveis.** Hoje: 14 páginas em ~27 s ≈ **1,9 s por
página**, para 1390 títulos. A listagem é sempre integral — não há filtro de data em
`/contas/receber` (os nomes dos parâmetros nunca foram confirmados, e o código evita
chutar):

| Volume | Páginas | Só a listagem |
|---|---|---|
| 1× (1390) | 14 | ~27 s |
| 5× (6950) | 70 | ~133 s |
| **10× (13900)** | **139** | **~265 s** |

`REBUILD_TIME_BUDGET_MS` é de 300 s e o limite duro do Apps Script é ~360 s. A **~5–6× o
volume atual, a listagem sozinha consome o orçamento** e todas as execuções passam a
gravar parcial. Pior: como a listagem recomeça na página 1 em cada execução, o rebuild
**nunca converge** — não há cursor de continuação.

Não há correção segura sem uma das duas coisas: confirmar os parâmetros de data de
`/contas/receber`, ou guardar um cursor de paginação entre execuções. É o risco de escala
mais próximo, e o único desta auditoria que piora sozinho com o crescimento do negócio.

---

## 8. Estado das alterações

| Alteração | Ficheiro | Publicado? |
|---|---|---|
| Espaçamento + backoff de 429 | `apps-script/Código.js` | **Não** |
| `safeParse_` endurecido em `blingGet_` | `apps-script/Código.js` | **Não** |
| `podeGravarListagemVazia_` + guardas | `Código.js`, `Despesasbackend.js`, `RecebiveisBackend.js` | **Não** |
| `linhasOuFalha` | `src/services/blingDataService.js` | Front — entra no próximo build |

Para publicar o lado Apps Script: `docs/APPS_SCRIPT_SOURCE_OF_TRUTH.md` → checklist do
primeiro `clasp push`.
