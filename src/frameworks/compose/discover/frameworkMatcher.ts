import { FrameworkSpec, FileSystem } from "./types";

/**
 *
 */
export function filterFrameworksWithDependencies(
  allFrameworkSpecs: FrameworkSpec[],
  dependencies: Record<string, string>
): FrameworkSpec[] {
  return allFrameworkSpecs.filter((framework) => {
    return framework.requiredDependencies.every((dependency) =>
      dependencies.hasOwnProperty(dependency["name"])
    );
  });
}

/**
 *
 */
export function filterFrameworksWithFiles(
  allFrameworkSpecs: FrameworkSpec[],
  fs: FileSystem
): FrameworkSpec[] {
  return allFrameworkSpecs.filter((framework) => {
    if (!framework.requiredFiles) {
      return true;
    }
    framework.requiredFiles.every((files) => {
      if (Array.isArray(files)) {
        return files.every((file) => fs.exists(file));
      } else {
        return fs.exists(files);
      }
    });
  });
}

/**
 *
 */
export function removeEmbededFrameworks(allFrameworkSpecs: FrameworkSpec[]): FrameworkSpec[] {
  const embededFrameworkSet: Set<string> = new Set<string>();
  allFrameworkSpecs.forEach((framework) => {
    if (!framework.embedsFrameworks) {
      return;
    }
    framework.embedsFrameworks.forEach((item) => embededFrameworkSet.add(item));
  });
  return allFrameworkSpecs.filter((item) => !embededFrameworkSet.has(item.id));
}

/**
 * Identifies the correct FrameworkSpec for the codebase. kjajfkjasd.
 */
export function frameworkMatcher(
  runtime: string,
  fs: FileSystem,
  frameworks: FrameworkSpec[],
  dependencies: Record<string, string>
): FrameworkSpec | null {
  try {
    // Filter based on runtime name.
    const filterRuntimeFramework = frameworks.filter((framework) => framework.runtime === runtime);
    // Filter based on dependencies.
    const frameworksWithDependencies = filterFrameworksWithDependencies(
      filterRuntimeFramework,
      dependencies
    );
    // Filter based on files required.
    const frameworkWithFiles = filterFrameworksWithFiles(frameworksWithDependencies, fs);
    // Filter based on embeded Frameworks.
    const allMatches = removeEmbededFrameworks(frameworkWithFiles);

    if (!allMatches.length) {
      return null;
    }
    if (allMatches.length > 1) {
      const frameworkNames = allMatches.map((framework) => framework.id);
      throw new Error(`Multiple Frameworks are matched: ${frameworkNames.join(", ")}`);
    }

    return allMatches[0];
  } catch (error: any) {
    throw new Error("Failed to match the correct frameworkSpec", error.message);
  }
}
