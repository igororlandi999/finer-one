/****************************************************************************************
 * TesteReavaliacaoCategoria.gs — teste READ-ONLY da correção do reaproveitamento.
 * --------------------------------------------------------------------------------------
 * Não faz rede, não escreve no Drive, não corre rebuild. Exercita apenas as duas funções
 * puras do DespesasBackend.gs: precisaResolverCategoria_ e resolveCategoriaNome_.
 *
 * Função a executar: runTestarReavaliacaoCategoria
 ****************************************************************************************/

function runTestarReavaliacaoCategoria() {
  var falhas = 0;

  function verificar(descricao, obtido, esperado) {
    var ok = (obtido === esperado);
    if (!ok) falhas++;
    safeLog_((ok ? 'PASS  ' : 'FALHA ') + descricao +
             ' | obtido: ' + JSON.stringify(obtido) + ' | esperado: ' + JSON.stringify(esperado));
  }

  safeLog_('=========================================================');
  safeLog_('TESTE — reavaliação da categoria em títulos reaproveitados');
  safeLog_('=========================================================');

  safeLog_('');
  safeLog_('--- precisaResolverCategoria_ : deve REAVALIAR ---');
  verificar('1. null', precisaResolverCategoria_(null), true);
  verificar('   undefined', precisaResolverCategoria_(undefined), true);
  verificar('2. string vazia', precisaResolverCategoria_(''), true);
  verificar('   só espaços', precisaResolverCategoria_('   '), true);
  verificar('3. "Sem categoria"', precisaResolverCategoria_('Sem categoria'), true);
  verificar('4. " sem categoria "', precisaResolverCategoria_(' sem categoria '), true);
  verificar('   "SEM CATEGORIA"', precisaResolverCategoria_('SEM CATEGORIA'), true);

  safeLog_('');
  safeLog_('--- precisaResolverCategoria_ : deve PRESERVAR ---');
  verificar('5. "Software"', precisaResolverCategoria_('Software'), false);
  verificar('   "Aluguel"', precisaResolverCategoria_('Aluguel'), false);
  // Não confundir uma categoria REAL cujo nome comece por "Sem categoria" com a ausência.
  verificar('   "Sem categoria definida"', precisaResolverCategoria_('Sem categoria definida'), false);

  safeLog_('');
  safeLog_('--- 6. resolveCategoriaNome_ sobre um mapa ---');
  var mapa = { '12': 'Software', '34': 'Aluguel' };
  verificar('id 12 no mapa', resolveCategoriaNome_(12, mapa), 'Software');
  verificar('id "34" como string', resolveCategoriaNome_('34', mapa), 'Aluguel');
  verificar('id 999 fora do mapa', resolveCategoriaNome_(999, mapa), 'Sem categoria');
  verificar('id 0 (sem categoria no ERP)', resolveCategoriaNome_(0, mapa), 'Sem categoria');
  verificar('id null', resolveCategoriaNome_(null, mapa), 'Sem categoria');

  safeLog_('');
  safeLog_('--- integração: título congelado volta a ser resolvido ---');
  var congelado = { id: 1, categoriaId: 12, categoriaNome: 'Sem categoria' };
  if (precisaResolverCategoria_(congelado.categoriaNome)) {
    congelado.categoriaNome = resolveCategoriaNome_(congelado.categoriaId, mapa);
  }
  verificar('congelado com id 12 -> resolvido', congelado.categoriaNome, 'Software');

  var jaResolvido = { id: 2, categoriaId: 34, categoriaNome: 'Aluguel' };
  var antes = jaResolvido.categoriaNome;
  if (precisaResolverCategoria_(jaResolvido.categoriaNome)) {
    jaResolvido.categoriaNome = resolveCategoriaNome_(jaResolvido.categoriaId, mapa);
  }
  verificar('já resolvido não é reprocessado', jaResolvido.categoriaNome, antes);

  var semNoErp = { id: 3, categoriaId: 0, categoriaNome: 'Sem categoria' };
  if (precisaResolverCategoria_(semNoErp.categoriaNome)) {
    semNoErp.categoriaNome = resolveCategoriaNome_(semNoErp.categoriaId, mapa);
  }
  verificar('sem categoria no ERP continua estável', semNoErp.categoriaNome, 'Sem categoria');

  safeLog_('');
  safeLog_('=========================================================');
  safeLog_(falhas === 0 ? 'RESULTADO: todos os casos passam.' : 'RESULTADO: ' + falhas + ' FALHA(S).');
  safeLog_('=========================================================');
  return { falhas: falhas };
}