# Classificação de despesas — auditoria sobre dados reais

> Snapshot de produção de 2026-08-23 (`meta.geradoEm: 2026-08-23T05:05:54.246Z`),
> 301 títulos, 300 depois de excluir 1 cancelado.
> Reproduzível: `node diagnostico/_classificacaoAudit.mjs <dir> [aaaa-mm]`
>
> **Nenhuma regra financeira foi alterada.** O comportamento atual está fixado em
> `src/utils/classificacaoReal.test.js` para que qualquer mudança seja deliberada.

---

## 1. Distribuição por grupo da DRE

| Grupo | Títulos | Valor | Entra na DRE operacional? |
|---|---:|---:|---|
| `comprasEstoque` | 40 | 1 395 803,02 | Não — vira CMV quando vendido |
| `naoClassificado` | **9** | **202 343,60** | **Não — cai fora** |
| `impostos` | 21 | 184 971,03 | Sim — dedução da receita |
| `retiradas` | 9 | 110 166,01 | Sim — abaixo do EBITDA |
| `pessoal` | 13 | 50 600,47 | Sim — operacional |
| `fretePago` | 140 | 24 140,00 | Não — exclusão deliberada |
| `fixas` | 39 | 15 786,80 | Sim — operacional |
| `administrativas` | 24 | 9 429,45 | Sim — operacional |
| `comissoes` | 4 | 6 842,41 | Sim — dedução da receita |
| `devolucoes` | 1 | 30,00 | Sim — dedução da receita |

`fretePago` é o grupo mais numeroso (140 títulos, 46,7% da contagem) e um dos menores em
valor. É esperado: são fretes unitários de encomenda.

## 2. Não classificados por mês

| Mês | Títulos | Valor |
|---|---:|---:|
| 2026-01 | 1 | 200,00 |
| **2026-04** | **2** | **200 241,90** |
| 2026-07 | 3 | 1 554,35 |
| 2026-08 | 3 | 347,35 |

**Abril, não julho, é o mês com maior exposição.** Dois títulos, 200 241,90 — e um deles
sozinho vale 200 000,00. Ambos com `categoriaId: 0`.

| Categoria não reconhecida | Títulos | Valor |
|---|---:|---:|
| `Sem categoria` | 7 | 201 907,25 |
| `Taxas pagas` | 1 | 236,35 |
| `Custo dos serviços prestados` | 1 | 200,00 |

---

## 3. Os três títulos de julho, em detalhe

Total: **1 554,35**. Nenhum é cancelado; todos com `situacao: 2`.

### A · `26256508150` — 200,00 — regra insuficiente

```
dataEmissao      2026-07-06     vencimento  2026-07-10
categoriaId      14722444211    categoriaNome  "Custo dos serviços prestados"
historico        "Ref. montagem mesas escritório."
contato          pessoa singular          formaPagamento  Pix
```

**Tipo A — a regra não contempla uma categoria que existe e é real.**

Onde deve entrar não é óbvio, e é essa a razão de não ter sido corrigido: o **nome** da
categoria diz custo direto de serviço, que é território de CMV; o **histórico** diz
montagem de mesas de escritório, que é território administrativo. As duas leituras dão
linhas diferentes da DRE.

> **Regra proposta (requer decisão):** mapear `"custo dos servicos prestados"` para
> `ADMINISTRATIVAS`, com base no histórico, **ou** deixar em `NAO_CLASSIFICADO` até
> existir uma linha de custo de serviço na DRE. Mandar para CMV é a única opção que este
> motor **não** suporta — o CMV é exclusivamente manual, por desenho.

### B · `26281773247` — 1 118,00 — dado ausente na origem

```
dataEmissao      2026-07-08     vencimento  2026-07-08
categoriaId      0              categoriaNome  "Sem categoria"
historico        "Ref. mão de obra alarme + DVR"
```

**Tipo B — não há o que inferir.** `categoriaId: 0` no Bling significa sem categoria
atribuída. O histórico fala de mão de obra, mas deduzir `PESSOAL` seria inventar: é um
serviço contratado a terceiros, não folha de pagamento — e a diferença muda o EBITDA na
mesma.

> **Ação: categorizar o título no Bling.** Não há regra de código a propor.

### C · `26319592678` — 236,35 — o dado existe e a regra não lhe chega

```
dataEmissao      2026-07-13     vencimento  2026-07-13
categoriaId      14722444247    categoriaNome  "Taxas pagas"
historico        "Ref. Encargos PFSP (prefeitura)."
contato.nome     "Simples Nacional"
```

**Tipo C — três sinais convergentes e nenhum casa com a regra:** a categoria diz taxa, o
histórico diz encargos de prefeitura, e o fornecedor chama-se literalmente *Simples
Nacional*. `classifyPayable` procura `"imposto"`, `"tributo"` e `"simples nacional"` na
categoria e no histórico — **e nunca olha para `contato`**.

⚠️ **A correção ingénua está errada.** Acrescentar `"taxa"` à regra de impostos manda isto
para `IMPOSTOS`, que **neste motor é uma dedução da receita** (a linha do Simples). Uma
taxa municipal não abate receita de venda: é uma despesa administrativa.

> **Regra proposta (requer decisão):** mapear `"taxas pagas"` para `ADMINISTRATIVAS`.
> Fica coerente com `"tarifa bancaria"`, que já lá está.
> **Não** acrescentar `"taxa"` a `IMPOSTOS`.
> Usar `contato.nome` como sinal de classificação é uma mudança maior e não é proposta
> aqui: introduz uma quarta fonte de verdade e o nome do fornecedor não é um facto
> contabilístico.

### Impacto se A e C fossem classificados

| | Hoje | Com A+C em administrativas |
|---|---:|---:|
| Despesas operacionais de julho | 12 127,28 | 12 563,63 |
| Disponibilidade da linha | `partial` | `partial` (B continua fora) |
| Diferença | | **+436,35 (+3,6 %)** |

Os 1 118,00 de B ficam fora enquanto não forem categorizados no Bling. Ou seja: **mesmo
resolvendo tudo o que é resolúvel em código, as despesas operacionais de julho continuam
`partial`.** O desbloqueio depende do Bling, não do motor.

### Linhas da DRE afetadas

Só uma, diretamente: **despesas operacionais**. Por `combineAvailability`, a marca
`partial` propaga depois para **EBITDA** e **resultado líquido** — que hoje já estão a
`null` por falta de CMV, e portanto ainda não se nota. **Notar-se-á no dia em que o CMV
de julho for lançado**: o mês passa a calcular, mas com o EBITDA marcado como parcial.

Os três títulos **não bloqueiam** o fecho de julho. `NAO_CLASSIFICADO` fica fora das
linhas e o único requisito de fecho é `cmv`.

---

## 4. Abril — o caso maior, por resolver

### `25608117127` — 200 000,00

```
dataEmissao   2026-04-20    categoriaId 0    historico "Ref. pagamento parcial Importação"
contato       OVERSEAS FOMENTO ADM E FINAN LTDA
```

O histórico diz **Importação**. `classifyPayable` tem `"importacao"` na regra de
compras/estoque — mas **só a procura na categoria**, nunca no histórico. Tipo C.

### `25489910273` — 241,90

```
dataEmissao   2026-04-06    categoriaId 0    historico "Ref. compra insumos (papel/cartucho)"
contato       KALUNGA SA
```

O histórico diz **insumos**, que também está na regra de compras/estoque — outra vez só
procurada na categoria. Tipo C.

**Efeito na DRE hoje: nenhum.** `COMPRAS_ESTOQUE` e `NAO_CLASSIFICADO` ficam **ambos** fora
das linhas operacionais, pelo que reclassificar não move um único número. O que muda é o
diagnóstico: 200 241,90 deixam de aparecer como "sem categoria reconhecida" e as despesas
operacionais de abril deixam de ser marcadas `partial` sem motivo real.

> **Regra proposta (requer decisão):** estender a regra 3 a procurar
> `"importacao"`, `"insumo"` e `"materia prima"` **também no histórico**, como já se faz
> para retiradas e devoluções. Resolve os dois títulos de abril e não altera valor nenhum.
> É a proposta de menor risco desta auditoria — mas continua a ser uma regra financeira.

---

## 5. Mapa completo — as 19 categorias reais

| Categoria (como o Bling a escreve) | Grupo | Regra que casa |
|---|---|---|
| Aluguel | `fixas` | `"aluguel"` |
| Comissão sobre vendas | `comissoes` | `"comissao"` |
| Compra de insumos e matéria prima | `comprasEstoque` | `"insumo"` |
| Compras de fornecedores | `comprasEstoque` | `"fornecedor"` |
| Distribuição de Lucros | `retiradas` | `"distribuicao de lucros"` |
| Fretes e seguros | `fretePago` | `"frete"` |
| Impostos sobre vendas | `impostos` | `"imposto"` |
| Material de escritório | `administrativas` | `"escritorio"` |
| Material de uso e consumo | `administrativas` | `"material de uso"` |
| Pró-labore | `pessoal` | `"pro-labore"` |
| Salários | `pessoal` | `"salario"` |
| Serviços contábeis | `fixas` | `"contab"` |
| Serviços de terceiros | `administrativas` | `"terceiros"` |
| Software | `fixas` | `"software"` |
| Tarifa bancária | `administrativas` | `"tarifa bancaria"` |
| Transferências | `naoClassificado` | *(nenhuma pela categoria)* |
| **Sem categoria** | `naoClassificado` | — |
| **Custo dos serviços prestados** | `naoClassificado` | — |
| **Taxas pagas** | `naoClassificado` | — |

### Dois casos em que o histórico ganha — e ganha bem

O único título de `Transferências` (30,00, março) sai como `devolucoes`, porque o
histórico diz *"Ref. a devolução de pagamento feio errado pelo cliente"*. E um título de
`Sem categoria` (13 520,00, abril) sai como `retiradas`, por *"Ref. adiantamento de
dividendos"*. **As duas classificações estão certas** — é a regra de histórico a fazer
exatamente o que deve.

⚠️ **Assimetria de observabilidade:** a retirada por histórico emite o aviso
`retirada-por-historico`; a devolução por histórico **não emite aviso nenhum**. Uma
classificação que contradiz a categoria devia ser sempre visível. Registado, não corrigido
— mexer nos avisos muda o que a DRE reporta.

---

## 6. Regras redundantes e sombreadas

`has()` usa `includes`, pelo que um termo que seja subcadeia de outro torna o segundo
inútil. Nenhuma destas afeta um único título hoje; ficam registadas para não serem
"descobertas" outra vez:

| Regra | Termo redundante | Porquê |
|---|---|---|
| compras | `"fornecedores"` | `"fornecedor"` já casa |
| compras | `"insumos"` | `"insumo"` já casa |
| impostos | `"impostos"` | `"imposto"` já casa |
| pessoal | `"salarios"` | `"salario"` já casa |
| administrativas | `"servicos de terceiros"` | `"terceiros"` já casa |
| administrativas | `"material de escritorio"` | `"escritorio"` já casa |
| retiradas (hist.) | `"dividendos"` | `"dividendo"` já casa |
| devoluções (hist.) | `"devolucao de venda"` | `"devolucao"` já casa |

**Não redundantes**, apesar de parecerem: `"comissao"`/`"comissoes"`,
`"devolucao"`/`"devolucoes"`, `"importacao"`/`"importacoes"` — a troca de `ao` por `oes`
quebra a subcadeia nos dois sentidos.

**Não foram encontradas regras sombreadas por ordem** — nenhuma categoria real casa com
duas regras em conflito.

---

## 7. Categorias do Bling que a conta ainda não usou

`classifyPayable` reconhece termos que não aparecem em nenhum dos 301 títulos:
`"folha de pagamento"`, `"encargo"`, `"licenca de software"`, `"mercadoria"`,
`"estoque"`, `"materia-prima"`, `"seguro"`, `"tributo"`, `"simples nacional"` (na
categoria), `"das simples"`, `"material de consumo"`.

Não é dívida: são regras defensivas para categorias plausíveis. Ficam registadas para que
uma futura limpeza saiba que **nunca foram exercitadas contra dados reais**.

---

## 8. Ver também

- `src/utils/classificacaoReal.test.js` — 31 testes de caracterização (as 19 categorias,
  os 3 títulos de julho, a precedência histórico × categoria)
- `src/utils/invariantesFinanceiros.contaminacao.test.js` — a forma de pagamento não
  classifica nada
- `diagnostico/_classificacaoAudit.mjs` — reproduz esta auditoria
- `docs/COVERAGE_AND_CLOSING_ARCHITECTURE.md` — porque é que julho não pede o CMV
