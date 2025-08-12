import { FlatCompat } from "@eslint/eslintrc";
import path from "path";
import { fileURLToPath } from "url";
import js from "@eslint/js";

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

// The old config needs to be loaded with require
// but this is an ES module, so we need to create a require function
import { createRequire } from "module";
const require = createRequire(import.meta.url);

export default [
    {
        ignores: [
            "eslint.config.js",
            "standalone/**",
            "templates/**",
            "src/dynamicImport.js",
            "scripts/webframeworks-deploy-tests/nextjs/**",
            "scripts/webframeworks-deploy-tests/angular/**",
            "scripts/frameworks-tests/vite-project/**",
            "/src/frameworks/docs/**",
            // This file is taking a very long time to lint, 2-4m
            "src/emulator/auth/schema.ts",
            // TODO(hsubox76): Set up a job to run eslint separately on vscode dir
            "firebase-vscode/",
            // If this is leftover from "clean-install.sh", don't lint it
            "clean/**",
        ]
    },
    ...compat.config(require("./.eslintrc.js.old"))
];
