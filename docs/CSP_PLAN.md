# CSP — Content Security Policy da Finer One

> **Estado: PLANO. Nada foi aplicado nesta sessão.**
> Uma CSP mal calibrada não degrada — parte. Uma diretiva a menos e a aplicação
> serve uma página em branco, sem erro visível para quem lá chega. Este documento
> existe para que a política seja **derivada do que a aplicação faz**, e não copiada
> de um exemplo genérico.

---

## 1. Porque é que isto é um gap real

O `docs/THREAT_MODEL_MULTIEMPRESA.md` aponta a ausência de CSP. A razão não é
conformidade: é que a Finer One passou a ter **tokens de sessão no browser**.

Antes da fundação SaaS, um XSS nesta aplicação dava acesso a dados que já estavam no
ecrã. Depois dela, dá acesso ao `access_token` do Supabase no `localStorage` — e com
ele, a **todas as empresas do utilizador**, a partir de qualquer máquina, até o token
expirar. O impacto de um XSS subiu de "vê o que o utilizador vê" para "é o utilizador".

CSP não impede um XSS. Impede que o resultado de um XSS saia para fora: sem
`connect-src` para o domínio do atacante, o script injetado não tem para onde enviar o
que roubou.

---

## 2. O que a aplicação REALMENTE precisa

Levantado do `dist/` construído nesta sessão e do `index.html`, não de memória.

| Recurso | Origem | Porquê |
|---|---|---|
| Scripts | próprios (`/finer-one/assets/*.js`) | bundle do Vite, sem CDN de script |
| Estilos | próprios + `fonts.googleapis.com` | `index.html` carrega Inter |
| Tipos de letra | `fonts.gstatic.com` | ficheiros da Inter |
| XHR/fetch | `finer-one-proxy.vercel.app` | o BFF/proxy de dados |
| XHR/fetch | `*.supabase.co` | **futuro** — auth e REST, quando existir |
| Imagens | próprias + `data:` | ícones e SVG embutidos |
| Frames | nenhum | a aplicação não embebe nada |

Domínios encontrados no bundle: `fb.me`, `reactjs.org`, `github.com` aparecem **apenas
em mensagens de aviso do React em texto**, não em pedidos. Não entram na política.

### O ponto sensível: `style-src`

O Recharts aplica estilos **inline** em tempo de execução (o `recharts_measurement_span`
da FASE 17 é um exemplo: `style="position:absolute;top:-20000px..."`). O Tailwind é
compilado para um ficheiro, mas o Recharts não.

Logo, **`style-src` precisa de `'unsafe-inline'`**. Não há volta a dar sem substituir a
biblioteca de gráficos. É uma concessão real e deve ser escrita como tal, não escondida:
permite a um XSS injetar CSS, o que dá defacement e exfiltração por seletores de atributo
— mau, mas muito menos mau do que `script-src 'unsafe-inline'`, que daria execução.

**`script-src` NÃO leva `'unsafe-inline'`.** É a diretiva que conta.

---

## 3. A política proposta

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://finer-one-proxy.vercel.app https://*.supabase.co;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

Notas de cada linha que não é óbvia:

- **`frame-ancestors 'none'`** — impede clickjacking. Ninguém embebe a Finer One num
  iframe para sobrepor um botão invisível de "confirmar cobertura".
- **`base-uri 'self'`** — sem isto, um `<base href="//atacante">` injetado redireciona
  todos os caminhos relativos. É uma diretiva barata e muito esquecida.
- **`object-src 'none'`** — não há Flash nem applets; fechar é gratuito.
- **`connect-src`** — a diretiva que trava a exfiltração. Sem o domínio do atacante
  aqui, o token roubado não sai.

⚠️ **`frame-ancestors` NÃO funciona em `<meta>`.** Só como cabeçalho HTTP. Ver §4.

---

## 4. O obstáculo: GitHub Pages não permite cabeçalhos

O frontend é servido por GitHub Pages, que **não permite configurar cabeçalhos HTTP**.
Isso tem duas consequências:

1. a CSP só pode ir em `<meta http-equiv="Content-Security-Policy">`;
2. `frame-ancestors` e `report-uri` **são ignorados em `<meta>`** — por especificação.

Ou seja: em GitHub Pages consegue-se a maior parte da política, mas **não** a proteção
contra clickjacking, e **não** o modo de relatório.

### Opções

| Opção | Ganha | Custo |
|---|---|---|
| **A.** `<meta>` no `index.html` | script-src, connect-src, base-uri, object-src | sem frame-ancestors, sem report-only |
| **B.** Servir o frontend pelo Vercel | política completa por cabeçalho, `report-only` primeiro | mudar o alojamento e o domínio |
| **C.** Cloudflare à frente do Pages | cabeçalhos sem mudar alojamento | mais uma peça de infraestrutura |

**Recomendação: A agora, B quando o Supabase entrar.** O momento natural para mudar
para o Vercel é quando já houver um backend lá — passa a haver uma só origem, o
`connect-src 'self'` fica mais apertado, e ganha-se `frame-ancestors`.

---

## 5. Porque não se aplicou nesta sessão

A missão proíbe "implementar política que possa quebrar produção sem validação", e há
duas incógnitas que só se resolvem a testar contra o site publicado:

1. **o SDK do Supabase ainda não está instalado.** Não se sabe se abre WebSocket
   (`wss://*.supabase.co` em `connect-src`) para realtime. Se abrir e a diretiva não o
   permitir, a sessão deixa de renovar — e o sintoma é "o utilizador é expulso ao fim de
   uma hora", que ninguém liga a uma CSP;
2. **o Vite injeta um `<script type="module">`** e, em modo de desenvolvimento, um
   cliente de HMR com `eval`. Uma `<meta>` no `index.html` aplica-se **também ao `npm run
   dev`** e partiria o desenvolvimento — a menos que seja injetada só no build.

Aplicar uma CSP e descobrir o defeito em produção, num produto financeiro, é
exatamente o tipo de troca que este projeto não faz.

---

## 6. Passos para aplicar, quando for

1. instalar o SDK do Supabase e **observar em DevTools → Network** que origens são
   realmente contactadas (incluir `wss://` se houver realtime);
2. gerar a `<meta>` **só no build**, com um plugin do Vite (`transformIndexHtml`), para
   não afetar o `npm run dev`;
3. publicar e percorrer a matriz da FASE 21 com a consola aberta — qualquer violação
   aparece como `Refused to ...`;
4. só depois considerar mudar para o Vercel e passar a cabeçalho, acrescentando
   `frame-ancestors 'none'` e um `report-uri`.

### Teste que deve acompanhar a aplicação

Um teste no espírito de `bundleSemAuthSimulada.test.js`: ler o `dist/index.html` e
falhar se a CSP **não** existir, ou se `script-src` contiver `'unsafe-inline'` ou
`'unsafe-eval'`. A política que interessa é a que ninguém pode afrouxar por engano.

---

## 7. O que a CSP não resolve

- **não substitui a autorização.** Um `viewer` continua a ser travado pelo BFF, não pelo
  browser;
- **não protege o BFF.** `curl` ignora CSP tal como ignora CORS;
- **não impede XSS.** Reduz o que um XSS consegue fazer. A prevenção continua a ser não
  injetar HTML não escapado — e hoje a aplicação não usa `dangerouslySetInnerHTML` em
  lado nenhum, o que é a defesa que de facto está a funcionar.
