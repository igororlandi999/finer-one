/****************************************************************************************
 * DiagnosticoFretePedidos.gs — READ-ONLY (Finer One / Frete F1)
 * --------------------------------------------------------------------------------------
 * Responde a UMA pergunta: nos pedidos reais da Overcel, o `total` inclui o frete?
 *
 * E a uma segunda, que a primeira não consegue responder sozinha: quem suporta o frete
 * (transporte.fretePorConta) — porque o snapshot NÃO preserva esse campo hoje.
 *
 * NÃO escreve no Drive. NÃO corre rebuild. NÃO altera o snapshot. NÃO corrige nada.
 * Rede: apenas GET (detalhe de pedidos), com throttle e teto.
 *
 * Reutiliza, sem os alterar: safeLog_, readPedidosSnapshot_, fetchPedidoDetalhe_,
 * DETAIL_THROTTLE_MS.
 *
 * Função a executar: runDiagnosticarFretePedidos
 ****************************************************************************************/

var DIAG_FRETE_MAX_EXEMPLOS = 10;  // quantos pedidos com frete != 0 detalhar
var DIAG_FRETE_TOLERANCIA = 0.01;  // tolerância de arredondamento na reconciliação

/* Modalidades de frete da NF-e 4.0. Tabela FISCAL, não inferida do número.
 * Relevante para a DRE: nas modalidades 0 e 3 o custo é do emitente (a Overcel) e o
 * valor compõe o total da nota; em 1, 4 e 9 o custo não é do emitente. */
var FRETE_POR_CONTA_LABEL = {
  '0': '0 = Remetente/Emitente (CIF) — custo DA EMPRESA',
  '1': '1 = Destinatário (FOB) — custo do cliente',
  '2': '2 = Terceiros',
  '3': '3 = Transporte próprio do remetente — custo DA EMPRESA',
  '4': '4 = Transporte próprio do destinatário',
  '9': '9 = Sem ocorrência de transporte'
};

function diagFreteNum_(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') { if (v === '') return null; var n = Number(v); return isNaN(n) ? null : n; }
  if (typeof v === 'object' && v.valor != null) { var nv = Number(v.valor); return isNaN(nv) ? null : nv; }
  return null;
}

function runDiagnosticarFretePedidos() {
  safeLog_('=========================================================');
  safeLog_('DIAGNOSTICO DE FRETE NOS PEDIDOS (read-only)');
  safeLog_('=========================================================');

  var snap = readPedidosSnapshot_();
  if (!snap || !snap.data) { safeLog_('Snapshot de pedidos inexistente ou ilegivel.'); return null; }
  var pedidos = snap.data;
  safeLog_('Pedidos no snapshot: ' + pedidos.length);
  if (snap.meta) safeLog_('meta -> gerado ' + snap.meta.geradoEm + ' | parcial ' + snap.meta.parcial);

  // ── 1) Panorama do campo `frete` em todo o snapshot ───────
  var semCampo = 0, freteZero = 0, freteNaoZero = 0, inspecionados = 0;
  var comFrete = [];
  for (var i = 0; i < pedidos.length; i++) {
    var p = pedidos[i];
    if (!p) continue;
    if (p.dreDetalheInspecionado === true) inspecionados++;
    var f = diagFreteNum_(p.frete);
    if (!Object.prototype.hasOwnProperty.call(p, 'frete') || p.frete == null) { semCampo++; continue; }
    if (f === 0) { freteZero++; continue; }
    freteNaoZero++;
    comFrete.push(p);
  }

  safeLog_('');
  safeLog_('--- 1) Campo `frete` no snapshot ---');
  safeLog_('sem campo / null     : ' + semCampo);
  safeLog_('frete = 0            : ' + freteZero);
  safeLog_('frete != 0           : ' + freteNaoZero);
  safeLog_('dreDetalheInspecionado: ' + inspecionados + ' de ' + pedidos.length);

  if (freteNaoZero === 0) {
    safeLog_('');
    safeLog_('CONCLUSAO: nenhum pedido com frete diferente de zero.');
    safeLog_('Com frete sempre 0, "total inclui frete" e "total exclui frete" sao');
    safeLog_('indistinguiveis. A questao economica NAO pode ser fechada com estes dados.');
    return { total: pedidos.length, semCampo: semCampo, freteZero: freteZero, freteNaoZero: 0 };
  }

  // ── 2) Reconciliação, pedido a pedido ─────────────────────
  safeLog_('');
  safeLog_('--- 2) Reconciliacao dos pedidos com frete != 0 ---');
  var incluiFrete = 0, excluiFrete = 0, naoReconcilia = 0, detalhesFeitos = 0;

  for (var k = 0; k < comFrete.length && k < DIAG_FRETE_MAX_EXEMPLOS; k++) {
    var o = comFrete[k];
    var totalProdutos = diagFreteNum_(o.totalProdutos);
    var desconto = diagFreteNum_(o.desconto);
    var frete = diagFreteNum_(o.frete);
    var outras = diagFreteNum_(o.outrasDespesas);
    var total = diagFreteNum_(o.total);

    safeLog_('');
    safeLog_('  [' + (k + 1) + '] id ' + o.id + ' | numero ' + o.numero + ' | data ' + o.data);
    safeLog_('      situacao: ' + JSON.stringify(o.situacao) + ' | inspecionado: ' + (o.dreDetalheInspecionado === true));
    safeLog_('      total ' + total + ' | totalProdutos ' + totalProdutos +
             ' | desconto ' + desconto + ' | frete ' + frete + ' | outrasDespesas ' + outras);

    if (totalProdutos == null || total == null) {
      safeLog_('      RECONCILIACAO IMPOSSIVEL: falta total ou totalProdutos.');
      naoReconcilia++;
    } else {
      var d = desconto || 0, ou = outras || 0;
      var comFreteCalc = totalProdutos - d + frete + ou;   // hipotese A: total INCLUI frete
      var semFreteCalc = totalProdutos - d + ou;           // hipotese B: total EXCLUI frete
      var difA = Math.abs(comFreteCalc - total);
      var difB = Math.abs(semFreteCalc - total);
      safeLog_('      A) totalProdutos - desconto + frete + outras = ' + comFreteCalc + ' | dif p/ total: ' + difA.toFixed(2));
      safeLog_('      B) totalProdutos - desconto + outras         = ' + semFreteCalc + ' | dif p/ total: ' + difB.toFixed(2));
      if (difA <= DIAG_FRETE_TOLERANCIA && difB > DIAG_FRETE_TOLERANCIA) {
        safeLog_('      => total INCLUI o frete (hipotese A)'); incluiFrete++;
      } else if (difB <= DIAG_FRETE_TOLERANCIA && difA > DIAG_FRETE_TOLERANCIA) {
        safeLog_('      => total EXCLUI o frete (hipotese B)'); excluiFrete++;
      } else if (difA <= DIAG_FRETE_TOLERANCIA && difB <= DIAG_FRETE_TOLERANCIA) {
        safeLog_('      => AMBIGUO (frete zero ou anulado por outro campo)'); naoReconcilia++;
      } else {
        safeLog_('      => NAO RECONCILIA por nenhuma das duas: ver descontos por item.'); naoReconcilia++;
      }
    }

    // Detalhe bruto: unica forma de ver transporte.fretePorConta (nao esta no snapshot).
    if (detalhesFeitos < DIAG_FRETE_MAX_EXEMPLOS && o.id != null) {
      try {
        var det = fetchPedidoDetalhe_(o.id);
        detalhesFeitos++;
        if (det) {
          var t = det.transporte || null;
          var porConta = (t && t.fretePorConta != null) ? String(t.fretePorConta) : null;
          safeLog_('      BRUTO: transporte.frete = ' + (t ? JSON.stringify(t.frete) : 'sem objeto transporte') +
                   ' | fretePorConta = ' + porConta +
                   (porConta && FRETE_POR_CONTA_LABEL[porConta] ? ('  -> ' + FRETE_POR_CONTA_LABEL[porConta]) : ''));
          safeLog_('      BRUTO: total = ' + det.total + ' | totalProdutos = ' + det.totalProdutos +
                   ' | desconto = ' + JSON.stringify(det.desconto) + ' | outrasDespesas = ' + det.outrasDespesas);
        } else {
          safeLog_('      BRUTO: detalhe nao retornado.');
        }
      } catch (e) {
        safeLog_('      BRUTO: detalhe FALHOU (' + ((e && e.message) ? e.message : e) + ')');
      }
      Utilities.sleep(DETAIL_THROTTLE_MS);
    }
  }

  if (comFrete.length > DIAG_FRETE_MAX_EXEMPLOS) {
    safeLog_('');
    safeLog_('NOTA: ' + (comFrete.length - DIAG_FRETE_MAX_EXEMPLOS) + ' pedido(s) com frete != 0 nao detalhados (teto).');
  }

  safeLog_('');
  safeLog_('================== RESUMO ==================');
  safeLog_('pedidosComFreteNaoZero : ' + freteNaoZero);
  safeLog_('analisados             : ' + Math.min(comFrete.length, DIAG_FRETE_MAX_EXEMPLOS));
  safeLog_('total INCLUI frete     : ' + incluiFrete);
  safeLog_('total EXCLUI frete     : ' + excluiFrete);
  safeLog_('nao reconcilia/ambiguo : ' + naoReconcilia);
  safeLog_('============================================');
  if (incluiFrete > 0 && excluiFrete === 0) {
    safeLog_('LEITURA: o total INCLUI o frete. Deduzi-lo da receita bruta e coerente.');
  } else if (excluiFrete > 0 && incluiFrete === 0) {
    safeLog_('LEITURA: o total EXCLUI o frete. Deduzi-lo SUBAVALIA a receita liquida.');
  } else if (incluiFrete > 0 && excluiFrete > 0) {
    safeLog_('LEITURA: comportamento MISTO entre pedidos. Nao aplicar regra unica.');
  } else {
    safeLog_('LEITURA: inconclusivo. Enviar o registo completo.');
  }

  return {
    total: pedidos.length, semCampo: semCampo, freteZero: freteZero, freteNaoZero: freteNaoZero,
    incluiFrete: incluiFrete, excluiFrete: excluiFrete, naoReconcilia: naoReconcilia
  };
}