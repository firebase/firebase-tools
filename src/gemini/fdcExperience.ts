import { Client } from "../apiv2";
import { dataconnectOrigin } from "../api";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import {
  GenerationStatus,
  GenerateSchemaRequest,
  GenerateOperationRequest,
  GenerateRequest,
  Schema,
  GenerateResponse,
} from "./types";

const apiClient = new Client({ urlPrefix: dataconnectOrigin(), auth: true });

export const PROMPT_GENERATE_CONNECTOR =
  'Generate at least one create (insert/upsert), delete, update, get (read by key), and list operation for each table defined in the schema. For user-specific data, use the \'auth.uid\' server value (e.g., id_expr: "auth.uid") or correct filters to secure user-owned data and require authentication using @auth(level: USER). For public accessible data, use @auth(level: PUBLIC, insecureReason: "why is it OK to be public?")';

export const PROMPT_GENERATE_SEED_DATA =
  "Create a single mutation wrapped in a @transaction to populate the database with seed data. The mutation should call the insertMany action (e.g., table_insertMany) for all tables/entities defined in the schema, using made up fake data. Generate appropriate fake records (3 to 5 per table) conforming to the schema and including proper relationships/foreign keys.";

// For debugging purposes
function logCurl(method: string, path: string, body: GenerateRequest): void {
  const url = `${dataconnectOrigin()}${path}`;
  const headers = [
    '-H "Content-Type: application/json"',
    '-H "Authorization: Bearer $(gcloud auth print-access-token)"',
  ].join(" ");

  const curl = `curl -X ${method} "${url}" ${headers} -d '${JSON.stringify(body)}'`;
  logger.debug(`[Agent Service] Reusable cURL command:\\n${curl}`);
}

/**
 * generateSchema generates a schema based on the users app design prompt.
 * @param prompt description of the app the user would like to generate.
 * @param project project identifier.
 * @param location location identifier.
 * @param onStatus callback for status updates.
 * @return graphQL schema for a Firebase SQL Connect Project.
 */
export async function generateSchema(
  prompt: string,
  project: string,
  location: string,
  onStatus?: (status: GenerationStatus) => void,
): Promise<string> {
  const path = `/v1/projects/${project}/locations/${location}/services/-:generateSchema`;
  const body: GenerateSchemaRequest = {
    name: `projects/${project}/locations/${location}/services/-`,
    prompt,
  };
  logCurl("POST", path, body);

  const res = await apiClient.request<GenerateSchemaRequest, NodeJS.ReadableStream>({
    method: "POST",
    path,
    body,
    responseType: "stream",
    resolveOnHTTPError: true,
  });

  if (res.status >= 400) {
    const errorText = await readStream(res.body);
    throw new FirebaseError(
      `Failed to generate schema. Status: ${res.status}, Message: ${errorText}`,
    );
  }

  return consumeStream(res.body, onStatus);
}

/**
 * generateOperation generates an operation based on the users prompt and deployed Firebase SQL Connect Service.
 * @param prompt description of the operation the user would like to generate.
 * @param service the name or service id of the deployed Firebase SQL Connect service.
 * @param project project identifier.
 * @param schemas local schemas.
 * @param onStatus callback for status updates.
 * @return graphQL operation for a deployed Firebase SQL Connect Schema.
 */
export async function generateOperation(
  prompt: string,
  service: string,
  project: string,
  schemas?: Schema[],
  onStatus?: (status: GenerationStatus) => void,
): Promise<string> {
  let location = "us-central1"; // Default fallback
  let serviceId = service;

  if (service.startsWith("projects/")) {
    const parts = service.split("/");
    project = parts[1];
    location = parts[3];
    serviceId = parts[5];
  }

  // If schemas are provided, serviceId should be "-"
  if (schemas && schemas.length > 0) {
    serviceId = "-";
  }

  const path = `/v1/projects/${project}/locations/${location}/services/${serviceId}:generateQuery`;
  const body: GenerateOperationRequest = {
    name: `projects/${project}/locations/${location}/services/${serviceId}`,
    prompt,
    schemas,
  };
  logCurl("POST", path, body);

  const res = await apiClient.request<GenerateOperationRequest, NodeJS.ReadableStream>({
    method: "POST",
    path,
    body,
    responseType: "stream",
    resolveOnHTTPError: true,
  });

  if (res.status >= 400) {
    const errorText = await readStream(res.body);
    throw new FirebaseError(
      `Failed to generate operation. Status: ${res.status}, Message: ${errorText}`,
    );
  }

  return consumeStream(res.body, onStatus);
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk: Buffer | string) => {
      data += chunk.toString();
    });
    stream.on("end", () => {
      resolve(data);
    });
    stream.on("error", (err) => {
      reject(err);
    });
  });
}

async function consumeStream(
  stream: NodeJS.ReadableStream,
  onStatus?: (status: GenerationStatus) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let fullText = "";
    stream.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      fullText += text;
      buffer += text;

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.substring(0, newlineIndex).trim();
        buffer = buffer.substring(newlineIndex + 1);
        if (line) {
          try {
            const obj = JSON.parse(line) as GenerateResponse;
            if (obj.status && onStatus) {
              onStatus(obj.status);
            }
          } catch (err) {
            // Ignore partial JSON lines
          }
        }
      }
    });

    stream.on("end", () => {
      try {
        const response = JSON.parse(fullText);
        if (Array.isArray(response)) {
          let code = "";
          for (const item of response) {
            if (item.status && onStatus) {
              onStatus(item.status);
            }
            if (item.part?.textChunk?.text) {
              code += item.part.textChunk.text;
            }
            if (item.part?.codeChunk?.code) {
              code += item.part.codeChunk.code;
            }
          }
          if (code) {
            resolve(extractCodeBlock(code));
          } else {
            resolve(fullText);
          }
        } else {
          const resObj = response as GenerateResponse;
          if (resObj.part?.codeChunk?.code) {
            resolve(extractCodeBlock(resObj.part.codeChunk.code));
          } else if (resObj.part?.textChunk?.text) {
            resolve(extractCodeBlock(resObj.part.textChunk.text));
          } else {
            resolve(fullText);
          }
        }
      } catch (e) {
        const lines = fullText.trim().split("\n");
        let code = "";
        for (const line of lines) {
          try {
            const obj = JSON.parse(line) as GenerateResponse;
            if (obj.part?.codeChunk?.code) {
              code += obj.part.codeChunk.code;
            } else if (obj.part?.textChunk?.text) {
              code += obj.part.textChunk.text;
            }
            if (obj.status && onStatus) {
              onStatus(obj.status);
            }
          } catch (err) {
            logger.error("Failed to parse FSQL Generate response: ", err);
          }
        }
        if (code) {
          resolve(extractCodeBlock(code));
        } else {
          resolve(fullText);
        }
      }
    });

    stream.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Extracts code block from a text response
 */
export function extractCodeBlock(text: string): string {
  const regex = /```(?:[a-z]+\n)?([\s\S]*?)```/m;
  const match = regex.exec(text);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Loose parsing if no backticks are present
  if (!text.includes("{")) {
    logger.warn("[Agent Service] Response seems to be plain text, no GraphQL code block found.");
  }

  // Return the entire text if no markdown code block is found
  return text.trim();
}
