# Readiness do plano Plus — estado real e o que falta

> Medido em **25/08/2026**, contra os dados reais da conta Overcel (1103 pedidos,
> 301 contas a pagar, 1421 recebíveis, 2316 documentos no catálogo).
> Verificado com a aplicação **a correr** no browser, não só por testes.
>
> **Atualizado às 20:05 de 25/08/2026: a versão 12 do Apps Script FOI publicada.**
> As três decisões de negócio que aqui figuravam como bloqueadas **foram tomadas** —
> registo em `docs/DECISOES_DE_NEGOCIO.md`.

---

## 1. Veredito

**O plano Plus responde com dados reais nas dez telas, e as respostas estão certas.**
As três coisas que o tornavam não-vendável — moeda errada, meses trocados e um
assistente que recusava o que o produto sabia — estão resolvidas e travadas por testes.

O que **impede a venda** é agora **uma coisa só**:

> **Não há autenticação.** O Web App é `ANYONE_ANONYMOUS` e o URL do proxy está no
> bundle: o dataset financeiro completo é publicamente legível. Não há vulnerabilidade a
> explorar — não há controlo de acesso a contornar. Mitigar exige tocar no proxy, que é
> um projeto separado (`docs/APPS_SCRIPT_SEGURANCA.md` §6).

As três decisões de negócio que aqui bloqueavam foram **tomadas em 25/08/2026** (§4.1), e
duas delas decidiram-se por *não fazer agora* — o que é uma decisão, não uma pendência.

---

## 2. As dez telas, uma a uma

Verificado no browser em 25/08/2026, com dados reais ligados. `main.innerText` sem um
único `€`, `undefined`, `NaN`, `Invalid Date` ou `[object Object]`; consola sem erros nem
avisos em nenhuma tela.

| Tela | Fonte real | Estado | Nota |
|---|---|---|---|
| Resumo | `resumo.metrics` + `financeiro` + `closings` | ✅ | Um selo Demo, correto: "Documentos recentes" não tem fonte de conteúdo |
| Diagnóstico Financeiro | `diagnostico` | ✅ | Resumo executivo nomeia o mês |
| Receitas | `receitas` | ✅ | |
| Despesas | `despesas` | ✅ | Inclui "Movimentos por classificar" quando existem |
| Clientes e Fornecedores | `fornecedores` + `recebiveis` | ✅ | |
| Documentos | `documents` | ✅ | Selo Demo correto: a **fonte** não devolve ficheiro (0 de 2316) |
| Dados a completar | `closings` | ✅ | Pede o CMV de julho, que é o que falta mesmo |
| Performance Financeira | `financeiro.metrics` | ✅ | |
| Alertas | `alertas.list` | ✅ | |
| Chat Financeiro | `financeiro` + tudo o resto | ✅ | 11 perguntas verificadas ao vivo |

Travado em `src/services/planoPlus.auditoria.test.js`: a lista de telas sai de
`PLANS.plus.screens`, pelo que **acrescentar uma tela ao plano sem lhe dar fonte real
passa a falhar**.

### O Chat, verificado ao vivo

As nove perguntas do guião mais duas de tesouraria, escritas na caixa do Chat com os
dados reais carregados:

| Pergunta | Resposta (resumida) |
|---|---|
| Qual foi o resultado? | junho de 2026, R$ 19.114,59, margem 10,63% — *"Inclui o CMV introduzido manualmente"* |
| Qual foi o EBITDA? | R$ 44.413,51, margem 24,71%, mesma ressalva |
| Qual a margem? | 10,63% sobre receita líquida de R$ 179.751,58 |
| Quanto tivemos de despesas? | **Despesas operacionais da DRE** R$ 19.298,37 (10,74%) — e, a seguir, *"não confundir com contas a pagar: em agosto vencem R$ 344.124,44"* |
| Quanto temos a pagar? | Contas a pagar com vencimento em **agosto de 2026**: R$ 344.124,44 |
| Como foi julho? | Não tem DRE apurada; diz porquê, e dá **faturação bruta** (R$ 172.899,40) nomeada como tal |
| Estamos lucrando? | **Sim.** + o número + a ressalva |
| Qual foi o melhor mês? | maio de 2026 **por faturação bruta**, critério declarado, agosto excluído por estar a decorrer |
| Por que julho não aparece na rentabilidade? | Bloqueios nomeados + **3 títulos por classificar, 0,38% do mês, R$ 1.554,35** |
| Quanto vou receber e pagar nos próximos 30 dias? | −R$ 153.524,34 — *"variação, não saldo"* |
| Qual é o meu saldo bancário? | Recusa: exige Open Banking |

Os cinco invariantes do guião verificam-se em todas: **DRE ≠ tesouraria**, **contas a
pagar ≠ despesas**, disponibilidade respeitada, mês sempre nomeado, e nenhum recurso
apresentado como definitivo.

---

## 3. O que foi corrigido nesta sessão

Quatro defeitos foram encontrados **a olhar para o produto a correr**, não nos testes.

| # | Defeito | Onde se via |
|---|---|---|
| 1 | `4.500 €` numa empresa em BRL, e duas das três sugestões eram recusadas pelo próprio Chat | cartão "Pergunte à Finer", Resumo |
| 2 | "Receitas (Mês)" sem mês, com **+105,4% vs mês anterior** a dois dedos do alerta "**caiu 56%** face ao mês anterior" — meses diferentes, sinais opostos, nenhum declarado | Resumo |
| 3 | O Chat recusava tesouraria dizendo que faltavam "recebíveis com datas de vencimento" — que estão ligados, e que o cartão "Cashflow previsto" do mesmo produto já desenhava | Chat vs. Resumo |
| 4 | "Despesas: −79,44%" era a variação de **contas a pagar**, e nenhuma linha dizia de que mês falava | "Insights inteligentes" (Chat) e "O que mudou" (Resumo) |

E uma medição de escala que os testes de dados não podiam apanhar:

| # | Defeito | Antes | Depois |
|---|---|---|---|
| 5 | Documentos desenhava as **2316 linhas** do catálogo de uma vez | ~62 800 nós, ~730 ms | ~2 940 nós, **~42 ms** |

Sobre o número 5: a medição de escala do projeto (`diagnostico/_perfEscala.mjs`) cobre
`buildSalesDataset` e continua linear (10× dados → ×10,7 tempo, re-medido hoje). O que
ela nunca mediu foi o custo de **desenhar** o resultado.

---

## 4. O que bloqueia, e porquê

### 4.1 Decisões de negócio — TOMADAS em 25/08/2026

Registo completo, com o que reabre cada conversa, em **`docs/DECISOES_DE_NEGOCIO.md`**.

| # | Decisão | O que ficou decidido |
|---|---|---|
| **B1** | Limiar de materialidade da classificação | **Não criar limiar.** Qualquer título relevante por classificar continua a impedir que a linha de despesas seja completa. A UI mantém os factos (quantidade, valor, rácio, origem). Política define-se com o **piloto**. |
| **B2** | Quem declara um mês de contas a pagar fechado | **Confirmação humana** dentro da Finer One — *"Confirmar cobertura das despesas de \<mês\>"*, **nunca** "fechar mês" nem "fecho contabilístico". **Não implementada nesta publicação**; `payables.completeThroughMonth` fica em `"2026-06"`. É a próxima fase de produto. |
| **B3** | Guarda de queda em massa por limiar (estratégia B) | **`K` não é definido; B fica adiada.** A sonda de página +1 resolve deterministicamente a causa conhecida. B reabre só perante evidência de queda anormal que passe por todas as guardas determinísticas. |

### 4.2 Bloqueios técnicos com dono conhecido

| # | Item | Porquê |
|---|---|---|
| T1 | **Autenticação** | Exige tocar no proxy, projeto separado. Sem isto o dataset é público. |
| T2 | **Recebíveis deixam de convergir a ~5–6× o volume** | A listagem é integral e recomeça na página 1 a cada execução; não há cursor de continuação. Hoje: 14 páginas, ~27 s de 300 s. **Passou a ser medido** (`meta.listagemMs` / `orcamentoMs`) em vez de invisível. Corrigir exige mudar recebíveis de *substitui* para *consolida* — decisão de arquitetura com consequências próprias sobre títulos apagados no ERP. |
| T3 | **Saldo bancário** | Não existe integração. O Chat e o Resumo dizem-no; nenhum finge. |
| T4 | **Mês sem atividade** | Lucro bruto e EBITDA continuam `null` porque o CMV é `null`, mesmo com o requisito `not_applicable`. Corrigir muda a semântica da DRE. |
| T5 | **Viewport estreito** | Não validado: a ferramenta reporta redimensionamento com sucesso mas o viewport mantém-se em 1920. Verificado por padrão de markup, não por observação. |

### 4.3 Publicado — versão 12, 25/08/2026

Deteção de truncamento de paginação, sonda de página +1 com aborto do rebuild, e medição
do custo da listagem estão **em produção**. Deployment oficial `<DEPLOYMENT_OFICIAL>` em `@12`, mesmo
ID e mesma URL, `USER_DEPLOYING` / `ANYONE_ANONYMOUS` inalterados, sem rollback. Registo
de execução no fim de `docs/PUBLICACAO_P0_CHECKLIST.md`.

Os campos novos de `meta` (`paginasLidas`, `listagemTruncada`, `listagemMs`,
`orcamentoMs`) só aparecem no **primeiro rebuild com a v12** — os snapshots servidos hoje
foram gravados pela v11. A sonda de página +1 corre nesse mesmo rebuild.

---

## 5. Estimativa de horas

Ordens de grandeza para uma pessoa que conheça este código. **Não incluem** as decisões
de negócio: essas custam uma conversa, não horas de desenvolvimento — mas B1 e B2
desbloqueiam trabalho que está aqui contado.

### Para pôr em produção o que já existe

| Trabalho | Horas | Nota |
|---|---:|---|
| ~~Publicar a versão 12~~ | ~~1,5 – 2~~ | ✅ **feito em 25/08, em ~4 min de execução** |
| Vigiar a madrugada seguinte (3 gatilhos, `check:data`, campos novos de `meta`) | **0,5** | Observação, não desenvolvimento — **por fazer** |
| **Subtotal** | **0,5** | |

### Para fechar os bloqueios técnicos

| Trabalho | Horas | Depende de |
|---|---:|---|
| T2 — cursor de continuação nos recebíveis (merge em vez de replace, estado em `meta`, semântica de títulos apagados, testes) | **10 – 16** | Decisão de arquitetura merge/replace |
| T1 — autenticação | **16 – 30** | Projeto do proxy; a estimativa varia com a mitigação escolhida (§6 de `APPS_SCRIPT_SEGURANCA.md`) |
| T4 — "não aplicável" como zero económico no `dreEngine` | **4 – 6** | Mudança de semântica: exige rever os testes de DRE |
| T5 — validação responsiva real | **2 – 4** | Ferramenta de viewport a funcionar |
| Documentos: paginação a sério (reutilizar `DataTable`) em vez de "mostrar mais" | **2 – 3** | Opcional — o limite atual já resolve o custo |
| **Subtotal** | **34 – 59** | |

### Se as decisões saírem

| Decisão | Trabalho que desbloqueia | Horas |
|---|---|---:|
| B1 — decidido: **sem limiar** | Nada a implementar. Reavaliar depois do piloto. | **0** |
| B2 — decidido: **confirmação humana** | *"Confirmar cobertura das despesas de \<mês\>"*: ação, persistência, propagação à cobertura, e o fluxo de resolução das pendências do mês | **8 – 12** |
| B3 — decidido: **B adiada** | Nada a implementar até haver evidência. | **0** |

**A próxima fase é B2.**

### Fora deste âmbito

Open Banking (saldo bancário real), previsão de vendas futuras e classificação
automática de títulos. Nenhum é uma correção; são produtos.

---

## 6. Ver também

- `docs/FINANCIAL_ANCHOR_CONTRACT.md` — de onde vem o mês âncora
- `docs/FINANCIAL_COMPLETENESS_CONTRACT.md` — o que torna um mês elegível
- `docs/INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md` — a queda em massa e a estratégia A
- `docs/PUBLICACAO_P0_CHECKLIST.md` — os passos de publicação, e o que falta publicar
- `src/services/planoPlus.auditoria.test.js` — a auditoria que trava tudo isto
