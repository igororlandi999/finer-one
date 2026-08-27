# Contrato de cobertura das fontes

> **Em vigor desde 2026-08-24.** Responde a: *o que é que sabemos, e o que é que NÃO
> sabemos, sobre a completude de uma fonte?*

---

## 1. Quatro eixos que não são o mesmo

| Eixo | Pergunta | Onde vive | Automático? |
|---|---|---|---|
| **freshness** | *quando foi gerado o snapshot?* | `meta.geradoEm` | sim |
| **rebuildComplete** | *o processo de recolha chegou ao fim?* | `meta.parcial`, `meta.listagemTruncada` | sim |
| **dataRange** | *que datas vieram nos dados?* | `meta.intervalos` | sim |
| **accountingCoverage** | *o mês está contabilisticamente completo?* | `coverage.completeThroughMonth` | **NÃO** |

**Os três primeiros são factos do snapshot. O quarto não é.**

## 2. `dataRange` ≠ `accountingCoverage`

A tentação óbvia é derivar cobertura do `vencimento.max`. **É errado, e já custou uma
sessão a este projeto:**

- `vencimento.max = 2027-07` não significa que a empresa tem despesas até 2027 —
  significa que há **um** título com vencimento futuro. Foi exatamente assim que a âncora
  da DRE saltou para `2027-07`.
- `vencimento.max = 2026-07` não significa que julho está completo — significa que o
  último título **que já chegou** é de julho. Uma fatura de fornecedor de julho pode
  chegar em agosto.

> Range mede **o que chegou**. Cobertura afirma **que já chegou tudo**. Nenhum campo de um
> snapshot sabe a segunda coisa.

## 3. Metadata do snapshot de despesas

Emitida por `apps-script/Despesasbackend.js` (**local; produção continua na versão 11**):

| Campo | Eixo | Notas |
|---|---|---|
| `geradoEm` | freshness | já existia |
| `parcial` | rebuildComplete | orçamento de **tempo** esgotado |
| `listagemTruncada` | rebuildComplete | teto de `MAX_PAGES` — **novo**; truncava em silêncio (P3.1) |
| `paginasLidas` | rebuildComplete | novo |
| `filtroData: null` | — | a listagem de `/contas/pagar` **não usa filtro de data**; declarado para ninguém assumir um intervalo que nunca existiu |
| `intervalos` | dataRange | `{min, max, comValor}` por campo de data — **novo** |

`comValor` mede **hidratação**: distingue "o título não tem esta data" de "não há títulos".

Nenhum campo existente foi renomeado ou removido — `lerGeradoEm`, `check:data` e a faixa
de frescura continuam a ler o que sempre leram.

## 4. Observabilidade do envelhecimento

`utils/coverageDiagnostics.js` → `financeiro.coverageDiagnostics`. **Contrato interno:**
nenhuma tela o mostra e **nada na disponibilidade muda por causa dele**.

| Campo (por fonte) | Significado |
|---|---|
| `declared` | o que está na configuração; `null` = deriva do relógio |
| `derived` | `true` quando deriva — **nunca envelhece** |
| `effectiveThroughMonth` | o limite que o motor vai mesmo usar |
| `coverageLagMonths` | meses civis **já encerrados** para lá da cobertura declarada |
| `coverageNeedsReview` | `lagMonths > 0` — sinal para humanos |

Estado em 2026-08-24: pedidos `derived`, lag 0. Contas a pagar declaradas em `2026-06`,
**lag 1** (julho terminou e continua fora). Não é um erro — pode ser a verdade. O que
mudou é que deixou de ser invisível: uma configuração esquecida durante meses tinha
exatamente o mesmo aspeto de uma configuração conservadora e correta.

## 5. O que continua a depender de uma pessoa

`payables.completeThroughMonth` continua editado à mão em `src/config/company.js`, **por
falta de sinal e não por falta de código**. Avançá-lo é afirmar "todas as faturas deste
mês já entraram" — um facto contabilístico.

Quando existir uma ação de "confirmar mês de despesas" no produto (ou um campo do ERP que
a suporte), `coverageNeedsReview` é o gatilho natural para a pedir.
