"use strict";

const chalk = require("chalk");
const envinfo = require("envinfo");

var Command = require("../command");

module.exports = new Command("info")
.description("Prints debugging information about the environment")
.action(async function() {
  console.log(chalk.bold('\nEnvironment Info:'));
    var info = await envinfo
      .run(
        {
          System: ['OS', 'CPU'],
          Binaries: ['Node', 'Yarn', 'npm'],
          Browsers: ['Chrome', 'Edge', 'Firefox', 'Safari'],
          npmGlobalPackages: ['firebase'],
        },
        {
          showNotFound: true,
          duplicates: true,
          fullTree: true,
        },
      );
    console.log(info);
});
