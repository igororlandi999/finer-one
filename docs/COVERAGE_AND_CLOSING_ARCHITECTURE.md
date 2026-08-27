# Cobertura e fecho — arquitetura

> **Estado: §4.1 IMPLEMENTADA em 2026-08-24.** A separação dos dois eixos está em
> produção local; o resto do documento continua a ser proposta.
>
> O contrato que vigora hoje, com nomes de campos e regras exatas, está em
> **`docs/MONTHLY_CLOSING_CONTRACT.md`**. Este documento mantém-se como o **diagnóstico**
> — é onde o problema está explicado por inteiro, com as medições que o provaram — e como
> o roteiro do que ainda falta (§5, passos 3 a 6).
>
> O que mudou face à proposta original: o eixo declarado por uma pessoa **não** migrou
> para o documento do Drive (passo 4, que exigiria uma rota de escrita pública — ver §5).
> Ficou em `company.js` com um nome honesto, `validatedThroughMonth`, e — o essencial —
> **deixou de ter poder para calar pendências**. O deadlock da §1 desapareceu sem que
> fosse preciso resolver a questão da escrita.
>
> Levantado na auditoria de 2026-08-23, com dados de produção. Corrigido em 2026-08-24.

---

## 1. O sintoma que trouxe aqui

`src/config/company.js` tem uma linha que decide mais do que parece:

```js
closedThroughMonth: "2026-06",
```

Hoje é 23 de agosto de 2026. Julho terminou há 54 dias. As três fontes estão frescas e
declaram-se completas (`parcial: false` nas três, snapshots gerados nessa madrugada).
Ainda assim, para a aplicação, **julho não existe como mês avaliável**:

| Superfície | O que mostra sobre julho |
|---|---|
| Dados a completar | `status: indeterminate`, selo **"Por validar"**, `porPreencher: **0**` |
| Resumo | *"Não foi possível validar todos os dados de julho de 2026"* |
| Performance | mostra **junho**; julho não é sequer candidato |
| Alertas | **nenhum** alerta para julho — o único de fecho é `closing-2026-05` |

E o item de CMV de julho fica assim:

```jsonc
{ "key": "cmv", "required": true, "status": "pending", "source": null, "value": null }
```

`pending`, não `missing`. E é essa palavra que fecha o círculo:

**a aplicação nunca pede o CMV de julho.** Não há pendência, não há contagem, não há
CTA. O utilizador não tem por onde saber que falta — e mesmo que soubesse, o mês não
avançava, porque o que o desbloqueia não é um dado: é **alguém editar um ficheiro de
código**.

Para comparação, maio comporta-se como se espera:

```jsonc
{ "key": "cmv", "required": true, "status": "missing" }   // -> alerta closing-2026-05
```

Maio é `incomplete` e gera alerta. Julho, com exatamente a mesma falta, é `indeterminate`
e não gera nada. A diferença entre os dois não está nos dados. Está em `closedThroughMonth`.

### 1.1 Verificado: julho está tecnicamente coberto, por inteiro

Reverificação de 23/08/2026, contando os pedidos do snapshot de produção por mês:

| Mês | Pedidos | Dias distintos | Intervalo | Tratado como |
|---|---|---|---|---|
| 2026-03 | 52 | 9 | 03-22 .. 03-31 | parcial — **e é mesmo** |
| 2026-04 | 197 | 26 | 04-01 .. 04-30 | completo |
| 2026-06 | 216 | 24 | 06-01 .. 06-30 | completo |
| **2026-07** | **197** | **24** | **07-01 .. 07-31** | **parcial** |
| 2026-08 | 220 | 15 | 08-03 .. 08-21 | parcial — mês em curso |

Julho vai de ponta a ponta do mês, com volume e densidade de dias equivalentes a junho e
abril, ambos tratados como completos. O snapshot declara `meta.parcial: false`.

Ou seja: **o rótulo `partial` de julho não vem de nenhuma lacuna nos dados — vem
inteiramente da configuração.** Março, por contraste, é genuinamente parcial (9 dias, a
começar a 22) e está corretamente declarado em `partialMonths`. A configuração *consegue*
exprimir parcialidade real; o problema é `closedThroughMonth` fazer três trabalhos ao
mesmo tempo — cobertura temporal, marcação de parcialidade e fecho contabilístico.

Isto tem uma consequência de sequenciamento para a §5: o estado `aberto` (passo 6) só
resolve julho **depois** de a cobertura passar a ser derivada de `meta` (passo 5).
Enquanto a cobertura for declarada por este campo, julho continua parcial por construção,
independentemente do estado de fecho.

---

## 2. O diagnóstico: um campo, duas perguntas

`closedThroughMonth` responde hoje, sozinho, a duas perguntas que **não são a mesma**:

| Pergunta | Natureza | Quem sabe a resposta |
|---|---|---|
| **Cobertura temporal** — os dados alcançam este mês, e por inteiro? | Técnica, verificável | O pipeline. Cada rebuild já sabe a janela que percorreu |
| **Fecho contabilístico** — este mês foi validado por uma pessoa? | Humana, declarativa | O utilizador, uma vez por mês |

Colapsá-las tem três consequências, todas visíveis hoje:

1. **Um mês tecnicamente completo fica bloqueado por falta de um gesto humano** — e sem
   que a aplicação peça esse gesto. É o deadlock da §1.
2. **Um mês declarado fechado passa a ser afirmado como real, mesmo que o snapshot esteja
   incompleto.** `meta.parcial === true` não veta nada hoje. As duas informações existem
   e nunca se cruzam.
3. **Adicionar uma empresa exige editar código.** O valor é por empresa e vive num módulo
   de configuração compilado no bundle.

Há ainda um quarto efeito, já registado no backlog como P0.1-bis: pôr o campo a `null`
não significa "nada fechado" — significa, no caminho de produção, **cobertura infinita**.
`sourceAvailability` salta a guarda e todos os meses viram `real`, incluindo 2027-07, que
só existe porque há contas a pagar com vencimento futuro. Um campo cuja ausência abre
tudo é um campo que não pode ser opcional — e isso, por si, já diz que o modelo está a
carregar peso a mais.

---

## 3. O que já está construído e a apontar nesta direção

Nada disto é greenfield. As peças existem:

| Peça | Onde | Estado |
|---|---|---|
| Cobertura por fonte, com herança | `payablesCoverage()` em `dreEngine.js` | Implementada, usada só para `payables` |
| Sobreposição declarada por fonte | `coverage.payables` em `company.js` | Escrita, comentada |
| Metadata por fonte | `meta.geradoEm`, `meta.parcial` | Emitida pelos três rebuilds, transportada, apresentada |
| Documento humano mensal no Drive | recurso `ajustes-manuais` | Existe, tem manutenção mensal, já guarda o CMV |
| Testes caracterizadores do defeito | `coverageContract.test.js` | 20 testes a fixar o comportamento atual |

O documento de ajustes manuais é a peça decisiva: **já existe um sítio, fora do código,
onde uma pessoa escreve uma vez por mês a informação de fecho daquele mês.** O CMV já lá
está. O mês de fecho é exatamente a mesma classe de dado — declaração humana, mensal,
por empresa — e está no sítio errado.

---

## 4. Modelo proposto

### 4.1 Separar os dois eixos

```js
// DERIVADO do pipeline. Nenhuma pessoa escreve isto.
coverage: {
  orders:      { de: "2026-03-01", ate: "2026-08-21", parcial: false },
  payables:    { de: "2026-01-05", ate: "2026-08-21", parcial: false },
  receivables: { de: "2026-01-05", ate: "2026-08-21", parcial: false },
}

// DECLARADO por uma pessoa, no documento do Drive. Um valor por empresa.
{ "companyId": "overcel", "closedThroughMonth": "2026-06", "months": { … } }
```

Um mês é **tecnicamente coberto** quando todas as fontes de que a linha depende o
alcançam por inteiro e nenhuma se declara parcial. É **contabilisticamente fechado**
quando o utilizador o declarou. As duas propriedades combinam-se, não se substituem:

| Coberto | Fechado | Estado do mês | O que a aplicação faz |
|---|---|---|---|
| não | — | `unavailable` / `partial` | não afirma números fechados |
| **sim** | **não** | **`aberto`** | **calcula, marca como não validado, e PEDE o que falta** |
| sim | sim | `real` | apresenta como período resolvido |

A linha a negrito é a que hoje não existe — e é exatamente onde julho está.

### 4.2 O que muda para o utilizador

Julho passaria a: **coberto, não fechado, CMV `missing`** → aparece em *Dados a completar*
com "1 dado por preencher", gera alerta de fecho, e tem CTA. Preenchido o CMV, o mês fica
elegível a ser declarado fechado — no mesmo documento, sem tocar em código.

### 4.3 Porque é ERP-agnóstico

O contrato é *"cada fonte declara a janela que percorreu e se chegou ao fim"*. Nada nele
menciona Bling, `/contas/pagar` ou Apps Script. Um conector para outro ERP cumpre o
contrato emitindo `meta.periodo` e `meta.parcial` — que é o mesmo que os rebuilds já
escrevem hoje no log. A cobertura deixa de ser uma opinião mantida à mão e passa a ser
uma **medição**.

---

## 5. Ordem de execução, por risco crescente

| # | Passo | Muda números? | Risco |
|---|---|---|---|
| 1 | Cada rebuild passa a emitir `meta.periodo = { de, ate }` | Não — puramente aditivo | Baixo |
| 2 | `coverage` aceita sobreposição por fonte (generalizar `payablesCoverage`) | Não, se os valores forem os atuais | Baixo |
| 3 | `meta.parcial === true` **veta** declarar o mês como real | **Sim** — pode tornar meses parciais | Médio |
| 4 | Fecho contabilístico migra de `company.js` para o documento do Drive | **Sim** — muda quem controla | Médio |
| 5 | Cobertura passa a ser **derivada** de `meta.periodo`; `company.js` perde `firstCompleteMonth` e `partialMonths` | **Sim** | Alto |
| 6 | Estado `aberto` (coberto ∧ não fechado) chega às superfícies | **Sim** — resolve o deadlock da §1 | Alto |

O passo 1 é seguro e independente: pode ser feito sem decisão financeira e destrava a
medição de todos os outros. Os passos 3 a 6 exigem decisão explícita.

### Perguntas por responder antes do passo 5

- **Fontes com históricos diferentes.** `firstCompleteMonth` é hoje único. Os pedidos
  alcançam 2026-03; as contas a pagar alcançam 2026-01. Um valor global obriga a escolher
  o mais restritivo e deita fora histórico real da outra fonte. Com cobertura por fonte,
  a resposta é por linha da DRE: a receita usa a janela dos pedidos, as deduções a das
  contas a pagar, e o lucro bruto a interseção. Isto **é** a semântica que
  `combineAvailability` já implementa — só falta alimentá-la com dados por fonte.
- **Escrita no documento do Drive.** O passo 4 pressupõe uma via de escrita que hoje não
  existe: os ajustes manuais são lidos, não escritos, pela aplicação. Enquanto não houver
  escrita segura e autenticada, migrar o fecho para lá troca um problema por outro.
  Ver `docs/APPS_SCRIPT_SEGURANCA.md` — o Web App é anónimo, e uma rota de escrita nele
  seria uma rota de escrita pública.
- **Retroatividade.** Declarar um mês fechado e depois reabri-lo é legítimo (uma correção
  contabilística acontece). O modelo tem de suportar reabrir sem reescrever histórico.

---

## 6. O que NÃO fazer

> Os dois primeiros pontos foram **resolvidos** em 2026-08-24 e ficam aqui com a
> resolução ao lado, porque a razão de cada um continua válida — mudou o que a torna
> segura, não o perigo que descrevia.

- ~~**Não pôr `closedThroughMonth` a `null`.**~~ **RESOLVIDO.** Era verdade porque `null`
  desarmava a guarda inteira e libertava todos os meses, incluindo 2027. `sourceAvailability`
  passou a tratar limite desconhecido como `partial`, e `buildSalesDataset` passou a
  injetar `referenceDate`. Com as duas, `completeThroughMonth: null` significa agora o que
  sempre devia ter significado: *deriva do calendário*.
- ~~**Não avançar o valor para `"2026-07"` como atalho.**~~ **RESOLVIDO, e o aviso estava
  certo:** avançá-lo faria julho substituir junho nos KPIs com lucro bruto, EBITDA e
  resultado líquido a `null`. Foi por isso que a correção **não** avançou o fecho: separou
  os eixos e fez a âncora dos KPIs ser o último mês **financeiramente completo**
  (`latestCompleteMonthKey`). Julho passou a ser pedido sem passar a ser exibido.
- **Não derivar o fecho contabilístico do calendário.** Continua válido e é a linha que
  divide as duas metades desta arquitetura. O calendário decide o que pode ser **pedido**;
  só uma pessoa decide o que está **validado**. `validatedThroughMonth` existe para não se
  perder essa distinção — e não tem, deliberadamente, efeito nenhum na disponibilidade.
- **Não transformar os títulos por classificar num requisito de fecho.** Não são um valor
  que o utilizador possa introduzir: são uma categoria que as regras da DRE não reconhecem.
  Pedi-los em *Dados a completar* misturaria-os com o CMV, que é outra coisa. Ver §10 do
  contrato.

---

## 7. Ver também

- `BACKLOG-TECNICO.md` → C7F.6 · P2.1-bis (proposta original, de que este documento é a
  versão desenvolvida)
- `src/utils/coverageContract.test.js` (20 testes caracterizadores do defeito P0.1-bis)
- `docs/DATA_HEALTH_CONTRACT.md` (frescura × completude — o mesmo princípio de dois eixos,
  já aplicado ao transporte)
- `diagnostico/julhoElegibilidade.mjs` e `diagnostico/_superficiesJulho.mjs` (medem, com
  dados reais, tudo o que está afirmado na §1)

---

## Sequela: cobertura resolvida, completude por resolver (2026-08-24, tarde)

A separação dos eixos descrita acima resolveu o deadlock e destravou o pedido do CMV de
julho. Expôs, porém, um segundo defeito que estava escondido atrás do primeiro.

Enquanto `closedThroughMonth` era avançado à mão **só depois** de o CMV estar lançado, o
último mês com requisitos satisfeitos era, por construção, também o último mês com as
fontes completas. Separados os eixos, deixam de coincidir — e `latestCompleteMonthKey`,
que só olha para os requisitos, passou a poder eleger como âncora dos KPIs um mês cujas
despesas operacionais e deduções continuavam `partial`.

Medido em julho/2026 com CMV sintético em memória: `closing.status: complete`,
`financeiro.monthKey: 2026-07`, `ebitda: partial`.

Diagnóstico e correção em **`docs/FINANCIAL_COMPLETENESS_CONTRACT.md`**.
Reprodução: `diagnostico/completudeFinanceiraJulho.mjs`.
