"use strict";

import * as fs from "fs-extra";
import * as _ from "lodash";

const program = require("commander");
const pkg = require("../package.json");

// TODO: Don't want to do lib
const loadAllCommands = require('../lib/commands');

program.version(pkg.version);

var client: any = {
    cli: program,
    getCommand: function(name: any) {
        for (var i = 0; i < client.cli.commands.length; i++) {
            if (client.cli.commands[i]._name === name) {
                return client.cli.commands[i];
            }
        }
        return null;
    },
}; 

loadAllCommands(client);

function listCommands() {
    return client.cli.commands.map((c: any) => {
        return c.name();
    });
}

function commandPagePage(name: string) {
    const fileName = name.replace(/:/g, '-') + '.md';
    const fullPath = `./docs/${fileName}`;

    return fullPath;
}

function generateCommandPage(name: string, command: any) {
    return `
# ${name}

${_.capitalize(command._description)}

## Usage
\`\`\`
firebase ${name} ${command.usage()}
\`\`\`

## Options
\`\`\`
${command.optionHelp()}
\`\`\`
`.trimLeft()
}

for (const cmdName of listCommands()) {
    const f = commandPagePage(cmdName);
    const content = generateCommandPage(cmdName, client.getCommand(cmdName));

    console.log(`Writing ${f}`);
    fs.writeFileSync(f, content);
}