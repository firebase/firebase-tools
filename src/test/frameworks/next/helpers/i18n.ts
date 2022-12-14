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
