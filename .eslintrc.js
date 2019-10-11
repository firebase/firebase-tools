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
    "rules": {
        "prettier/prettier": "error",
        "no-prototype-builtins": "warn", // TODO(bkendall): remove, allow to error.
        "no-restricted-globals": ["error", "name", "length"], // This is a keeper.
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
        "project": ["tsconfig.json"],
        "sourceType": "module",
    },
    "plugins": [
        "prettier",
        "@typescript-eslint",
    ],
    "parser": "@typescript-eslint/parser",
};
