# Decisões de negócio — registo

Este ficheiro existe porque três perguntas ficaram meses marcadas como "decisão de
negócio por tomar" espalhadas por backlog, contratos e comentários de código. Foram
tomadas em **25/08/2026**. Ficam aqui, num sítio só, com o que foi decidido, o que **não**
foi decidido, e o que reabre a conversa.

Uma decisão de *não fazer agora* é uma decisão. Registá-la evita que a próxima sessão a
volte a tratar como pendência técnica e a "resolva" por iniciativa própria.

---

## D1 — Materialidade da classificação

**Decidido: NÃO criar limiar de materialidade.**

A regra em vigor mantém-se, e é conservadora por escolha, não por omissão:

> Qualquer título relevante por classificar impede que a linha de **despesas
> operacionais** seja considerada completa — e, por consequência, pode impedir a
> elegibilidade do mês como âncora dos KPIs.

### O que NÃO existe, e não deve ser criado

Nenhum limiar. Nem `1%`, nem `0,5%`, nem `R$ X`, nem "acima de N títulos", nem qualquer
outra forma da mesma coisa. Um título de R$ 1 e um de R$ 100 000 continuam a produzir o
mesmo efeito.

### O que a UI deve continuar a mostrar

Os **factos**, sem veredito: quantidade, valor, rácio, e a categoria/origem que a fonte
traz. Já é o que fazem:

- `utils/classificationCompleteness.js` — mede; não tem constante de materialidade;
- página **Despesas**, secção *Movimentos por classificar* — lista os títulos, o peso e a
  categoria de origem, sem ação e sem sugerir categoria;
- **Chat**, ao explicar porque é que um mês não sustenta rentabilidade — diz quantos são,
  quanto pesam, que percentagem representam, **e diz que qualquer título bloqueia**, para
  que ninguém infira um limiar a partir do número.

Medido em produção: julho **0,38 %** (3 títulos, R$ 1 554,35); agosto **0,10 %**
(3 títulos, R$ 347,35).

### O que reabre a conversa

Observação do comportamento durante o **piloto**. A política define-se com o que se vir
lá, não antes.

---

## D2 — Cobertura das contas a pagar

**Decidido: a cobertura NÃO é inferida do calendário. Será uma confirmação HUMANA dentro
da Finer One — e não é implementada nesta publicação.**

O conceito da ação futura:

> **"Confirmar cobertura das despesas de julho de 2026"**
>
> Significado: o utilizador confirma que, **até onde sabe**, os documentos relevantes
> desse mês já estão disponíveis para análise.

### Vocabulário — o que NÃO chamar a isto

Nem *"fechar mês"*, nem *"fecho contabilístico"*, nem *"encerramento contabilístico"*. A
Finer One não faz encerramento contabilístico, e chamar-lhe isso seria afirmar sobre o
produto uma coisa que não é verdade. É a mesma razão pela qual `closingSummaryView` já
recusa a palavra "fechado".

### Estado nesta publicação

```js
// src/config/company.js
payables: { completeThroughMonth: "2026-06" }   // INALTERADO
```

Continua editado à mão, **por falta de sinal, não por falta de código**: nenhum campo do
snapshot permite derivá-lo (`geradoEm` é frescura, `parcial` diz que o rebuild terminou, e
a última competência presente é `2027-07` — um vencimento futuro, não cobertura).

`coverageDiagnostics` já assinala o atraso da cobertura declarada; é contrato interno e
nenhuma tela o mostra.

### Próximo passo

Depois desta publicação: construir o fluxo de produto — a ação, a persistência, e a
resolução das pendências do mês.

---

## D3 — Queda em massa de snapshot (estratégia B)

**Decidido: NÃO definir `K`, percentual ou absoluto. Estratégia B ADIADA.**

Nada de "queda > 50 %", "queda > 30 %", "menos X títulos" ou "diferença > Y %". Nenhuma
heurística deste género entra no produto por agora.

### Porquê, e o que já protege

A causa **conhecida** de uma queda em massa é determinística e está resolvida: a
paginação terminava cedo quando uma página vinha mais curta que `PAGE_LIMIT`, e o laço
tratava-a como a última. A **sonda de página +1** (`terminacaoPrematura_`, em `Código.js`)
confirma o fim de forma determinística e o rebuild **aborta sem gravar** quando a
paginação não chegou ao fim.

Isto ataca a causa em vez do sintoma, e por isso deteta um truncamento de 1 % tão bem
como um de 99 % — que nenhum limiar percentual apanharia. E, sobretudo, **não exige
decisão nenhuma**: não tem constante para escolher.

As proteções determinísticas em vigor:

| Guarda | O que trava |
|---|---|
| `podeGravarListagemVazia_` | zero por falha não substitui um snapshot com histórico |
| `loteDaListagem_` | `data` que não é lista aborta o rebuild em vez de paginar em vão |
| `paginacaoTruncada_` | teto `MAX_PAGES` atingido → snapshot marcado `parcial` |
| `terminacaoPrematura_` | paginação terminada antes do fim → **aborta sem gravar** |

### O que B cobriria, e continua descoberto

Um apagamento em massa **legítimo ou deliberado no ERP** — que não é terminação precoce e
passaria por todas as guardas acima. Medido em 2026-08-23: em 9,1 dias, **zero** títulos
desapareceram da listagem de contas a pagar; os liquidados mudam de situação e ficam.

### O que reabre a conversa

**Evidência de uma queda anormal que passe por todas as proteções determinísticas
atuais.** Até lá, B fica adiada.

---

## Ver também

- `docs/INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md` — as estratégias A–D, medidas
- `docs/FINANCIAL_COMPLETENESS_CONTRACT.md` — o que torna um mês elegível como âncora
- `docs/MONTHLY_CLOSING_CONTRACT.md` — porque é que títulos por classificar não são um
  requisito de fecho
- `docs/READINESS_PLUS.md` — o estado do plano Plus e o que estas decisões desbloqueiam
