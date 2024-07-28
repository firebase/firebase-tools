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

async function generateCompletionFiles(): Promise<void> {
  const commandSignatures: CommandDescriptor[] = [];

  // Import each command and store its signature in commandSignatures
  for (const commandFile of fs.readdirSync("./src/commands")) {
    const command = (
      (await import("../src/commands/" + commandFile.replace(/.ts$/, ""))) as { command: Command }
    ).command;

    if (command == null || command["name"] == null) {
      continue;
    }

    commandSignatures.push({
      help: command["helpText"],
      name: command["name"],
      description: command["descriptionText"].replace(/\n/g, "\r"),
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

  /*
   * Generate bash completion file from its template, providing database variables
   */
  const bashDeclarations = `
# List of firebase root commands
COMMANDS="${commandSignatures.map(({ name }) => name).join(" ")}"

declare -A OPTIONS
# Maps a command to its list of options separated by space
${commandSignatures
  .map(
    ({ name, options }) =>
      `OPTIONS[${name}]="${options.map(({ handles }) => handles.join(" ")).join(" ")}"`
  )
  .join("\n")}

# If an option of a command needs a parameter, it will be added to this hashmap with "<COMMAND>:<OPTION>" string as its
# key (its value is not important)
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
      .filter((item) => item)
      .join("\n")
  )
  .filter((item) => item)
  .join("\n")}

# If an option of a command accepts a file as its parameter, it will be added to this hashmap with "<COMMAND>:<OPTION>"
# string as its key (its value is not important)
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
      .filter((item) => item)
      .join("\n")
  )
  .filter((item) => item)
  .join("\n")}
`;
  const bashTemplate = fs
    .readFileSync("scripts/completion-templates/completion_template.sh")
    .toString();
  fs.writeFileSync("completion.sh", bashTemplate.replace(/\n# DECLARATIONS\n/g, bashDeclarations));

  /*
   * Generate fish completion file from its template, providing database variables
   */
  const fishDeclarations = `
# List of all the firebase root commands to be used as the index of following variables
set COMMANDS_INDEX ${commandSignatures.map(({ name }) => name).join(" ")}

# List of descriptions for associated commands (indices match with items in COMMANDS)
set COMMAND_DESCRIPTIONS ${commandSignatures.map(({ description }) => `"${description}"`).join(" ")}

# List of options of commands: each row contains all the options of the corresponding command (indices match with items
# in COMMANDS_INDEX)
set OPTIONS ${commandSignatures
    .map(({ options }) => `"${options.map(({ handles }) => handles.join(" ")).join(" ")}"`)
    .join(" ")}

# List of all the options of all commands as "<COMMAND>:<OPTION>" to be used as the index of following variables
set OPTIONS_INDEX ${commandSignatures
    .map(
      ({ name, options }) =>
        `${options
          .map(({ handles }) => handles.map((handle) => `${name}:${handle}`).join(" "))
          .join(" ")}`
    )
    .join(" ")}

# List of descriptions for associated options (indices match with items in OPTIONS_INDEX)
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

# If an option accepts parameters, it will be listed in this array in its "<COMMAND>:<OPTION>" form
set OPTION_PARAMETERS ${commandSignatures
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

# If an option accepts files as its parameter, it will be listed in this array in its "<COMMAND>:<OPTION>" form
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

void generateCompletionFiles();
