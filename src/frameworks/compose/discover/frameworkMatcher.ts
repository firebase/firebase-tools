import { FrameworkSpec, FileSystem } from "./types";

/**
 *
 */
export function filterFrameworksWithDependencies(
  allFrameworkSpecs: FrameworkSpec[],
  dependencies: Record<string, string>
): FrameworkSpec[] {
  return allFrameworkSpecs.filter((framework) => {
    return framework.requiredDependencies.every((dep) => {
      return dep["name"] in dependencies;
    });
  });
}

/**
 *
 */
export async function filterFrameworksWithFiles(
  allFrameworkSpecs: FrameworkSpec[],
  fs: FileSystem
): Promise<FrameworkSpec[]> {
  const filteredFrameworks = [];
  for (const framework of allFrameworkSpecs) {
    if (!framework.requiredFiles) {
      filteredFrameworks.push(framework);
      continue;
    }
    const isRequired = await Promise.all(
      framework.requiredFiles.map(async (files) => {
        if (Array.isArray(files)) {
          const boolArray = await Promise.all(files.map((file) => fs.exists(file)));
          return boolArray.every((x) => x);
        } else {
          return await fs.exists(files);
        }
      })
    );
    if (isRequired.every((x) => x)) {
      filteredFrameworks.push(framework);
    }
  }
  return filteredFrameworks;
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
export async function frameworkMatcher(
  runtime: string,
  fs: FileSystem,
  frameworks: FrameworkSpec[],
  dependencies: Record<string, string>
): Promise<FrameworkSpec | null> {
  try {
    // Filter based on runtime name.
    const filterRuntimeFramework = frameworks.filter((framework) => framework.runtime === runtime);
    // Filter based on dependencies.
    const frameworksWithDependencies = filterFrameworksWithDependencies(
      filterRuntimeFramework,
      dependencies
    );
    // Filter based on files required.
    const frameworkWithFiles = await filterFrameworksWithFiles(frameworksWithDependencies, fs);
    // Filter based on embeded Frameworks.
    const allMatches = removeEmbededFrameworks(frameworkWithFiles);

    if (allMatches.length === 0) {
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
