# Frontend — os commits locais por publicar

> # ✅ ENCERRADO — SNAPSHOT HISTÓRICO (não atualizar)
>
> **A 30/08/2026 já não há commits por publicar.** `origin/main` = `a8bfca0`, **0 à
> frente / 0 atrás**. A cadeia foi enviada por fast-forward, sem force e sem reescrita de
> histórico, e o artefacto correspondente está em `gh-pages 22b0526`.
>
> O corpo deste ficheiro descreve o estado a **29/08/2026**, quando eram 17 commits, e
> **fica deliberadamente por corrigir** — é um registo do que se sabia na altura.
> Os números abaixo (17 commits, `b99c97d` como ponta, 2316 testes em 92 ficheiros) estão
> **obsoletos**: a cadeia publicada tem **27** commits, a ponta é `a8bfca0`, e a base é de
> **2337** testes em **96** ficheiros.
>
> **Porque não foi apagado**, apesar de o próprio ficheiro o mandar fazer no fim: o *grafo
> de dependências* e o argumento sobre o **ponto de paragem seguro** continuam a ser a
> melhor explicação escrita de porque `9531cc8` e `b99c97d` não podiam ficar de fora — e
> essa explicação não existe em mais lado nenhum. Apagá-lo perderia isso. Se se preferir
> apagar mesmo assim, a decisão é de quem o escreveu.
>
> ---
>
> *Texto original de 29/08/2026, mantido tal como estava:*
>
> **29/08/2026.** `origin/main` = `4e8b309`. Local = `b99c97d`. **17 commits à frente.**
> Nada enviado. Histórico **não** reescrito.
>
> Base: 2316 testes em 92 ficheiros, build verde.

---

## Classificação

| | |
|---|---|
| **A** | obrigatório antes de ligar a autenticação |
| **B** | obrigatório antes de ligar o transporte protegido |
| **C** | segurança |
| **D** | semântica financeira |
| **E** | documentação |
| **F** | melhoria não bloqueadora |

---

## Os 17

| # | SHA | Assunto | Ficheiros | Δ | Classe |
|---|---|---|---|---|---|
| 1 | `5286a38` | impedir fallback anónimo e corrida multiempresa | 5 | +813/−13 | **B, C** |
| 2 | `966b5a1` | preservar semântica financeira sem DRE | 3 | +319/−60 | **D** |
| 3 | `1338928` | registar auditoria de segurança de agosto | 9 | +1293/−93 | E |
| 4 | `7994255` | carimbar o dataset com a empresa lida | 2 | +200/−3 | **B, C** |
| 5 | `15f49e8` | neutralizar injeção de fórmula no CSV | 2 | +115/−2 | **C** |
| 6 | `45b3598` | fixar dois invariantes que só se provavam por leitura | 2 | +350 | F (testes) |
| 7 | `d1a9fb5` | catálogo de erros, caches, runbooks, invariante multiempresa | 6 | +649/−1 | E |
| 8 | `d1b0eff` | o score deixa de afirmar um máximo que não avaliou | 3 | +287/−12 | **D** |
| 9 | `a7c46a4` | um diagnóstico que não se pronuncia não autoriza o máximo | 2 | +50/−13 | **D** |
| 10 | `02e6060` | registo de riscos e roteiro de desktop | 2 | +280 | E |
| 11 | `f471c77` | `monthKeyOf` deixa de ler data de calendário como instante UTC | 2 | +162/−5 | **D** |
| 12 | `8c6cf07` | registar R-12 fechado e a aresta R-17 | 1 | +5/−2 | E |
| 13 | `b53f8c2` | a frase do score sai do mesmo juízo que a flag | 2 | +58/−3 | **D** |
| 14 | `8205ce3` | registar R-H, R-A fechados e R-B temporário | 1 | +19/−7 | E |
| 15 | `3022fef` | o espaço à cabeça deixa de esconder uma fórmula do CSV | 2 | +75/−2 | **C** |
| 16 | `9531cc8` | só uma leitura escopada pode carimbar o dataset | 2 | +208/−5 | **A, B, C** |
| 17 | `b99c97d` | cobertura e moeda não atravessam para outra empresa | 2 | +119/−4 | **B, D** |

Os 15 primeiros vinham de sessões anteriores. **#16 e #17 são desta sessão.**

---

## Grafo de dependências

```
                    ┌─ CSV ────────────────────────────────┐
                    │  15f49e8 ──────────► 3022fef         │
                    │  (neutraliza)        (espaço à cabeça)│
                    └──────────────────────────────────────┘
                       mesmo ficheiro; #15 altera a função que #5 criou


                    ┌─ SCORE ──────────────────────────────┐
     966b5a1 ──────►│  d1b0eff ──► a7c46a4 ──► b53f8c2     │
   (sem DRE não     │  (não afirma  (diagnóstico  (a frase  │
    inventa)        │   o máximo)    mudo)        segue)    │
                    └──────────────────────────────────────┘
                       cadeia estrita em scoreDisclosure.js


                    ┌─ MULTIEMPRESA ───────────────────────┐
     5286a38 ──────►│  7994255 ──────────► 9531cc8 ──► b99c97d
   (o provider      │  (carimbo da        (só a leitura   (cobertura
    passa companyId)│   leitura)           escopada)       e moeda)
                    └──────────────────────────────────────┘
                       #4 precisa de #1: sem o provider a passar
                       `companyId`, não há o que carimbar.
                       #16 corrige a janela que #1+#4 abriram juntos.
                       #17 é a mesma classe, nos outros dois campos.


     f471c77 ──────► 8c6cf07          02e6060 ──► 8c6cf07 ──► 8205ce3
   (corrige R-12)   (documenta)         (RISK_REGISTER.md, cadeia textual)
```

**Independentes de tudo:** `1338928`, `d1a9fb5`, `45b3598` (docs e testes puros).

### O que o grafo responde

**Podem os 17 subir juntos?** **Sim, e é a única opção sensata.** São lineares em `main`,
sem reordenação necessária, e nenhuma cadeia atravessa outra.

**Pode publicar-se um subconjunto?** Tecnicamente só um **prefixo contíguo** — o Git não
deixa saltar. E na prática **não se deve**:

> ⚠️ **Um prefixo que pare em `7994255` (#4) e não chegue a `9531cc8` (#16) publica o
> defeito descrito em `FRONTEND_AUTH_RELEASE_PLAN.md`.** A janela é aberta por #1 + #4 em
> conjunto e só é fechada por #16. Parar entre eles é o pior ponto de paragem possível de
> toda a série.

**O único ponto de paragem seguro é o fim.** `b99c97d`, ou nada.

---

## Porque é seguro publicar os 17 com os interruptores desligados

`5286a38` mudou `resolveDataTransport` para devolver `NENHUM` — e não o legado anónimo —
quando falta empresa ou token. Essa mudança **só se ativa** com
`VITE_PROTECTED_DATA_TRANSPORT` ligado:

```js
if (!protectedTransportRequested(env)) return { transport: LEGADO, ... };   // ← sai aqui
if (requiresAuth !== true)             return { transport: LEGADO, ... };
```

Com o interruptor vazio, a função sai no primeiro `if` e devolve o legado **antes de
sequer olhar** para empresa ou token. Comportamento de hoje, byte a byte — e com controlo
positivo em `transporteProtegido.semLegado.test.js` ("interruptor DESLIGADO e sem empresa:
continua legado — a instalação de hoje não muda").

O que **muda já** com os interruptores desligados, e é desejado:

- a corrida multiempresa e o logout deixam de deixar aterrar leituras obsoletas;
- o CSV deixa de exportar fórmulas ativas;
- sem DRE não se inventa resultado nem margem;
- o score não afirma um máximo que não avaliou;
- `monthKeyOf` deixa de recuar um mês em fusos negativos.

---

## O que fazer com este ficheiro

Depois de publicar, apagá-lo. Descreve um estado transitório, e um documento que descreve
um estado que já não existe é pior do que não existir.
