# Contrato da âncora financeira

> **Em vigor desde 2026-08-24.** Responde a: *de que mês são os KPIs de rentabilidade, e
> esse mês foi escolhido ou foi o que sobrou?*
> Pré-requisito: `docs/FINANCIAL_COMPLETENESS_CONTRACT.md` (os quatro eixos).

---

## 1. A seleção

```js
mesFechado   = latestAnchorEligibleMonthKey(closings) || latestUsableFinancialMonth(...)
anchorSource = elegível ? "eligible" : (recurso ? "fallback" : "none")
```

O segundo termo é um **recurso**: aceita o último mês com **receita real**, sem olhar às
contas a pagar nem ao CMV.

| `anchorSource` | Significado | `financeiro.metrics` |
|---|---|---|
| `eligible` | Passou em todos os critérios. É a referência oficial. | presente |
| `fallback` | Nenhum mês da janela é elegível. Números verdadeiros no que têm, **não é um fecho**. | presente |
| `none` | Não há mês utilizável. | `null` |

## 2. Campos em `financeiro`

| Campo | Responde a |
|---|---|
| `monthKey` | *de que mês são os KPIs?* |
| `anchorSource` | *foi escolhido ou foi o que sobrou?* |
| `anchorEligible` | o mesmo, em booleano |
| `anchorFinancial` | o veredito completo do mês âncora (bloqueios nomeados), ou `null` fora da janela |
| `civilMonthKey` | *que mês acabou e precisa de mim?* |
| `referenciaAtrasada` | *os KPIs são de um mês anterior ao que acabou?* |

**`referenciaAtrasada` e `anchorEligible` respondem a perguntas diferentes** e nenhum
substitui o outro. Foi assim que o defeito passava despercebido: com as contas a pagar
ausentes, a âncora era o próprio mês civil (logo `referenciaAtrasada: false`, literalmente
verdade) com deduções, EBITDA e resultado todos `unavailable`.

## 3. Matriz medida

Cenários em `src/services/financialAnchor.test.js`:

| # | Cenário | Âncora | `anchorSource` |
|---|---|---|---|
| A | Há mês elegível | esse mês | `eligible` |
| B | Cobertura das despesas atrasada | mês civil | `fallback` |
| C | Fontes completas, sem CMV | mês civil | `fallback` |
| D | Contas a pagar **ausentes** | mês civil | `fallback` |
| E | Só meses vazios | `null` | `none` |
| F | Conta a pagar com vencimento em 2027 | mês elegível anterior | `eligible` |

## 4. Regra para a UI

> **Nenhuma superfície pode apresentar um `fallback` como mês fechado.**

`performanceView.buildAnchorNotice(financeiro)` devolve a ressalva pronta — `null` quando
a âncora é elegível. Consumida pelo Resumo e pela Performance; ambos leem a **mesma**
decisão em vez de a reescrever.

| `anchorSource` | Badge | Texto |
|---|---|---|
| `eligible` | — | nenhuma ressalva |
| `fallback` | `Análise parcial` | "…não representam um fecho", com as rubricas em falta nomeadas |
| `none` | `Sem mês completo` | "Nenhum período tem dados suficientes para apurar rentabilidade." |

## 5. Vocabulário

"**fechado**" está proibido em copy visível: a Finer One **não tem ação formal de
encerramento contabilístico**, e afirmá-la seria mentir sobre o produto. Usar
"completo" / "elegível" / "análise parcial".

`real` é vocabulário do **motor** e nunca aparece como etiqueta — `AVAILABILITY_LABELS`
só nomeia os estados não-reais. No produto, "dados reais" significa outra coisa (fonte
ligada vs. demonstração) e as duas leituras não podem colidir no mesmo ecrã.
