# Cobertura confirmada das despesas — contrato

> Implementado em **26/08/2026**. **Nada publicado**: produção corre a versão 12 do Apps
> Script, que não tem a escrita de cobertura.

---

## 1. A pergunta que isto responde

> "Até que mês é que os documentos relevantes de despesas já estão disponíveis para
> análise, segundo quem conhece a operação?"

E, com igual importância, o que **não** responde. Confirmar cobertura **não** é:

- fechar o mês;
- fecho ou encerramento contabilístico;
- validação da contabilidade;
- afirmar que os valores estão corretos;
- afirmar que não existem documentos desconhecidos;
- aprovação fiscal.

A validação humana da contabilidade continua em `validatedThroughMonth`, na
configuração, **sem efeito nenhum na disponibilidade** — e assim se mantém. São dois
eixos e é preciso que continuem a sê-lo.

---

## 2. O problema que resolve

`src/config/company.js` tinha:

```js
payables: { completeThroughMonth: "2026-06" }
```

Todos os meses, alguém teria de abrir o código e mudar uma string para o produto deixar
de tratar o mês anterior como parcial. **Isso não é configuração: é uma operação mensal
disfarçada de constante.**

A configuração passa a ser o que sempre devia ter sido — o **fallback**. Quem manda,
havendo, é a confirmação.

---

## 3. O contrato

### 3.1 Onde vive

No **mesmo documento** de ajustes manuais no Drive, num bloco de topo **separado** de
`months`:

```json
{
  "companyId": "overcel",
  "months":   { "2026-06": { "cmv": { "value": 116039.70, "updatedAt": "…" } } },
  "coverage": {
    "payables": {
      "completeThroughMonth": "2026-07",
      "confirmedAt": "2026-08-26T20:49:36.000Z",
      "confirmedBy": "user",
      "note": null
    }
  },
  "updatedAt": "…"
}
```

Mesmo documento porque a infraestrutura de leitura, escrita, lock, backup rotativo e
guarda de empresa já existe e está testada. **Bloco separado** porque um CMV e uma
cobertura não partilham validação (um é um número, o outro é um mês), não partilham
semântica (um é um valor que a plataforma não conhece, o outro é um estado que ela não
consegue apurar) e não devem partilhar histórico.

`confirmedBy` é um **papel**, nunca uma pessoa: o documento não guarda PII. Quem
confirmou fica no log de execução do Apps Script, já controlado por conta Google.

### 3.2 Regras

| Regra | Porquê |
|---|---|
| Mês **futuro ou corrente** é recusado | Confirmar um mês que ainda não terminou é afirmar sobre dias que não aconteceram |
| Mês **anterior** é aceite | É o mecanismo de correção. Um valor que só sobe é um valor que não se corrige |
| Ausência → fallback de `company.js` | Ausência é ausência: não se inventa cobertura |
| Mês malformado → ignorado | Cair no fallback é o lado seguro |
| Só `payables` | A cobertura dos pedidos deriva do calendário e não precisa de confirmação |

### 3.3 O limite que não cede

**Uma confirmação humana nunca torna uma fonte tecnicamente incompleta em completa.**

A garantia é **estrutural**, não uma verificação que se possa esquecer:

1. `sourceAvailability` testa `snapshotPartial` **antes** de olhar para qualquer limite
   de cobertura;
2. em `buildSalesDataset`, o veto do snapshot é aplicado **depois** da confirmação:

```js
coverageComSnapshotParcial(          // 2. o facto técnico veta por cima
  resolveEffectiveCoverage({ … }),   // 1. a confirmação escreve o limite
  meta
)
```

Invertê-las deixaria uma confirmação apagar a marca de um snapshot incompleto. Assim não
há sequer caminho para isso. Medido em `manualCoverage.test.js` e
`coberturaConfirmada.test.js` (cenário E).

---

## 4. ⚠️ BLOQUEIO ARQUITETURAL — persistência a partir do browser

**A escrita segura a partir do frontend depende de autenticação que não existe.**

O Web App é `ANYONE_ANONYMOUS` e o URL do proxy vai no bundle. Qualquer endpoint de
escrita alcançável a partir deste frontend é, por definição, um **endpoint de escrita
anónimo sobre dados financeiros**: sem autenticação de utilizador não há forma de
distinguir quem chama, e **um segredo dentro do bundle não é um segredo**.

Opções avaliadas:

| Opção | Veredito |
|---|---|
| A · Backend autenticado / proxy | Não resolve sozinha: o proxy autenticaria *o proxy*, não o utilizador. Precisa de D |
| B · Segredo server-side | O frontend teria de o apresentar → estaria no bundle. **Rejeitada** |
| C · Vercel function protegida | Mesma dependência de D para saber *quem* chama |
| D · Autenticação do produto | **É a resposta.** Ver §6 |
| E · Escrita interna no editor (padrão já usado pelo CMV) | **Adotada como ponte** |

### O que existe hoje

- **Motor:** a confirmação é real. O dataset é reconstruído e todos os estados (fecho,
  âncora, alertas, Chat) recalculam de verdade.
- **Sessão:** dura o que durar a sessão. Uma recarga volta ao valor da configuração, e a
  UI **diz** "confirmada nesta sessão" — não promete persistência que não tem.
- **Persistência:** um operador executa `runConfirmarCoberturaDespesas('2026-07')` no
  editor do Apps Script, autenticado pela sua conta Google. É o mesmo padrão de
  `salvarAjusteManual_`, pela mesma razão, com o mesmo lock, backup e guarda de empresa.
  **Não publicado** — só existe na fonte local.
- **Guarda:** `coberturaConfirmada.test.js` falha se aparecer um `doPost` em qualquer
  ficheiro do Apps Script, ou se o `doGet` encaminhar para a escrita.

---

## 5. O que muda em julho de 2026 — medido com dados reais

`npx vite-node diagnostico/_coberturaJulho.mjs` (read-only, só GET).

| | antes | depois |
|---|---|---|
| `payables.completeThroughMonth` | 2026-06 (config) | **2026-07 (user)** |
| `revenueNet` | partial | **real** |
| `deductions` | partial | **real** |
| `withdrawals` | partial | **real** |
| `payablesCoverage` | partial | **real** |
| `cmv` | unavailable | unavailable |
| `operatingExpenses` | partial | partial |
| `coverageNeedsReview` | true | **false** |
| `anchorEligible` | false | false |
| títulos por classificar | 3 · R$ 1 554,35 · 0,38% | **idênticos** |

Linhas bloqueadas, antes e depois:

```
antes : deductions[cobertura] cmv[por_informar] operatingExpenses[cobertura,classificacao] withdrawals[cobertura]
depois:                       cmv[por_informar] operatingExpenses[classificacao]
```

**Cada causa cai sozinha.** A cobertura resolve-se; o CMV e a classificação não — e é
isso que se quer. Cobertura completa não é classificação completa.

---

## 6. O que falta para autenticação

Auditoria objetiva do que a escrita segura exige.

| # | Peça | Estado | Horas |
|---|---|---:|---:|
| 1 | Identidade (login/password ou OAuth Google) + sessão | não existe | 12 – 20 |
| 2 | Proxy a validar a sessão e a recusar pedidos não autenticados | não existe | 6 – 10 |
| 3 | `doPost` no Apps Script, invólucro fino sobre `salvarCoberturaConfirmada_` | **lógica pronta**, falta a rota | 2 – 4 |
| 4 | Segredo partilhado proxy↔Apps Script (o proxy passa a ser o único chamador) | não existe | 3 – 5 |
| 5 | Isolamento por empresa (`companyId` da sessão, não da config) | parcial: a guarda de empresa existe no documento | 8 – 14 |
| 6 | Retirar `ANYONE_ANONYMOUS` das ações sensíveis | depende de 1–4 | 2 – 3 |
| | **Total** | | **33 – 56** |

Arquitetura recomendada, por ordem: **1 → 2 → 4 → 3 → 6 → 5**. O passo 3 é o mais barato
de todos precisamente porque a validação, o lock, o backup e o merge já vivem no
Apps Script — foi construído a pensar nisto.

---

## 7. Ficheiros

| Ficheiro | Papel |
|---|---|
| `src/utils/manualCoverage.js` | a regra — normalização, validação, merge, proveniência |
| `src/utils/coverageConfirmationView.js` | a apresentação — estados do cartão e a copy |
| `src/services/manualInputsService.js` | leitura do bloco `coverage` do documento |
| `src/services/blingDataService.js` | `resolveEffectiveCoverage` + `rebuildComCobertura` |
| `apps-script/AjustesManuaisBackend.js` | escrita interna (editor-only, **não publicada**) |
| `diagnostico/_coberturaJulho.mjs` | o antes/depois com dados reais |

Testes: `manualCoverage.test.js` (28), `coberturaConfirmada.test.js` — serviço (11) e
Apps Script (22), mais os do Chat e da guarda estrutural do ecrã.

---

## 8. Ver também

- `docs/DECISOES_DE_NEGOCIO.md` — D2, a decisão que originou este fluxo
- `docs/MONTHLY_CLOSING_CONTRACT.md` — cobertura vs. validação humana
- `docs/SOURCE_COVERAGE_CONTRACT.md` — frescura ≠ completude ≠ cobertura
- `docs/APPS_SCRIPT_SEGURANCA.md` — §6, mitigações de `ANYONE_ANONYMOUS`
