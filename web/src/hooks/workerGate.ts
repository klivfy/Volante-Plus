import type { BacktestWorkerResponse } from '../workers/backtest.worker';

/**
 * Decisão pura de aceitação de uma resposta do worker de backtest.
 *
 * WHY: o worker entrega UMA resposta por pedido, na ordem de chegada — mas o
 * remetente pode ter postado pedidos novos no meio do caminho (troca de
 * modalidade, novo backtest). Aceitar qualquer resposta que chegue aplicava o
 * resultado do pedido ANTIGO ao estado ATUAL: na tela inicial, performances de
 * uma modalidade eram gravadas no cache de outra (universos 1..60 vs 1..80
 * misturados) e o resultado correto, que chegava depois, era descartado.
 *
 * O contrato: `useBacktestWorker` carimba cada `run` com um `requestId`
 * incremental e guarda o id do pedido mais recente; a resposta ecoa o id do
 * pedido que a originou. Só há consumo quando os ids batem — resposta sem eco
 * (ou com eco de pedido antigo) é obsoleta por definição.
 *
 * Função pura para o contrato ficar testável sem DOM/worker.
 */
export function acceptsResponse(
  expectedRequestId: number | null,
  response: BacktestWorkerResponse,
): boolean {
  if (expectedRequestId === null) return false;
  return response.requestId === expectedRequestId;
}
