import { FirebaseError } from "../../../error";
import { FrameworkSpec, FileSystem } from "./types";
import { logger } from "../../../logger";

export function filterFrameworksWithDependencies(
  allFrameworkSpecs: FrameworkSpec[],
  dependencies: Record<string, string>
): FrameworkSpec[] {
  try {
    return allFrameworkSpecs.filter((framework) => {
      return framework.requiredDependencies.every((dependency) => {
        return dependency.name in dependencies;
      });
    });
  } catch (error) {
    logger.error("Error while filtering FrameworksWithDependencies", error);
    throw error;
  }
}

export async function filterFrameworksWithFiles(
  allFrameworkSpecs: FrameworkSpec[],
  fs: FileSystem
): Promise<FrameworkSpec[]> {
  try {
    const filteredFrameworks = [];
    for (const framework of allFrameworkSpecs) {
      if (!framework.requiredFiles) {
        filteredFrameworks.push(framework);
        continue;
      }
      let isRequired = true;
      for (const files of framework.requiredFiles) {
        if (Array.isArray(files)) {
          for (const file of files) {
            isRequired = isRequired && (await fs.exists(file));
          }
        } else {
          isRequired = isRequired && (await fs.exists(files));
        }
      }

      if (isRequired) {
        filteredFrameworks.push(framework);
      }
    }
    return filteredFrameworks;
  } catch (error) {
    logger.error("Error while filtering FrameworksWithFiles", error);
    throw error;
  }
}

export function removeEmbededFrameworks(allFrameworkSpecs: FrameworkSpec[]): FrameworkSpec[] {
  try {
    const embededFrameworkSet: Set<string> = new Set<string>();
    allFrameworkSpecs.forEach((framework) => {
      if (!framework.embedsFrameworks) {
        return;
      }
      framework.embedsFrameworks.forEach((item) => embededFrameworkSet.add(item));
    });
    return allFrameworkSpecs.filter((item) => !embededFrameworkSet.has(item.id));
  } catch (error) {
    logger.error("Error occured while removing Embeded Frameworks", error.message);
    throw error;
  }
}

/**
 * Identifies the correct FrameworkSpec for the codebase.
 */
export async function frameworkMatcher(
  runtime: string,
  fs: FileSystem,
  frameworks: FrameworkSpec[],
  dependencies: Record<string, string>
): Promise<FrameworkSpec | null> {
  try {
    const filterRuntimeFramework = frameworks.filter((framework) => framework.runtime === runtime);
    const frameworksWithDependencies = filterFrameworksWithDependencies(
      filterRuntimeFramework,
      dependencies
    );
    const frameworkWithFiles = await filterFrameworksWithFiles(frameworksWithDependencies, fs);
    const allMatches = removeEmbededFrameworks(frameworkWithFiles);

    if (allMatches.length === 0) {
      return null;
    }
    if (allMatches.length > 1) {
      const frameworkNames = allMatches.map((framework) => framework.id);
      throw new FirebaseError(`Multiple Frameworks are matched: ${frameworkNames.join(", ")}`);
    }

    return allMatches[0];
  } catch (error) {
    throw new FirebaseError("Failed to match the correct frameworkSpec");
  }
}
