# Roadmap Pós-Demo — Finer One

Princípio do roadmap: **cada fase liga uma fonte de dados nova a telas que já existem**. O front está construído; os selos Demo saem à medida que os dados entram.

---

## Fase 1 — Ajustes pós-feedback dos sócios
Objetivo: incorporar o que a demo revelar antes de abrir frente nova.
- Calibrar thresholds do score e dos alertas com o uso real da Overcel (pesos das penalizações, limites de concentração, MoM).
- Ajustes de texto/UX apontados pelos sócios.
- Decidir a prioridade entre as fases 2, 3 e 5 (a ordem abaixo é proposta, não dogma).
- Itens técnicos triviais do backlog que couberem de carona (ver `BACKLOG-TECNICO.md`).

## Fase 2 — Open Banking
Objetivo: saldo e tesouraria reais.
- Integração bancária (agregador PSD2 a selecionar para o mercado PT).
- Liga: Saldo Disponível (Resumo), base do Cashflow previsto, alertas de liquidez/tesouraria (categorias hoje mock).
- Entregável honesto mínimo: saldo real + extrato; previsão de cashflow só quando houver também recebíveis (fase 3).

## Fase 3 — Recebíveis / clientes reais
Objetivo: o lado "a receber" com vencimentos.
- Fonte: contas a receber do Bling (mesmo padrão técnico das contas a pagar já integradas — Apps Script + snapshot).
- Liga: Saldo a Receber, faturas de clientes em aberto/atraso, tab Clientes, "Faturas em atraso" do Resumo, alertas de recebimentos, e (com a fase 2) o cashflow previsto real.
- Reaproveita: builders e helpers do lado fornecedores são o molde.

## Fase 4 — Documentos reais com storage
Objetivo: upload e gestão documental verdadeiros.
- Storage: Google Drive via Apps Script (caminho natural, já autenticado) ou backend dedicado.
- Liga: tela Documentos inteira (upload, listagem persistente, categorias); depois, associação documento ↔ título financeiro.
- Fora do MVP por decisão: nada de upload sem persistência.

## Fase 5 — Contabilidade / SAF-T
Objetivo: demonstrações contábeis reais.
- Fonte: exportação do contabilista ou SAF-T (PT).
- Liga: Performance Financeira (DRE, Balanço, Cashflow contábil, KPIs anuais), Relatórios exportáveis para bancos (promessa central do produto), margem real na IA Financeira.
- Maior esforço de modelagem; maior valor comercial para o plano Pro.

## Fase 6 — IA generativa sobre o motor determinístico
Objetivo: linguagem natural sem sacrificar exatidão.
- O `chatEngine` atual vira a camada de ferramentas/contexto: o modelo generativo recebe os mesmos dados reais e as mesmas respostas calculadas, e reformula/expande em linguagem natural.
- Garantia de projeto: números sempre do motor determinístico (zero alucinação numérica); o LLM cuida da conversa, não da conta.
- Pré-requisito: decidir fornecedor/custo e a política de privacidade de dados dos clientes.

## Fase 7 — Multiempresa / autenticação
Objetivo: sair do piloto para produto vendável.
- Autenticação real, gestão de empresas/utilizadores, isolamento de dados por cliente.
- Onboarding da integração Bling por cliente (hoje o OAuth é configurado manualmente para a Overcel).
- Ponto de decisão de arquitetura: backend próprio vs escalar o padrão Apps Script por cliente.

---

## Dependências entre fases
- Cashflow previsto real = Fase 2 + Fase 3.
- Relatórios para bancos = Fase 5.
- Venda ao segundo cliente = Fase 7 (pode correr em paralelo às fases de dados).
