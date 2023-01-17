/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const typescriptPlugin = require("rollup-plugin-typescript2");
const json = require("@rollup/plugin-json");
import commonjs from "@rollup/plugin-commonjs";
const resolve = require("@rollup/plugin-node-resolve");
const typescript = require("typescript");

const pkgParent = require("../package.json");
const pkg = require("./package.json");

const deps = Object.keys(Object.assign({}, pkgParent.peerDependencies, pkgParent.dependencies));

const es5BuildPlugins = [
  typescriptPlugin({
    typescript,
  }),
  resolve(),
  json(),
  commonjs(),
];

const cjsBuilds = [
  {
    input: "src/extension.ts",
    output: [{ file: pkg.main, format: "cjs", sourcemap: true, interop: false }],
    // make all deps external when debugging so it will compile faster
    external: (id) => deps.some((dep) => id === dep || id.startsWith(`${dep}/`)),
    // external: ['ora', 'inquirer', 'colorette', 'proxy-agent', 'lodash'],
    // external: ['vm2'],
    plugins: es5BuildPlugins,
  },
];

module.exports = cjsBuilds;
