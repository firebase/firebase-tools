"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const package_json_1 = require("../package.json");
const prompt_1 = require("../../src/prompt");
const commander_1 = require("commander");
const data_connect_1 = require("./templates/data-connect");
const command = new commander_1.Command(package_json_1.default.name)
    .option("-- framework <string>", "Whether you want an angular or Next.js app")
    .option("-- product <string>", "What firebase product you want to use")
    .action(async (options) => {
    const framework = options.framework ||
        (await (0, prompt_1.select)({
            choices: ["angular", "next"],
            message: "Which framework do you want to use?",
        }));
    if (framework === 'next') {
        // ask follow-up question for what product to use.
        const product = options.product || (await (0, prompt_1.select)({
            choices: ['Data Connect'],
            message: "What firebase product do you want to use?",
        }));
        if (product === 'Data Connect') {
            await (0, data_connect_1.setUpDataConnectTemplate)();
        }
    }
});
command.parse();
