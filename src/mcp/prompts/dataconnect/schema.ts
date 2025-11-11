import { prompt } from "../../prompt";
import { loadAll } from "../../../dataconnect/load";
import { mainSchema, type ServiceInfo } from "../../../dataconnect/types";
import { BUILTIN_SDL, MAIN_INSTRUCTIONS } from "../../util/dataconnect/content";
import { compileErrors } from "../../util/dataconnect/compile";

function renderServices(fdcServices: ServiceInfo[]) {
  if (!fdcServices.length) return "Data Connect Status: <UNCONFIGURED>";

  return `\n\n## Data Connect Schema

The following is the up-to-date content of existing schema files (their paths are relative to the Data Connect source directory).

${mainSchema(fdcServices[0].schemas)
  .source.files?.map((f) => `\`\`\`graphql ${f.path}\n${f.content}\n\`\`\``)
  .join("\n\n")}`;
}

function renderErrors(errors?: string) {
  return `\n\n## Current Schema Build Errors\n\n${errors || "<NO ERRORS>"}`;
}

export const schema = prompt(
  "core",
  {
    name: "schema",
    description: "Generate or update your Firebase Data Connect schema.",
    arguments: [
      {
        name: "prompt",
        description:
          "describe the schema you want generated or the edits you want to make to your existing schema",
        required: true,
      },
    ],
    annotations: {
      title: "Generate Data Connect Schema",
    },
  },
  async ({ prompt }, { config, projectId, accountEmail }) => {
    const fdcServices = await loadAll(projectId, config);
    const buildErrors = fdcServices.length
      ? await compileErrors(fdcServices[0].sourceDirectory)
      : "";

    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
${MAIN_INSTRUCTIONS}\n\n${BUILTIN_SDL}

==== CURRENT ENVIRONMENT INFO ====

User Email: ${accountEmail || "<NONE>"}
Project ID: ${projectId || "<NONE>"}
${renderServices(fdcServices)}${renderErrors(buildErrors)}

==== USER PROMPT ====

${prompt}

==== TASK INSTRUCTIONS ====

1. If Data Connect is marked as \`<UNCONFIGURED>\`, first run the \`firebase_init\` tool with \`{dataconnect: {}}\` arguments to initialize it.
2. If there is not an existing schema to work with (or the existing schema is the commented-out default schema about a movie app), follow the user's prompt to generate a robust schema meeting the specified requirements.
3. If there is already a schema, perform edits to the existing schema file(s) based on the user's instructions. If schema build errors are present and seem relevant to your changes, attempt to fix them.
4. After you have performed edits on the schema, run the \`dataconnect_compile\` tool to build the schema and see if there are any errors. Fix errors that are related to the user's prompt or your changes.
5. If there are errors, attempt to fix them. If you have attempted to fix them 3 times without success, ask the user for help.
6. If there are no errors, write a brief paragraph summarizing your changes.`,
        },
      },
    ];
  },
);
