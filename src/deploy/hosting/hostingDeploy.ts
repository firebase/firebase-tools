// NOTE: This type is incomplete and contains only config necessary for validation.
export interface HostingConfig {
  ignore?: string[];
  public?: string;
  rewrites?: {
    source: string;
    destination?: string;
    function?: string;
    run?: { serviceId: string; location?: string };
  }[];
  redirects?: {
    source: string;
  }[];
  i18n?: { root: string };
}

export interface HostingDeploy {
  site: string;
  version?: string;
  config: HostingConfig;
}
