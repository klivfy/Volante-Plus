import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common from '../../locales/pt-BR/common.json';

// Só pt-BR por enquanto — o app inteiro já era só nessa língua antes desta
// mudança. A estrutura (namespace "common", chaves aninhadas por tela) já
// fica pronta para um segundo idioma no futuro: bastaria adicionar
// `locales/<lng>/common.json` e registrar como mais um resource abaixo.
const resources = {
  'pt-BR': { common },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    defaultNS: 'common',
    interpolation: {
      // React já escapa JSX por padrão — deixar o i18next escapar de novo
      // corrompe acentos/pontuação (ex.: "número" viraria "n&#250;mero").
      escapeValue: false,
    },
  });
}

export default i18n;
