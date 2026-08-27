# Contrato do fecho mensal

> **Estado: em vigor desde 2026-08-24.**
> Este documento descreve o que o código FAZ. Para o diagnóstico do problema que levou
> aqui — com as medições de produção que o provaram — ver
> `docs/COVERAGE_AND_CLOSING_ARCHITECTURE.md`.
>
> **Complemento obrigatório (2026-08-24, mais tarde no mesmo dia):**
> `docs/FINANCIAL_COMPLETENESS_CONTRACT.md`. Este contrato responde por UM eixo — o dos
> requisitos do utilizador. Um mês com `CLOSING_STATUS.COMPLETE` **não é**, por si só, um
> mês financeiramente completo nem um mês elegível como âncora dos KPIs: o catálogo de
> requisitos tem uma entrada (o CMV), pelo que preencher o CMV esgotava-o e promovia o mês
> a âncora com as despesas operacionais ainda parciais. Ver o complemento antes de ligar
> `closing.status` a qualquer decisão sobre rentabilidade.

---

## 1. A pergunta que este contrato responde

> *"O que é que falta para eu poder confiar nos números deste mês — e a Finer One
> consegue pedir-mo sem que ninguém edite código?"*

A segunda metade da pergunta é a que estava por responder até 2026-08-24.

---

## 2. Os três eixos

Um mês é avaliado em três eixos **independentes**. A confusão entre dois deles foi a
causa do defeito.

| # | Eixo | Pergunta | Onde vive | Quem o determina |
|---|---|---|---|---|
| 1 | **Cobertura da fonte** | *"O ERP já entregou tudo o que este mês teve?"* | `coverage.completeThroughMonth` | O pipeline e o calendário |
| 2 | **Calendário** | *"Este mês já terminou?"* | o relógio (`referenceDate`) | O tempo |
| 3 | **Validação humana** | *"Alguém reviu e validou este mês?"* | `coverage.validatedThroughMonth` | Uma pessoa |

**Só os eixos 1 e 2 decidem se um dado pode ser PEDIDO.** O eixo 3 é informativo e não
tem — deliberadamente — efeito nenhum na disponibilidade das fontes.

### Porque é que isto importa

Até 2026-08-24, um único campo (`closedThroughMonth`) respondia aos eixos 1 e 3 ao mesmo
tempo. Como era mantido à mão e só avançava depois de o mês estar validado, uma validação
em atraso encolhia também a cobertura declarada. O resultado era um ciclo fechado:

```
julho > closedThroughMonth
  → receita de julho = "partial"          (dreEngine.sourceAvailability)
  → aplicabilidade do CMV = indeterminate (monthlyClosing)
  → item CMV = "pending", não "missing"
  → julho = "indeterminate", missingItems = []
  → "Dados a completar" não pede o CMV
  → ninguém lança o CMV
  → nada justifica avançar closedThroughMonth
  → julho > closedThroughMonth …
```

A única saída era editar `src/config/company.js`. Ou seja: **a configuração manual decidia
se o sistema sequer podia PEDIR o dado que faltava.**

---

## 3. Cobertura da fonte — `completeThroughMonth`

Até que mês é que a fonte entregou tudo. É um facto, não uma opinião.

```js
// src/config/company.js
historyCoverage: {
  firstCompleteMonth: "2026-04",
  partialMonths: ["2026-03"],
  completeThroughMonth: null,                       // PEDIDOS: deriva do calendário
  payables: { completeThroughMonth: "2026-06" },    // DESPESAS: conservador e explícito
}
```

### `null` significa *deriva do relógio*, nunca *ilimitado*

`sourceAvailability` resolve o limite por esta ordem:

1. `completeThroughMonth`, se declarado;
2. `closedThroughMonth` — **alias legado**, mantido para não partir configurações antigas;
3. o mês anterior ao de `referenceDate` (o mês civil corrente está sempre aberto);
4. **nada disso** → o mês é `partial`.

O passo 4 é o que torna `null` seguro. Antes de 2026-08-24 a guarda era saltada por
inteiro quando não havia limite, e **todos** os meses passavam a `real` — foi assim que a
âncora da DRE chegou a apontar para 2027-07, um mês que existia só porque há contas a
pagar com vencimento futuro. É a mesma regra do resto do projeto: ausência de prova nunca
é prova.

> O passo 3 depende de alguém injetar `referenceDate`. `buildSalesDataset` passou a
> injetá-la — uma só leitura do relógio por dataset, partilhada por todas as âncoras,
> para que duas leituras não caiam em lados opostos da meia-noite do dia 1.

### Porque é que os pedidos derivam e as despesas não

Naturezas diferentes, não inconsistência:

- **Pedidos** nascem no ato da venda. Um mês civil terminado tem os seus pedidos todos.
  Derivar do calendário é correto **e** dispensa manutenção.
- **Contas a pagar** chegam atrasadas. Uma fatura de julho pode entrar em setembro.
  Declarar julho completo seria afirmar o que não se sabe, por isso o limite fica
  conservador e explícito.

Consequência desejada: as despesas de julho continuam `partial` — que é a verdade — sem
que isso impeça o pedido do CMV, que depende só da receita.

---

## 4. Mês civil encerrado

Vem do calendário e de mais nada. `closedMonthKeys({ now, count })` devolve os últimos
meses civis **terminados**, do mais recente para o mais antigo, e o mês em curso nunca
entra.

Um mês terminado **sem um único documento** continua a ser um mês terminado. A janela não
depende de existirem movimentos — se dependesse, um mês vazio desapareceria em vez de ser
avaliado.

---

## 5. Mês financeiramente completo

Distinto de "encerrado", e a distinção passou a importar quando os eixos se separaram.

- **Encerrado** = o calendário virou a página.
- **Completo** = todos os requisitos obrigatórios aplicáveis estão satisfeitos, e pelo
  menos um foi efetivamente satisfeito.

`latestCompleteMonthKey(closings)` devolve o mais recente que cumpre as duas condições.

### A cláusula da vacuidade

Um mês **sem atividade nenhuma** é `COMPLETE` por vacuidade: sem receita, o CMV fica
`not_applicable`, não sobra requisito por satisfazer e o mês fecha — com
`totalComplete: 0`. É um veredito correto para *"este mês pode fechar?"* e péssimo para
*"onde ancoro os KPIs?"*: as margens de um mês sem vendas não significam nada.

Foi um defeito real, apanhado pela suite quando um abril vazio ganhou a um junho
movimentado. Daí a condição extra `totalComplete > 0`: pelo menos um requisito tem de ter
sido **satisfeito**, não apenas dispensado.

### Os dois meses chegam ao UI

| Campo | Pergunta que responde | Hoje |
|---|---|---|
| `financeiro.monthKey` | *"De que mês são estes números?"* | `2026-06` |
| `financeiro.civilMonthKey` | *"Que mês acabou e precisa de mim?"* | `2026-07` |
| `financeiro.referenciaAtrasada` | *"Os KPIs estão atrás do calendário?"* | `true` |
| `financeiro.closingPendente` | o fecho do mês encerrado, tal como o motor o produziu | julho, `incomplete` |

Enquanto o fecho era avançado à mão só depois de o CMV estar lançado, os dois primeiros
coincidiam sempre e um só campo bastava. Separados os eixos, divergem exatamente quando há
trabalho por fazer — que é quando o utilizador mais precisa de ver os dois.

**Regra:** julho não substitui junho nos KPIs de rentabilidade enquanto lhe faltar o CMV.
Junho responde *"quanto ganhámos"*; julho responde *"o que falta"*.

---

## 6. Requisitos e os seus estados

Catálogo em `CLOSING_REQUIREMENTS` (`src/utils/monthlyClosing.js`). Hoje tem uma entrada,
o CMV; acrescentar impostos sobre o lucro ou depreciações é acrescentar uma entrada, sem
tocar na agregação nem nos estados.

| Estado do item | Significado | Aparece em *Dados a completar*? | Gera alerta? |
|---|---|---|---|
| `complete` | dado presente e utilizável | sim, como concluído | não |
| `missing` | mês terminado, coberto, dado em falta | **sim, como pendência** | **sim** |
| `pending` | por apurar (ver abaixo) | sim, como "por validar" | não |
| `not_applicable` | provadamente não se aplica | sim, como não aplicável | não |

`pending` tem três origens, deliberadamente no mesmo estado — nenhuma é um dado em atraso:

1. o mês civil ainda está em curso — não é atraso, é cedo;
2. o mês é anterior à cobertura histórica — não há base para exigir;
3. a aplicabilidade não é determinável.

### Estados do mês

| Estado | Quando |
|---|---|
| `in_progress` | o mês civil não terminou |
| `incomplete` | terminou e falta dado obrigatório **confirmado** |
| `indeterminate` | terminou, mas não é possível afirmar se está completo |
| `complete` | terminou e tem tudo o que é exigido |

`incomplete` ganha a `indeterminate` de propósito: saber com certeza que falta um dado é
mais forte, e mais acionável, do que não saber se outro é exigível.

---

## 7. O requisito CMV

### Quando é exigível

A Finer One só pode **exigir** o CMV quando consegue provar que houve venda no mês. A
prova é a receita **bruta** — não a líquida, que depende também das contas a pagar, uma
fonte independente que nada tem a ver com a pergunta *"houve venda?"*.

| `revenue.grossAvailability` | `gross` | Aplicabilidade | Consequência |
|---|---|---|---|
| `real` | `≠ 0` | aplicável | **CMV é exigido** |
| `real` | `= 0` | não aplicável | zero real: não houve venda, não há CMV a pedir |
| `partial` | qualquer | indeterminada | receita subavaliada por definição: não se cobra |
| `unavailable` | — | indeterminada | sem fonte: nada a afirmar em nenhum sentido |

### Quando pedir input manual, e quando não

O motor lê `availability`, **nunca** a marca de quem a produziu. Não existe em
`monthlyClosing.js` uma única referência a Bling, Moloni, Primavera, PHC, Sage, Jasmin ou
TOConline — e não pode passar a existir.

- ERP que fornece CMV → `availability: "real"` → mês fecha, **nada é pedido**;
- CMV introduzido à mão → `availability: "manual"` → mês fecha na mesma;
- sem nenhum dos dois, num mês terminado com venda comprovada → `missing` → é pedido.

**Zero manual é um valor real.** `0` fecha o mês tal como `90000`. Nunca se usa *truthy*
para decidir se um dado existe, e ausência nunca é convertida em zero.

---

## 8. Quando alertar

`buildClosingAlerts` emite **apenas** para meses `incomplete` com `missingItems` não
vazio. Por construção, isso exclui:

- o mês corrente (`in_progress`);
- meses futuros (nunca entram na janela civil);
- meses fora da cobertura comprovada (`pending`, não `missing`);
- requisitos `not_applicable`.

Um alerta por mês, `id` derivado da chave do mês — não há duplicados. Severidade por
recência: o mês imediatamente anterior com pendência crítica é `danger`; os restantes,
`warning`.

Hoje: **julho `danger`, maio `warning`, junho nenhum.**

---

## 9. Como evitar a edição mensal de `company.js`

Era preciso editá-lo todos os meses porque `closedThroughMonth` era ao mesmo tempo o
sinal de cobertura e o de validação — e o produto ficava parado até alguém o avançar.

Já não é:

| Campo | Precisa de edição mensal? | Porquê |
|---|---|---|
| `completeThroughMonth` (pedidos) | **Não** — é `null`, deriva do calendário | um mês terminado tem os pedidos todos |
| `payables.completeThroughMonth` | Só quando a política mudar | conservador por natureza da fonte |
| `firstCompleteMonth` / `partialMonths` | Não — são factos históricos, fixos | descrevem o passado |
| `validatedThroughMonth` | Opcional, e **sem consequência funcional** | informativo |

O passo seguinte, ainda por fazer, é derivar `completeThroughMonth` de `meta.periodo` de
cada snapshot em vez do calendário — passando a cobertura de *inferência* a **medição**.
Ver §5 do documento de arquitetura, passo 5.

### O que continua a exigir uma pessoa

Lançar o CMV. Isso é uma decisão financeira, não uma configuração — e a Finer One agora
**pede-o**, em vez de ficar em silêncio à espera de uma edição de código.

---

## 10. Títulos por classificar — porque NÃO são um requisito de fecho

Em julho de 2026 há 3 títulos (1 554,35 BRL, 12,8 % das despesas operacionais do mês) cuja
categoria as regras da DRE não reconhecem.

Não entram em `missingItems`, e é deliberado:

- **Não são um valor que o utilizador possa introduzir.** Dois têm `categoriaNome: "Sem
  categoria"` na origem; um tem `"Taxas pagas"`, uma categoria real que o mapeamento da
  DRE não cobre. A resolução é corrigir a regra ou recategorizar no ERP — nunca escrever
  um número num campo.
- **Misturá-los com o CMV confundiria duas coisas diferentes.** *Dados a completar* é para
  valores que a pessoa fornece. Um item "3 títulos por classificar" ao lado de "CMV" faria
  parecer que ambos se resolvem da mesma maneira.
- **Não impedem o mês de fechar.** Julho está `incomplete` por causa do CMV e de mais nada.

O que fazem: marcam `availability.despesasOperacionais` como `partial` e disparam o aviso
`titulos-nao-classificados`, exposto como `classificacaoIncompleta`. Dois eixos separados
de propósito — **um mês pode estar fechado no tempo e mesmo assim ter classificação
incompleta**.

**UX recomendada** (por implementar): aviso operacional na página de Despesas, com ligação
para a lista filtrada por não classificados. Nunca em *Dados a completar*.

---

## 11. Invariantes — o que nenhuma alteração pode quebrar

Cada um tem teste. `src/utils/fechoContratoNovo.test.js`, salvo indicação.

1. Um mês civil encerrado com receita real e CMV ausente **pede** o CMV.
2. Consegue-o **sem** que ninguém edite `company.js`.
3. Uma validação humana em atraso **não** silencia pendências.
4. O mês corrente é `in_progress` e nunca entra em pendências.
5. Um mês futuro nunca é `real`, mesmo com títulos lá dentro.
6. Receita real zero → CMV `not_applicable`, não pendência.
7. Mês antes da cobertura → `pending`, sem alerta falso.
8. `partial` nunca vira `complete`.
9. CMV manual zero é valor real e fecha o mês.
10. CMV `real` vindo do ERP fecha o mês sem pedir nada.
11. Junho não muda por existirem dados de julho ou de agosto.
12. Um título com vencimento em 2027 não contamina junho.
13. A âncora dos KPIs é o último mês completo — e um mês completo por vacuidade não pode
    sê-lo.
14. Ausência de limite de cobertura nunca é lida como cobertura ilimitada
    (`coverageContract.test.js`).

---

## 12. Ver também

- `docs/COVERAGE_AND_CLOSING_ARCHITECTURE.md` — o diagnóstico e o que ainda falta
- `src/utils/fechoCivilVsValidacao.test.js` — o defeito, preservado como história
- `src/utils/coverageContract.test.js` — contrato da cobertura temporal
- `diagnostico/_configVivaFecho.mjs` — corre o caminho de produção sobre dados reais
- `docs/DATA_HEALTH_CONTRACT.md` — frescura × completude, o mesmo princípio de dois eixos
  aplicado ao transporte
