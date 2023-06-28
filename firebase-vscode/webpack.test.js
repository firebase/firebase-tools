//@ts-check

"use strict";

const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
  name: "extension",
  mode: "none",
  target: "node", // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target

  entry: "./src/test/runTest.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    publicPath: path.resolve(__dirname, "dist"),
    filename: "runTest.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  devtool: "source-map",
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    // mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
    mainFields: ["main", "module"],
    extensions: [".ts", ".js"],
    alias: {
      // provides alternate implementation for node module and source files
      "proxy-agent": path.resolve(__dirname, 'src/stubs/empty-class.js'),
      "marked-terminal": path.resolve(__dirname, 'src/stubs/empty-class.js'),
      // "ora": path.resolve(__dirname, 'src/stubs/empty-function.js'),
      "commander": path.resolve(__dirname, 'src/stubs/empty-class.js'),
      "inquirer": path.resolve(__dirname, 'src/stubs/inquirer-stub.js'),
      // This is used for Github deploy to hosting - will need to restore
      // or find another solution if we add that feature.
      "libsodium-wrappers": path.resolve(__dirname, 'src/stubs/empty-class.js'),
      "marked": path.resolve(__dirname, 'src/stubs/marked.js')
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
            {
              search: /(\.|\.\.)[\.\/]+templates/g,
              replace: "./templates",
            },
            {
              search: /(\.|\.\.)[\.\/]+schema/g,
              replace: "./schema",
            },
            {
              search: /Configstore\(pkg\.name\)/g,
              replace: "Configstore('firebase-tools')",
            },
            // TODO(hsubox76): replace with something more robust
            {
              search: "childProcess.spawn(translatedCommand",
              replace: "childProcess.spawn(escapedCommand"
            }
          ],
        },
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
        }
      ],
    })
  ],
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};


module.exports = [
  extensionConfig,
];
