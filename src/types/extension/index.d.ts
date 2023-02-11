export interface CommandOptions {
  cwd?: string;
  extensionOptions?: ExtensionOptions;
  [key: string]: unknown;
}

export interface ExtensionOptions {
  spa?: boolean;
  publicFolder?: string;
}
