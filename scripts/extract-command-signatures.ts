import * as fs from "fs";
import { Command } from "../src/command";

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

  // Import each command and store its signature in commandSignatures
  for (const commandFile of fs.readdirSync("./src/commands")) {
    const command = (await import("../src/commands/" + commandFile.replace(/.ts$/, ""))) as Command;

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
            .replace(/^(-[^,\s]*(, -[^,\s]*)*) .*$/, (_, rawOptions: string) => rawOptions)
            .split(", "),
          text: option,
          description,
          parameter,
          acceptsFile: parameter?.includes("file") || false,
        };
      }),
    });
  }

  // Store signatures in a JSON file
  fs.writeFileSync("command-signatures.json", JSON.stringify(commandSignatures));

  // Generate bash completion file from its template, providing database variables
  const bashDeclarations = `
COMMANDS="${commandSignatures.map(({ name }) => name).join(" ")}"

declare -A OPTIONS
${commandSignatures
  .map(
    ({ name, options }) =>
      `OPTIONS[${name}]="${options.map(({ handles }) => handles.join(" ")).join(" ")}"`
  )
  .join("\n")}

declare -A PARAMETERS
${commandSignatures
  .map(({ name, options }) =>
    options
      .map(({ handles, parameter }) =>
        handles
          .map((handle) =>
            parameter ? `PARAMETERS["${name}:${handle}"]="${parameter}"` : undefined
          )
          .filter((item) => item)
          .join("\n")
      )
      .join("\n")
  )
  .filter((item) => item)
  .join("\n")}

declare -A ACCEPTS_FILE
${commandSignatures
  .map(({ name, options }) =>
    options
      .map(({ handles, acceptsFile }) =>
        handles
          .map((handle) =>
            acceptsFile ? `ACCEPTS_FILE["${name}:${handle}"]="ACCEPTS"` : undefined
          )
          .filter((item) => item)
          .join("\n")
      )
      .join("\n")
  )
  .filter((item) => item)
  .join("\n")}
`;
  const bashTemplate = fs
    .readFileSync("scripts/completion-templates/completion_template.sh")
    .toString();
  fs.writeFileSync("completion.sh", bashTemplate.replace(/\n# DECLARATIONS\n/g, bashDeclarations));

  // Generate fish completion file from its template, providing database variables
  const fishDeclarations = `
set COMMANDS ${commandSignatures.map(({ name }) => name).join(" ")}

set COMMAND_DESCRIPTIONS ${commandSignatures.map(({ description }) => `"${description}"`).join(" ")}

set OPTIONS ${commandSignatures
    .map(({ options }) => `"${options.map(({ handles }) => handles.join(" ")).join(" ")}"`)
    .join(" ")}

set OPTION_DESCRIPTIONS ${commandSignatures
    .map(
      ({ options }) =>
        `${options
          .map(({ handles, description }) =>
            handles.map(() => `"${description.replace(/"/g, '\\"')}"`).join(" ")
          )
          .join(" ")}`
    )
    .join(" ")}

set HANDLES_INDEX ${commandSignatures
    .map(
      ({ name, options }) =>
        `${options
          .map(({ handles }) => handles.map((handle) => `${name}:${handle}`).join(" "))
          .join(" ")}`
    )
    .join(" ")}

set PARAMETERS ${commandSignatures
    .map(({ name, options }) =>
      options
        .map(({ handles, parameter }) =>
          parameter ? handles.map((handle) => `${name}:${handle}`).join(" ") : undefined
        )
        .filter((item) => item)
        .join(" ")
    )
    .filter((item) => item)
    .join(" ")}

set ACCEPTS_FILE ${commandSignatures
    .map(({ name, options }) =>
      options
        .map(({ handles, acceptsFile }) =>
          acceptsFile ? handles.map((handle) => `${name}:${handle}`).join(" ") : undefined
        )
        .filter((item) => item)
        .join(" ")
    )
    .filter((item) => item)
    .join(" ")}
`;
  const fishTemplate = fs
    .readFileSync("scripts/completion-templates/completion_template.fish")
    .toString();
  fs.writeFileSync(
    "completion.fish",
    fishTemplate.replace(/\n# DECLARATIONS\n/g, fishDeclarations)
  );
}

void extractCommandSignatures();
