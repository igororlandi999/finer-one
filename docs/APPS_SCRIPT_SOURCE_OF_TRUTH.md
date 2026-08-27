# Apps Script — `apps-script/` como fonte de verdade

**Estado: colisão RESOLVIDA em 23/08/2026.** O clone local representa agora 100 % do
projeto remoto. Falta apenas o passo humano de versionar (`git add`) e, a partir daí,
`clasp push` fica tecnicamente destravado.

> **ATUALIZAÇÃO 23/08/2026 (tarde) — `clasp push` está BLOQUEADO.**
> Não por causa desta colisão, que continua resolvida, mas por uma definição de conta:
> a *Google Apps Script API* está desligada em `script.google.com/home/usersettings`.
> Leituras (`status`, `deployments`, `versions`) funcionam; só a escrita é rejeitada.
> A conta autenticada é `igororlandibarros@gmail.com` — a correta.
> **Os três P0 estão prontos e verdes localmente, e nenhum está em produção.**
> Passo a passo para publicar: [`PUBLICACAO_P0_CHECKLIST.md`](./PUBLICACAO_P0_CHECKLIST.md).

O único componente que **escreve** os dados da aplicação vive no Apps Script. Até aqui
estava fora do git: sem diff, sem revisão, sem histórico. O que o impedia era uma
colisão de nomes — este documento regista o problema, a correção e o que falta.

---

## 1. O problema, como era

O projeto remoto tinha **16 ficheiros**. Um `clasp pull` em Windows trazia **15**.

| | |
|---|---|
| `Testecategoriasdespesas.gs` | 12 154 bytes · 263 linhas · `sha256:69047e6f32380093…` |
| `TesteCategoriasDespesas.gs` | 12 154 bytes · 263 linhas · `sha256:69047e6f32380093…` |

Os dois nomes diferiam **apenas na caixa** de duas letras. O NTFS é insensível à caixa:
o segundo ficheiro escrito sobrepunha o primeiro, e o clone ficava com uma cópia sob o
nome criado primeiro. Foi por isso que a auditoria inicial não conseguiu compará-los —
**não havia dois ficheiros em disco para comparar**.

A verificação byte-a-byte teve de ser feita **em memória**, sobre a resposta de
`projects.getContent`, antes de qualquer escrita em disco. Confirmou-se: conteúdo
idêntico, mesmo hash.

### Efeito no escopo global

O Apps Script não tem módulos: todos os `.gs` partilham um único escopo global. Ter o
ficheiro duas vezes significava **8 símbolos declarados duas vezes**:

```
DIAG_AMOSTRA_TITULOS                 var
DIAG_MAX_CATEGORIAS_LOG              var
runDiagnosticarCategoriasDespesas    function
diagChamadaCategoriasCrua_           function
diagBuildCategoriasMap_              function
diagAmostraTitulos_                  function
diagSnapshotExistente_               function
diagConclusao_                       function
```

Eram os **únicos** duplicados: dos 219 símbolos globais do projeto, mais nenhum aparecia
duas vezes.

**Porque ainda funcionava.** As duas constantes usavam `var`, que tolera redeclaração —
a segunda vencia, com o mesmo valor. As funções idem.

**Porque era uma bomba-relógio.** Trocar um `var` por `const` ou `let` numa das cópias
transformaria isto num `SyntaxError` de **carregamento**, derrubando o projeto **inteiro**
— `doGet` e os três rebuilds incluídos. Não seria uma falha na função de diagnóstico:
seria o projeto a não carregar.

O próprio Google sinalizava o problema. No diálogo *Adicionar acionador*:

> *«Este projeto contém uma ou mais funções com o mesmo nome. A escolha de uma dessas
> funções resultará em um comportamento indefinido.»*

E na lista de funções, `runDiagnosticarCategoriasDespesas` aparecia marcada com `*`.

---

## 2. Nada dependia do nome do ficheiro

Provado, não presumido:

- **O escopo é global e por símbolo, não por ficheiro.** Nenhuma chamada qualifica uma
  função pelo ficheiro onde vive — não existe sintaxe para isso no Apps Script.
- **`grep -i "testecategoriasdespesas"` em todo o projeto** devolvia uma única ocorrência
  que não era declaração: o cabeçalho do próprio ficheiro, que se identificava como
  `TesteCategoriasDespesas.gs`.
- **Nenhuma das 6 funções era chamada por outro ficheiro.** São pontos de entrada de
  diagnóstico *read-only*, executados à mão pelo editor.

Auditoria de segurança antes de remover: **nenhuma escrita** (`setContent`, `DriveApp`,
`PropertiesService`, operações sobre acionadores — todas ausentes), **nenhum segredo**,
e uma só chamada de rede: um `GET` a `/categorias/receitas-despesas`.

---

## 3. O que foi feito

**Sobreviveu `TesteCategoriasDespesas.gs`** (CamelCase). Duas razões independentes:

1. **O ficheiro identificava-se assim a si próprio**, na primeira linha do cabeçalho.
2. **É a convenção do projeto**: `TesteContasPagar`, `TesteEnriquecimentoDespesas`,
   `TesteReavaliacaoCategoria`, `TesteAjustesManuaisBackend`, `ValidacaoRebuildRecebiveis`.
   `Testecategoriasdespesas` era o único fora do padrão — nasceu de um engano de escrita.

**Foi apagado, não renomeado.** Renomear deixaria os 8 símbolos declarados duas vezes:
o problema do escopo global permaneceria, escondido atrás de dois nomes que já não
pareceriam duplicados. A duplicação não tinha valor a preservar — as duas cópias eram o
mesmo byte.

Removido pelo editor web em 23/08/2026. O diálogo de confirmação nomeou o alvo
explicitamente — `"Testecategoriasdespesas.gs"` —, o que serviu de verificação final.

### Verificação pós-remoção

| Verificação | Resultado |
|---|---|
| Ficheiros no HEAD remoto | **15** (era 16) |
| Grupos de conteúdo idêntico | **0** |
| Colisões case-insensitive | **0** |
| `doGet` (recurso principal) | 1071 pedidos · HTTP 200 |
| `?recurso=despesas` | 301 títulos · HTTP 200 |
| `?recurso=recebiveis` | 1390 títulos · HTTP 200 |
| `?recurso=ajustes-manuais` | documento presente · HTTP 200 |
| Erros de carregamento nas Execuções | nenhum |
| Acionadores diários | 3, intactos |

### Re-clone limpo

O `clasp pull` **não** basta por si: o nome antigo em minúsculas continuava em disco e o
NTFS reescrevia-o. Foi preciso limpar os fontes primeiro (preservando `.clasp.json`) e só
depois puxar:

```bash
rm -f apps-script/*.js apps-script/appsscript.json
cd apps-script && clasp pull      # Pulled 15 files
```

Resultado: **15 no remoto, 15 em disco**, zero colisões, e os **15 hashes conferem** um a
um contra o conteúdo lido pela API. `apps-script/` representa finalmente 100 % do projeto.

---

## 4. Auditoria de segredos

Feita antes de propor o versionamento. Nada em `apps-script/` deve ir para o git sem isto.

| Item | Veredito |
|---|---|
| `.clasp.json` | Só `scriptId` e opções de extensão. O `scriptId` é um identificador, não uma credencial: aceder ao projeto exige OAuth. Seguro. |
| `appsscript.json` | Fuso, runtime, logging e config do Web App. Sem segredos. |
| Literais de credenciais | Apenas **placeholders** em `Código.js:93-95` (`'COLE_AQUI_O_CLIENT_ID'`, …), com uma guarda que rejeita valores por preencher. |
| Strings tipo token | Nenhuma. |
| Script Properties | **Não fazem parte do código-fonte** e o `clasp` nunca as puxa. É lá que vivem `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET` e os tokens. |
| `.gitignore` | Cobre `.env`. O `~/.clasprc.json` (credenciais do clasp) vive na *home* do utilizador, fora do repositório. |

**Conclusão: `apps-script/` é seguro para versionar.**

### Um ponto a registar, não um segredo

`appsscript.json` declara `"access": "ANYONE_ANONYMOUS"`. O Web App é publicamente
acessível sem autenticação — é o que permite ao proxy Vercel chamá-lo. Não é um segredo
exposto, mas é uma decisão de superfície de ataque que convém ser deliberada e não
esquecida.

---

## 5. Veredito de readiness — **READY**

Auditoria completa em 23/08/2026. Nenhum bloqueio técnico ao primeiro `clasp push`.

| Verificação | Resultado |
|---|---|
| Remoto = local | **15 = 15**, os 15 hashes conferem |
| Colisões case-insensitive | **0** |
| Símbolos globais duplicados | **0** (eram 8) |
| Encoding | **UTF-8 válido** nos 15 ficheiros |
| BOM | **nenhum** |
| Fins de linha | **CRLF uniforme** em todos — sem mistura |
| Ficheiros inesperados / gerados | **nenhum** (16 ficheiros: 15 fonte + `.clasp.json`) |
| Segredos | **nenhum** (ver §4) |
| `.clasprc.json` dentro do repositório | **não** — vive na *home* do utilizador |
| `apps-script/` ignorado pelo git | **não** — entra normalmente |
| Peso | **270 KB**, nenhum ficheiro acima de 100 KB |

### Fins de linha, em detalhe

`core.autocrlf = true` e não existe `.gitattributes`. Na prática: o git normaliza para
**LF** ao gravar no repositório e devolve **CRLF** no checkout em Windows — que é
exatamente o que o `clasp` escreve e espera. Não há risco de churn nem de diffs
fantasma.

*Melhoria opcional, deliberadamente NÃO aplicada:* um `.gitattributes` com
`apps-script/** text eol=crlf` tornaria isto determinístico independentemente da
configuração de quem clona. Não foi criado porque `.gitattributes` afeta o repositório
inteiro e essa é uma decisão que merece ser tomada de propósito, não como efeito
secundário desta auditoria.

---

## 6. O que falta

Passos humanos, deliberadamente **não** executados nesta sessão:

1. **Versionar:**
   ```bash
   git add apps-script/
   git commit -m "chore: versiona o backend Apps Script como fonte de verdade"
   ```
2. **A partir daí, `apps-script/` manda.** Qualquer alteração feita diretamente no editor
   web passa a ser uma divergência a reconciliar, não uma edição legítima.
3. **Primeiro `clasp push` deliberado e verificado.** Não usar `--watch` à partida: é o
   momento em que o git passa a poder sobrepor produção.

### Dívida adjacente, agora visível

`SNAPSHOT_TIMEZONE` está declarada **só** em `Código.gs` e é usada por
`Despesasbackend.gs` e `RecebiveisBackend.gs`. Funciona pelo escopo global partilhado,
mas é um acoplamento invisível: apagar ou renomear `Código.gs` parte silenciosamente os
instaladores dos outros dois. Com o versionamento em vigor, passa a ser detetável em
revisão — mas continua por resolver.

---

## 7. Reauditoria de 23/08/2026 (tarde) — o que mudou

A sessão de auditoria alterou **três** ficheiros de fonte e acrescentou **quatro**
ficheiros de teste. O veredito READY da §5 mantém-se, com uma correção nova e um bloqueio
novo que não existia quando foi escrito.

### 7.1 Divergência deliberada face a produção

`apps-script/` **deixou de ser idêntico ao remoto**. É intencional e está documentado:

| Ficheiro | Alteração | Documento |
|---|---|---|
| `Código.js` | espaçamento de 350 ms + backoff de 429 em `blingGet_` | `BLING_RATE_LIMIT_E_RESILIENCIA.md` §2 |
| `Código.js` | `safeParse_` endurecido — 2xx ilegível deixa de virar lote vazio | idem §4.1 |
| `Código.js` | `podeGravarListagemVazia_` + `RECURSOS_SUPORTADOS` + guarda no `doGet` | idem §4.1, `APPS_SCRIPT_SEGURANCA.md` §4 |
| `Despesasbackend.js` | guarda de listagem vazia | `BLING_RATE_LIMIT_E_RESILIENCIA.md` §4.1 |
| `RecebiveisBackend.js` | guarda de listagem vazia + redação de dados pessoais | idem, `APPS_SCRIPT_SEGURANCA.md` §3.2 |

**Enquanto não houver push, produção corre o comportamento antigo.** Em concreto: os
481 CPF continuam expostos e um `?recurso=xyz` continua a devolver pedidos.

### 7.2 Bloqueio novo — e corrigido: `clasp push` levaria os testes

`.clasp.json` declara `scriptExtensions: [".js", ".gs"]`, `rootDir: ""` e
`skipSubdirectories: false`. Os quatro `*.test.js` desta pasta importam `vitest` e
`node:fs` — módulos que não existem no runtime da Google. Um push sem filtro enviava-os e
o projeto remoto ficava com ficheiros que não compilam.

Criado `apps-script/.claspignore`. **Confirmar sempre com `clasp status`, que lista
exatamente o que seria enviado.**

### 7.3 Inventário atual

```
14 ficheiros de fonte .js   +  appsscript.json      =  15  a enviar   (bate com o remoto)
 4 ficheiros *.test.js                              =   0  a enviar   (.claspignore)
 .clasp.json, .claspignore                          =   0  a enviar   (config local)
```

| Verificação | Resultado |
|---|---|
| Sintaxe (`node --check`) nos 18 `.js` | **passa** |
| Símbolos globais duplicados entre ficheiros | **0** |
| Segredos | **0** — `setCredentials_` continua com `COLE_AQUI_*` |
| `doPost` | **não existe** — a única entrada HTTP é `doGet` |
| Fins de linha | **CRLF uniforme**, incluindo os ficheiros novos |
| Testes do lado Apps Script | **61 testes, todos verdes** |

---

## 8. Checklist do primeiro `clasp push`

Por ordem. Parar em qualquer passo que não confirme.

### Antes

- [ ] `npm test` verde (a suíte inclui os 61 testes de `apps-script/`).
- [ ] `git add apps-script/ && git commit` — **versionar antes de publicar**, para haver
      um ponto de retorno que não dependa do editor web.
- [ ] `clasp status` — confirmar a lista de envio: **15 ficheiros**, e
      **nenhum `.test.js`**. Se algum aparecer, PARAR e rever o `.claspignore`.
- [ ] `clasp pull` para uma pasta **descartável** e comparar com `apps-script/`. Só devem
      divergir os três ficheiros da §7.1. Qualquer outra divergência é uma edição feita no
      editor web que ainda não está no repositório — **reconciliar primeiro**.
- [ ] Comparar o `appsscript.json` remoto com o local. O local não declara `oauthScopes`;
      se o remoto os declarar, o push pode removê-los e forçar reautorização. Havendo
      diferença, alinhar o local **antes** de enviar.
- [ ] Registar a versão atualmente implantada (**Versão 10**) — é o alvo de rollback.

### Push

- [ ] `clasp push` **sem `--watch`**. `--watch` transforma cada gravação local numa
      publicação, e este é precisamente o momento em que o git passa a poder sobrepor
      produção.
- [ ] Confirmar no editor web que os 15 ficheiros lá estão e que **não** apareceu nenhum
      ficheiro de teste.

### Publicar (passo separado — o push não implanta)

- [ ] Implantar como **NOVA versão** do Web App. **Não sobrepor a Versão 10.**
- [ ] Testar a nova URL `/exec` antes de apontar o proxy:
      - [ ] sem parâmetro → 1071 pedidos
      - [ ] `?recurso=despesas` → 301 títulos
      - [ ] `?recurso=recebiveis` → 1390 títulos **e `contato` com exatamente `id`,
            `nome`, `tipo`** — nada mais. A redação passou a ser allow-list, por isso a
            verificação também é: confirmar a ausência de `numeroDocumento` já não chega.
      - [ ] `?recurso=ajustes-manuais` → documento, não lista
      - [ ] `?recurso=xyz` → `{ "error": true, "code": "RECURSO_DESCONHECIDO" }`
      - [ ] `?recurso=` *(vazio)* → 1071 pedidos *(retrocompatibilidade)*
- [ ] Só então apontar o proxy para a nova versão.
- [ ] `npm run check:data` → **SAUDÁVEL**, três fontes `parcial=false`.

### Na madrugada seguinte

- [ ] Execuções → filtrar por **Baseado no tempo**. Esperado: 3 execuções, todas
      `Concluído`.
- [ ] Confirmar nos registos que **não** há `HTTP 429` — e, se houver, que aparece
      `HTTP 429 recuperado em … apos N tentativa(s)`.
- [ ] Confirmar que **não** aparece `ABORTADO: listagem … veio VAZIA`.
- [ ] Acionadores → continuam **exatamente 3**, taxa de erros 0%.

### Rollback

Reimplantar a **Versão 10** e apontar o proxy de volta. O `clasp push` altera o código do
projeto, mas a implantação ativa continua a ser a que estiver selecionada — por isso é que
publicar uma versão nova, em vez de sobrepor, é o que torna o rollback imediato.

### Dívida que continua por resolver

`SNAPSHOT_TIMEZONE` está declarada **só** em `Código.js` e é usada pelos instaladores de
gatilhos de `Despesasbackend.js` e `RecebiveisBackend.js`. Funciona pelo escopo global
partilhado, mas apagar ou renomear `Código.js` parte-os silenciosamente.
