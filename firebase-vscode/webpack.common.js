//@ts-check

"use strict";

const path = require("path");
const webpack = require("webpack");
const fs = require("fs");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
  name: "extension",
  target: "node", // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target
  entry: {
    extension: "./src/extension.ts",
    server: {
      import: "./src/data-connect/language-server.ts",
      filename: "[name].js",
    },
  }, // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  devtool: "source-map",
  externalsType: "commonjs",
  externals: {
    vscode: "vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // avoid dynamic depencies from @vue/compiler-sfc
    squirrelly: "squirrelly",
    teacup: "teacup",
    "teacup/lib/express": "teacup/lib/express",
    "coffee-script": "coffee-script",
    marko: "marko",
    slm: "slm",
    vash: "vash",
    plates: "plates",
    "babel-core": "babel-core",
    htmling: "htmling",
    ractive: "ractive",
    mote: "mote",
    eco: "eco",
    jqtpl: "jqtpl",
    hamljs: "hamljs",
    jazz: "jazz",
    hamlet: "hamlet",
    whiskers: "whiskers",
    "haml-coffee": "haml-coffee",
    "hogan.js": "hogan.js",
    templayed: "templayed",
    walrus: "walrus",
    mustache: "mustache",
    just: "just",
    ect: "ect",
    toffee: "toffee",
    twing: "twing",
    dot: "dot",
    "bracket-template": "bracket-template",
    velocityjs: "velocityjs",
    "dustjs-linkedin": "dustjs-linkedin",
    atpl: "atpl",
    liquor: "liquor",
    twig: "twig",
    handlebars: "handlebars",
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    // mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
    mainFields: ["main", "module"],
    extensions: [".ts", ".js", ".json"], // needed to handle a node_module dependency emojilib, which requires json without ext.
    alias: {
      // "ora": path.resolve(__dirname, 'src/stubs/empty-function.js'),
      commander: path.resolve(__dirname, "src/stubs/empty-class.js"),
      inquirer: path.resolve(__dirname, "src/stubs/inquirer-stub.js"),
      "inquirer-autocomplete-prompt": path.resolve(
        __dirname,
        "src/stubs/inquirer-stub.js",
      ),
      // This is used for Github deploy to hosting - will need to restore
      // or find another solution if we add that feature.
      "libsodium-wrappers": path.resolve(__dirname, "src/stubs/empty-class.js"),
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/],
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        test: /\.ts$/,
        loader: "string-replace-loader",
        options: {
          multiple: [
            // CLI code has absolute path to schema/. We copy schema/
            // into dist, and this is the correct path now.
            {
              search: /(\.|\.\.)[\.\/]+schema/g,
              replace: "./schema",
            },
            // Without doing this, it dynamically grabs pkg.name from
            // package.json, which is the firebase-vscode package name.
            // We want to use the same configstore name as firebase-tools
            // so the CLI and extension can share login state.
            {
              search: /Configstore\(pkg\.name\)/g,
              replace: "Configstore('firebase-tools')",
            },
            // Some CLI code uses module.exports for test stubbing.
            // We are using ES2020 and it doesn't recognize functions called
            // as exports.functionName() or module.exports.functionName().
            // Maybe separate those CLI src files at a future time so they can
            // still be stubbed for tests without doing this, but this is
            // a temporary fix.
            {
              search: /module\.exports\.([a-zA-Z0-9]+)\(/g,
              /** @param match {any} */
              replace: (match) => match.replace("module.exports.", ""),
            },
            // cloudtasks.ts type casts so there's an " as [type]" before the
            // starting paren to call the function
            {
              search: /module\.exports\.([a-zA-Z0-9]+) as/g,
              /** @param match {any} */
              replace: (match) => match.replace("module.exports.", ""),
            },
            // Disallow starting . to ensure it doesn't conflict with
            // module.exports
            // Must end with a paren to avoid overwriting exports assignments
            // such as "exports.something = value"
            {
              search: /[^\.]exports\.([a-zA-Z0-9]+)\(/g,
              /** @param match {any} */
              replace: (match) => match.replace("exports.", ""),
            },
          ],
        },
      },
      {
        test: /\.js$/,
        loader: "string-replace-loader",
        options: {
          multiple: [
            // firebase-tools/node_modules/superstatic/lib/utils/patterns.js
            // Stub out the optional RE2 dependency
            // TODO: copy the dependency into dist instead of removing them via search/replace.
            {
              search: 'RE2 = require("re2");',
              replace: "RE2 = null;",
            },
            // firebase-tools/node_modules/superstatic/lib/middleware/index.js
            // Stub out these runtime requirements
            // TODO: copy the dependencies into dist instead of removing them via search/replace.
            {
              search:
                'const mware = require("./" + _.kebabCase(name))(spec, config);',
              replace: 'return "";',
            },
          ],
        },
      },
      {
        test: /.node$/,
        loader: "node-loader",
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "../templates",
          to: "./templates",
        },
        {
          from: "../schema",
          to: "./schema",
        },
        // TODO(hlshen): Sanity check if these should be fixed or removed. AFIACT, they exist for functions and hosting deploys, which are not relevant anymore.
        // Copy uncompiled JS files called at runtime by
        // firebase-tools/src/parseTriggers.ts
        // {
        //   from: "*.js",
        //   to: "./",
        //   context: "../src/deploy/functions/runtimes/node",
        // },
        // // Copy cross-env-shell.js used to run predeploy scripts
        // // to ensure they work in Windows
        // {
        //   from: "../node_modules/cross-env/dist",
        //   to: "./cross-env/dist",
        // },
      ],
    }),
  ],
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

/** @param entryName {any} */
function makeWebConfig(entryName, entryPath = "") {
  return {
    name: entryName,
    mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
    entry: "./" + path.join("webviews", entryPath, `${entryName}.entry.tsx`),
    output: {
      // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
      path: path.resolve(__dirname, "dist"),
      filename: `web-${entryName}.js`,
    },
    resolve: {
      extensions: [".ts", ".js", ".jsx", ".tsx"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: ["ts-loader"],
        },
        // SCSS
        /**
         * This generates d.ts files for the scss. See the
         * "WaitForCssTypescriptPlugin" code below for the workaround required
         * to prevent a race condition here.
         */
        {
          test: /\.scss$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: "@teamsupercell/typings-for-css-modules-loader",
              options: {
                banner:
                  "// autogenerated by typings-for-css-modules-loader. \n// Please do not change this file!",
              },
            },
            {
              loader: "css-loader",
              options: {
                modules: {
                  mode: "local",
                  localIdentName: "[local]-[hash:base64:5]",
                  exportLocalsConvention: "camelCaseOnly",
                },
                url: false,
              },
            },
            "postcss-loader",
            "sass-loader",
          ],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: `web-${entryName}.css`,
      }),
      new ForkTsCheckerWebpackPlugin(),
      new WaitForCssTypescriptPlugin(),
    ],
    devtool: "nosources-source-map",
  };
}

// Using the workaround for the typings-for-css-modules-loader race condition
// issue. It doesn't seem like you have to put any actual code into the hook,
// the fact that the hook runs at all seems to be enough delay for the scss.d.ts
// files to be generated. See:
// https://github.com/TeamSupercell/typings-for-css-modules-loader#typescript-does-not-find-the-typings
class WaitForCssTypescriptPlugin {
  /** @param compiler {any} */
  apply(compiler) {
    const hooks = ForkTsCheckerWebpackPlugin.getCompilerHooks(compiler);

    hooks.start.tap("WaitForCssTypescriptPlugin", (change) => {
      console.log("Ran WaitForCssTypescriptPlugin");
      return change;
    });
  }
}

/** Each folder in webviews needs to generate their webconfigs independently */
const baseWebviews = fs
  .readdirSync("webviews")
  .filter((filename) => filename.match(/\.entry\.tsx/))
  .map((filename) => filename.replace(/\.entry\.tsx/, ""))
  .map((name) => makeWebConfig(name));

const dataConnectWebviews = fs
  .readdirSync("webviews/data-connect")
  .filter((filename) => filename.match(/\.entry\.tsx/))
  .map((filename) => filename.replace(/\.entry\.tsx/, ""))
  .map((name) => makeWebConfig(name, "data-connect" /** entryPath */));

module.exports = [
  // web extensions is disabled for now.
  // webExtensionConfig,
  extensionConfig,
  ...baseWebviews,
  ...dataConnectWebviews,
];
