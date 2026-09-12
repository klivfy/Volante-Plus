/**
 * Constantes de navegação compartilhadas entre Server e Client Components.
 *
 * WHY (arquivo próprio, sem 'use client'): um valor exportado por um módulo
 * `'use client'` vira uma referência de cliente quando importado por um
 * Server Component — interpolar essa referência (como no `calc()` do
 * padding do layout) produz `"calc(funct..."` em vez do número, e a marcação
 * gerada no servidor diverge da do cliente na hidratação.
 */
export const BOTTOM_NAV_HEIGHT = 56;
