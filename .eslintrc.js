const globalRules = {
    "no-prototype-builtins": "warn", // TODO(bkendall): remove, allow to error.
    "no-restricted-globals": ["error", "name", "length"], // This is a keeper.
    "no-useless-escape": "warn", // TODO(bkendall): remove, allow to error.
    "prefer-const": "warn", // TODO(bkendall): remove, allow to error.
    "prefer-promise-reject-errors": "warn", // TODO(bkendall): remove, allow to error.
    "prefer-spread": "warn", // TODO(bkendall): remove, allow to error.
    "require-jsdoc": "warn", // TODO(bkendall): remove, allow to error.
    "valid-jsdoc": "warn", // TODO(bkendall): remove, allow to error.
}

module.exports = {
    "env": {
        "es6": true,
        "node": true,
    },
    "extends": [
        "eslint:recommended",
        "google",
        "prettier",
        "prettier/@typescript-eslint",
    ],
    "rules": Object.assign(
        {
            "prettier/prettier": "error",
        },
        globalRules),
    "overrides": [
        {
            "files": ["*.ts"],
            "extends": [
                "plugin:@typescript-eslint/eslint-recommended",
                "plugin:@typescript-eslint/recommended",
                "plugin:@typescript-eslint/recommended-requiring-type-checking",
                "google",
                "prettier",
                "prettier/@typescript-eslint",
            ],
            "rules": Object.assign(
                {
                    "@typescript-eslint/await-thenable": "warn", // TODO(bkendall): remove, allow to error.
                    "@typescript-eslint/ban-types": "warn", // TODO(bkendall): remove, allow to error.
                    "@typescript-eslint/camelcase": "warn", // TODO(bkendall): remove, allow to error.
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
                },
                {
                    "camelcase": "warn", // TODO(bkendall): remove, allow to error.
                    "new-cap": "warn", // TODO(bkendall): remove, allow to error.
                    "no-case-declarations": "warn", // TODO(bkendall): remove, allow to error.
                    "no-constant-condition": "warn", // TODO(bkendall): remove, allow to error.
                    "no-fallthrough": "warn", // TODO(bkendall): remove, allow to error.
                    "no-unused-vars": "warn", // TODO(bkendall): remove, allow to error.
                    "require-atomic-updates": "warn", // TODO(bkendall): remove, allow to error.
                }, 
                globalRules),
        },
        {
            "files": ["*.js"],
            "rules": {
                "no-extra-boolean-cast": "warn", // TODO(bkendall): remove, allow to error.
                "no-invalid-this": "warn", // TODO(bkendall): remove, allow to error.
                "no-redeclare": "warn", // TODO(bkendall): remove, allow to error.
                "no-var": "warn", // TODO(bkendall): remove, allow to error.
                "prefer-rest-params": "warn", // TODO(bkendall): remove, allow to error.
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
