import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadSavedLocale,
  saveLocale,
  translate,
  type SupportedLocale,
  type TranslationKey,
} from './i18n';

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key, params) => translate('en', key, params),
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => loadSavedLocale());

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
