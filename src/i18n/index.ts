import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './en.json';
import he from './he.json';

const resources = {
  en: { translation: en },
  he: { translation: he },
};

const deviceLanguage = getLocales()[0].languageCode ?? 'he';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: deviceLanguage === 'he' ? 'he' : 'en', // Default to English if not Hebrew
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
