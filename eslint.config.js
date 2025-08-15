
const globals = require("globals");
const prettier = require("eslint-plugin-prettier");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const jsdoc = require("eslint-plugin-jsdoc");
const brikke = require("eslint-plugin-brikke");
const tsParser = require("@typescript-eslint/parser");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = [
  ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:jsdoc/recommended",
    "google",
    "prettier",
  ),
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },

      ecmaVersion: 2017,
      sourceType: "module",

      parserOptions: {
        project: ["tsconfig.json", "tsconfig.dev.json"],
        warnOnUnsupportedTypeScriptVersion: false,
      },

      parser: tsParser,
    },

    rules: {
      "jsdoc/newline-after-description": "off",

      "jsdoc/require-jsdoc": ["warn", {
        publicOnly: true,
      }],

      "no-restricted-globals": ["error", "name", "length"],
      "prefer-arrow-callback": "error",
      "prettier/prettier": "error",
      "require-atomic-updates": "off",
      "require-jsdoc": "off",
      "valid-jsdoc": "off",

      "brikke/no-undeclared-imports": ["error", {
        excludedFilePatterns: ["**/scripts/**/*", `update-notifier-cjs.d.ts`],
        excludedModules: [/node:/, "express-serve-static-core"],
      }],

      "no-prototype-builtins": "warn",
      "no-useless-escape": "warn",
      "prefer-promise-reject-errors": "warn",
      "no-constant-binary-expression": "off",
    },

    plugins: {
      prettier,
      "@typescript-eslint": typescriptEslint,
      jsdoc,
      brikke,
    },

    settings: {
      jsdoc: {
        tagNamePreference: {
          returns: "return",
        },
      },
    },
  }, {
    files: ["**/*.ts"],

    rules: {
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "@typescript-eslint/no-invalid-this": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/require-await": "off",
      "no-invalid-this": "off",
      "no-unused-vars": "off",

      eqeqeq: ["error", "always", {
        null: "ignore",
      }],

      camelcase: ["error", {
        properties: "never",
      }],

      "@typescript-eslint/ban-types": "warn",

      "@typescript-eslint/explicit-function-return-type": ["warn", {
        allowExpressions: true,
      }],

      "@typescript-eslint/no-extra-non-null-assertion": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",

      "@typescript-eslint/no-use-before-define": ["warn", {
        functions: false,
        typedefs: false,
      }],

      "@typescript-eslint/no-var-requires": "warn",
      "@typescript-eslint/prefer-includes": "warn",
      "@typescript-eslint/prefer-regexp-exec": "warn",
      "@typescript-eslint/prefer-string-starts-ends-with": "warn",
      "@typescript-eslint/restrict-plus-operands": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "no-case-declarations": "warn",
      "no-constant-condition": "warn",
      "no-fallthrough": "warn",
    },
  }, {
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
      "no-var": "off",
      "prefer-arrow-callback": "off",
    },
  }, {
    files: ["**/*.spec.*"],

    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },

    rules: {},
  }, {
    files: ["src/mcp/tools/**/*.ts"],

    rules: {
      camelcase: "off",
    },
  }, {
    ignores: [
      "eslint.config.js",
      "src/dynamicImport.js",
      "scripts/webframeworks-deploy-tests/nextjs/**/*",
      "scripts/webframeworks-deploy-tests/angular/**/*",
      "scripts/frameworks-tests/vite-project/**/*",
      "src/frameworks/docs/**/*",
      "src/emulator/auth/schema.ts",
      "**/firebase-vscode/",
      "clean/**/*",
      "**/coverage",
      "**/dev",
      "**/lib",
      "**/node_modules",
      "**/standalone",
      "**/templates",
      "**/.firebase",
    ],
  }
];
