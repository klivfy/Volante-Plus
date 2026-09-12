import { Draw, Lottery } from '../../types/domain';
import megaSenaSeed from './megasena.json';
import maisMilionariaSeed from './mais_milionaria.json';

/**
 * Histórico de fallback para uso 100% offline (primeira visita sem rede, ou
 * PWA instalado sem nunca ter sincronizado). **Dados sintéticos**, não
 * resultados oficiais da Caixa — ver `README.md` desta pasta. Servem só para
 * o app ter algo para analisar/gerar antes da primeira sincronização real
 * (`services/caixaApi.ts`), nunca como fonte de verdade.
 */
export function getSeedData(lottery: Lottery): Draw[] {
  switch (lottery) {
    case Lottery.MEGA_SENA:
      return megaSenaSeed as Draw[];
    case Lottery.MAIS_MILIONARIA:
      return maisMilionariaSeed as Draw[];
    default:
      return [];
  }
}
