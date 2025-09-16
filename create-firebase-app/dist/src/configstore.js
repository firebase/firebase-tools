"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configstore = void 0;
const Configstore = require("configstore");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json");
exports.configstore = new Configstore(pkg.name);
