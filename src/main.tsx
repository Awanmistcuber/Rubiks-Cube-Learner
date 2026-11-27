import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {I18nProvider} from './i18n/I18nContext.tsx';
import './index.css';

if (import.meta.env.DEV) {
  interface InpTelemetryEntry {
    value: number;
    rating: string;
    interactionType: string;
    target: string;
    timestamp: number;
  }
  const win = window as unknown as {
    __KUBI_INP_ENTRIES__?: InpTelemetryEntry[];
  };
  win.__KUBI_INP_ENTRIES__ = [];

  void import('web-vitals').then(({onINP}) => {
    onINP(
      (metric) => {
        const longestEntry = metric.entries[metric.entries.length - 1] as
          | (PerformanceEventTiming & {target?: Element | null})
          | undefined;
        const targetEl = longestEntry?.target;
        const targetLabel = targetEl
          ? targetEl.getAttribute('data-testid') ||
            targetEl.getAttribute('aria-label') ||
            targetEl.id ||
            `${targetEl.tagName.toLowerCase()}${targetEl.textContent ? `("${targetEl.textContent.trim().slice(0, 24)}")` : ''}`
          : 'unknown';

        const entry: InpTelemetryEntry = {
          value: Math.round(metric.value),
          rating: metric.rating,
          interactionType: longestEntry?.name ?? 'interaction',
          target: targetLabel,
          timestamp: Date.now(),
        };
        win.__KUBI_INP_ENTRIES__?.push(entry);
        console.debug(
          `[INP] ${entry.value}ms (${entry.rating}) via ${entry.interactionType} -> ${entry.target}`
        );
      },
      {reportAllChanges: true}
    );
  });
}

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
