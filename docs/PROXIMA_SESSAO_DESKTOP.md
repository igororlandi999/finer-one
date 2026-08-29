# Próxima sessão — o que exige desktop

> **Atualizado a 29/08/2026**, ao fim da TERCEIRA sessão de telemóvel (a segunda foi
> interrompida a meio de uma mutação — ver a nota de recuperação no fim deste ficheiro).
> Escrito a 29/08/2026, ao fim da segunda sessão de telemóvel.
> A versão anterior (28/08) está **obsoleta**: descrevia 222 testes no BFF, 2272 no
> frontend, "BFF ahead 4, frontend ahead 9" e o repositório Git **ligado** à Vercel.
> Nenhuma dessas coisas é verdade hoje. Os passos 3 a 8 dessa versão **foram executados**.
>
> **Ordem importa.** Cada passo assume os anteriores.

---

## Estado real no início desta sessão de desktop

| | |
|---|---|
| **BFF** | `74a1e0b`, **0 à frente / 0 atrás** de `origin/main`, árvore limpa. **235** testes. **Congelado — não se lhe tocou.** |
| **Frontend** | **27 commits à frente** de `origin/main` (o HEAD é o commit que escreveu esta linha — `git log --oneline -1`). **2337** testes, **96** ficheiros. Build verde, `check:predeploy` tudo verde, `git diff --check` limpo. |
| `.mcp.json` | modificado localmente, **fora do stage**. Não versionar a alteração. |
| Vercel ↔ Git | **desligado** (R-A fechado). Deploy manual por CLI. |
| Production | `kgcs3qugg` — **não** é o candidato, e **não está mapeado a um SHA**. |
| Protection Bypass | **ainda existe** (R-B). É o passo 1. |

Se os números divergirem, **parar e perceber porquê** antes de continuar.

---

## 0. Reposicionar (5 min)

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
git status --short && git log --oneline -3
npm test                    # esperado: 235
npm run check:predeploy     # esperado: tudo verde

cd "C:\Users\User\Documents\VS Code\finer-one"
git status --short && git log --oneline -5
npm run check:predeploy     # corre testes E build — esperado: 2337, tudo verde
```

O `check:predeploy` do frontend **imprime os interruptores**. Olhar para eles: dizem em
que etapa do rollout a máquina está configurada, e é isso que seria publicado.

---

## 1. Remover o Protection Bypass (R-B) — **primeiro, e sozinho**

`BFF_PRODUCTION_PROMOTION.md` §1. O smoke que o exigia terminou.

Confirmar pelo fio que um Preview responde `401` **sem** cabeçalho de bypass. Se responder
`200`, o bypass não saiu.

**Não avançar para a promoção no mesmo minuto.** Se algo partir a seguir, quer-se saber se
foi o bypass ou o deploy.

---

## 2. Ler o ambiente de Produção — **só ler** (10 min)

`BFF_PRODUCTION_PROMOTION.md` §2. As duas leituras que mais importam:

- [ ] **`ALLOWED_ORIGINS` existe em Production?** É o risco de promoção nº 1. Sem ela, o
      endpoint legado — que é o que serve a aplicação hoje — fica sem CORS e a aplicação
      inteira mostra "indisponível";
- [ ] **o SHA de `kgcs3qugg`.** Anotar. Fecha `BFF_PRODUCTION_DELTA.md`, que hoje é
      inferência e passa a ser facto:

```bash
git log --oneline <SHA-de-kgcs3qugg>..74a1e0b     # isto É o delta
```

Se `ALLOWED_ORIGINS` faltar: **configurá-la e parar por hoje.**

---

## 3. Promover o BFF (15 min)

`BFF_PRODUCTION_PROMOTION.md` §3–4. Anotar o deployment **anterior** antes de promover —
é o alvo do rollback.

## 4. Smoke de pós-produção (30 min)

`BFF_POST_PRODUCTION_SMOKE.md`, inteiro e pela ordem escrita.

O §6 tem uma verificação que **exige isolamento**: fazer uma recusa autenticada, esperar
dois minutos **sem tráfego nenhum**, e só então consultar o `audit_log`. Foi assim que R-H
foi apanhado — sob tráfego o registo funcionava.

**Depois disto, parar.** O frontend não se mexe no mesmo dia.

---

## 5. (Sessão seguinte) Frontend

`FRONTEND_AUTH_RELEASE_PLAN.md`. Três etapas, uma de cada vez:

| | | |
|---|---|---|
| **E1** | publicar os 27 commits com os interruptores **desligados** | comportamento de hoje, byte a byte |
| **E2** | ligar `VITE_AUTH_MODE=supabase`, leitura ainda legada | ⚠️ ver abaixo |
| **E3** | ligar `VITE_PROTECTED_DATA_TRANSPORT=true` | nunca no mesmo dia de E2 |

> ⚠️ **E2 só é segura a partir de `9531cc8` + `b99c97d`.** Esta sessão encontrou e provou
> um **P1** (R-18) que vivia exatamente nessa etapa: com autenticação ligada e transporte
> legado, trocar para a Finer Teste mostrava os números **reais da Overcel** sob o nome da
> Finer Teste. Publicar a autenticação a partir de `origin/main` reintroduzia-o.
>
> O teste de aceitação de E2 é literalmente esse: **trocar para a Finer Teste tem de
> mostrar "empresa sem dados ligados"**, e não números.

---

## O que **não** fazer

- **Não** enviar os commits do frontend antes do BFF estar em produção e estável.
- **Não** ligar `VITE_PROTECTED_DATA_TRANSPORT` no mesmo dia da promoção do BFF.
- **Não** ligar `COVERAGE_WRITES_ENABLED`.
- **Não** tocar no Apps Script nem em `ANYONE_ANONYMOUS` (R-14).
- **Não** executar migrações SQL.
- **Não** versionar a alteração local do `.mcp.json` (o `check:predeploy` bloqueia se
  estiver em stage).
- **Não** apagar o utilizador de smoke `smoke-fb99be3@example.com` — está ativo de
  propósito.

---

## Se sobrar tempo, por ordem de valor

1. **R-07** — endurecer o contrato do upstream no BFF: recusar `{"error":true}` com `502`
   em vez de o reencaminhar com `200`. Local e testável; precisa do Preview só para
   confirmar que nenhuma resposta legítima do GAS tem essa forma.
2. **R-06 / B-03** — cadeia real de redirects do Apps Script
   (`curl -sIL "$GAS_URL"`). Se for sempre `script.google.com → script.googleusercontent.com`,
   R-06 fecha com uma lista de hosts permitidos em vez de `redirect: "follow"` cego.
3. **R-15** — desenhar `004_audit_log_retention.sql`. **Escrever, não executar.**
4. **R-09** — repor `cobertura.confirmada` na troca de empresa. Sem impacto visível hoje
   (o campo é escrito e nunca lido), mas é a última aresta da mesma família de R-18/R-19.

---

## Veredicto de prontidão, ao fim da terceira sessão de telemóvel

Estes três veredictos são a razão de este ficheiro existir. Substituem qualquer versão
anterior. Nenhum deles depende de memória de conversa.

| Etapa | Veredicto | Do que depende |
|---|---|---|
| **BFF → Production** | **GO condicional** | Condição única e bloqueante: **remover o Protection Bypass (R-B) antes de promover**, e confirmar `ALLOWED_ORIGINS` em Production **antes** de promover (passos 1 e 2 acima). O candidato `74a1e0b` está congelado, limpo, 0/0 face a `origin/main`, com 235 testes. Nada nas três sessões de telemóvel lhe tocou nem encontrou defeito nele. |
| **E2 — autenticação ligada** | **GO condicional** | Condição: publicar **a partir do HEAD local**, nunca de `origin/main`. E2 é exatamente a etapa onde vivia o R-18 (P1): autenticação ligada + transporte legado mostrava os números reais da Overcel sob o nome da Finer Teste. Está fechado em `9531cc8` + `b99c97d`, e as duas guardas foram **mortas por mutação** nesta sessão (M3, M4a, M4b) — logo a regressão é real e não decorativa. **Teste de aceitação:** trocar para a Finer Teste tem de mostrar "empresa sem dados ligados", e não números. |
| **E3 — transporte protegido** | **GO condicional** | Condições, por ordem: (1) E2 estável, e **nunca no mesmo dia**; (2) **R-07 fechado ou aceite por escrito** — o `{"error":true}` do Apps Script continua a sair do BFF como `200`, e hoje só há uma camada de defesa a jusante (`linhasOuFalha`); (3) B-03 e B-04 verificados em Preview. O R-23 (nome da empresa escrito à mão) era um bloqueador de E3 e está fechado, com as duas metades da guarda mortas por mutação (M1, M2). |

---

## O que NÃO se consegue fechar sem browser/desktop

Análise estática não é substituto de teclado. Isto é a lista completa do que ficou por
verificar, e cada linha diz **porquê é que só ali se verifica**.

| # | O que falta | Porquê exige browser | Onde |
|---|---|---|---|
| 1 | **`ActionPlanModal`: `Escape`, foco inicial, devolução do foco, armadilha de foco, `inert` no fundo, scroll do fundo** | São comportamento em tempo de execução com teclado e rato reais. Nenhum existe hoje; declarar `aria-modal` antes de os construir seria pior do que não o declarar. | **R-28** |
| 2 | **Que o clique no véu fecha e o clique no painel não** | A propagação está travada no código (`stopPropagation`), o que torna o comportamento *provável* — mas não foi exercido com rato. | R-28 |
| 3 | **Anúncio real num leitor de ecrã** (NVDA/VoiceOver) da paginação, do `aria-live` e do diálogo | O DOM está provado; o que a tecnologia de apoio faz com ele, não. `happy-dom` não é um leitor de ecrã. | R-24 / R-28 |
| 4 | **Smoke autenticado do BFF, isolamento entre duas empresas, cadeia de redirects do GAS, equivalência Preview↔Produção** | Exigem sessão iniciada e rede real. | B-03, B-04 |
| 5 | **O teste de aceitação de E2** (trocar de empresa mostra "sem dados ligados") | É o comportamento do produto montado, com duas empresas reais e sessão. | R-18 |

---

## Nota de recuperação — a interrupção da segunda sessão

A segunda sessão foi cortada a meio da **FASE H** (mutation testing), logo depois de
aplicar uma mutação em `src/pages/Alertas.jsx` e antes de a reverter. A terceira sessão
encontrou a árvore assim e recuperou-a:

- `Alertas.jsx` tinha, de facto, a mutação do R-23 (`subtitle` de volta a "Overcel"
  escrito à mão). Restaurado com `git restore` **só desse ficheiro**;
- `ActionPlanModal.jsx` tinha uma alteração **não commitada e não esperada** — não era
  mutação, era trabalho a meio (a semântica de diálogo). Foi mantida, completada com
  regressão e commitada em `6e62a3b`;
- `.mcp.json` continua modificado e fora do stage, como deve.

**A lição operacional, para quem correr mutações a seguir:** aplicar uma → correr →
confirmar que morre → restaurar **imediatamente** → `git diff` vazio antes da seguinte.
Nunca duas ao mesmo tempo, e nunca uma mutação a atravessar o fim de uma sessão.

E uma lição sobre o método: **correr a mutação contra o ficheiro de teste errado dá um
falso sobrevivente.** Aconteceu com a M10, que parecia sobreviver a
`availabilityPropagacao.test.js` e morria em `dreEngine.test.js`. Em caso de dúvida,
correr a suite inteira: são 8 segundos.
