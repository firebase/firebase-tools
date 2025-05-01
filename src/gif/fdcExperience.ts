import { Client } from "../apiv2";
import { cloudCompanionOrigin } from "../api";

const apiClient = new Client({ urlPrefix: cloudCompanionOrigin(), auth: true });
const schemaGeneratorExperience = "/appeco/firebase/fdc-schema-generator";

export interface GenerateSchemaRequest {
  input: { messages: { content: string; author: string }[] };
  experienceContext: { experience: string };
}

export interface GenerateSchemaResponse {
  output: { messages: { content: string }[] };
  displayContext: {
    additionalContext: {
      "@type": string;
      firebaseFdcDisplayContext: { schemaSyntaxError: string };
    };
  };
}

/**
 * generateSchema generates a schema based on the users app design prompt.
 * @param prompt description of the app the user would like to generate.
 * @param project project identifier.
 * @return graphQL schema for a Firebase Data Connect Project.
 */
export async function generateSchema(prompt: string, project: string): Promise<string> {
  const res = await apiClient.post<GenerateSchemaRequest, GenerateSchemaResponse>(
    `/v1beta/projects/${project}/locations/global/instances/default:completeTask`,
    {
      input: { messages: [{ content: prompt, author: "USER" }] },
      experienceContext: {
        experience: schemaGeneratorExperience,
      },
    },
  );
  return res.body.output.messages[0].content;
}
