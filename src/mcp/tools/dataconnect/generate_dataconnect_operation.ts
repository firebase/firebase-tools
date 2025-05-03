import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { generateOperation } from "../../../gif/fdcExperience.js";
import { pickService } from "../../../dataconnect/fileUtils.js";

export const generate_dataconnect_operation = tool(
  {
    name: "generate_dataconnect_operation",
    description:
      "Generates a single Firebase Data Connect query or mutation based on the currently deployed schema and the provided prompt.",
    inputSchema: z.object({
      // Lifted guidance from : https://cloud.google.com/gemini/docs/discover/write-prompts
      prompt: z
        .string()
        .describe(
          "Write the prompt like you're talking to a person, describe the task you're trying to accomplish and give details that are specific to the users requst",
        ),
      service: z
        .string()
        .nullish()
        .describe(
          "Optional: Uses the serviceId from the firebase.json file if nothing provided. The service id or name of the deployed Firebase Data Connect Schema in format: projects/<project-id>/locations/<location>/services/<service-name>.",
        ),
    }),
    annotations: {
      title:
        "Generate a Firebase Data Connect Operation on a deployed Firebase Data Connect Schema.",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
      // TODO: Create an endpoint to check for GiF activiation.
    },
  },
  async ({ prompt, service }, { projectId, host, config }) => {
    const serviceInfo = await pickService(
      projectId!,
      config!,
      service || undefined,
    );
    const schema = await generateOperation(prompt, serviceInfo.serviceName, projectId!);
    return toContent(schema);
  },
);
