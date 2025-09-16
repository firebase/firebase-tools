"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gemini = void 0;
const templates_1 = require("../../../templates");
const promptUpdater_1 = require("./promptUpdater");
const utils_1 = require("../../../utils");
// Define constants at the module level for clarity and reuse.
const GEMINI_DIR = ".gemini/extensions/firebase";
const CONTEXTS_DIR = `${GEMINI_DIR}/contexts`;
exports.gemini = {
    name: "gemini",
    displayName: "Gemini CLI",
    /**
     * Configures the Gemini CLI extension for Firebase.
     *
     * This function sets up the necessary context files for Gemini to understand the
     * Firebase project structure. It creates a `.gemini/extensions/firebase` directory
     * with the following files:
     *
     * - `gemini-extension.json`: The main configuration for the extension.
     * - `contexts/FIREBASE.md`: The main entry point for project-specific context. It imports other files.
     * - `contexts/FIREBASE-BASE.md`: Contains fundamental details about the Firebase project.
     * - `contexts/FIREBASE-FUNCTIONS.md`: (Optional) Contains information about Firebase Functions if the feature is enabled.
     *
     * File ownership:
     * - ALL files under .gemini/extensions/firebase/: Fully managed by us
     *
     * Since this is a dedicated Firebase extension directory, we own all files
     * and can safely replace them without worrying about user customizations.
     * Users don't typically edit extension files directly.
     */
    async configure(config, projectPath, enabledFeatures) {
        const files = [];
        // Part 1: Configure the main gemini-extension.json file.
        const extensionPath = `${GEMINI_DIR}/gemini-extension.json`;
        const extensionTemplate = (0, templates_1.readTemplateSync)("init/aitools/gemini-extension.json");
        const newConfigRaw = extensionTemplate.replace("{{PROJECT_PATH}}", projectPath);
        let extensionUpdated = false;
        try {
            const existingRaw = config.readProjectFile(extensionPath);
            const existingConfig = JSON.parse(existingRaw);
            const newConfig = JSON.parse(newConfigRaw);
            if (!(0, utils_1.deepEqual)(existingConfig, newConfig)) {
                config.writeProjectFile(extensionPath, newConfigRaw);
                extensionUpdated = true;
            }
        }
        catch (_a) {
            // File doesn't exist or is invalid JSON, so we (re)create it.
            config.writeProjectFile(extensionPath, newConfigRaw);
            extensionUpdated = true;
        }
        files.push({ path: extensionPath, updated: extensionUpdated });
        // Part 2: Generate feature-specific context files (e.g., FIREBASE-BASE.md).
        const baseContent = (0, promptUpdater_1.generateFeaturePromptSection)("base");
        const basePath = `${CONTEXTS_DIR}/FIREBASE-BASE.md`;
        const baseResult = await (0, promptUpdater_1.replaceFirebaseFile)(config, basePath, baseContent);
        files.push({ path: basePath, updated: baseResult.updated });
        // Part 3: Create the main FIREBASE.md file that imports the context files.
        const imports = [
            "# Firebase Context",
            "",
            "<!-- Import base Firebase context -->",
            `@./contexts/FIREBASE-BASE.md`,
        ];
        if (enabledFeatures.includes("functions")) {
            const functionsContent = (0, promptUpdater_1.generateFeaturePromptSection)("functions");
            const functionsPath = `${CONTEXTS_DIR}/FIREBASE-FUNCTIONS.md`;
            const functionsResult = await (0, promptUpdater_1.replaceFirebaseFile)(config, functionsPath, functionsContent);
            files.push({ path: functionsPath, updated: functionsResult.updated });
            imports.push("", "<!-- Import Firebase Functions context -->", `@./contexts/FIREBASE-FUNCTIONS.md`);
        }
        const importContent = imports.join("\n");
        const { content: mainContent } = (0, promptUpdater_1.generatePromptSection)(enabledFeatures, {
            customContent: importContent,
        });
        const contextPath = `${GEMINI_DIR}/FIREBASE.md`;
        const mainResult = await (0, promptUpdater_1.replaceFirebaseFile)(config, contextPath, mainContent);
        files.push({ path: contextPath, updated: mainResult.updated });
        return { files };
    },
};
