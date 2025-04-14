import { FirebaseError } from "../../../error";
import { FrameworkSpec, FileSystem } from "./types";
import { logger } from "../../../logger";

/**
 *
 */
export function filterFrameworksWithDependencies(
  allFrameworkSpecs: FrameworkSpec[],
  dependencies: Record<string, string>,
): FrameworkSpec[] {
  return allFrameworkSpecs.filter((framework) => {
    return framework.requiredDependencies.every((dependency) => {
      return dependency.name in dependencies;
    });
  });
}

/**
 *
 */
export async function filterFrameworksWithFiles(
  allFrameworkSpecs: FrameworkSpec[],
  fs: FileSystem,
): Promise<FrameworkSpec[]> {
  try {
    const filteredFrameworks = [];
    for (const framework of allFrameworkSpecs) {
      if (!framework.requiredFiles) {
        filteredFrameworks.push(framework);
        continue;
      }
      let isRequired = true;
      for (let files of framework.requiredFiles) {
        files = Array.isArray(files) ? files : [files];
        for (const file of files) {
          isRequired = isRequired && (await fs.exists(file));
          if (!isRequired) {
            break;
          }
        }
      }
      if (isRequired) {
        filteredFrameworks.push(framework);
      }
    }

    return filteredFrameworks;
  } catch (error) {
    logger.error("Error: Unable to filter frameworks based on required files", error);
    throw error;
  }
}

/**
 * Embeded frameworks help to resolve tiebreakers when multiple frameworks are discovered.
 * Ex: "next" embeds "react", so if both frameworks are discovered,
 * we can suggest "next" commands by removing its embeded framework (react).
 */
export function removeEmbededFrameworks(allFrameworkSpecs: FrameworkSpec[]): FrameworkSpec[] {
  const embededFrameworkSet: Set<string> = new Set<string>();

  for (const framework of allFrameworkSpecs) {
    if (!framework.embedsFrameworks) {
      continue;
    }
    for (const item of framework.embedsFrameworks) {
      embededFrameworkSet.add(item);
    }
  }

  return allFrameworkSpecs.filter((item) => !embededFrameworkSet.has(item.id));
}

/**
 * Identifies the best FrameworkSpec for the codebase.
 */
export async function frameworkMatcher(
  runtime: string,
  fs: FileSystem,
  frameworks: FrameworkSpec[],
  dependencies: Record<string, string>,
): Promise<FrameworkSpec | null> {
  try {
    const filterRuntimeFramework = frameworks.filter((framework) => framework.runtime === runtime);
    const frameworksWithDependencies = filterFrameworksWithDependencies(
      filterRuntimeFramework,
      dependencies,
    );
    const frameworkWithFiles = await filterFrameworksWithFiles(frameworksWithDependencies, fs);
    const allMatches = removeEmbededFrameworks(frameworkWithFiles);

    if (allMatches.length === 0) {
      return null;
    }
    if (allMatches.length > 1) {
      const frameworkNames = allMatches.map((framework) => framework.id);
      throw new FirebaseError(
        `Multiple Frameworks are matched: ${frameworkNames.join(
          ", ",
        )} Manually set up override commands in firebase.json`,
      );
    }

    return allMatches[0];
  } catch (error: any) {
    throw new FirebaseError(`Failed to match the correct framework: ${error}`);
  }
}
