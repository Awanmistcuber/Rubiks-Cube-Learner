import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';

export type SupportedLocale = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de';
export type TranslationKey = keyof typeof en;
export type TranslationDictionary = Record<TranslationKey, string>;

export interface LocaleOption {
  code: SupportedLocale;
  nativeName: string;
  englishName: string;
  shortTag: string;
}

export const LOCALE_STORAGE_KEY = 'kubi_ui_locale_v1';

export const SUPPORTED_LOCALES: readonly LocaleOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', shortTag: 'EN' },
  { code: 'zh', nativeName: '中文', englishName: 'Chinese', shortTag: 'ZH' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', shortTag: 'JA' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', shortTag: 'KO' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', shortTag: 'ES' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', shortTag: 'FR' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', shortTag: 'DE' },
];

export const TRANSLATION_DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = {
  en,
  zh,
  ja,
  ko,
  es,
  fr,
  de,
};

const VALID_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES.map((l) => l.code));

export function normalizeLocale(raw: string | null | undefined): SupportedLocale {
  if (!raw || typeof raw !== 'string') return 'en';
  const cleaned = raw.trim().toLowerCase();
  if (VALID_LOCALE_SET.has(cleaned)) {
    return cleaned as SupportedLocale;
  }
  const prefix = cleaned.split(/[-_]/)[0];
  if (VALID_LOCALE_SET.has(prefix)) {
    return prefix as SupportedLocale;
  }
  return 'en';
}

export function translate(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const dict = TRANSLATION_DICTIONARIES[locale] ?? TRANSLATION_DICTIONARIES.en;
  let text = dict[key] ?? TRANSLATION_DICTIONARIES.en[key] ?? key;

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replaceAll(`{{${paramKey}}}`, String(paramValue));
    }
  }
  return text;
}

export function loadSavedLocale(): SupportedLocale {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved) return normalizeLocale(saved);
    } catch {
      // ignore storage errors
    }
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalizeLocale(navigator.language);
  }
  return 'en';
}

export function saveLocale(locale: SupportedLocale): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage errors
  }
}
