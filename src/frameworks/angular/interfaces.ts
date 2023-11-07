interface AngularLocale {
  translation?: string;
  baseHref?: string;
}

export interface AngularI18nConfig {
  sourceLocale:
    | string
    | {
        code: string;
        baseHref?: string;
      };
  locales: Record<string, AngularLocale>;
}
