/**
 * Configuração central de privacidade (LGPD) — fonte única para a página
 * /privacidade, o banner de consentimento e o rodapé.
 *
 * ⚠️ PLACEHOLDER OBRIGATÓRIO DE PREENCHER: `dpoEmail` deve apontar para o
 * canal real do Encarregado antes de um deploy público com operação de
 * dados pessoal (Art. 41 da LGPD exige Encarregado quando aplicável).
 * Ver docs/CONFORMIDADE-LGPD.md, seção "Pendências".
 */

export const PRIVACY_CONFIG = {
  /** Nome público do controlador. */
  controllerName: 'Volante+',
  /**
   * Canal do Encarregado (DPO) para exercício dos direitos do Art. 18.
   * TODO(dpo): substituir pelo endereço real do Encarregado.
   */
  dpoEmail: 'privacidade@volanteplus.app',
  /** Data (ISO) da última revisão desta política — exibida na página. */
  policyUpdatedAt: '2026-11-04',
} as const;
