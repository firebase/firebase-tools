"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.frameworkMatcher = exports.removeEmbededFrameworks = exports.filterFrameworksWithFiles = exports.filterFrameworksWithDependencies = void 0;
const error_1 = require("../../../error");
const logger_1 = require("../../../logger");
/**
 *
 */
function filterFrameworksWithDependencies(allFrameworkSpecs, dependencies) {
    return allFrameworkSpecs.filter((framework) => {
        return framework.requiredDependencies.every((dependency) => {
            return dependency.name in dependencies;
        });
    });
}
exports.filterFrameworksWithDependencies = filterFrameworksWithDependencies;
/**
 *
 */
async function filterFrameworksWithFiles(allFrameworkSpecs, fs) {
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
    }
    catch (error) {
        logger_1.logger.error("Error: Unable to filter frameworks based on required files", error);
        throw error;
    }
}
exports.filterFrameworksWithFiles = filterFrameworksWithFiles;
/**
 * Embeded frameworks help to resolve tiebreakers when multiple frameworks are discovered.
 * Ex: "next" embeds "react", so if both frameworks are discovered,
 * we can suggest "next" commands by removing its embeded framework (react).
 */
function removeEmbededFrameworks(allFrameworkSpecs) {
    const embededFrameworkSet = new Set();
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
exports.removeEmbededFrameworks = removeEmbededFrameworks;
/**
 * Identifies the best FrameworkSpec for the codebase.
 */
async function frameworkMatcher(runtime, fs, frameworks, dependencies) {
    try {
        const filterRuntimeFramework = frameworks.filter((framework) => framework.runtime === runtime);
        const frameworksWithDependencies = filterFrameworksWithDependencies(filterRuntimeFramework, dependencies);
        const frameworkWithFiles = await filterFrameworksWithFiles(frameworksWithDependencies, fs);
        const allMatches = removeEmbededFrameworks(frameworkWithFiles);
        if (allMatches.length === 0) {
            return null;
        }
        if (allMatches.length > 1) {
            const frameworkNames = allMatches.map((framework) => framework.id);
            throw new error_1.FirebaseError(`Multiple Frameworks are matched: ${frameworkNames.join(", ")} Manually set up override commands in firebase.json`);
        }
        return allMatches[0];
    }
    catch (error) {
        throw new error_1.FirebaseError(`Failed to match the correct framework: ${error}`);
    }
}
exports.frameworkMatcher = frameworkMatcher;
//# sourceMappingURL=frameworkMatcher.js.map