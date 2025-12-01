import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { generateOperation } from "../../../gemini/fdcExperience";
import { pickOneService } from "../../../dataconnect/load";

export const generate_operation = tool(
  "dataconnect",
  {
    name: "generate_operation",
    description:
      "Use this to generate a single Firebase Data Connect query or mutation based on the currently deployed schema and the provided prompt.",
    inputSchema: z.object({
      // Lifted guidance from : https://cloud.google.com/gemini/docs/discover/write-prompts
      prompt: z
        .string()
        .describe(
          "Write the prompt like you're talking to a person, describe the task you're trying to accomplish and give details that are specific to the users request",
        ),
      service_id: z
        .string()
        .optional()
        .describe(
          `Data Connect Service ID to disambiguate if there are multiple Data Connect services.`,
        ),
      location_id: z
        .string()
        .optional()
        .describe(
          `Data Connect Service location ID to disambiguate among multiple Data Connect services.`,
        ),
    }),
    annotations: {
      title: "Generate Data Connect Operation",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
      requiresGemini: true,
    },
  },
  async ({ prompt, service_id, location_id }, { projectId, config }) => {
    const serviceInfo = await pickOneService(
      projectId,
      config,
      service_id || undefined,
      location_id || undefined,
    );
    const schema = await generateOperation(prompt, serviceInfo.serviceName, projectId);
    return toContent(schema);
  },
);
