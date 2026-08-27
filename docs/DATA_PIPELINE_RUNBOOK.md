# Runbook — Pipeline de dados do Finer One

Este documento existe por um motivo concreto: em agosto de 2026 os dados da aplicação
estiveram parados **um mês** sem ninguém dar por isso, e descobrir porquê custou uma
investigação inteira. Se voltar a acontecer, este runbook deve resolver em minutos.

**A regra que resume tudo:** o backend devolve `HTTP 200` mesmo quando serve um snapshot
de há um mês. **Nunca assuma que 200 significa dados atuais.**

---

## 1. Arquitetura

```
Bling ERP (API v3)
      │  OAuth 2.0, refresh token rotativo
      ▼
Google Apps Script  ──────────────►  Google Drive (3 ficheiros JSON)
  projeto "Finer One"                  finer_one_pedidos_snapshot.json
  doGet + rebuilds                     finer_one_despesas_snapshot.json
      │                                finer_one_recebiveis_snapshot.json
      │  Web App (/exec)               finer_one_ajustes_manuais_overcel.json
      ▼
Vercel proxy  ── resolve CORS, não cacheia, não transforma
      ▼
Front React (Vite)
```

**O que serve e o que reconstrói são coisas diferentes.** O `doGet` apenas *lê* o
snapshot que estiver no Drive. Quem o *escreve* são as funções `runRebuild*`, e essas
só correm por acionador diário ou à mão. Foi precisamente a ausência desses acionadores
a causa da paragem de 2026.

### Recursos servidos

Todos no mesmo endpoint, distinguidos por `?recurso=`:

| Recurso | Query | Ficheiro no Drive | Função de rebuild |
|---|---|---|---|
| Pedidos de venda | *(sem parâmetro)* | `finer_one_pedidos_snapshot.json` | `runRebuildPedidosSnapshot` |
| Contas a pagar | `?recurso=despesas` | `finer_one_despesas_snapshot.json` | `runRebuildDespesasSnapshot` |
| Contas a receber | `?recurso=recebiveis` | `finer_one_recebiveis_snapshot.json` | `runRebuildRecebiveisSnapshot` |
| Ajustes manuais (CMV) | `?recurso=ajustes-manuais` | `finer_one_ajustes_manuais_overcel.json` | *(mantido à mão)* |

⚠️ **Um `recurso` desconhecido cai no ramo por omissão e devolve o snapshot de PEDIDOS.**
Um `?recurso=despesass` (com erro de escrita) responde `200` com centenas de pedidos.
Se um recurso parecer devolver dados estranhos, confirme primeiro a grafia.

---

## 2. Acionadores esperados

Projeto **Finer One** → *Acionadores*. Devem existir **exatamente três**, um por pipeline:

> ✅ **Instalados e verificados em 23/08/2026.** Os três instaladores foram corridos
> pelo editor, um de cada vez, e cada um registou `Gatilhos duplicados removidos: 1`.
> A idempotência foi provada empiricamente: **seis** invocações (3 + 3) e a lista
> continua a mostrar exatamente três acionadores, um por handler.
>
> Nota de operação: o estado encontrado **não** era zero — já existiam três
> acionadores, nunca executados. Correr os instaladores é seguro nesse caso: cada um
> substitui o do seu próprio handler e não toca nos outros dois.

| Função | Tipo | Janela | Fuso |
|---|---|---|---|
| `runRebuildPedidosSnapshot` | Baseado no tempo, diário | ~01:00 | America/Sao_Paulo |
| `runRebuildDespesasSnapshot` | Baseado no tempo, diário | ~02:00 | America/Sao_Paulo |
| `runRebuildRecebiveisSnapshot` | Baseado no tempo, diário | ~03:00 | America/Sao_Paulo |

**As horas são janelas, não horários.** O Apps Script dispara gatilhos horários algures
dentro da hora indicada. O escalonamento de 1 h existe porque os três rebuilds partilham
o mesmo `LockService`; se dois se cruzarem, o segundo falha a obter o lock e recupera no
dia seguinte — não corrompe nada.

### Reinstalar um acionador

Cada backend traz o seu instalador, **idempotente por construção** (apaga todos os
gatilhos da função-alvo antes de criar um):

| Instalador | Ficheiro | Verificador |
|---|---|---|
| `installDailyPedidosSnapshotTrigger` | `Código.gs` | `listPedidosSnapshotTriggers` |
| `installDailyDespesasSnapshotTrigger` | `Despesasbackend.gs` | `listDespesasSnapshotTriggers` |
| `installDailyRecebiveisSnapshotTrigger` | `RecebiveisBackend.gs` | `listRecebiveisSnapshotTriggers` |

Correr o instalador N vezes deixa sempre **um** gatilho. Nunca crie os acionadores pela
UI: ficariam invisíveis no código e voltaríamos ao problema de configuração implícita.

---

## 3. Diagnóstico rápido

### Passo 1 — o health check (30 segundos)

```bash
npm run check:data          # ou: node scripts/check-data-pipeline.mjs
npm run check:data -- --json
```

Só faz `GET`. Nunca escreve, nunca reconstrói, nunca imprime segredos. Devolve, por
recurso: nº de registos, `meta.geradoEm`, idade, `parcial`, e a data mais recente dos
movimentos. Códigos de saída: `0` tudo fresco · `1` avisos ou idade desconhecida ·
`2` falhas.

**Leia a linha CONJUNTO.** Vale pela fonte **mais antiga** — um conjunto não é mais
fresco do que a sua pior fonte.

### Passo 2 — se algo estiver velho, ver as Execuções

`script.google.com` → projeto Finer One → **Execuções**. Filtre por *Failed* / *Timed out*.

- Ignore as execuções de `doGet`: correm a cada carregamento e não escrevem nada.
- Procure `runRebuild*` de tipo **Trigger**. Tipo `Editor` significa que alguém correu à
  mão — não é automação.

⚠️ **O log de execuções expira.** Uma paragem com mais de uma semana pode já não ter
registo. Nesse caso, procure no email do dono do script por
`apps-scripts-notifications@google.com` (*«Summary of failures for Google Apps Script»*),
que sobrevive à expiração dos logs.

### Passo 3 — os Acionadores

Mesma consola → **Acionadores**. Confirme os três da secção 2 e a coluna *Taxa de erros*.
Se estiverem em falta, corra os instaladores.

⚠️ A vista *Meus acionadores* só mostra os acionadores **da sua conta**. Se o script foi
configurado noutra conta Google, os acionadores dela são invisíveis aqui — e isso parece
exatamente igual a «não existe acionador nenhum».

---

## 4. Vocabulário: o que cada palavra significa

Estes conceitos são **independentes** e confundi-los foi a origem de mais de um defeito.

| Termo | Onde vive | O que significa |
|---|---|---|
| `geradoEm` | `meta.geradoEm` de cada recurso | Quando o snapshot foi **escrito**. Não diz nada sobre o conteúdo. |
| `parcial` | `meta.parcial` | O rebuild **não terminou** de hidratar. Recente e incompleto ao mesmo tempo. |
| `fresh` | UI | Menos de 24 h. |
| `warning` | UI | Entre 24 h e 72 h. |
| `stale` | UI | Mais de 72 h — o pipeline provavelmente parou. |
| `unknown` | UI | A fonte **não declarou** data. **Não saber a idade não é o mesmo que estar fresco.** |

**Frescura ≠ completude.** Um snapshot pode ter cinco minutos e estar incompleto. O
front transporta as duas propriedades em separado (`meta.geradoEm` e `meta.parcial`) por
esse motivo.

**`closedThroughMonth` é outra coisa ainda**: é uma declaração *contabilística* de que
um mês está fechado, hoje mantida à mão em `src/config/company.js`. Não é derivada dos
dados e não deve ser confundida com cobertura ou frescura.

---

## 5. Rebuild manual

Editor do Apps Script → escolher o ficheiro → escolher a função no seletor → **Executar**.
Acompanhar em *Registo de execução*.

| Função | Duração típica |
|---|---|
| `runRebuildPedidosSnapshot` | ~80 s |
| `runRebuildDespesasSnapshot` | ~20 s |
| `runRebuildRecebiveisSnapshot` | ~60 s (mais, se houver atraso acumulado) |

### Recebíveis podem precisar de mais do que uma passagem

O rebuild tem um orçamento de ~5 min (`REBUILD_TIME_BUDGET_MS`) contra o limite de ~6 min
do Apps Script. Com atraso acumulado, esgota o tempo e grava um snapshot **PARCIAL**:

```
Orcamento de tempo atingido. Salvando snapshot PARCIAL de recebiveis.
PARCIAL: rode *** novamente para continuar.
```

**Isto não é um erro.** É o desenho a funcionar: cada passagem hidrata mais um lote e
reaproveita o anterior. Correr outra vez até o log dizer `concluido` sem `(PARCIAL)`.
Em agosto de 2026 foram precisas duas passagens (303 s + 64 s) para recuperar um mês.

Depois de qualquer rebuild manual, confirmar com `npm run check:data`.

---

## 6. Publicação e rollback

O Web App serve uma **versão congelada**, não o código guardado. Guardar no editor
**não** altera o que a aplicação recebe — foi esta a razão de as alterações de metadata
parecerem não fazer efeito.

**Publicar:** *Implantar → Gerenciar implantações → ✏️ editar → Versão: «Nova versão» →
Implantar*. Isto **atualiza a implantação existente**: mesmo Deployment ID, mesmo URL.

⚠️ **Nunca usar «Nova implantação».** Criaria um URL diferente e o proxy deixaria de
encontrar o backend.

**Rollback:** o mesmo caminho, escolhendo a versão anterior na lista. As versões antigas
ficam arquivadas e o ID e o URL não mudam.

Histórico relevante: Versão 9 (21/08/2026) → Versão 10 (22/08/2026, emissão de
`meta.geradoEm` nos três recursos).

---

## 7. Regras que não se negoceiam

- **Nunca usar mock como fallback de erro.** Uma falha de ligação apresentada como «modo
  demonstração» diz ao utilizador que os números falsos no ecrã são intencionais. Os
  quatro estados de origem (`loading`, `api`, `mock`, `unavailable`) existem
  precisamente para não colapsar avaria e escolha — ver `src/utils/dataSourceStates.js`.
- **Nunca inventar `geradoEm`** a partir do relógio local nem inferi-lo do último
  movimento. Ausência de data é `null`, e a UI diz «desconhecida».
- **Nunca assumir que `HTTP 200` significa dados atuais.**
- **Não mexer em `closedThroughMonth` sem especificação.** Mudá-lo altera o mês de
  referência da DRE e, com ele, todos os números financeiros apresentados.

---

## 8. Problema conhecido: clasp em Windows

O projeto tem dois ficheiros cujos nomes diferem **apenas em maiúsculas/minúsculas**:

```
Testecategoriasdespesas.gs
TesteCategoriasDespesas.gs
```

O sistema de ficheiros do Windows não os distingue, por isso `clasp clone` traz 14 de 15
ficheiros — o segundo sobrescreve o primeiro.

**Ambos têm conteúdo byte-a-byte idêntico** (263 linhas, as mesmas 6 funções de
diagnóstico read-only), verificado em 22/08/2026. Não se perdeu código: é um ficheiro
duplicado, e no escopo global do Apps Script as suas funções estão declaradas duas vezes.

**Enquanto isto não for resolvido, NÃO usar `clasp push`** a partir de um clone feito em
Windows: enviaria 14 ficheiros contra 15 remotos.

Resolução recomendada (por ordem): apagar **um** dos dois no editor → re-clonar →
confirmar contagem → só então permitir `clasp push`. O clone local em `apps-script/`
serve entretanto como referência de leitura.

> ✅ **RESOLVIDO em 23/08/2026.** `Testecategoriasdespesas.gs` foi removido do remoto;
> sobreviveu `TesteCategoriasDespesas.gs`. O remoto tem 15 ficheiros e o clone local
> tem 15 — sem colisões, com os hashes a conferir. Registo completo em
> `docs/APPS_SCRIPT_SOURCE_OF_TRUTH.md`.
>
> **Atenção ao re-clonar:** `clasp pull` não basta sozinho. O nome antigo em minúsculas
> continua em disco e o NTFS reescreve-o. É preciso limpar os fontes primeiro:
> `rm -f apps-script/*.js apps-script/appsscript.json` e só depois `clasp pull`
> (preservando `.clasp.json`).

---

## 9. Provar que um acionador REALMENTE dispara

> ✅ **Provado em 23/08/2026, para os três pipelines.** As execuções abaixo aparecem em
> *Execuções* com **Tipo: `Baseado no tempo`** — não `Editor`, não `App da Web`:
>
> | Função | Hora (SP) | Duração | Estado | `parcial` |
> |---|---|---|---|---|
> | `runRebuildPedidosSnapshot` | 00:36:26 | 9,5 s | Concluído | `false` |
> | `runRebuildDespesasSnapshot` | 00:48:57 | 5,8 s | Concluído | `false` |
> | `runRebuildRecebiveisSnapshot` | 00:55:48 | 36,2 s | Concluído | `false` |
>
> Recebíveis **não** precisou de segunda passagem. Integridade verificada nos três: as
> contagens (1071 / 301 / 1390), os hashes de IDs, os totais e os meses de junho e julho
> ficaram **byte-a-byte iguais** — o rebuild consolida, não substitui.
>
> ✅ **E o acionador diário disparou sozinho.** Às **01:06:08** de 23/08/2026,
> `runRebuildPedidosSnapshot` correu com Tipo `Baseado no tempo`, 7,4 s, Concluído —
> **com o one-shot já apagado**, pelo que só pode ter vindo do acionador diário
> instalado. `geradoEm` avançou para `04:06:13.794Z` e a integridade manteve-se.
> É a prova que faltava: a automação funciona sem intervenção.


Correr `runRebuildPedidosSnapshot` pelo botão **Executar** prova que a *função*
funciona. Não prova que o **mecanismo de acionadores** funciona: uma execução manual
aparece nas Execuções com origem **Editor**, não **Acionador**, e foi precisamente a
ausência de acionadores — não um defeito das funções — que parou os dados durante um mês.

A prova exige uma execução cuja origem seja o próprio `ScriptApp`. Faz-se com um
acionador **descartável** de disparo único, sem tocar nos horários definitivos.

**A via mais simples não precisa de código nenhum.** Em *Acionadores* →
**Adicionar acionador**, escolher a função, `Baseado no tempo` e o tipo
**«Data e hora específicas»** — é um one-shot nativo. Formato do campo:
`AAAA-MM-DD HH:MM`, no fuso indicado ao lado do rótulo (GMT-03:00).

⚠️ **O one-shot NÃO se apaga sozinho.** Depois de disparar fica na lista como
**«Desativado»**. Tem de ser removido à mão: ⋮ → *Excluir acionador*. Confirmar
sempre que a lista volta a três.

O ajudante em código abaixo continua válido — útil para quem prefira `after(ms)` —
mas já não é necessário.

### O ajudante descartável

Colar no editor (qualquer ficheiro `.gs`), correr, e **apagar quando o teste terminar**.
Usa só `ScriptApp`, o mesmo âmbito que os instaladores definitivos já usam: não pede
permissões novas, não mexe em OAuth e não exige publicar versão.

```javascript
/** Acionador de disparo ÚNICO, daqui a `minutos`. Só para provar a origem "Acionador". */
function criarTesteOneShot(nomeFuncao, minutos) {
  ScriptApp.newTrigger(nomeFuncao)
    .timeBased()
    .after((minutos || 2) * 60 * 1000)
    .create();
  Logger.log('One-shot criado para ' + nomeFuncao + ' (~' + (minutos || 2) + ' min).');
}

/** Lista TODOS os acionadores do projeto, com handler e tipo. */
function listarTodosOsTriggers() {
  var t = ScriptApp.getProjectTriggers();
  Logger.log('Total: ' + t.length);
  for (var i = 0; i < t.length; i++) {
    Logger.log('  ' + t[i].getHandlerFunction() + '  |  ' + t[i].getEventType() + '  |  uid ' + t[i].getUniqueId());
  }
  return t.length;
}

/** Remove os acionadores de uma função — usar para limpar o one-shot se ele sobrar. */
function removerTriggersDe(nomeFuncao) {
  var t = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < t.length; i++) {
    if (t[i].getHandlerFunction() === nomeFuncao) { ScriptApp.deleteTrigger(t[i]); n++; }
  }
  Logger.log('Removidos: ' + n);
  return n;
}
```

> `after()` dispara **uma vez** e o acionador é descartado pelo Apps Script. Ainda assim,
> confirmar com `listarTodosOsTriggers()` — um one-shot esquecido é lixo silencioso.

### Procedimento, um pipeline de cada vez

Nunca dois em simultâneo: os três rebuilds partilham o mesmo `LockService`.

1. `npm run check:data` — anotar o `geradoEm` atual do pipeline a testar.
2. `criarTesteOneShot('runRebuildPedidosSnapshot', 2)`.
3. `listarTodosOsTriggers()` — confirmar que o one-shot lá está.
4. Esperar. **Execuções** → a linha nova tem de dizer:
   - função `runRebuildPedidosSnapshot`;
   - **Tipo de implementação / origem: `Acionador`** — é este o campo que interessa,
     e é o único que distingue este teste de um `Executar` manual;
   - estado **Concluído**, duração coerente, sem erro.
5. `npm run check:data` — o `geradoEm` tem de ser **posterior** ao anotado, e
   `parcial` tem de continuar `false`.
6. `listarTodosOsTriggers()` — confirmar que o one-shot desapareceu. Se sobrou:
   `removerTriggersDe('runRebuildPedidosSnapshot')`.

Repetir para `runRebuildDespesasSnapshot` e depois `runRebuildRecebiveisSnapshot`.

**Recebíveis:** se sair `parcial: true`, **não é falha do mecanismo** — é o
comportamento descrito na secção 5, e a origem `Acionador` continua provada. Correr uma
segunda passagem e registar que foram precisas duas.

### Só depois: instalar os definitivos

```
installDailyPedidosSnapshotTrigger()
installDailyDespesasSnapshotTrigger()
installDailyRecebiveisSnapshotTrigger()
```

Um de cada vez, e no fim `listarTodosOsTriggers()`: têm de existir **exatamente três**,
um por handler, e nenhum one-shot.

### Provar a idempotência

Correr os três instaladores **outra vez** e listar de novo. O total tem de continuar em
três — cada instalador apaga os acionadores do seu próprio handler antes de criar o novo
(`getHandlerFunction() === alvo`), pelo que nunca acumula nem toca nos dos outros dois.
Se aparecerem 2/2/2, a idempotência está partida e não se avança.

---

## 10. Referência rápida

```bash
npm run check:data            # estado do pipeline, read-only
npm test                      # suíte completa
npm run build                 # build de produção do front
```

| Onde | O quê |
|---|---|
| `scripts/check-data-pipeline.mjs` | Health check read-only |
| `src/services/blingDataService.js` | Única fronteira entre o Bling e o formato interno |
| `src/utils/dataFreshness.js` | Limiares de frescura (24 h / 72 h) |
| `src/utils/dataHealth.js` | Frescura × completude, os dois eixos |
| `docs/APPS_SCRIPT_SOURCE_OF_TRUTH.md` | Estado e readiness do versionamento (READY) |
| `docs/APPS_SCRIPT_API_CONTRACT.md` | Contrato HTTP de cada recurso |
| `docs/DATA_HEALTH_CONTRACT.md` | Regras da faixa de saúde dos dados |
| `diagnostico/julhoElegibilidade.mjs` | Matriz de elegibilidade de um mês (read-only) |
| `diagnostico/julhoNaoClassificados.mjs` | Títulos sem categoria reconhecida (read-only) |
| `src/utils/dataSourceStates.js` | Os quatro estados de origem |
| `src/services/producao.fixtures.js` | Shapes REAIS de produção, sanitizados |
| `apps-script/` | Clone do Apps Script — 100% do remoto desde 23/08/2026 |
| `src/utils/coverageContract.test.js` | Testes caracterizadores do risco `closedThroughMonth: null` |

---

## 11. Rate limit do Bling — o que esperar nos registos

*(Auditoria de 23/08/2026. Detalhe completo em `docs/BLING_RATE_LIMIT_E_RESILIENCIA.md`.)*

O Bling permite **3 pedidos por segundo**. Até esta auditoria, só o laço de detalhe tinha
throttle (`DETAIL_THROTTLE_MS = 500`); as listagens e os mapas de apoio disparavam em
rajada. Consequência medida: `runRebuildDespesasSnapshot` das 02:05 apanhou **HTTP 429**
em `/formas-pagamentos`; a execução das 00:48, com a mesma sequência, escapou por sorte.

### Mensagens novas nos registos *(depois de publicado)*

| Mensagem | O que significa | O que fazer |
|---|---|---|
| `HTTP 429 em <path> … Backoff 1100ms, tentativa 1/3.` | Rate limit apanhado; a repetir | Nada. É o mecanismo a funcionar |
| `HTTP 429 recuperado em <path> apos N tentativa(s).` | Recuperou | Nada |
| `Bling GET <path> falhou (HTTP 429)` | Esgotou as 3 tentativas | Ver se há outra integração a consumir a mesma conta |
| `… devolveu HTTP 200 com corpo ilegivel (JSON invalido, N bytes).` | Resposta 2xx que não é JSON | **Investigar.** Antes, isto virava um lote vazio em silêncio |
| `ABORTADO: listagem … veio VAZIA mas o snapshot anterior tem N titulos. Snapshot anterior PRESERVADO` | Guarda P0 disparou | **Investigar antes do rebuild seguinte.** O snapshot bom está intacto |

### `Aviso: nao foi possivel listar formas de pagamento`

**Não é um problema financeiro.** `formaPagamento.nome` alimenta apenas o rótulo *método*
na lista de Despesas. Não entra em `classifyPayable`, nem na DRE, nem no EBITDA, nem em
totais. Fixado como invariante em
`src/utils/invariantesFinanceiros.contaminacao.test.js`.

**O aviso equivalente sobre categorias, esse, importa.** `Aviso: nao foi possivel listar
categorias … Tudo ficara Sem categoria` significa que os títulos hidratados nessa execução
ficam por classificar e caem fora da DRE. **Auto-cura no rebuild seguinte**
(`precisaResolverCategoria_` retenta o que está como "Sem categoria"), mas durante um dia
os números do mês estão subavaliados. Se aparecer, forçar um rebuild manual em vez de
esperar pela madrugada.

### Limite de escala conhecido

A listagem de `/contas/receber` é sempre integral — não há filtro de data confirmado.
Hoje: 14 páginas em ~27 s. A **~5–6× o volume atual (≈70–84 páginas)** a listagem sozinha
consome o orçamento de 5 minutos, todas as execuções passam a gravar `parcial: true`, e
**o rebuild deixa de convergir** — não há cursor de continuação, cada execução recomeça na
página 1. É o único risco desta auditoria que piora sozinho com o crescimento do negócio.

---

## 12. Guarda P0 — zero por falha nunca substitui um snapshot bom

*(Local; entra em vigor com o próximo push.)*

Regra: **uma listagem vazia só substitui o snapshot quando o snapshot anterior também
estava vazio.** Havendo histórico, o rebuild aborta sem gravar e regista
`ABORTADO: … PRESERVADO`.

Pedidos nunca precisou desta guarda — o snapshot é o merge de histórico + janela, e uma
janela vazia não apaga nada. Despesas e recebíveis substituem a lista inteira e não tinham
proteção nenhuma.

**Se uma empresa chegar legitimamente a zero títulos**, o rebuild vai abortar todos os dias
e registá-lo. Desbloqueio deliberado: apagar o ficheiro de snapshot no Drive. É suposto ser
um gesto humano — é uma perda total de dados.
