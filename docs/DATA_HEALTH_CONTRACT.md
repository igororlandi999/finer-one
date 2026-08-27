# Contrato da saúde dos dados

**O que este documento fixa:** como o Finer One decide o que dizer ao utilizador sobre a
qualidade dos dados que está a mostrar — e, sobretudo, o que **não** pode dizer.

Escrito em 23/08/2026, quando a apresentação da completude foi finalmente ligada (P0.2).

---

## 1. Dois eixos, nunca um

Frescura e completude são **ortogonais**. Colapsá-las numa escala única obriga a escolher
qual dos dois problemas se esconde.

| | Recente | Antigo |
|---|---|---|
| **Completo** | tudo bem | dados íntegros, mas desatualizados |
| **Incompleto** | *gerado agora e a meio* | os dois problemas ao mesmo tempo |

O canto de cima à direita e o de baixo à esquerda são estados **diferentes** e exigem
frases diferentes. O caso que originou tudo isto é o de baixo à esquerda: o rebuild
escreve `parcial: true` quando esgota o orçamento de tempo, e o snapshot fica recente
**e** incompleto — a idade sozinha diria que está tudo bem.

### Os estados

```
freshness    fresh · warning · stale · unknown      (limiares: 24 h / 72 h)
completeness complete · partial · unknown
```

Não existe enum combinatório. Existe uma `severidade` **derivada**, só para escolher o
tratamento visual: `neutra · atencao · alerta · desconhecida`.

---

## 2. As regras que não se negoceiam

**`UNKNOWN` é um estado próprio, não um sinónimo de nada.**
Não saber a idade dos dados não é o mesmo que saber que estão frescos, nem que estão
velhos. Uma fonte que não se pronuncia sobre a sua completude não autoriza declarar o
conjunto completo — mas também não é prova de que esteja incompleto.

**Ausência de prova nunca é prova.**
Sem `meta.geradoEm` → `unknown`, jamais `fresh`. Sem o mapa `meta.parcial` → `unknown`,
jamais `complete`. É por isso que `resolveDataCompleteness` **recusa** usar
`meta.algumParcial` como substituto do mapa: sem mapa esse booleano vale `false`, o que
se leria como «está completo».

**`PARTIAL` nunca sai `neutra`.**
Por mais fresco que o snapshot seja. É a regra central da P0.2 e tem teste próprio.

**`partial` não significa dado errado.**
Significa snapshot incompleto: o que lá está é válido, o que pode faltar são linhas que o
rebuild ainda não escreveu. Há um teste que falha se alguém escrever «errado»,
«incorreto», «inválido» ou «falso» nestas mensagens.

**O conjunto vale pela pior fonte.**
`geradoEm` do conjunto é a data **mais antiga** das três. Basta **uma** fonte parcial para
o conjunto não estar completo; declarar completo exige que **as três** se pronunciem.

**Zero real não é indisponibilidade.**
Um `data: []` é dado real com zero linhas. Esta camada nem sequer vê linhas — só vê
`meta` —, e há um teste estrutural que impede que passe a inferir saúde de contagens.

---

## 3. O que o utilizador vê

| Estado | Rótulo | Detalhe |
|---|---|---|
| fresh + complete | «Atualizado há 2 horas» | *(nenhum — silêncio é a mensagem)* |
| fresh + partial | «Atualizado agora mesmo · atualização parcial» | «Parte dos dados ainda está a ser completada (contas a receber).» |
| warning + partial | «Atualizado há 1 dia · atualização parcial» | **os dois** detalhes, um por linha |
| stale + complete | «Atualizado há 8 dias» | «Os valores apresentados podem não refletir a atividade mais recente.» |
| unknown | «Data de atualização desconhecida» | «A fonte não indicou quando os dados foram recolhidos.» |

Com data desconhecida, a nota de parcialidade **não** entra no rótulo — «Data
desconhecida · atualização parcial» daria a entender que se sabe mais do que se sabe. A
parcialidade aparece no detalhe, onde é observação e não alegação sobre o momento.

A faixa é **discreta quando está tudo bem**. Um aviso permanente com a mesma intensidade
acaba ignorado — e seria ignorado exatamente no dia em que passasse a importar.

---

## 4. Onde cada coisa vive

| Camada | Ficheiro | Responsabilidade |
|---|---|---|
| Transporte | `services/blingDataService.js` | Emite `meta.geradoEm`, `meta.parcial` (mapa por fonte), `algumParcial`, `todasCompletas`. |
| Idade | `utils/dataFreshness.js` | Limiares (24 h / 72 h) e frases de idade. **Único** sítio com números de horas. |
| Composição | `utils/dataHealth.js` | Junta os dois eixos sem os fundir. Puro: sem JSX, sem rede, sem finanças. |
| Apresentação | `components/ui/DataHealth.jsx` | Só cores e ícones. **Nenhuma regra.** |
| Montagem | `layouts/AppShell.jsx` | Um ponto global, só com `source === API`. Passa `sales.meta` **inteiro**. |
| Operação | `scripts/check-data-pipeline.mjs` | Os mesmos dois eixos, fora da app. Limiares duplicados de propósito. |

**A raiz da P0.2 foi o AppShell passar só `geradoEm`.** Há um teste estrutural que falha
se alguém voltar a fazê-lo.

---

## 5. O que esta camada nunca faz

- **Não esconde números.** Um dataset velho continua a ser exibido tal como o motor o
  produziu — o que muda é o utilizador saber a idade dele. Esconder seria uma decisão de
  produto diferente, e mais destrutiva.
- **Não participa em cálculo nenhum.** Nenhuma linha da DRE, nenhum mês âncora e nenhuma
  disponibilidade consultam `meta`.
- **Não afirma nada sobre contabilidade.** «Os dados estão recentes e completos» não é
  «a DRE pode ser fechada». A segunda pergunta depende de CMV lançado, da classificação
  dos títulos e do mês de fecho declarado. `check-data` chama ao seu veredito **estado
  técnico do pipeline** exatamente para não sugerir o contrário.

---

## 6. Estado técnico no health check

`npm run check:data` termina com:

```
frescura   : fresh
completude : completo
ESTADO TÉCNICO DO PIPELINE: SAUDÁVEL
```

| Código de saída | Significado |
|---|---|
| `0` | saudável — todas as fontes recentes **e** explicitamente completas |
| `1` | atenção — alguma velha, sem data, sem veredito de completude, ou parcial |
| `2` | indisponível — falha técnica de transporte (HTTP, rede, JSON inválido) |

`1` **não** significa dado errado. Significa que o pipeline não consegue afirmar que está
tudo recente e completo — o que é diferente de afirmar que está mal.

---

## 7. Cobertura de testes

`src/utils/dataHealth.test.js` — 35 testes:

- as quatro combinações que a P0.2 exige, uma a uma;
- ortogonalidade (um eixo não altera o veredito do outro);
- casos reais com **três** fontes: todas completas · uma parcial · uma velha · uma sem
  data · uma silenciosa · `meta.parcial` ausente · dataset vazio · avaria;
- as garantias em conjunto: `unknown ≠ complete`, `partial ≠ erro`, `stale ≠ partial`;
- guardas estruturais sobre a camada pura, o componente e o AppShell.

---

## 8. Casos de fronteira (auditoria de 23/08/2026)

`dataHealth.test.js` cobre os percursos que o backend produz hoje.
`dataHealth.limites.test.js` cobre o que acontece quando o payload **não** é o esperado —
entradas que ninguém escreve de propósito e que chegam quando algo muda a montante.

**A regra que todas partilham: perante entrada que não se percebe, o veredito é `UNKNOWN`.
Nunca `COMPLETE`.**

### 8.1 Correção aplicada — um array deixou de poder afirmar completude

`typeof [] === "object"`, pelo que um array passava a verificação de tipo. Um
`meta.parcial = [false, false, false]` chegava ao `Object.keys` com três chaves
(`"0"`, `"1"`, `"2"`) todas a `false` e saía **`COMPLETE`** — uma afirmação sobre pedidos,
contas a pagar e contas a receber tirada de um payload que não fala de nenhuma delas.

`resolveDataCompleteness` passou a exigir um objeto simples, tanto em `meta` como em
`meta.parcial`.

### 8.2 Matriz de fronteira

| Entrada | Veredito | Porquê |
|---|---|---|
| `meta.parcial = []` ou `[false,…]` | `UNKNOWN` | Array não é mapa por fonte |
| `meta.parcial` string / número / booleano / função | `UNKNOWN` | Sem coerção |
| `meta.parcial = null` | `UNKNOWN` | Ausência ≠ completude |
| `meta` string / número / array / função | `UNKNOWN` | Sem rebentar |
| sem argumentos | `UNKNOWN` | — |
| `{ orders: "true", … }` | `UNKNOWN` | Comparação **estrita**: `"true"` não dispara aviso nem confirma |
| `{ orders: 1, payables: 0 }` | `UNKNOWN` | `1`/`0` não substituem `true`/`false` |
| `{ orders: undefined, … }` | `UNKNOWN` | Silêncio de uma fonte impede afirmar o conjunto |
| `{ …, estoque: true }` *(fonte nova)* | `PARTIAL`, nomeada `"estoque"` | Chave crua é feia mas honesta |
| `{ …, estoque: null }` | `UNKNOWN` | Fonte nova silenciosa também conta |
| `{ estoque: false }` *(só desconhecidas)* | `COMPLETE` | **Deliberado** — esta camada reporta o que a fonte declara; não valida que fontes deviam existir |

### 8.3 Os dois eixos nos extremos

- **Relógio adiantado** (`geradoEm` no futuro) → `FRESH` com `ageHours: 0`. É desvio de
  fuso, não dados do futuro, e não contamina a completude.
- **Data ilegível + completude conhecida** → severidade `DESCONHECIDA`. A idade domina:
  não saber *quando* é pior do que saber que falta uma parte. A parcialidade continua no
  **detalhe**, mas não entra no **rótulo** — `"Data desconhecida · atualização parcial"`
  daria a entender que se sabe mais do que se sabe.
- **`geradoEm` válido, `parcial` em falta** → `FRESH` + `UNKNOWN`, severidade `NEUTRA`.
  Sem prova de incompletude não se alarma.
- **Três fontes parciais** → um único detalhe, com as três enumeradas em português
  corrente.

### 8.4 O portão do AppShell

```js
const saude = (source === DATA_SOURCE.API && !loading) ? resolveDataHealth(…) : null;
```

Nem `loading` nem modo demonstração chegam à faixa: durante o carregamento não há `meta`
nenhum, e resolver a saúde aí produzia *"Data de atualização desconhecida"* a piscar antes
dos dados chegarem. O modo demonstração tem selo próprio e não se confunde com idade de
snapshot. Ambas as condições estão fixadas por teste estrutural.

**Cobertura: 55 testes** (35 no contrato + 20 nos limites).
