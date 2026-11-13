// Ambient types for vite module in CommonJS / node moduleResolution
// Matches Vite's exported runtime APIs needed by firebase-tools

declare module "vite" {
  export interface Plugin {
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type PluginOption = any;

  export interface UserConfig {
    root?: string;
    base?: string;
    publicDir?: string | false;
    plugins?: PluginOption[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }

  export interface InlineConfig extends UserConfig {
    configFile?: string | false;
    mode?: string;
  }

  export interface ResolvedConfig extends UserConfig {
    plugins: readonly Plugin[];
    publicDir: string;
    appType: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }

  export function defineConfig(config: UserConfig): UserConfig;
  export function defineConfig(config: Promise<UserConfig>): Promise<UserConfig>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function defineConfig(config: any): any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function build(inlineConfig?: InlineConfig): Promise<any>;

  export function resolveConfig(
    inlineConfig: InlineConfig,
    command: "build" | "serve",
    defaultMode?: string,
    defaultNodeEnv?: string,
    isPreview?: boolean,
  ): Promise<ResolvedConfig>;
}
