import eslint from "@eslint/js";
import eslintConfigGoogle from "eslint-config-google";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintConfigJSDoc from "eslint-plugin-jsdoc";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";
import globals from "globals";
import brikke from "eslint-plugin-brikke";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigJSDoc.configs["flat/recommended"],
  eslintConfigGoogle,
  eslintConfigPrettier,
  eslintPluginPrettierRecommended,
  {
    ignores: [
      ".nyc_output/**/*",
      "node_modules/**/*",
      "standalone/**/*",
      "templates/**/*",
      "scripts/**/*",
      ".firebase",
      "eslint.config.mjs",
      "lib/**/*",
      ".coverage/**/*",
      "src/dynamicImport.js",
      "src/emulator/dataconnect/pg-gateway",
      "/src/frameworks/docs/**",
      // This file is taking a very long time to lint, 2-4m
      "src/emulator/auth/schema.ts",
      // TODO(hsubox76): Set up a job to run eslint separately on vscode dir
      "firebase-vscode/",
      // If this is leftover from "clean-install.sh", don't lint it
      "clean/**",
      ".prettierrc.js",
    ],
  },
  {
    plugins: {
      brikke: brikke,
    },
    settings: {
      jsdoc: {
        tagNamePreference: {
          returns: "return",
        },
      },
    },
    rules: {
      "jsdoc/newline-after-description": "off",
      "jsdoc/require-jsdoc": ["warn", { publicOnly: true }],
      "no-restricted-globals": ["error", "name", "length"],
      "prefer-arrow-callback": "error",
      "prettier/prettier": "error",
      "require-atomic-updates": "off", // This rule is so noisy and isn't useful: https://github.com/eslint/eslint/issues/11899
      "require-jsdoc": "off", // This rule is deprecated and superseded by jsdoc/require-jsdoc.
      "valid-jsdoc": "off", // This is deprecated but included in recommended configs.
      "brikke/no-undeclared-imports": [
        "error",
        {
          excludedFilePatterns: ["**/scripts/**/*", `update-notifier-cjs.d.ts`],
          excludedModules: [
            /node:/,
            "express-serve-static-core", // We rely on just the types, and the package breaks our build.
          ],
        },
      ],
      "no-prototype-builtins": "warn", // TODO(bkendall): remove, allow to error.
      "no-useless-escape": "warn", // TODO(bkendall): remove, allow to error.
      "prefer-promise-reject-errors": "warn", // TODO(bkendall): remove, allow to error.

      "brikke/no-undeclared-imports": [
        "error",
        {
          excludedFilePatterns: ["**/scripts/**/*", `update-notifier-cjs.d.ts`],
          excludedModules: [
            /node:/,
            "express-serve-static-core", // We rely on just the types, and the package breaks our build.
          ],
        },
      ],
    },
    languageOptions: {
      ecmaVersion: 2017,
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
      parserOptions: {
        ecmaVersion: "es2017",
        projectService: {
          project: ["tsconfig.json", "tsconfig.dev.json"],
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",

      // Google style guide allows us to omit trivial parameters and returns
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",

      "@typescript-eslint/no-invalid-this": "error",
      "@typescript-eslint/no-unused-vars": "error", // Unused vars should not exist.
      "no-invalid-this": "off", // Turned off in favor of @typescript-eslint/no-invalid-this.
      "no-unused-vars": "off", // Off in favor of @typescript-eslint/no-unused-vars.
      eqeqeq: ["error", "always", { null: "ignore" }],
      camelcase: ["error", { properties: "never" }], // snake_case allowed in properties iif to satisfy an external contract / style
      // TODO(joehan): Go through these one by one and fix/remove
      '@typescript-eslint/no-unused-expressions': "warn",
      '@typescript-eslint/no-explicit-any': "warn",
      '@typescript-eslint/dot-notation': "warn",
      '@typescript-eslint/prefer-for-of': "warn",
      '@typescript-eslint/no-require-imports': "warn",
      '@typescript-eslint/consistent-indexed-object-style': "warn",
      '@typescript-eslint/consistent-type-definitions': "warn",
      '@typescript-eslint/prefer-nullish-coalescing': "warn",
      '@typescript-eslint/prefer-promise-reject-errors': "warn",
      '@typescript-eslint/no-unused-vars': "warn",
      '@typescript-eslint/array-type': "warn",
      '@typescript-eslint/consistent-generic-constructors': "warn",
      'no-constant-binary-expression': "warn",
      'valid-typeof': "warn",
      '@typescript-eslint/prefer-optional-chain': "warn",
      '@typescript-eslint/no-base-to-string': "warn",
      '@typescript-eslint/no-unsafe-enum-comparison': "warn",
      '@typescript-eslint/only-throw-error': "warn",
      '@typescript-eslint/no-redundant-type-constituents': "warn",
      '@typescript-eslint/no-duplicate-type-constituents': "warn",
      '@typescript-eslint/non-nullable-type-assertion-style': "warn",
      '@typescript-eslint/no-empty-object-type': "warn",
      '@typescript-eslint/ban-tslint-comment': "warn",
      '@typescript-eslint/class-literal-property-style': "warn",
      '@typescript-eslint/await-thenable': "warn",
      '@typescript-eslint/no-wrapper-object-types': "warn",
      '@typescript-eslint/prefer-function-type': "warn",
      '@typescript-eslint/no-unsafe-function-type': "warn",
      // End temp rules
      "@typescript-eslint/explicit-function-return-type": ["warn", { allowExpressions: true }], // TODO(bkendall): SET to error.
      "@typescript-eslint/no-extra-non-null-assertion": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-floating-promises": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-inferrable-types": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-misused-promises": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-unnecessary-type-assertion": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-unsafe-argument": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-unsafe-assignment": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-unsafe-call": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-unsafe-member-access": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-unsafe-return": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/no-use-before-define": ["warn", { functions: false, typedefs: false }], // TODO(bkendall): change to error.
      "@typescript-eslint/no-var-requires": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/prefer-includes": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/prefer-regexp-exec": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/prefer-string-starts-ends-with": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/restrict-plus-operands": "warn", // TODO(bkendall): remove, allow to error.
      "@typescript-eslint/restrict-template-expressions": "warn", // TODO(bkendall): remove, allow to error.
      "no-case-declarations": "warn", // TODO(bkendall): remove, allow to error.
      "no-constant-condition": "warn", // TODO(bkendall): remove, allow to error.
      "no-fallthrough": "warn", // TODO(bkendall): remove, allow to error.
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/unbound-method": "off",

      "no-var": "off", // TODO(bkendall): remove, allow to error.
      "prefer-arrow-callback": "off", // TODO(bkendall): remove, allow to error.
    },
  },
];