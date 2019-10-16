module.exports = {
    "env": {
        "es6": true,
        "node": true,
    },
    "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "google",
        "prettier",
        "prettier/@typescript-eslint",
    ],
    "rules": {
        "prettier/prettier": "error",
        "no-prototype-builtins": "warn", // TODO(bkendall): remove, allow to error.
        "no-restricted-globals": ["error", "name", "length"],
        "no-useless-escape": "warn", // TODO(bkendall): remove, allow to error.
        "prefer-const": "warn", // TODO(bkendall): remove, allow to error.
        "prefer-promise-reject-errors": "warn", // TODO(bkendall): remove, allow to error.
        "require-jsdoc": "warn", // TODO(bkendall): remove, allow to error.
        "valid-jsdoc": "warn", // TODO(bkendall): remove, allow to error.
    },
    "overrides": [
        {
            "files": ["*.ts"],
            "rules": {
                "@typescript-eslint/await-thenable": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/ban-types": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/camelcase": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/explicit-function-return-type": ["warn", { allowExpressions: true }], // TODO(bkendall): SET to error.
                "@typescript-eslint/no-inferrable-types": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/no-misused-promises": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/no-unnecessary-type-assertion": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/no-use-before-define": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/no-use-before-define": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/no-var-requires": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/prefer-includes": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/prefer-regexp-exec": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/prefer-string-starts-ends-with": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/require-await": "warn", // TODO(bkendall): remove, allow to error.
                "@typescript-eslint/unbound-method": "warn", // TODO(bkendall): remove, allow to error.
                "camelcase": "warn", // TODO(bkendall): remove, allow to error.
                "new-cap": "warn", // TODO(bkendall): remove, allow to error.
                "no-case-declarations": "warn", // TODO(bkendall): remove, allow to error.
                "no-constant-condition": "warn", // TODO(bkendall): remove, allow to error.
                "no-fallthrough": "warn", // TODO(bkendall): remove, allow to error.
                "no-unused-vars": "warn", // TODO(bkendall): remove, allow to error.
                "require-atomic-updates": "warn", // TODO(bkendall): remove, allow to error.
            },
        },
        {
            "files": ["*.js"],
            "rules": {
                "@typescript-eslint/camelcase": "off",
                "@typescript-eslint/explicit-function-return-type": "off",
                "@typescript-eslint/no-empty-function": "off",
                "@typescript-eslint/no-misused-promises": "off",
                "@typescript-eslint/no-this-alias": "off",
                "@typescript-eslint/no-use-before-define": "off",
                "@typescript-eslint/no-var-requires": "off",
                "@typescript-eslint/prefer-includes": "off",
                "@typescript-eslint/prefer-regexp-exec": "off",
                "@typescript-eslint/unbound-method": "off",
                "no-invalid-this": "warn", // TODO(bkendall): remove, allow to error.
                "no-var": "warn", // TODO(bkendall): remove, allow to error.
            },
        },
        {
            "files": ["*.spec.*"],
            "env": {
                "mocha": true,
            },
            "rules": {
                "require-jsdoc": "warn", // TODO(bkendall): remove, allow to error.
            },
        },
    ],
    "globals": {},
    "parserOptions": {
        "ecmaVersion": "2017",
        "project": ["tsconfig.json", "tsconfig.dev.json"],
        "sourceType": "module",
    },
    "plugins": [
        "prettier",
        "@typescript-eslint",
    ],
    "parser": "@typescript-eslint/parser",
};
