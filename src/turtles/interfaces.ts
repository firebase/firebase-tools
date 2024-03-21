/**
 * A Platform Adapter encapsulates the commands needed to discover
 * and create an instance of a framework.
 */
export interface PlatformAdapter {
  // Unique id for an platform.
  id: string;

  // id of possible parents. Undefined Adapters are bound to the root adapter.
  parentId?: string;

  // Instructions required to create an instance of this framework
  create: {
    install_command?: string;
    build_command?: string;
    develop_command?: string;
    run_command?: string;
    init_command?: string; // aka bootstrap or zero state
    output_directory?: string; // where we should expect a framework to dump output
    is_backend_required?: boolean; // Determines if a Cloud Function is required
  };

  // Properties used to infer if a framework is being used.
  discover: {
    required_files?: string[];
    required_package_dependency?: PackageManagerDependency;

    // The following two are speculative
    optional_files?: string[];
    required_package_dependencies?: PackageManagerDependency[];
  };
}

export interface PlatformAdapterResult {
  // Discovered Platform Adapter
  adapter: PlatformAdapter;

  // Directory (relative to project root)
  directory: string;

  // Describes distance from the project root directory.
  directory_depth: number;

  // How likely do we believe a framework is in use.
  confidence_score: number;
}

export enum PackageManager {
  UNKNOWN,
  NPM,
}

export interface PackageManagerDependency {
  packageManager: PackageManager;
  dependency: string;
  semver?: string;
}
