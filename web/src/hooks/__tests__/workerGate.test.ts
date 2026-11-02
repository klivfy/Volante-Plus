import { describe, expect, it } from 'vitest';
import { Lottery } from '../../types/domain';
import type { BacktestWorkerResponse } from '../../workers/backtest.worker';
import { acceptsResponse } from '../workerGate';

function success(requestId: number | null, lottery: Lottery = Lottery.MEGA_SENA): BacktestWorkerResponse {
  return { type: 'success', requestId, lottery, performances: [], trevoPerformances: [] };
}

function report(requestId: number | null, lottery: Lottery = Lottery.MEGA_SENA): BacktestWorkerResponse {
  return {
    type: 'report',
    requestId,
    lottery,
    report: {
      trainingDraws: 1,
      validationDraws: 1,
      totalGames: 1,
      totalBets: 1,
      stats: { mean: 0, variance: 0, stdDeviation: 0 },
      expectedMeanHits: 0,
      prizeRate: 0,
      prizeCount: 0,
      hitDistribution: {},
      performances: [],
      trevoPerformances: [],
    },
  };
}

describe('acceptsResponse (gate de respostas obsoletas do worker)', () => {
  it('aceita a resposta cujo requestId ecoa o pedido pendente', () => {
    expect(acceptsResponse(3, success(3))).toBe(true);
    expect(acceptsResponse(3, report(3, Lottery.QUINA))).toBe(true);
  });

  it('rejeita resposta de pedido antigo (id menor que o pendente)', () => {
    // Corrida original: usuário troca de modalidade enquanto a análise antiga
    // ainda roda; a resposta atrasada não pode ser aplicada ao estado atual.
    expect(acceptsResponse(2, success(1, Lottery.MEGA_SENA))).toBe(false);
  });

  it('rejeita resposta sem eco de requestId (resposta estranha/legada)', () => {
    expect(acceptsResponse(2, success(null))).toBe(false);
  });

  it('rejeita qualquer resposta quando não há pedido pendente', () => {
    expect(acceptsResponse(null, success(1))).toBe(false);
    expect(acceptsResponse(null, success(null))).toBe(false);
  });

  it('rejeita resposta de pedido futuro (id maior que o pendente) — contrato estrito', () => {
    // O id pendente é sempre o do pedido MAIS RECENTE; um id maior só pode ser
    // resposta de outra instância/geração — rejeitar é o seguro.
    expect(acceptsResponse(2, success(3, Lottery.QUINA))).toBe(false);
  });

  it('gate julga só o id; a modalidade ecoada fica para os consumidores', () => {
    // Defesa em profundidade é feita nos consumidores (resultLottery/reportLottery);
    // este teste documenta a fronteira do contrato do gate.
    const respostaQuina = success(5, Lottery.QUINA);
    expect(acceptsResponse(5, respostaQuina)).toBe(true);
    expect(respostaQuina.lottery).toBe(Lottery.QUINA);
  });

  it('julga só o requestId, independente do tipo de resposta (success/report/error)', () => {
    const errorResponse: BacktestWorkerResponse = {
      type: 'error',
      requestId: 4,
      lottery: Lottery.MAIS_MILIONARIA,
      message: 'boom',
    };
    expect(acceptsResponse(4, errorResponse)).toBe(true);
    expect(acceptsResponse(5, errorResponse)).toBe(false);
  });
});
