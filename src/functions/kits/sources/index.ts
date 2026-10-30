import { Config } from "../../../config";
import { FirebaseError } from "../../../error";
import { createDirectoryAdapter } from "./directory";
import { createNpmPackageAdapter, TemplateType } from "./npm";
import { KitSourceAdapter } from "./types";

export * from "./types";
export * from "./npm";
export * from "./directory";

export interface ResolveSourceAdapterOptions {
  config: Config;
  package?: string;
  directory?: string;
  template?: TemplateType;
  nonInteractive?: boolean;
  force?: boolean;
}

/**
 * Resolves the appropriate KitSourceAdapter for the given CLI/install options.
 */
export function resolveSourceAdapter(options: ResolveSourceAdapterOptions): KitSourceAdapter {
  if (options.package && options.directory) {
    throw new FirebaseError("Cannot specify both --package and --directory. Please choose one.");
  }
  if (options.directory && options.template) {
    throw new FirebaseError("Cannot specify --template with --directory.");
  }
  if (options.directory) {
    return createDirectoryAdapter({
      config: options.config,
      directory: options.directory,
    });
  }
  if (options.package) {
    return createNpmPackageAdapter({
      config: options.config,
      package: options.package,
      template: options.template,
      nonInteractive: options.nonInteractive,
      force: options.force,
    });
  }

  throw new FirebaseError("Must specify either --package or --directory.");
}
