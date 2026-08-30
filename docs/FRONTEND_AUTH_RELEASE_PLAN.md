# Frontend — plano de publicação da autenticação e do transporte protegido

> **Atualizado a 30/08/2026, ao fim da sessão de consolidação pós-E2.**
> A abertura anterior — *"Nada foi publicado, nada foi enviado. 17 commits à frente"* —
> está **obsoleta e era verdade apenas a 29/08**. Hoje:
>
> | | |
> |---|---|
> | **E2** | **CONCLUÍDO.** Publicado a 30/08/2026, 02:56:56 (−03:00). |
> | **SHA do frontend validado** | `a8bfca0` |
> | **`origin/main`** | `a8bfca0` — **0 à frente / 0 atrás**. Os 27 commits estão no GitHub. |
> | **`gh-pages`** | `22b0526` |
> | **Interruptores publicados** | `VITE_AUTH_MODE=supabase` · `VITE_PROTECTED_DATA_TRANSPORT` **vazio** |
> | **E3** | **NÃO INICIADO.** |
> | **BFF** | `74a1e0b` em Production, smoke autenticado concluído. |
>
> **R-18 está defendido em produção**, verificado no browser real — ver E2 abaixo.

---

## ⚠️ Duas numerações de etapas, e não são a mesma

Este ficheiro e o `RISK_REGISTER.md` numeram as etapas de maneira **diferente**, e
confundi-las torna o desvio D-1 ininteligível. Fica aqui a tabela de tradução:

| Neste ficheiro | No `RISK_REGISTER.md` | O que é |
|---|---|---|
| **E0** | E1 | publicar o BFF em Produção |
| **E1** | *(não tem número próprio)* | publicar os commits do frontend com os interruptores desligados |
| **E2** | E2 | ligar a autenticação |
| **E3** | E3 | ligar o transporte protegido |
| E4 / E5 | E4 / E5 | observar e desligar o legado *(aqui)* · piloto e escala *(no registo)* |

Quando se disser "E1 foi saltado" (D-1), é **o E1 deste ficheiro**.

---

## O achado que decide a sequência

Esta sessão encontrou, provou e corrigiu um defeito que **muda a resposta** à pergunta
"a autenticação e o transporte protegido devem subir juntos ou em duas etapas?".

**A etapa intermédia — autenticação LIGADA, transporte protegido DESLIGADO — não era
segura.** `FinerDataProvider` passava o `companyId` da empresa **ativa** a `loadFinerData`
sem perguntar que transporte tinha sido resolvido. Com o interruptor desligado, o
transporte é o legado — anónimo, um só conjunto de dados. Então:

```
utilizador troca para a Finer Teste  ->  companyId = "finer-teste"
o legado lê o endpoint anónimo       ->  dados da OVERCEL
o dataset era carimbado              ->  "finer-teste"
resolveCompanyDataScope              ->  LIGADA
AppShell                             ->  monta as páginas
```

Os números **reais** da Overcel sob o nome "Finer Teste", com o guarda de escopo a dizer
que estava tudo bem. Corrigido em `9531cc8`; a mesma classe apareceu na cobertura e na
moeda e foi corrigida em `b99c97d`.

**Consequência para este plano:** a etapa A só é publicável **com estes dois commits
incluídos**. Publicar a autenticação a partir de `origin/main` (`4e8b309`) — ou de
qualquer ponto anterior a `9531cc8` — reintroduz o defeito num utilizador multiempresa
real, que é exatamente o que a Overcel + Finer Teste são hoje.

---

## Etapas, e porquê nesta ordem

### E0 — BFF em Produção · **pré-requisito de tudo**

`BFF_PRODUCTION_PROMOTION.md`. Nada abaixo começa antes de isto estar estável.

**Rollback:** promover o deployment anterior. Não toca no frontend.

---

### E1 — Publicar os commits do frontend **com o interruptor desligado**

> ## ⛔ E1 FOI SALTADO — desvio **D-1**, **ACEITE**. Não voltar atrás para o executar.
>
> **O que aconteceu.** A publicação de 30/08/2026 foi directamente de E2: o `gh-pages`
> saltou do bundle de **18/07/2026** para o bundle com a autenticação ligada. Não houve
> nunca um deploy intermédio com `VITE_AUTH_MODE` vazio. O histórico do `gh-pages`
> tem três publicações em toda a sua vida — 17/07, 18/07 e 30/08 — e nenhuma delas é E1.
>
> **O que se perdeu com isso**, e fica dito para não ser redescoberto: a capacidade de
> **separar o diagnóstico**. Se aparecer agora um defeito, não há como distinguir "foram
> os 27 commits" de "foi o interruptor da autenticação", que é a razão declarada de
> existirem duas etapas. Não é uma perda recuperável — reexecutar E1 hoje significaria
> despublicar E2, que já está validado em produção, para provar uma etapa intermédia que
> já não interessa a ninguém.
>
> **Porque é aceite e não corrigido.** E2 passou integralmente no browser real, incluindo
> o teste que E1 existia para preceder. Voltar atrás trocaria um risco fechado por um
> risco aberto.
>
> **O que continua válido desta secção:** o parágrafo do rollback. `4e8b309` continua a
> ser um alvo de republicação a partir do qual a aplicação funciona com os interruptores
> desligados — só que agora é um ponto do passado de `main`, e não a sua ponta.

O que sobe: os 17 commits *(eram 17 quando isto foi escrito; a cadeia publicada tem 27)*.
O que **não** muda no comportamento: nada de leitura.

- `VITE_PROTECTED_DATA_TRANSPORT` **vazio** → `resolveDataTransport` devolve o legado no
  segundo `if`, antes de olhar para empresa ou token. **Idêntico a hoje, byte a byte** —
  e tem controlo positivo em `transporteProtegido.semLegado.test.js`.
- `VITE_AUTH_MODE` **vazio ou `disabled`** nesta etapa.

O que **melhora já** nesta etapa, sem interruptor nenhum: a corrida multiempresa, o
logout a invalidar leituras em voo, o CSV, a semântica financeira sem DRE, o score, o
fuso do `monthKeyOf`.

**Verificação:** a aplicação carrega, mostra os números da Overcel, e
`transporte === "legado"`.
**Rollback:** `git revert` do deploy no GitHub Pages, ou republicar `4e8b309`.
**Custo do rollback:** minutos. É o passo mais barato de desfazer de todo o plano.

---

### E2 — Ligar a autenticação, ainda com leitura legada · ✅ **CONCLUÍDO**

`VITE_AUTH_MODE=supabase` + `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

⚠️ **Esta é a etapa que o defeito acima tornava perigosa.** É segura **a partir de
`b99c97d`**, e não antes. Foi publicada a partir de `a8bfca0`, que a contém.

| | |
|---|---|
| **Publicado** | 30/08/2026, 02:56:56 (−03:00) |
| **A partir de** | `a8bfca0` |
| **`gh-pages`** | `22b0526` |
| **Bundle servido** | `assets/index-DVG67Kg3.js` |
| **Validado no browser real** | 30/08/2026 |
| **Reprodutibilidade** | `npm run check:predeploy` reconstrói `dist/` **byte a byte igual** ao artefacto publicado |

O que se confirmou — **todos passaram**, em browser real com utilizador multiempresa:

- [x] login funciona; sessão, utilizador e empresa ativa corretos;
- [x] **trocar para a Finer Teste mostra "empresa sem dados ligados"** — e **não** os
      números da Overcel. É a verificação direta do defeito corrigido. A UI diz
      literalmente *"Para não apresentar números de outra empresa, nenhuma informação
      financeira é mostrada."*;
- [x] **zero flash** de dados da Overcel sob o nome Finer Teste — provado com um gravador
      (`requestAnimationFrame` + `MutationObserver` em toda a subárvore) que classificou
      cada estado renderizado: a assinatura numérica da Overcel passa de **12/12 a 0/12**
      na mesma amostra em que aparece o estado de ausência, nas **duas** voltas;
- [x] trocar de volta para a Overcel mostra os números da Overcel, e o papel volta de
      `Consulta` a `Proprietário`;
- [x] Overcel → Finer Teste → Overcel, **duas vezes**, sem mistura;
- [x] refresh mantém a sessão e restaura a empresa permitida;
- [x] logout limpa o ecrã **e remove o token** do `localStorage`;
- [x] novo login parte de estado limpo — os alertas são recalculados, não reaproveitados;
- [x] **32/32 leituras financeiras pelo legado; zero chamadas ao transporte protegido**;
- [x] consola sem erros de auth, escopo de empresa ou carregamento financeiro;
- [x] módulos demonstrativos alcançáveis identificam-se como tal.

> ⚠️ **O que este teste NÃO provou, e é importante:** *isolamento forte* entre duas
> empresas. A conta usada é membro **das duas** empresas (`Proprietário` na Overcel,
> `Consulta` na Finer Teste). O que ficou provado é que os dados de A não aparecem sob o
> nome de B para um utilizador multiempresa — que é exatamente o R-18. **Não** ficou
> provado que um utilizador só de B não alcança A. Ver **R-33**.

**Rollback:** repor `VITE_AUTH_MODE` vazio, reconstruir e republicar. A leitura nunca
dependeu da autenticação nesta etapa, por isso o rollback não tem efeito sobre os dados.

---

### E3 — Ligar o transporte protegido · ⛔ **NÃO INICIADO**

`VITE_PROTECTED_DATA_TRANSPORT=true`. **Só depois de E2 estar estável, e nunca no mesmo
dia.**

> **Estado a 30/08/2026: NÃO INICIADO. `VITE_PROTECTED_DATA_TRANSPORT` está vazio**, no
> `.env.local` e no bundle publicado (verificado nos bytes do próprio bundle servido).
>
> **Condições de arranque, todas por cumprir antes de tocar no interruptor:**
>
> | # | Condição | Estado |
> |---|---|---|
> | 1 | E2 estável, e **não no mesmo dia** de E2 | E2 publicado a 30/08 — logo, **não antes de 31/08** |
> | 2 | **R-07 fechado ou aceite por escrito** — o `{"error":true}` do Apps Script continua a sair do BFF como `200`, com uma só camada de defesa a jusante (`linhasOuFalha`) | aberto |
> | 3 | **B-03** — cadeia real de redirects do Apps Script, verificada em Preview | por verificar |
> | 4 | **B-04** — equivalência Preview ↔ Produção nos quatro recursos do caminho legado | por verificar |
> | 5 | **Isolamento forte entre duas empresas reais** demonstrado com uma conta que pertença a **uma só** empresa | bloqueado — ver **R-33** |
>
> A condição 5 não estava neste plano e foi acrescentada a 30/08: a validação de E2
> mostrou que a configuração de contas actual **não consegue** demonstrar isolamento
> forte. Resolver quando existir uma conta de empresa única.

A partir daqui o legado passa a ser **proibido**: faltando empresa ou token, o transporte
é `NENHUM` e não o anónimo. Provado ao nível da rede em
`transporteProtegido.semLegado.test.js` (401, 403, 400, 404, 413, 429, 500, 502, 503,
rede em baixo, DNS, JSON inválido, HTML com 200 — nenhum cai no legado).

- [ ] a Overcel mostra os mesmos números que em E2 — **equivalência**, e é o que prova
      que a migração não mudou o dinheiro;
- [ ] a Finer Teste responde `integracao-nao-configurada` e a UI explica a ausência;
- [ ] nenhum pedido a `/api/pedidos/vendas` no separador de rede.

**Rollback:** repor o interruptor vazio e republicar. Volta ao legado, que continua a
existir e a funcionar.

---

### E4 — Observar o legado

Ver `LEGACY_SUNSET` abaixo.

### E5 — Desligar o legado

Só depois de E4 provar zero chamadas.

---

## Juntos ou em etapas?

**Em etapas, e a resposta é agora mais forte do que era antes desta sessão.**

O argumento habitual é o do diagnóstico: três mudanças no mesmo dia tornam impossível
saber qual partiu o quê. Continua a valer. Mas há um segundo argumento, que só apareceu
porque a etapa intermédia foi analisada a sério: **a etapa intermédia tinha um defeito
próprio, que nenhum teste cobria porque nenhum teste a exercia.**
`datasetCarimbaEmpresa.test.js` só exercia o transporte protegido — o par "autenticação
ligada + legado" não existia em teste nenhum.

Isso é um argumento **contra** saltar etapas por acharmos que a intermédia é inofensiva.
Foi precisamente por ser considerada inofensiva que não tinha testes.

---

## Canary — não vale a pena, e porquê

O GitHub Pages serve um único artefacto estático a partir de um branch. **Não há canary
real**: nem percentagem de tráfego, nem divisão por utilizador.

Alternativas consideradas e descartadas:

| Hipótese | Veredito |
|---|---|
| Branch de preview separado | Publicaria num URL diferente, com **origem diferente** — e a origem tem de estar em `ALLOWED_ORIGINS` do BFF. Passa a exigir uma alteração no BFF para testar o frontend: acopla as duas coisas que este plano existe para separar. |
| Flag por query string (`?protected=1`) | Poria a escolha do transporte **nas mãos do visitante**. O interruptor decide se as leituras são autenticadas; um atacante escolheria o legado anónimo. **Inaceitável.** |
| Flag por `localStorage` | Mesma objeção, com um passo a mais. |

**Conclusão:** sem canary. O que substitui é o que já existe — as etapas pequenas e
reversíveis acima, e o facto de E1 e E3 serem desfazíveis em minutos por serem apenas uma
variável de ambiente e uma republicação.

---

## LEGACY_SUNSET — quanto tempo manter o legado

| Fase | Duração | Critério de saída |
|---|---|---|
| **Observar** | ≥ 2 semanas após E3 | zero chamadas a `/api/pedidos/vendas` nos registos |
| **Confirmar** | 1 semana | zero, incluindo um fecho de mês completo — é quando aparecem os utilizadores esporádicos |
| **Desligar** | — | remover a rota do BFF |

Duas semanas não é um número redondo por acaso: cobre o ciclo mensal parcialmente e apanha
quem só abre a aplicação no fecho. Um browser com a página aberta há dias continua a
correr o bundle antigo, e é esse o caso que a fase de observação existe para apanhar.

**Não implementar hoje nenhuma flag de produção para isto.**

### Observabilidade — como saber se ainda há chamadas

Registos da Vercel, sem analytics novo:

```
path:"/api/pedidos/vendas"
```

Últimos 7 dias. **Contar, não amostrar.** Se houver chamadas, ver a origem antes de
concluir: um scraper externo do endpoint anónimo não é um utilizador do produto, e são
duas conclusões opostas sobre se se pode desligar.

Não construir dashboards para isto. É uma pergunta que se faz três vezes e depois deixa de
existir.

---

## Matriz de rollback

| Etapa | Como reverter | Custo | Efeito nos dados |
|---|---|---|---|
| E0 BFF | promover o deployment anterior | minutos | nenhum |
| ~~E1 commits~~ | **saltado (D-1)** — `4e8b309` continua a servir de alvo de republicação, mas é hoje um ponto do passado de `main`, e não a sua ponta (`main` = `a8bfca0`) | minutos | nenhum |
| E2 auth | `VITE_AUTH_MODE` vazio + reconstruir + republicar | minutos | nenhum — a leitura não dependia |
| E3 protegido | interruptor vazio + republicar | minutos | volta ao legado |
| E5 legado desligado | **caro** — exige novo deploy do BFF | horas | é por isso que E4 dura semanas |

**A única etapa cara de desfazer é a última.** Todas as outras são uma variável de
ambiente e uma republicação — e é assim de propósito.
