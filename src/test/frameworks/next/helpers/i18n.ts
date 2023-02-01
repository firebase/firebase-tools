import type { DomainLocale } from "next/dist/server/config";
import { I18N_CUSTOM_ROUTE_PREFIX } from "../../../../frameworks/next/utils";

export const pathsWithCustomRoutesInternalPrefix = [
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/:slug(\\d{1,})`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/:slug`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/bar`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/\\(escapedparentheses\\)/:slug(\\d{1,})`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/barbar`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/bar/another-regex/((?!bar).*)`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/barbar`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/team`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/barbar`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/about-us`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/barbar`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/post/:slug`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/barbar`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/blog/:slug*`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/barbar`,
  `${I18N_CUSTOM_ROUTE_PREFIX}(en\\-US|fr|nl\\-NL|nl\\-BE)/docs/:slug`,
  `${I18N_CUSTOM_ROUTE_PREFIX}/bar/barbar`,
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
