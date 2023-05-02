interface AngularLocale {
  translation?: string;
  baseHref?: string;
}

export interface AngularI18nConfig {
  sourceLocale: string;
  locales: Record<string, AngularLocale>;
}
