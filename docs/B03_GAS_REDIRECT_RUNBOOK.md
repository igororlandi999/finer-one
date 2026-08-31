# B-03 / R-06 — a cadeia de redirects do Apps Script

> # ✅ B-03 ESTÁ FECHADO — 31/08/2026
>
> A `GAS_URL` foi fornecida **localmente** pelo Igor, a sonda correu, e a cadeia foi
> medida. **B-03 deixa de bloquear E3.** O resultado está logo abaixo.
>
> O resto do documento fica como está: descreve **como** se mediu e continua a ser o
> procedimento a repetir se o deployment do Apps Script alguma vez mudar.
>
> **A `GAS_URL` não foi impressa, não foi guardada e não entrou em commit nenhum.**

---

## ✅ O resultado — 31/08/2026

Medido com a `GAS_URL` real, fornecida localmente e usada só em memória.

```
  salto 0  host inicial: script.google.com
  salto 1  302 -> script.googleusercontent.com
  salto 2  200 (final)

  ── resumo ─────────────────────────────────────
  redirects seguidos : 1
  host final         : script.googleusercontent.com
  hosts distintos    : script.google.com, script.googleusercontent.com
  estado final       : 200
  content-type final : application/json
```

### O que isto responde

| Pergunta do B-03 | Resposta |
|---|---|
| Quantos saltos? | **Um.** |
| Para que hosts? | **`script.google.com` → `script.googleusercontent.com`** |
| Algum host inesperado? | **Nenhum.** Os dois são do Google e são exatamente os que a documentação do Apps Script descreve |
| O deployment está autorizado? | **Sim.** `200` final com `application/json` — se tivesse perdido a autorização viria `text/html`, a página de login |

**É exatamente a cadeia que se supunha, e agora é medida.** A diferença entre as duas
coisas é a razão de B-03 ter existido.

### A lista de hosts permitidos, que é o que R-06 precisava

```
script.google.com
script.googleusercontent.com
```

### O que continua por fazer — e é código, não medição

**R-06 fica com a evidência completa e o endurecimento por aplicar.** O BFF continua com
`redirect: "follow"` cego, e `test/upstream-redirects.test.mjs` prova que um `302` para
outro host seria seguido e o corpo de lá servido como o documento financeiro.

Trocar o `follow` cego por seguir com verificação de host contra os dois nomes acima é uma
alteração **pequena e localizada**, em dois ficheiros
(`api/companies/[companyId]/financial-data.js` e `api/pedidos/vendas.js`). Não se fez nesta
sessão porque é código do BFF e a sessão estava mandatada para correr o runbook do R-33.

**Quando for feita, o teste `SEGUE PARA OUTRO HOST` passa a falhar — e é suposto.** É esse
o sinal de que o endurecimento entrou. Trocar a expectativa por `502` e apagar o aviso do
cabeçalho do teste.

---

## O que B-03 pergunta

Quantos saltos tem a cadeia de redirects do Web App do Apps Script, e para que **hosts**.
A resposta fecha o **R-06**: hoje o BFF segue redirects **cegamente**
(`redirect: "follow"`), e com a lista de hosts reais passa a poder segui-los para uma
**lista de hosts permitidos**.

---

## O que esta sessão mediu sem a `GAS_URL`

Duas coisas que antes eram inferência e passam a ser facto.

### 1. As opções que o BFF passa ao upstream

Lidas do código e **verificadas no fio** por
`finer-one-proxy/test/upstream-redirects.test.mjs`:

| | |
|---|---|
| Método | `GET` |
| `redirect` | **`"follow"`** — cego, é o R-06 |
| Cabeçalhos | `Accept: application/json` e **mais nada** |
| **`Authorization`** | **NÃO é propagado.** O token de quem pede não viaja para o Apps Script — que está publicado como `ANYONE_ANONYMOUS` e não teria o que fazer com ele. Mandá-lo seria entregar uma credencial da Finer One a um terceiro, de graça |
| Timeout | 15 000 ms, por `AbortController` |
| `Content-Type` da resposta | forçado a `application/json; charset=utf-8` **só depois** de o corpo passar `corpoEhJsonDoContrato` |
| Cache | `Cache-Control: private, no-store` |
| Erro de rede / timeout | `502` com `code: UPSTREAM` / `TIMEOUT` — nunca `200` com corpo vazio |
| Estado do upstream | **nunca reencaminhado.** Qualquer `!ok` vira `502` (senão um `401` do Apps Script chegava ao frontend como `401` deste BFF e **terminava a sessão** do utilizador por avaria de terceiros) |

### 2. O que `redirect: "follow"` faz mesmo — medido, não suposto

**Isto nunca tinha sido exercido por teste nenhum.** Todos os outros testes do upstream
injetam `fetchImpl`, e um duplo é uma função: recebe `{ redirect: "follow" }` num objeto
de opções e **ignora-o**, porque não é um cliente HTTP. A opção que decide o comportamento
mais sensível do proxy estava documentada e não estava medida.

`test/upstream-redirects.test.mjs` fecha isso com o `fetch` real do Node contra servidores
`node:http` locais. Cinco testes, todos a passar:

| O que se mediu | Resultado |
|---|---|
| Cadeia dentro do mesmo host, dois saltos | seguida até ao fim; o corpo final é o que serve — é a forma da cadeia real do Apps Script |
| **Redirect para um host DIFERENTE** | **SEGUIDO.** O host alternativo é mesmo contactado e o corpo que vem de lá é servido como o documento financeiro, desde que tenha a forma do contrato. **É o R-06, em cima da mesa** |
| Cadeia infinita | o `fetch` do Node corta; o handler traduz em `502 UPSTREAM` e não pendura |
| Redirect que acaba em HTML (a página de login do Google) | `502 UPSTREAM_INVALIDO` — nunca `200` |
| O endereço nos registos | ausente. Nem host, nem query |

> **Nota para quem fechar o R-06:** o teste `SEGUE PARA OUTRO HOST` é de **caracterização**
> — descreve o risco, não a intenção. Ao acrescentar a lista de hosts permitidos ele passa
> a falhar, **e é suposto**. Trocar a expectativa por `502` e apagar o aviso do cabeçalho.

### Qual é o tamanho real do R-06

Menor do que parece. Para redirecionar o upstream é preciso **já controlar o Apps
Script** — e quem controla o Apps Script já controla os dados. O que estes testes medem
não é a probabilidade, é a **amplitude**: hoje, um upstream comprometido pode mandar o BFF
buscar o "documento financeiro" a qualquer host da internet. A lista de hosts permitidos
não impede o comprometimento; limita-o ao que o Google serve.

---

## O que falta, e como se corre quando houver a `GAS_URL`

`finer-one-proxy/scripts/gas-redirect-probe.mjs`. Escrito e **verificado ponta a ponta**
nesta sessão contra `script.google.com` com um id de deployment inventado (que não é
segredo): a cadeia é medida e nada de sensível é impresso.

```powershell
# PowerShell — o valor entra pelo AMBIENTE, nunca por argumento
$env:GAS_URL = "<colar aqui>"
node scripts/gas-redirect-probe.mjs
Remove-Item Env:GAS_URL
```

```bash
# bash
GAS_URL="<colar aqui>" node scripts/gas-redirect-probe.mjs
```

**Argumento da linha de comandos, não.** Um argumento fica no histórico da shell e na
lista de processos da máquina.

### O que o programa imprime

Número do salto, código de estado, e o **host** de cada `Location`. Mais o resumo:
redirects seguidos, host final, hosts distintos, estado final, `content-type`, tamanho do
corpo.

### O que nunca imprime

- a `GAS_URL`, inteira ou aos pedaços — nem o caminho, nem o id do deployment;
- querystrings, de qualquer salto;
- cabeçalhos de pedido ou de resposta que não sejam o **host** de um `Location`;
- o corpo da resposta final (só o tamanho).

Usa `redirect: "manual"` de propósito: com `follow`, o Node resolveria a cadeia por dentro
e não haveria nada para medir. `GET` e não `HEAD` — o Apps Script rejeita `HEAD` em vários
deployments, e um `405` no primeiro salto responderia a outra pergunta.

### Exemplo real da saída (id inventado, sem segredo)

```
  salto 0  host inicial: script.google.com
  salto 1  404 (final)

  ── resumo ─────────────────────────────────────
  redirects seguidos : 0
  host final         : script.google.com
  hosts distintos    : script.google.com
  estado final       : 404
  content-type final : text/html
```

Um id inválido dá `404` **sem redirect nenhum** — ou seja, a cadeia real só aparece com a
`GAS_URL` verdadeira. Confirma que B-03 precisa mesmo do valor e de mais nada.

---

## O que se faz com o resultado

1. **Ler a linha `hosts distintos`.** É literalmente a lista de hosts permitidos.
   Copiar **essa linha** — não o endereço;
2. se for `script.google.com, script.googleusercontent.com` (o esperado), **R-06 fecha**
   trocando `redirect: "follow"` por seguir à mão com verificação de host, ou por
   `redirect: "manual"` com uma lista;
3. se aparecer um host **inesperado**, parar: isso é um achado, não uma configuração;
4. se o `content-type` final **não** for `application/json`, o deployment perdeu
   autorização — é o caso que o BFF já traduz em `502 UPSTREAM_INVALIDO`, e está provado.

## O que este runbook NÃO faz

Não toca no BFF de Production. Não faz deploy. Não escreve. É uma leitura, com `GET`, ao
mesmo endereço que o BFF já lê a cada pedido.
