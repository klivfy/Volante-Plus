import { useCallback, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import {
  DEFAULT_SIMULATIONS_PER_NUMBER,
  analyzeBacktest,
  analyzeTrevoBacktest,
} from '../../../../web/src/engine/backtestAnalyzer';
import { generateGames } from '../../../../web/src/engine/gameGenerator';
import { hasTrevos } from '../../../../web/src/engine/prizeRules';
import { getSeedData } from '../../../../web/src/data/seed';
import {
  GameBatch,
  Lottery,
  MAX_GAMES,
  MIN_GAMES,
  NumberPerformance,
} from '../../../../web/src/types/domain';
import { getDraws, getPerformances, savePerformances } from '../../../src/storage';

type Status = 'loading' | 'ready' | 'generating' | 'error';

const LOTTERY_LABEL: Record<Lottery, string> = {
  [Lottery.MEGA_SENA]: 'Mega-Sena',
  [Lottery.MAIS_MILIONARIA]: '+Milionária',
};

const LOTTERY_OPTIONS = [Lottery.MEGA_SENA, Lottery.MAIS_MILIONARIA];

function formatGame(
  lottery: Lottery,
  game: { numbers: number[]; trevoDuplas?: [number, number][] },
): string {
  const numbers = game.numbers.map((n) => String(n).padStart(2, '0')).join(' ');
  if (!hasTrevos(lottery) || !game.trevoDuplas?.length) return numbers;
  const trevos = game.trevoDuplas.map((dupla) => dupla.join('-')).join(' | ');
  return `${numbers}\nTrevos: ${trevos}`;
}

/**
 * Popup simplificado da extensão: sem card de "próximo concurso" (fetch de
 * rede extra num popup que já pode ser fechado a qualquer momento) nem tela de
 * backtesting — só o essencial, seleção de loteria e geração de jogos, lido
 * do que o service worker já sincronizou em `chrome.storage.local`.
 */
export default function PopupContent() {
  const [lottery, setLottery] = useState<Lottery>(Lottery.MEGA_SENA);
  const [status, setStatus] = useState<Status>('loading');
  const [performances, setPerformances] = useState<NumberPerformance[]>([]);
  const [trevoPerformances, setTrevoPerformances] = useState<NumberPerformance[]>([]);
  const [batchCount, setBatchCount] = useState(MIN_GAMES);
  const [batch, setBatch] = useState<GameBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Avisa o service worker que o popup abriu — o usuário "viu" os sorteios
  // novos, então ele limpa o badge do ícone (ver extension/src/background.ts).
  useEffect(() => {
    void browser.runtime.sendMessage({ type: 'popup-opened' }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setBatch(null);

    async function load(): Promise<void> {
      try {
        const cached = await getPerformances(lottery);
        if (cancelled) return;
        if (cached) {
          setPerformances(cached.performances);
          setTrevoPerformances(cached.trevoPerformances);
          setStatus('ready');
          return;
        }

        const stored = await getDraws(lottery);
        const draws = stored.length > 0 ? stored : getSeedData(lottery);
        const computed = analyzeBacktest(draws, lottery, DEFAULT_SIMULATIONS_PER_NUMBER);
        const computedTrevos = analyzeTrevoBacktest(draws, lottery, DEFAULT_SIMULATIONS_PER_NUMBER);
        if (cancelled) return;

        setPerformances(computed);
        setTrevoPerformances(computedTrevos);
        void savePerformances(lottery, computed, computedTrevos);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar dados.');
        setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [lottery]);

  const handleGenerate = useCallback(() => {
    setStatus('generating');
    setError(null);
    // Adia pro próximo tick só pra "Gerando…" pintar antes do cálculo síncrono.
    setTimeout(() => {
      try {
        const result = generateGames(lottery, batchCount, performances, { trevoPerformances });
        setBatch(result);
        setStatus('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível gerar os jogos.');
        setStatus('error');
      }
    }, 0);
  }, [lottery, batchCount, performances, trevoPerformances]);

  async function handleCopy(index: number, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
    } catch {
      // Sem permissão de clipboard no popup — silencioso, não é crítico.
    }
  }

  const busy = status === 'loading' || status === 'generating';

  return (
    <main>
      <h1>Volante+</h1>

      <div className="lottery-selector" role="group" aria-label="Escolha a loteria">
        {LOTTERY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={option === lottery ? 'chip chip--selected' : 'chip'}
            aria-pressed={option === lottery}
            disabled={busy}
            onClick={() => setLottery(option)}
          >
            {LOTTERY_LABEL[option]}
          </button>
        ))}
      </div>

      {status === 'error' && error && <p className="error">{error}</p>}

      <div className="controls">
        <label htmlFor="game-count">Quantos jogos: {batchCount}</label>
        <input
          id="game-count"
          type="range"
          min={MIN_GAMES}
          max={MAX_GAMES}
          value={batchCount}
          disabled={busy}
          onChange={(event) => setBatchCount(Number(event.target.value))}
        />

        <button type="button" className="primary" onClick={handleGenerate} disabled={busy} aria-busy={busy}>
          {status === 'loading' ? 'Analisando histórico…' : status === 'generating' ? 'Gerando…' : 'Gerar jogos'}
        </button>
      </div>

      {batch && (
        <ul className="games" aria-label="Jogos gerados">
          {batch.games.map((game, index) => (
            <li key={index} className="game-card">
              <div className="game-card__header">
                <span>Jogo {String(index + 1).padStart(2, '0')}</span>
                <button type="button" onClick={() => void handleCopy(index, formatGame(lottery, game))}>
                  {copiedIndex === index ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <div className="game-card__numbers">
                {game.numbers.map((n) => (
                  <span key={n} className="ball">
                    {String(n).padStart(2, '0')}
                  </span>
                ))}
              </div>
              {hasTrevos(lottery) && game.trevoDuplas && game.trevoDuplas.length > 0 && (
                <div className="game-card__trevos">
                  {game.trevoDuplas.map((dupla, i) => (
                    <span key={i} className="trevo">
                      {dupla.join('-')}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
