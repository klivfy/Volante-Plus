import megasenaSnapshot from '../../data/mirrorSnapshot/megasena.json';
import maisMilionariaSnapshot from '../../data/mirrorSnapshot/maismilionaria.json';
import { Draw, Lottery } from '../../types/domain';
import { DrawDataset } from './provenance';

/**
 * Carrega o espelho de terceiros como `DrawDataset` — a única fonte de
 * histórico real disponível offline neste ambiente. Ver o README ao lado dos
 * arquivos JSON (`data/mirrorSnapshot/README.md`) para a origem exata, o
 * commit capturado e por que as datas são sintéticas.
 *
 * `provenance: 'third_party_mirror'`, nunca `'official'` — a auditoria
 * imprime a ressalva correspondente antes de qualquer resultado.
 */
export function loadMirrorSnapshot(lottery: Lottery): DrawDataset {
  const draws =
    lottery === Lottery.MEGA_SENA
      ? (megasenaSnapshot as Draw[])
      : lottery === Lottery.MAIS_MILIONARIA
        ? (maisMilionariaSnapshot as Draw[])
        : [];

  return {
    lottery,
    draws,
    provenance: 'third_party_mirror',
    sourceLabel:
      'guilhermeasn/loteria.json, commit f800c2777 (2024-11-17) — agregação ' +
      'de terceiros dos resultados da Caixa, não afiliada; datas por ' +
      'concurso sintetizadas (a fonte não as fornece), ver README do diretório.',
    datesAreApproximate: true,
  };
}
