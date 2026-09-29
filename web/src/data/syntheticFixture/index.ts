import { Draw, Lottery } from '../../types/domain';
import megaSenaSeed from './megasena.json';
import maisMilionariaSeed from './mais_milionaria.json';

/**
 * Fixture SINTÉTICA (PRNG): não é resultado da Caixa. Deixou de ser o seed do
 * app — o histórico embutido é o real, em `data/history/`. Esta fixture existe
 * só para a guarda de procedência da auditoria (`engine/audit/provenance.ts`
 * recusa dados que coincidam com ela) e para testes. Ver `README.md`.
 */
export function getSyntheticFixture(lottery: Lottery): Draw[] {
  switch (lottery) {
    case Lottery.MEGA_SENA:
      return megaSenaSeed as Draw[];
    case Lottery.MAIS_MILIONARIA:
      return maisMilionariaSeed as Draw[];
    default:
      return [];
  }
}
