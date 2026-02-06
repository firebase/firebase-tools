const { merge } = require("webpack-merge");
const path = require("path");
const configs = require("../../webpack.common");
const glob = require("glob");

const extensionConfig = configs.find((config) => config.name === "extension");

const getTestFiles = () =>
  new Promise((resolve, reject) => {
    glob(
      "**/**.test.ts",
      { cwd: path.resolve(__dirname, "suite") },
      (err, files) => {
        if (err) {
          reject(e(err));
        }
        const testFiles = {};
        for (const file of files) {
          const fileName = path.parse(file).name;
          testFiles[fileName] = path.resolve(__dirname, "suite", file);
        }
        resolve(testFiles);
      },
    );
  });

async function getTestConfig() {
  const testFiles = await getTestFiles();

  const testConfig = merge(extensionConfig, {
    mode: "development",
    name: "test",
    parallelism: 20,
    entry: testFiles,
    output: {
      // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
      path: path.resolve(
        __dirname,
        "../../dist/test/firebase-vscode/src/test/",
      ),
      filename: "[name].js",
      libraryTarget: "commonjs2",
      devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    externals: {
      vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
      fsevents: "require('fsevents')",
    },
    optimization: {
      splitChunks: {
        chunks: "all",
      },
    },
  });

  return testConfig;
}

module.exports = getTestConfig();
