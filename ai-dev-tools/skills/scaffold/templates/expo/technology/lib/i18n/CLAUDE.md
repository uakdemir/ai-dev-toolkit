# `lib/i18n/` — i18n boundary (expo-localization + i18next)

## What this is for

`lib/i18n/` owns **translation + locale detection**:
- `expo-localization` detects the device locale at boot.
- `i18next` / `react-i18next` resolves translation keys against
  locale JSON files.

## Configuration

- Supported locales and the default fallback are defined in
  `lib/i18n/index.ts`. Translation JSON lives under
  `lib/i18n/locales/<lang>.json`.
- Translation workflow (source → distribution) typically uses
  Crowdin or DeepL; the exported JSON drops into `locales/`. Treat
  `locales/*.json` as write-only from the workflow — do not hand-edit
  non-source locales.

## Canonical usage patterns

```ts
// lib/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from './locales/en.json';
import es from './locales/es.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: Localization.getLocales()[0]?.languageCode ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export { i18n };
```

```tsx
// In a component
import { useTranslation } from 'react-i18next';
export function Greeting() {
  const { t } = useTranslation();
  return <Text>{t('home.greeting')}</Text>;
}
```

## What NOT to do

- **Do not inline user-facing strings in components.** Every
  user-visible string goes through `t()`.
- **Do not concatenate translated strings.** Use interpolation
  (`t('key', { name })`) — concatenation breaks RTL, grammar agreement,
  and word order across languages.
- **Do not ship pseudo-locale strings to production.** Remove
  `pseudo-en` and test locales from the resources list before a
  production build.

## Provider docs

- https://docs.expo.dev/versions/latest/sdk/localization/
- https://www.i18next.com/

---
Project-specific or personal AI guidance not managed by the scaffold lives
in `CLAUDE.local.md` next to this file. Read it if present.
