# Contrato de completude financeira

> **Estado: em vigor desde 2026-08-24.**
> Complementa `docs/MONTHLY_CLOSING_CONTRACT.md`, que responde por um eixo só — o dos
> requisitos do utilizador. Este documento responde pelos outros três e, sobretudo,
> declara que **não podem voltar a ser colapsados num só**.

---

## 1. A pergunta que este contrato responde

> *"Este mês pode sustentar os KPIs de rentabilidade — margem, EBITDA, resultado
> líquido — ou ainda não?"*

Até 2026-08-24 a plataforma respondia a esta pergunta com a resposta a outra:
*"o utilizador preencheu tudo o que lhe foi pedido?"*.

---

## 2. O defeito, medido

O catálogo de requisitos de fecho (`CLOSING_REQUIREMENTS`) tem hoje **uma** entrada: o
CMV. Logo, lançar o CMV esgotava o catálogo, o mês ficava `CLOSING_STATUS.COMPLETE`, e
`latestCompleteMonthKey` promovia-o imediatamente a âncora dos KPIs.

Reproduzido em julho/2026 com dados reais e um CMV **sintético injetado só em memória**
(`diagnostico/completudeFinanceiraJulho.mjs`):

| linha | valor | availability |
|---|---:|---|
| receita bruta | 172 899,40 | `real` |
| deduções | 20 882,02 | **`partial`** |
| receita líquida | 152 017,38 | `partial` |
| CMV (sintético) | 111 111,11 | `manual` |
| lucro bruto | 40 906,27 | `partial` |
| despesas operacionais | 12 127,28 | **`partial`** |
| **EBITDA** | 28 778,99 | **`partial`** |
| **resultado líquido** | 28 778,99 | **`partial`** |

E, ainda assim:

```
closing.status          complete
latestCompleteMonthKey  2026-07
financeiro.monthKey     2026-07   <- os KPIs de rentabilidade passavam para julho
alerta de julho         desaparecia
```

**Informar o CMV resolve o CMV. Não torna completas as contas a pagar de julho**, que a
cobertura declara fechadas só até junho — porque uma fatura de fornecedor de julho pode
chegar em agosto.

---

## 3. Os quatro eixos

| # | Eixo | Pergunta | Onde vive | Quem o resolve |
|---|---|---|---|---|
| 1 | **Requisitos** | *"O utilizador preencheu tudo o que lhe foi pedido?"* | `closing.status` (`monthlyClosing.js`) | O utilizador |
| 2 | **Fontes** | *"As fontes necessárias estão completas?"* | `financial.sourceCompleteness` | O ERP e o tempo |
| 3 | **Análise** | *"A análise financeira do mês está completa?"* | `financial.financialAnalysisStatus` | Os dois anteriores |
| 4 | **Âncora** | *"Este mês pode ser a referência oficial da rentabilidade?"* | `financial.anchorEligible` | Os três anteriores + atividade |

Os eixos 2, 3 e 4 vivem em `src/utils/financialCompleteness.js`, anexados a cada fecho
como `closing.financial` por `buildSalesDataset`.

### Porque é que os quatro não colapsam

- **1 ≠ 2.** O CMV é um requisito **do utilizador**, não uma fonte. Contá-lo em
  `sourceCompleteness` faria um mês com o ERP inteiro em mãos aparecer como
  "fontes incompletas" — mandando procurar no ERP um dado que o ERP não tem.
- **2 ≠ 3.** A análise inclui o CMV; as fontes não. Um mês com as fontes todas fechadas
  e o CMV por lançar tem `sourceCompleteness: complete` e
  `financialAnalysisStatus: unavailable`.
- **3 ≠ 4.** Um mês **sem atividade nenhuma** pode ter a análise completa por vacuidade
  e continua a não servir de âncora: as margens de um mês sem vendas não significam nada.

---

## 4. Linhas essenciais

`ESSENTIAL_LINES` — as linhas **base** da DRE cuja ausência torna a rentabilidade do mês
uma afirmação insegura:

| linha | origem |
|---|---|
| `revenueGross` — receita bruta | fonte |
| `deductions` — deduções | fonte |
| `cmv` — CMV | **requisito** |
| `operatingExpenses` — despesas operacionais | fonte |
| `withdrawals` — retiradas de sócios | fonte |

**Deliberadamente fora:**

- `lucroBruto`, `ebitda`, `resultadoLiquido` — são **combinações** das linhas acima.
  Avaliá-las contaria o mesmo defeito duas vezes e esconderia qual a linha responsável.
- `freteVenda` — informativo desde a F3, não entra em dedução nenhuma. Um pedido sem o
  campo de frete não pode bloquear o mês.

Contam como dado utilizável: `real`, `manual`, `mixed`. **`partial` não conta** — um
mínimo conhecido não é o total do mês.

---

## 5. O que bloqueia cada estado

| Bloqueio (`ANCHOR_BLOCKER`) | Quando | Quem resolve |
|---|---|---|
| `mes_em_curso` | o mês civil ainda não terminou | o tempo |
| `requisitos_por_preencher` | `closing.status === incomplete` | **o utilizador** |
| `requisitos_por_apurar` | `closing.status === indeterminate` | o ERP / a cobertura |
| `sem_atividade` | mês `complete` com `totalComplete === 0` | ninguém — é o que é |
| `analise_incompleta` | alguma linha essencial não é utilizável | o ERP / a classificação |

### Causas por linha (`LINE_CAUSE`)

Um mês pode estar parcial pelos dois motivos ao mesmo tempo, e reportar só o primeiro
mandaria o utilizador resolver metade:

| causa | significado | sinal de origem |
|---|---|---|
| `cobertura` | o período ainda não fechou na fonte | `availability.payablesCoverage` |
| `classificacao` | há títulos cuja natureza não foi reconhecida | warning `titulos-nao-classificados` |
| `sem_fonte` | a fonte não existe para o período | `availability` da linha |
| `por_informar` | requisito do utilizador ainda por preencher | `availability` da linha |

Só `operatingExpenses` carrega o eixo da classificação — é a única linha cuja soma
exclui títulos por reconhecer (`dreEngine.dispClassificacaoOpex`).

---

## 6. `NOT_APPLICABLE` legítimo não bloqueia

Num mês com receita real **zero**, o motor de fecho declara o CMV `not_applicable`: não
houve venda, não há custo de mercadoria vendida a pedir. A `availability` da linha
continua `unavailable` — o `dreEngine` não conhece o eixo da aplicabilidade.

`buildFinancialCompleteness` lê `closing.items` e retira essa linha da avaliação
(`notApplicable: true`). Sem isso, o mês era reportado com *"CMV por preencher"*: pedia
um dado que a própria plataforma tinha acabado de declarar inexigível.

**O que não muda:** esse mês continua fora dos KPIs — mas por `sem_atividade`, que é a
razão verdadeira.

> **Dívida conhecida.** As linhas derivadas (lucro bruto, EBITDA) continuam `null` nesse
> mês, porque o CMV é `null`. Torná-las calculáveis exigiria o `dreEngine` tratar
> "não aplicável" como zero económico — **mudança de semântica da DRE**, não correção
> desta camada. Não foi feita.

---

## 7. O que é automático e o que não é

| Facto | Automático? | Fonte |
|---|---|---|
| Cobertura dos **pedidos** | **Sim** | `completeThroughMonth: null` → deriva do calendário |
| Cobertura das **contas a pagar** | **Não** | `payables.completeThroughMonth`, mantido à mão |
| Classificação dos títulos | Sim (regras) | `classifyPayable`; títulos por reconhecer ficam de fora |
| CMV | Não | requisito do utilizador (ou de uma futura integração) |
| Elegibilidade como âncora | **Sim** | derivada dos anteriores, sem manutenção |

### Porque é que a cobertura das contas a pagar continua manual

Auditado em 2026-08-24 (`diagnostico/julhoTitulosECobertura.mjs`). O snapshot de
despesas declara:

```json
{"geradoEm":"2026-08-24T05:05:58.114Z","totalTitulos":301,"parcial":false}
```

- `geradoEm` mede **frescura** — quando o snapshot foi gerado, não o que ele cobre.
- `parcial` mede se o **rebuild terminou**, não se o mês está contabilisticamente
  completo. Um rebuild completo de um mês incompleto tem `parcial: false`.
- A **última competência presente** nos títulos é `2027-07` — um vencimento futuro.
  Derivar cobertura daí reintroduziria exatamente o defeito de 2027-07 e declararia
  julho completo cedo demais.
- `meta.periodoAtualizado`, `periodoInicio` e `periodoFim` **não existem**.

**Não há hoje sinal nenhum que diga "todas as faturas deste mês já entraram".** Isso é
um facto contabilístico, não um facto do snapshot. O campo continua manual **por falta
de sinal, não por falta de código**.

---

## 8. Impacto na UX

| Superfície | Antes | Depois |
|---|---|---|
| **Resumo** (fecho mensal) | "Julho de 2026 concluído — os dados necessários estão completos" | "Julho de 2026 com análise parcial", com as causas por linha |
| **Dados a completar** | "Todos os dados necessários estão disponíveis." | "Todos os dados pedidos foram preenchidos." + ressalva `Análise parcial` quando as **fontes** não estão completas |
| **Performance** | ancorava no mês com requisitos satisfeitos | ancora no mês **elegível** |
| **Alertas** | o alerta do mês desaparecia assim que o CMV entrasse | passa a existir um segundo alerta, `info`, sem ação — o mês continua descrito sem ser cobrado |

A ressalva de "Dados a completar" lê **`sourceCompleteness`**, não
`financialAnalysisStatus`: essa página já responde pelo eixo dos requisitos, e o que lhe
falta dizer é a parte que o utilizador **não** consegue resolver.

---

## 9. Onde isto vive

| Ficheiro | Papel |
|---|---|
| `src/utils/financialCompleteness.js` | os eixos 2, 3 e 4; `latestAnchorEligibleMonthKey` |
| `src/utils/monthlyClosing.js` | o eixo 1; `latestCompleteMonthKey` **deprecado como âncora** |
| `src/services/blingDataService.js` | compõe os dois e escolhe a âncora |
| `src/utils/closingSummaryView.js` | copy do Resumo |
| `src/utils/completionDataView.js` | copy de "Dados a completar" |
| `src/utils/closingAlerts.js` | os dois tipos de alerta de fecho |

### Testes que travam o contrato

| Ficheiro | O que protege |
|---|---|
| `src/utils/financialCompleteness.test.js` | a **regra** — matriz A–H da âncora, regras mínimas, decomposição de causas |
| `src/services/ancoraKpis.contrato.test.js` | a **ligação** — que o serviço usa mesmo o seletor certo, fim a fim |

Uma regressão que trocasse `latestAnchorEligibleMonthKey` de volta por
`latestCompleteMonthKey` passaria em todos os testes unitários e falharia no segundo.

---

## 10. Decisões de negócio em aberto

1. **Materialidade da classificação.** Três títulos de julho (R$ 1 554,35 = **0,38%**
   dos títulos do mês) tornam `operatingExpenses` `partial` e, por isso, bloqueiam a
   elegibilidade de julho como âncora. Não existe limiar de materialidade: **qualquer**
   título por classificar bloqueia. É o comportamento conservador e é o atual; se se
   quiser um limiar, é uma decisão contabilística, não técnica.
2. **Quem declara que um mês de contas a pagar está fechado.** Enquanto não existir essa
   ação (ou um campo do ERP que a suporte), `payables.completeThroughMonth` continua a
   ser editado à mão em `src/config/company.js`.

---

## 11. Sequela: o recurso da âncora e a materialidade (2026-08-24, sessão seguinte)

Três frentes fechadas depois de o contrato acima entrar em vigor:

### 11.1 O recurso da âncora deixou de ser silencioso

`financeiro.monthKey` sai de `mesElegivel || mesUsavel`. O segundo termo aceita o último
mês com **receita real**, sem olhar às contas a pagar nem ao CMV — e chegava à UI
indistinguível do primeiro. Contrato completo e matriz medida em
**`docs/FINANCIAL_ANCHOR_CONTRACT.md`**.

### 11.2 Materialidade: factos, sem política

`utils/classificationCompleteness.js` mede, por mês: `unclassifiedCount`,
`unclassifiedAmount`, `classifiedAmount`, `totalRelevantAmount`,
`deliberatelyExcludedAmount` e `unclassifiedRatio`.

**Não existe limiar de materialidade e este módulo não o cria.** Um título de R$ 1 e um
de R$ 100 000 continuam a produzir o mesmo bloqueio — o que mudou é que o peso deixou de
ser invisível. `deliberatelyExcludedAmount` está separado porque o denominador de
qualquer rácio futuro depende de incluir ou não compras/estoque e frete pago, e essa
escolha é da política, não da medição.

Medido em produção: julho **0,38%** (3 títulos, R$ 1 554,35), agosto **0,10%**
(3 títulos, R$ 347,35).

### 11.3 Onde os títulos por classificar aparecem

Página **Despesas**, secção *Movimentos por classificar* — discreta, informativa e **sem
ação**: não há edição (não existe fluxo seguro), não há link para o ERP (não há contrato
de URL por título que se possa construir sem o inventar) e não se sugere categoria
nenhuma (sugerir é classificar).

**Não** em "Dados a completar": ali só entram requisitos **do utilizador**, e classificar
resolve-se no sistema de origem.
