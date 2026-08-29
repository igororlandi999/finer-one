# Frontend — plano de publicação da autenticação e do transporte protegido

> Escrito a **29/08/2026**. **Nada foi publicado, nada foi enviado.**
> O frontend está **17 commits à frente** de `origin/main` (`4e8b309`), todos locais.

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

O que sobe: os 17 commits. O que **não** muda no comportamento: nada de leitura.

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

### E2 — Ligar a autenticação, ainda com leitura legada

`VITE_AUTH_MODE=supabase` + `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

⚠️ **Esta é a etapa que o defeito acima tornava perigosa.** É segura **a partir de
`b99c97d`**, e não antes.

O que confirmar, e é o teste que importa:

- [ ] login funciona; um utilizador sem membership não vê dados financeiros;
- [ ] **trocar para a Finer Teste mostra "empresa sem dados ligados"** — e **não** os
      números da Overcel. É a verificação direta do defeito corrigido;
- [ ] trocar de volta para a Overcel mostra os números da Overcel;
- [ ] logout limpa o ecrã e não deixa resíduo de gráficos.

**Rollback:** repor `VITE_AUTH_MODE` vazio e republicar. A leitura nunca dependeu da
autenticação nesta etapa, por isso o rollback não tem efeito sobre os dados.

---

### E3 — Ligar o transporte protegido

`VITE_PROTECTED_DATA_TRANSPORT=true`. **Só depois de E2 estar estável, e nunca no mesmo
dia.**

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
| E1 commits | republicar `4e8b309` | minutos | nenhum |
| E2 auth | `VITE_AUTH_MODE` vazio + republicar | minutos | nenhum — a leitura não dependia |
| E3 protegido | interruptor vazio + republicar | minutos | volta ao legado |
| E5 legado desligado | **caro** — exige novo deploy do BFF | horas | é por isso que E4 dura semanas |

**A única etapa cara de desfazer é a última.** Todas as outras são uma variável de
ambiente e uma republicação — e é assim de propósito.
