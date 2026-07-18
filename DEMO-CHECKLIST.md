# Checklist Pré-Demo — Finer One MVP Plus

Rodar na ordem, 15-20 minutos antes de apresentar. Se qualquer item falhar, ver "Se algo falhar" no fim.

## Build e publicação
- [ ] `npm run build` — termina com `✓ built` (aviso do chunk Recharts é normal).
- [ ] `npm run deploy` (se for apresentar pelo GitHub Pages) e abrir a URL publicada; ou `npm run dev` se for apresentar em localhost.

## Conexão com dados reais
- [ ] Abrir o Resumo e confirmar o banner **"Dados reais conectados ao Bling"** (se aparecer o banner de demonstração, a API não carregou — ver abaixo).
- [ ] KPIs do Resumo com valores reais da Overcel e **Saldo Disponível com selo Demo**.

## Fluxos críticos (os que a demo usa)
- [ ] **CSV**: clicar Exportar em Receitas — `receitas.csv` baixa e abre no Excel com acentos corretos. (Amostragem de um chega; os quatro foram validados no teste de ponta a ponta.)
- [ ] **Diagnóstico**: score exibido bate com o do destaque do Resumo.
- [ ] **Recalcular** no Diagnóstico: roda sem erro e o score reaparece.
- [ ] **Plano de Ação**: abre, mostra os passos, fecha pelo botão e pelo fundo.
- [ ] **Diagnóstico → Chat**: clicar uma pergunta sugerida — o Chat abre com a pergunta **já respondida**.
- [ ] **Chat ao vivo**: perguntar "Porque é que o meu score está baixo?" — resposta com as penalizações que somam o score.
- [ ] **Selos Demo**: passar o olho em Cashflow previsto (Resumo), Evolução do score (Diagnóstico/Finer Score) e Performance Financeira — selos visíveis.

## Higiene de palco
- [ ] Console do navegador sem erros (F12 → Console).
- [ ] Fechar outras abas/notificações; zoom do navegador em 100%.
- [ ] Ter o `roteiro-demo-mvp-plus.md` aberto em segunda tela.
- [ ] Não improvisar perguntas ao Chat fora das sugeridas (fora do repertório ele responde limitação honesta — correto, mas quebra o ritmo).

## Se algo falhar
- **Banner de demonstração em vez de dados reais**: verificar o Vercel proxy e o Apps Script (abrir a URL do proxy diretamente); recarregar a página. A demo funciona em modo demo, mas perde a força — resolver antes.
- **CSV não baixa**: verificar bloqueio de pop-up/download do navegador.
- **Recalcular demorado**: normal no primeiro reload do dia (snapshot no Drive); aguardar e não clicar repetidamente.
