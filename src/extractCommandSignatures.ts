import * as fs from "fs";
import { Command } from "./command";

interface CommandDescriptor {
  name: string;
  description: string;
  help: string;
  options: {
    handles: string[];
    text: string;
    description: string;
    parameter?: string;
    acceptsFile: boolean;
  }[];
}

async function extractCommandSignatures(): Promise<void> {
  const commandSignatures: CommandDescriptor[] = [];

  for (const commandFile of fs.readdirSync("./src/commands")) {
    const command = (await import("./commands/" + commandFile.replace(/.ts$/, ""))) as Command;

    if (!command["name"]) {
      continue;
    }

    commandSignatures.push({
      help: command["helpText"],
      name: command["name"],
      description: command["descriptionText"],
      options: command["options"].map(([option, description]: string[]) => {
        const possibleParameter = option.replace(
          /^-[^,\s]*(, -[^,\s]*)* (.*)$/,
          (_, __, parameter: string) => parameter
        );
        const parameter = possibleParameter.startsWith("-")
          ? undefined
          : possibleParameter.replace(/^[[{<]|[\]}>]$/g, "");

        return {
          handles: option
            .replace(/^(-[^\s]*(, -[^\s]*)*).*$/, (_, rawOptions: string) => rawOptions)
            .split(", "),
          text: option,
          description,
          parameter,
          acceptsFile: parameter?.includes("file") || false,
        };
      }),
    });
  }

  fs.writeFileSync("command-signatures.json", JSON.stringify(commandSignatures));

  const bashDeclaration = `
COMMANDS="${commandSignatures.map(({ name }) => name).join(" ")}"
${commandSignatures
  .map(
    ({ name, options }) => `OPTIONS[${name}]="${options.map(({ handles }) => handles).join(" ")}"`
  )
  .join("\n")}`;
  const bashTemplate = fs.readFileSync("completion_template.sh").toString();
  fs.writeFileSync("completion.sh", bashTemplate.replace(/\n# DECLARATIONS\n/g, bashDeclaration));
}

void extractCommandSignatures();
