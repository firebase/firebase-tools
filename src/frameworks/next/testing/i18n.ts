import type { DomainLocale } from "next/dist/server/config";

export const pathsWithCustomRoutesInternalPrefix = [
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/:slug(\\d{1,})`,
  `/:nextInternalLocale/bar/:slug`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/bar`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/\\(escapedparentheses\\)/:slug(\\d{1,})`,
  `/:nextInternalLocale/bar/barbar`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/another-regex/((?!bar).*)`,
  `/:nextInternalLocale/bar/barbar`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/team`,
  `/:nextInternalLocale/bar/barbar`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/about-us`,
  `/:nextInternalLocale/bar/barbar`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/post/:slug`,
  `/:nextInternalLocale/bar/barbar`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/blog/:slug*`,
  `/:nextInternalLocale/bar/barbar`,
  `/:nextInternalLocale(en\\-US|fr|nl\\-NL|nl\\-BE)/docs/:slug`,
  `/:nextInternalLocale/bar/barbar`,
];

export const i18nDomains: DomainLocale[] = [
  {
    defaultLocale: "en-US",
    domain: "en-us.firebaseapp.com",
  },
  {
    defaultLocale: "pt-BR",
    domain: "pt-br.firebaseapp.com",
  },
  {
    defaultLocale: "es-ES",
    domain: "es-es.firebaseapp.com",
  },
  {
    defaultLocale: "fr-FR",
    domain: "fr-fr.firebaseapp.com",
  },
  {
    defaultLocale: "it-IT",
    domain: "it-it.firebaseapp.com",
  },
  {
    defaultLocale: "de-DE",
    domain: "de-de.firebaseapp.com",
  },
];

export const domains = i18nDomains.map(({ domain }) => domain);
