# Onde persistir o estado financeiro manual — Drive, base de dados, ou os dois

Pergunta: agora que vai existir uma base de dados (por causa de autenticação e
multiempresa), onde vivem a **cobertura confirmada** e o **CMV**?

---

## O que existe hoje

| Estado | Onde | Como se escreve |
|---|---|---|
| CMV mensal | Documento JSON no Google Drive | `salvarAjusteManual_` no editor do Apps Script, autenticado pela conta Google do operador |
| Cobertura confirmada | Documento JSON no Google Drive (mesmo documento, bloco `coverage`) | `salvarCoberturaConfirmada_`, igual — **sem endpoint HTTP** |

Ambas têm, já implementado e testado: validação, `LockService`, backup antes de
escrever, merge sobre o documento existente. Não é código improvisado.

A confirmação de cobertura a partir do browser **não persiste** — funciona no motor
durante a sessão e a UI di-lo por extenso. A razão está em
`docs/COBERTURA_CONFIRMADA_CONTRATO.md` §4: sem autenticação, qualquer endpoint de
escrita alcançável a partir do frontend seria um endpoint de escrita **anónimo** sobre
dados financeiros.

---

## As três opções

### A. Tudo continua no Drive

| | |
|---|---|
| ✅ | Zero migração. O código de escrita já existe, com lock, backup e testes. |
| ✅ | O contabilista abre o ficheiro. Não é pouco. |
| ❌ | **Autoria**: o documento guarda um *papel* (`"user"`), não uma pessoa. Com N utilizadores por empresa, "quem confirmou julho?" deixa de ter resposta. |
| ❌ | **Concorrência**: `LockService` serializa dentro de um projeto GAS. Com N empresas em projetos distintos, não há lock global. |
| ❌ | **Multiempresa**: um documento por empresa, com naming e permissões geridos à mão. |
| ❌ | **Histórico**: os backups são cópias, não uma linha temporal consultável. |
| ❌ | **Permissões**: o Drive não sabe o que é um `viewer` da Finer One. |

### B. Cobertura na BD, CMV no Drive ← **recomendada**

| | |
|---|---|
| ✅ | A cobertura ganha **autor real** (`actor_user_id` do token), histórico em `audit_log` e RLS. |
| ✅ | A escrita fica atrás de `write_financial_state` — um `viewer` não confirma coberturas. |
| ✅ | O CMV **não se mexe**: continua a funcionar, com o código testado que já tem. |
| ✅ | Migra-se **um** estado de cada vez, com um caminho de rollback óbvio. |
| ⚠️ | Duas fontes de estado manual durante um período. Mitigado: são estados *diferentes* (um valor vs. uma afirmação), não o mesmo estado em dois sítios. |

### C. Migrar tudo já para a BD

| | |
|---|---|
| ✅ | Uma só fonte, um só modelo de permissões, um só histórico. |
| ❌ | Toca no CMV — que entra **diretamente na DRE** — na mesma sessão em que se introduz autenticação. Duas mudanças de risco ao mesmo tempo, e um problema no meio é difícil de atribuir. |
| ❌ | Obriga a reescrever `manualInputsService.js`, `AjustesManuaisBackend.js` e a migrar os valores existentes. |
| ❌ | Perde-se a inspeção direta do ficheiro sem ganhar nada de imediato. |

---

## Recomendação: **B**

O critério é este: **migra-se o estado que a base de dados torna melhor, e não o que
ela torna possível.**

- A **cobertura** melhora mesmo: hoje não tem autor, e num produto multiempresa "quem
  afirmou que os documentos de julho estavam disponíveis" é a pergunta que vale a pena
  poder responder. É também a que está bloqueada — e desbloqueá-la é o objetivo.
- O **CMV** não melhora: é um valor que alguém introduz, já tem validação, lock, backup
  e testes, e move-se do Drive para a BD sem ganhar capacidade nenhuma. Migrá-lo agora é
  trabalho e risco sem retorno.

Além disso: a cobertura é **estado de plataforma** (uma afirmação sobre a integridade
dos dados, com autor e momento); o CMV é **estado contabilístico** (um número que entra
na DRE). Que vivam em sítios diferentes durante um tempo não é incoerência — é a
diferença entre eles.

---

## Estratégia de transição

**Fase 1 — cobertura na BD** *(o que esta sessão prepara)*
- Tabela `company_coverage`, upsert por `(company_id, source)`.
- `POST /api/companies/:companyId/manual-coverage` — escrito, protegido, com
  `lerCoberturaAtual`/`gravarCobertura` por ligar.
- Registo `manual_coverage.confirmed` em `audit_log`.
- *Concluído quando*: confirmar julho persiste, sobrevive a uma recarga, aparece no
  registo com o autor certo, e um `viewer` recebe 403.

**Fase 2 — leitura unificada**
- `blingDataService` passa a receber a cobertura do BFF em vez do documento do Drive.
- O bloco `coverage` do documento fica como **fallback de leitura** durante uma versão.
- *Concluído quando*: a app usa a cobertura da BD e o documento pode perder o bloco sem
  que nada mude.

**Fase 3 — CMV, mais tarde e por razão própria**
- Gatilho: **duas pessoas** da mesma empresa passarem a introduzir CMV, ou a segunda
  empresa exigir isolamento a sério.
- Até lá fica no Drive. **Não se migra o CMV nesta sessão só porque passou a haver
  base de dados.**

**Fase 4 — classificação de títulos**
- Volume maior, modelo diferente. Nasce na BD quando existir; não migra.

---

## O que não muda

- `LockService`, backup e validação do Apps Script continuam a proteger o CMV.
- `salvarCoberturaConfirmada_` continua a existir como caminho de emergência —
  autenticado pela conta Google do operador, sem HTTP.
- **Não se cria `doPost` no Apps Script.** O teste estrutural que o impede
  (`apps-script/coberturaConfirmada.test.js`) mantém-se e continua a passar.
