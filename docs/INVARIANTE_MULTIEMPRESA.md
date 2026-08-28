# O invariante multiempresa

> Uma página. É a regra que qualquer código novo tem de respeitar.

---

## A regra

> **Uma resposta pertence a um triplo: `(sessão, empresa, geração)`.**
>
> Só escreve no estado quem ainda é o triplo atual.
> Uma resposta obsoleta termina em silêncio.

E a sua consequência de apresentação:

> **Um dataset que não diz de quem é não pode ser apresentado.**

---

## Porque três, e não um

Cada um dos três fecha uma porta que os outros dois deixam aberta.

**Empresa sozinha não chega.** A sequência A → B → A produz duas leituras da *mesma*
empresa, e a primeira é obsoleta. Uma guarda que só comparasse `companyId` deixava-a
passar. É por isso que existe uma **geração**: o que torna uma leitura obsoleta não é a
empresa, é a vez.

**Geração sozinha não chega.** A geração só avança quando `load` volta a correr, e `load`
só volta a correr quando uma das suas dependências muda. No **logout com a empresa
configurada ativa**, nenhuma muda:

- `getAccessToken` e `signOut` são `useCallback([adapter])` → estáveis;
- `requiresAuth` vem do modo de compilação → estável;
- `companyId` volta ao id da **configuração** quando a sessão cai — e esse id é o da
  Overcel, que é exatamente a empresa da sessão que acabou de terminar.

Por isso existe a **sessão** (`sessaoId = ${status}:${user?.id}`), que muda no login, no
logout e na troca de utilizador.

**Sessão e geração não chegam.** Elas garantem que o resultado certo aterra no estado. Não
garantem que o *conteúdo* pertence à empresa que a interface está a nomear. Para isso o
dataset carrega uma **etiqueta de proveniência** (`sales.companyId`) e a apresentação
compara-a com a empresa ativa (`resolveCompanyDataScope`).

---

## A armadilha que isto já apanhou (28/08/2026)

A etiqueta vinha de `ACTIVE_COMPANY.id` — uma **constante de compilação**. Enquanto a
leitura foi sempre da Overcel, a constante e a verdade coincidiram, e o guarda parecia
funcionar.

**Estava a comparar a configuração consigo própria.** Acertava por coincidência.

No dia em que o transporte protegido ligasse, a leitura passaria a trazer os dados da
empresa pedida enquanto a etiqueta continuava a dizer "overcel" — e o guarda recusaria
apresentar dados corretos a todas as empresas menos uma.

**A lição, generalizada:** uma etiqueta que não depende da leitura nunca pode detetar uma
leitura errada. Se a proveniência não vem da mesma operação que produziu os dados, não é
proveniência — é uma segunda cópia da configuração.

---

## O que isto obriga em código novo

Qualquer coisa `async` que escreva estado partilhado tem de responder a três perguntas
**antes** de escrever:

1. **Ainda sou a geração atual?**
   ```js
   const minhaVez = ++geracao.current;
   const aindaSouEu = () => geracao.current === minhaVez;
   // ...
   if (!aindaSouEu()) return;   // no sucesso, no catch E no finally
   ```
   O `finally` também: uma leitura obsoleta a desligar o `loading` apaga o indicador da
   leitura que ainda está a decorrer.

2. **O que vou escrever diz de quem é?** Se o valor descreve uma empresa, tem de carregar
   o id **da leitura**, não da configuração e não da empresa ativa no momento da escrita.

3. **Este cache tem a empresa na chave?** Se não tiver, ou é escopado ao provider (e
   reposto com ele), ou é uma fuga à espera de acontecer.

---

## O que **não** conta como cumprir a regra

- **`?.` em vez de guarda.** Transforma um contrato partido num `null` silencioso. Num
  motor financeiro, um null silencioso é o pior erro possível: plausível, do tipo certo,
  e errado.
- **Comparar só `companyId`.** Ver A → B → A.
- **Assumir que o React descarta escritas em componentes desmontados.** Descarta, mas a
  regra passa a depender de um detalhe do React em vez de ser verdadeira por si.
- **Etiquetar com a empresa ativa no momento da escrita.** É a versão nova do defeito de
  28/08: passa a comparar a empresa ativa consigo própria.

---

## Onde está provado

| Afirmação | Ficheiro |
|---|---|
| troca de empresa, resposta antiga não aterra | `src/context/FinerDataContext.corrida.test.jsx` |
| A → B → A: duas gerações antigas calam-se | idem |
| logout, resposta anterior não reaparece | idem |
| outro utilizador, mesma empresa | idem |
| desmontar invalida o que está em voo | idem |
| a etiqueta é a empresa **lida** | `src/services/datasetCarimbaEmpresa.test.js` |
| o guarda continua a recusar quando deve | idem |
| o rebuild preserva a etiqueta | idem |
| ausência nunca vira zero, avaria nunca vira demo | `src/services/avariaNuncaViraDemo.test.js` |

Cada um deles tem um **controlo positivo** ao lado: uma guarda demasiado zelosa recusaria
tudo e passaria os testes de recusa todos a verde, com a aplicação permanentemente vazia.
