/****************************************************************************************
 * ValidacaoRebuildRecebiveis.gs — Finer One / Contas a Receber (Fase 1B — Observabilidade)
 * --------------------------------------------------------------------------------------
 * Funções MANUAIS de validação controlada do rebuild real de recebíveis.
 * Rodar SOMENTE pelo editor do Apps Script. Nada aqui é chamado pelo doGet.
 *
 * NÃO altera: rebuildRecebiveisSnapshot_, serveRecebiveis_, contrato { data, debug },
 * snapshots, doGet, OAuth, proxy, frontend, alertas, diagnóstico, score, chat, IA.
 * NÃO cria rota. NÃO reduz throttle. NÃO aumenta orçamento de tempo.
 * NÃO faz chamadas de detalhe próprias: o rebuild controlado apenas DELEGA ao
 * rebuildRecebiveisSnapshot_ existente (mesmas chamadas do fluxo atual).
 *
 * REUTILIZA (mesmo projeto, escopo global):
 *   Do Código.gs ............ safeLog_
 *   Do RecebiveisBackend.gs . rebuildRecebiveisSnapshot_, readRecebiveisSnapshot_,
 *                             valorPreenchido_
 *
 * LOGS SEGUROS: apenas contadores e datas de meta. Nunca loga nomes de clientes,
 * documentos, histórico, links Pix/boleto, tokens ou objetos completos.
 *
 * USO PREVISTO:
 *   1) runValidarSnapshotRecebiveisAtual()  -> ANTES do rebuild (linha de base)
 *   2) runRebuildRecebiveisControlado()     -> executa o rebuild existente + resumo
 *   3) runValidarSnapshotRecebiveisAtual()  -> apos CADA execucao parcial e ao final
 ****************************************************************************************/

/* ====================================================================================
 * Indicadores estruturais sobre o array data do snapshot (apenas contagens).
 * ==================================================================================== */
function indicadoresSnapshotRecebiveis_(data) {
  var ind = {
    total: 0,
    detalheCarregado: 0,
    saldoPreenchido: 0,
    categoriaIdPreenchido: 0,
    categoriaNomePreenchido: 0,
    historicoPreenchido: 0,
    numeroDocumentoPreenchido: 0,
    contatoNomePreenchido: 0,
    formaPagamentoNomePreenchido: 0,
    aliasesSincronizados: 0,
    shapeLegado: 0,
    semId: 0,
    idsDuplicados: 0
  };
  if (!data || !data.length) return ind;

  ind.total = data.length;
  var vistos = {};      // id -> ocorrencias
  var duplicados = {};  // ids com mais de uma ocorrencia

  for (var i = 0; i < data.length; i++) {
    var t = data[i] || {};

    // Ids
    if (t.id == null) {
      ind.semId++;
    } else {
      var k = String(t.id);
      vistos[k] = (vistos[k] || 0) + 1;
      if (vistos[k] === 2) duplicados[k] = true; // conta cada id duplicado UMA vez
    }

    // Shape: legado = sem o objeto categoria (contrato antigo tinha so categoriaId na raiz)
    var temShapeNovo = (t.categoria && typeof t.categoria === 'object');
    if (!temShapeNovo) ind.shapeLegado++;

    // Hidratacao e campos de detalhe
    if (t.detalheCarregado === true) ind.detalheCarregado++;
    if (t.saldo != null) ind.saldoPreenchido++;
    if (valorPreenchido_(t.historico)) ind.historicoPreenchido++;
    if (valorPreenchido_(t.numeroDocumento)) ind.numeroDocumentoPreenchido++;

    // Categoria (shape novo)
    var catId = temShapeNovo && t.categoria.id != null ? t.categoria.id : null;
    var catNome = temShapeNovo && valorPreenchido_(t.categoria.nome) ? t.categoria.nome : null;
    if (catId != null) ind.categoriaIdPreenchido++;
    if (catNome != null) ind.categoriaNomePreenchido++;

    // Aliases da raiz sincronizados com categoria.{id,nome} (null tambem deve bater)
    var aliasId = (t.categoriaId != null) ? t.categoriaId : null;
    var aliasNome = valorPreenchido_(t.categoriaNome) ? t.categoriaNome : null;
    if (temShapeNovo && String(aliasId) === String(catId) && String(aliasNome) === String(catNome)) {
      ind.aliasesSincronizados++;
    }

    // Nomes
    if (t.contato && valorPreenchido_(t.contato.nome)) ind.contatoNomePreenchido++;
    if (t.formaPagamento && valorPreenchido_(t.formaPagamento.nome)) ind.formaPagamentoNomePreenchido++;
  }

  ind.idsDuplicados = Object.keys(duplicados).length;
  return ind;
}

/* Log seguro dos indicadores (somente contadores; nenhum valor de registro). */
function logIndicadoresRecebiveis_(ind, rotulo) {
  safeLog_('----- Indicadores estruturais (' + rotulo + ') -----');
  safeLog_('Total de titulos: ' + ind.total);
  safeLog_('detalheCarregado === true: ' + ind.detalheCarregado + '/' + ind.total);
  safeLog_('saldo preenchido: ' + ind.saldoPreenchido + '/' + ind.total);
  safeLog_('categoria.id preenchido: ' + ind.categoriaIdPreenchido + '/' + ind.total);
  safeLog_('categoria.nome preenchido: ' + ind.categoriaNomePreenchido + '/' + ind.total);
  safeLog_('historico preenchido: ' + ind.historicoPreenchido + '/' + ind.total);
  safeLog_('numeroDocumento preenchido: ' + ind.numeroDocumentoPreenchido + '/' + ind.total);
  safeLog_('contato.nome preenchido: ' + ind.contatoNomePreenchido + '/' + ind.total);
  safeLog_('formaPagamento.nome preenchido: ' + ind.formaPagamentoNomePreenchido + '/' + ind.total);
  safeLog_('aliases categoriaId/categoriaNome sincronizados: ' + ind.aliasesSincronizados + '/' + ind.total);
  safeLog_('objetos no shape LEGADO (sem objeto categoria): ' + ind.shapeLegado);
  safeLog_('registros sem id: ' + ind.semId);
  safeLog_('ids duplicados (ids distintos com 2+ ocorrencias): ' + ind.idsDuplicados);
}

/* ====================================================================================
 * runValidarSnapshotRecebiveisAtual() — SO LEITURA do snapshot atual. Zero chamadas
 * de API. Usar antes do rebuild (linha de base), apos cada parcial e ao final.
 * ==================================================================================== */
function runValidarSnapshotRecebiveisAtual() {
  var snap = readRecebiveisSnapshot_();
  if (!snap || !snap.data) {
    safeLog_('Snapshot de recebiveis inexistente ou vazio. Nada a validar.');
    return null;
  }

  safeLog_('========== VALIDACAO DO SNAPSHOT ATUAL (leitura, sem API) ==========');
  if (snap.meta) {
    safeLog_('Meta -> gerado ' + snap.meta.geradoEm +
             ' | totalTitulos ' + snap.meta.totalTitulos +
             ' | hidratados na ultima execucao ' + snap.meta.hidratadosNestaExecucao +
             ' | reaproveitados ' + snap.meta.reaproveitados +
             ' | chamadas de detalhe ' + snap.meta.chamadasDetalhe +
             ' | parcial ' + snap.meta.parcial);
  } else {
    safeLog_('Meta ausente (snapshot de versao anterior).');
  }

  var ind = indicadoresSnapshotRecebiveis_(snap.data);
  logIndicadoresRecebiveis_(ind, 'snapshot atual');

  var pendentes = ind.total - ind.detalheCarregado;
  safeLog_('Pendentes de hidratacao (sem detalheCarregado): ' + pendentes + '/' + ind.total);
  safeLog_((snap.meta && snap.meta.parcial)
    ? 'Snapshot PARCIAL: rode runRebuildRecebiveisControlado() novamente para continuar.'
    : 'Snapshot marcado como COMPLETO na ultima execucao.');
  safeLog_('====================================================================');

  return { meta: snap.meta || null, indicadores: ind, pendentes: pendentes };
}

/* ====================================================================================
 * runRebuildRecebiveisControlado() — executa o rebuild EXISTENTE (sem duplicar logica,
 * sem chamadas proprias) e registra um resumo seguro do resultado + indicadores do
 * snapshot recem-gravado.
 * ==================================================================================== */
function runRebuildRecebiveisControlado() {
  safeLog_('========== REBUILD CONTROLADO DE RECEBIVEIS ==========');
  safeLog_('Delegando ao rebuildRecebiveisSnapshot_ existente (mesmo fluxo, throttle e orcamento).');

  var inicio = Date.now();
  var status = rebuildRecebiveisSnapshot_();
  var duracaoSeg = Math.round((Date.now() - inicio) / 1000);

  safeLog_('Status retornado pelo rebuild: ' + JSON.stringify(status));
  safeLog_('Duracao aproximada: ' + duracaoSeg + 's');

  if (!status || status.ok !== true) {
    safeLog_('Rebuild NAO executou (motivo: ' + (status && status.motivo ? status.motivo : 'desconhecido') +
             '). Snapshot anterior permanece intacto.');
    safeLog_('======================================================');
    return { status: status, indicadores: null };
  }

  var snap = readRecebiveisSnapshot_();
  if (!snap || !snap.data) {
    safeLog_('AVISO: rebuild reportou ok, mas o snapshot nao pode ser lido. Validar Drive.');
    safeLog_('======================================================');
    return { status: status, indicadores: null };
  }

  var ind = indicadoresSnapshotRecebiveis_(snap.data);
  var pendentes = ind.total - ind.detalheCarregado;

  safeLog_('--- Resumo da execucao ---');
  safeLog_('Total processado (titulos no snapshot): ' + ind.total);
  safeLog_('Hidratados nesta execucao: ' + status.hidratados);
  safeLog_('Reaproveitados de execucoes anteriores: ' + status.reaproveitados);
  safeLog_('Execucao parcial: ' + (status.parcial ? 'SIM' : 'NAO'));
  safeLog_('Total pendente de hidratacao: ' + pendentes + '/' + ind.total);

  logIndicadoresRecebiveis_(ind, 'apos o rebuild');

  if (status.parcial || pendentes > 0) {
    safeLog_('CONTINUACAO NECESSARIA: rode runRebuildRecebiveisControlado() de novo. ' +
             'Os ja hidratados serao reaproveitados; so os pendentes geram chamadas de detalhe.');
  } else {
    safeLog_('REBUILD COMPLETO: parcial=false e zero pendentes.');
  }
  safeLog_('======================================================');

  return { status: status, indicadores: ind, pendentes: pendentes };
}