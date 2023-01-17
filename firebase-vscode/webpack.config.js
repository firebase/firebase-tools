//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

const pkgParent = require("../package.json");

const deps = Object.keys(pkgParent.dependencies);


/**@type {import('webpack').Configuration}*/
const config = {
  target: 'webworker', // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  // externals: {
  //   vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  // },
  externals: [
    function ({ context, request }, callback) {
      if (deps.some((dep) => request === dep || request.startsWith(`${dep}/`))) {
        return callback(null, 'commonjs ' + request);
      }
      if (request === 'vscode') {
        return callback(null, 'commonjs vscode');
      }
      callback();
    }
  ],
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
    extensions: ['.ts', '.js'],
    alias: {
      // provides alternate implementation for node module and source files
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
      "fs": false,
      "http": false,
      "open": false,
      "path": false,
      "url": false,
      "util": false,
      "assert": false,
      "stream": false,
      "crypto": false
    }
  },
  plugins: [new NodePolyfillPlugin({
    includeAliases: ['process']
  })],
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};
module.exports = config;