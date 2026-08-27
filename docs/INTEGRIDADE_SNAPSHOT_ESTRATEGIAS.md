# Integridade dos snapshots — evidência medida e estratégias

> **Estado: a estratégia A está IMPLEMENTADA (2026-08-25). B, C e D não.**
> Escolher uma estratégia muda quando um rebuild grava e quando aborta. Este documento
> existe para que a escolha seja feita com números à frente, e não por intuição.
>
> Medido em 2026-08-23, com dados de produção.
> **Nada aqui foi publicado**: produção continua na versão 11 do Apps Script.

---

## 1. O problema (R1)

`podeGravarListagemVazia_` pergunta *"veio vazio?"*. Só isso.

```js
podeGravarListagemVazia_(5, 1390)  // -> true. Grava 5 e destrói 1390.
```

Uma listagem truncada não vem vazia, portanto passa. O caminho é concreto: o laço de
paginação termina em `if (lote.length < PAGE_LIMIT) break;` — uma página que devolva 47
títulos em vez de 100, por qualquer motivo transitório, **encerra a paginação como se
fosse a última página** e o snapshot é reescrito com uma fração dos dados.

---

## 2. A medição que muda o raciocínio

A suposição de partida — *"títulos liquidados saem da listagem, portanto quedas
legítimas são normais e um limiar bloquearia rebuilds válidos"* — **está errada**. Os
dados contradizem-na.

Comparação do snapshot de contas a pagar de **2026-08-14** (293 títulos) com o de
**2026-08-23** (301 títulos), 9,1 dias de intervalo:

| Medida | Valor |
|---|---|
| Títulos que **desapareceram** | **0** (0,0 %) |
| Títulos novos | 8 |
| Variação líquida | +8 |
| Rotatividade diária de saída | **0,00 %/dia** |

E o que muda, muda **dentro** da listagem, não para fora dela:

| Situação | 14/08 | 23/08 |
|---|---|---|
| `1` | 46 | 44 |
| `2` | 246 | 256 |
| `5` | 1 | 1 |

Dez títulos passaram de `1` para `2` — liquidaram-se — e **continuaram na listagem**.

Nada envelhece para fora, tampouco:

| | 14/08 | 23/08 |
|---|---|---|
| Emissão mais antiga | 2026-01-19 | **2026-01-19** (idêntica) |
| Emissão mais recente | 2026-08-12 | 2026-08-21 |

Os 8 títulos novos têm todos emissão entre 14 e 21 de agosto. **A listagem é
append-only na prática.** Isto é coerente com o desenho: `/contas/pagar` e
`/contas/receber` são consultados **sem filtro de data** (decisão documentada — os nomes
dos parâmetros de data destes endpoints nunca foram confirmados).

### Consequência

Se a listagem só cresce, **qualquer decréscimo é anómalo**, não apenas o zero. O espaço
de decisão não é "que percentagem de queda é aceitável" — é "quanta tolerância dar a
apagamentos deliberados no ERP".

### Limites desta evidência — ler antes de decidir

- **Uma janela, um recurso.** 9 dias, contas a pagar. Recebíveis não tem histórico local
  para comparar; assume-se o mesmo comportamento por serem a mesma família de endpoint,
  o que é plausível mas **não medido**.
- **Nove dias não capturam eventos anuais.** Uma limpeza de fim de exercício ou uma
  migração de ERP podem apagar títulos em massa, legitimamente.
- **Apagar títulos no Bling é possível.** Um lançamento errado corrigido produz uma queda
  legítima de 1 ou 2. Monotonia estrita seria demasiado rígida.

---

## 3. Estratégias

### A · Sonda de página +1 — confirmação determinística do fim  ✅ IMPLEMENTADA E PUBLICADA (v12)

Terminado o laço, pedir **uma página além** da última. Se vier vazia, a paginação chegou
mesmo ao fim. Se vier com dados, a terminação foi prematura → abortar sem gravar.

- **Não tem limiar.** Não exige decisão de negócio nenhuma.
- Ataca a **causa** medida (terminação precoce), não o sintoma (contagem baixa).
- Custo: **+1 request por rebuild.** Recebíveis passa de 14 para 15 páginas (+7 %).
- Detecta truncagem independentemente do tamanho da queda — inclusive uma queda de 1 %,
  que qualquer limiar percentual deixaria passar.
- **Não cobre** o caso de a API devolver páginas completas mas com conteúdo errado, nem
  um colapso consistente do lado do Bling.
- Assume que uma segunda leitura da página seguinte é fiável — se a falha for persistente,
  a sonda também falha, e o resultado é abortar. Falha fechado, que é o lado certo.

### B · Guarda de decréscimo com tolerância absoluta

Bloquear quando `novo < anterior − K`, com `K` pequeno (ordem de grandeza: 5).

- **Ancorada na medição:** 0 saídas em 9 dias torna qualquer decréscimo suspeito.
- Apanha truncagem de qualquer origem, incluindo as que a estratégia A não vê.
- `K` é uma decisão — pequena e informada, mas ainda assim sua.
- Uma limpeza legítima em massa bloqueia e exige intervenção manual. Aceitável se for
  raro e **se houver sinal**; hoje não há alerta para abortos repetidos (R3).
- Generaliza de contas a pagar para recebíveis **sem medição** desse recurso.

### C · Confirmação em duas execuções

Um resultado suspeito não grava, mas fica registado em `meta`. Se a execução seguinte
vir o mesmo, aceita-se.

- **Zero limiares** se combinada com A; com B, adia a decisão sobre `K`.
- Falhas transitórias — que é o que a medição sugere serem o risco real — **curam-se
  sozinhas**, sem intervenção.
- Uma queda legítima entra sozinha no ciclo seguinte (≤24 h, ou num re-run manual).
- Exige **estado entre execuções**. O sítio natural é `meta` do próprio snapshot.
- Se a falha for **persistente** e não transitória, a segunda execução confirma o valor
  errado e grava-o. C sozinha não chega.

### D · Total declarado pelo envelope — **não verificada**

A ideia: se a resposta do Bling trouxer o total de registos, compara-se com o recolhido.
Seria o sinal mais forte de todos.

**Não há evidência de que exista.** Auditei o código: nenhuma linha lê o envelope além de
`res.data`. Não posso confirmar nem desmentir a partir daqui, porque testar exige um token
do Bling, que só existe dentro do Apps Script.

**Experiência barata para resolver isto:** uma execução manual que registe
`Object.keys(res)` de uma chamada a `/contas/pagar`. Se aparecer um total, D passa a ser
a estratégia mais forte e barata, e A/B/C tornam-se redundantes ou complementares. **Vale
a pena correr antes de decidir qualquer outra coisa.**

---

## 4. Recomendação — e o que foi feito

### O que ficou implementado (2026-08-25)

**A, e só A.** `terminacaoPrematura_` (`Código.js`) é pura e não tem limiar nenhum:
recebe o tamanho do último lote, o `PAGE_LIMIT` e o tamanho da sonda. Devolve `true`
apenas quando o laço parou por fim natural (última página curta) **e** a página seguinte
ainda tem títulos.

| | |
|---|---|
| Onde se sonda | `fetchContasPagarLista_({sondarFim:true})` e `fetchContasReceberLista_({sondarFim:true})` |
| Onde **não** se sonda | o fallback ao vivo — chama sem `opts` e não paga request nenhum (§6: a amplificação anónima não podia piorar) |
| Onde não é preciso | pedidos: `rebuildPedidosSnapshot_` consolida via `mergePedidosSnapshot`, e uma janela truncada dá menos pedidos novos, não destruição de histórico |
| Efeito da deteção | **aborta sem gravar** (`motivo: 'paginacao-terminada-cedo'`); o snapshot de ontem continua a servir |
| Custo | +1 request por rebuild: despesas 4→5 páginas, recebíveis 14→15 |
| Testes | `apps-script/quedaMassiva.test.js` |

Porque abortar e não gravar-marcado-`parcial`: o teto `MAX_PAGES` é um limite **conhecido
e estável** — grava-se e marca-se. Uma terminação precoce é sintoma de falha
**transitória**; gravar destruiria o snapshot bom, e a leitura seguinte tem tudo para
correr bem.

**B continua por decidir e não foi implementada:** escolher o `K` é decisão de negócio.
**D continua por verificar:** exige um token do Bling, que só existe dentro do Apps Script.

### A recomendação original, mantida para registo

**Correr primeiro a experiência D.** É uma linha de log e responde a uma pergunta que
muda todo o resto.

Independentemente do resultado, **A é a candidata mais forte** para adotar já: não pede
decisão nenhuma, ataca a causa medida, e custa um request. **A + C** cobre transitório e
persistente sem introduzir qualquer limiar.

**B fica em reserva.** Só se justifica se D não existir e se A se mostrar insuficiente —
e, nesse caso, com `K` absoluto e pequeno, nunca com percentagem: a evidência não suporta
falar em percentagens quando a taxa de saída medida é zero.

> **DECIDIDO EM 25/08/2026: B fica ADIADA e `K` não é definido.** Nem percentual, nem
> absoluto. A sonda de página +1 resolve deterministicamente a causa conhecida
> (terminação prematura da paginação) e não exige constante nenhuma. B só volta à mesa
> perante **evidência de uma queda anormal que passe por todas as proteções
> determinísticas atuais** — que continuam a ser `podeGravarListagemVazia_`,
> `loteDaListagem_`, `paginacaoTruncada_` e `terminacaoPrematura_`.
> Registo completo em `docs/DECISOES_DE_NEGOCIO.md` (D3).

---

## 5. Risco adjacente — `MAX_PAGES` trunca em silêncio

`MAX_PAGES = 50` × `PAGE_LIMIT = 100` = **teto de 5000 títulos**. Atingido o teto, o laço
termina e grava o que tiver, sem aviso.

| Recurso | Títulos | Páginas | Uso do teto |
|---|---|---|---|
| Recebíveis | 1390 | 14 | **28 %** |
| Despesas | 301 | 4 | 8 % |

Folga de 3,6× para recebíveis. A ritmo de crescimento das despesas (+8 em 9 dias ≈ +320/ano)
o teto está a anos de distância — mas o crescimento de recebíveis não foi medido, e a
falha, quando chegar, é **silenciosa e indistinguível de um mês normal**. A estratégia A
detecta-a de graça: no teto, a página seguinte traz dados.

---

## 6. R2 — o fallback ao vivo, medido

Com o snapshot em falta, o backend pagina o Bling a pedido de quem chamar. E o Web App é
`ANYONE_ANONYMOUS`, com o URL do proxy embutido no bundle.

**A condição é mais larga do que "snapshot em falta":**

| Recurso | Condição | Comportamento |
|---|---|---|
| Recebíveis | `Array.isArray(snap.data)` | **endurecido** — `data:[]`, fonte `snapshot-vazio`, não chama o Bling |
| Despesas | `snap.data.length > 0` | fallback ao vivo |
| Pedidos | `snap.data.length > 0` | fallback ao vivo |

`length > 0` significa que um snapshot **legitimamente vazio** também dispara o fallback.

### Custo medido

| Recurso | Chamada | Requests ao Bling por pedido HTTP anónimo |
|---|---|---|
| Pedidos | `fetchPedidosVendas_`, janela de 90 dias (681 pedidos) | **7** |
| Despesas | `fetchContasPagarLista_`, listagem **completa** | **4** |

- Amplificação: **1 request anónimo → 4-7 requests ao Bling.**
- O limite de 3 req/s do Bling satura com **~0,4 requests anónimos por segundo**.
- A quota diária de `UrlFetch` do Apps Script (~20 000) esgota com **~2 900 requests
  anónimos/dia** — e, esgotada, **os rebuilds noturnos também falham**.

A degradação é auto-reforçada: o fallback ativa-se exatamente quando o snapshot falta, e
ao ativar-se impede o rebuild que produziria o snapshot.

### Comportamento mais seguro — proposta

Alinhar despesas e pedidos com recebíveis: `Array.isArray(snap.data)` e, sem snapshot,
devolver `data:[]` com uma `fonte` própria que o front distinga de zero real. O front já
sabe fazer isto — é o que faz com `snapshot-vazio`.

**A decisão que fica consigo:** o fallback existe para o arranque a frio, antes do
primeiro rebuild. Removê-lo obriga a que o primeiro snapshot venha sempre de uma execução
manual de `runRebuild*`. É uma troca de conveniência inicial por superfície de abuso
permanente — mas é uma troca, não uma limpeza óbvia.

---

## 7. Ver também

- `BACKLOG-TECNICO.md` → C7F.8 (R1-R6) e C7F.9 (índice por prioridade)
- `apps-script/snapshotIntegridade.test.js` — a lacuna do R1 e a assimetria do R2 estão
  fixadas como testes, para não voltarem a ser invisíveis
- `apps-script/quedaMassiva.test.js` — a estratégia A: a função pura, onde se sonda e
  onde deliberadamente não se sonda, e o aborto antes de qualquer gravação
- `docs/BLING_RATE_LIMIT_E_RESILIENCIA.md` — o incidente de 429 que originou o P0-3
