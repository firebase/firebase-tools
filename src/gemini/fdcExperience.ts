import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import {
  GenerateResponse,
  GenerationStatus,
} from "./types";

// Use autopush environment as requested
const AUTOPUSH_ORIGIN = "https://autopush-firebasedataconnect.sandbox.googleapis.com";
const apiClient = new Client({ urlPrefix: AUTOPUSH_ORIGIN, auth: true });

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
  const res = await apiClient.request<any, NodeJS.ReadableStream>({
    method: "POST",
    path: `/v1/projects/${project}/locations/${location}/services/-:generateSchema`,
    body: {
      name: `projects/${project}/locations/${location}/services/-`,
      prompt,
    },
    responseType: "stream",
    resolveOnHTTPError: true,
  });

  if (res.status >= 400) {
    const errorText = await readStream(res.body);
    throw new FirebaseError(`Failed to generate schema. Status: ${res.status}, Message: ${errorText}`);
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
  schemas?: any[],
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

  const res = await apiClient.request<any, NodeJS.ReadableStream>({
    method: "POST",
    path: `/v1/projects/${project}/locations/${location}/services/${serviceId}:generateQuery`,
    body: {
      name: `projects/${project}/locations/${location}/services/${serviceId}`,
      prompt,
      schemas,
    },
    responseType: "stream",
    resolveOnHTTPError: true,
  });

  if (res.status >= 400) {
    const errorText = await readStream(res.body);
    throw new FirebaseError(`Failed to generate operation. Status: ${res.status}, Message: ${errorText}`);
  }

  return consumeStream(res.body, onStatus);
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => {
      data += chunk.toString();
    });
    stream.on("end", () => {
      resolve(data);
    });
    stream.on("error", (reject));
  });
}

async function consumeStream(
  stream: NodeJS.ReadableStream,
  onStatus?: (status: GenerationStatus) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullText = "";
    stream.on("data", (chunk) => {
      const text = chunk.toString();
      fullText += text;

      // Try to parse individual chunks for status updates if they are full JSON lines (NDJSON)
      const lines = text.trim().split("\n");
      for (const line of lines) {
         try {
             const obj = JSON.parse(line) as GenerateResponse;
             if (obj.status && onStatus) {
                 onStatus(obj.status);
             }
         } catch (err) {
             // Ignore partial JSON lines
         }
      }
    });

    stream.on("end", () => {
      try {
        const response = JSON.parse(fullText) as GenerateResponse;
        if (response.part?.codeChunk?.code) {
             resolve(response.part.codeChunk.code);
        } else if (response.part?.textChunk?.text) {
             resolve(response.part.textChunk.text);
        } else {
             resolve(fullText);
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
                 // Also handle status in the final pass if not handled during stream
                 if (obj.status && onStatus) {
                      onStatus(obj.status);
                 }
             } catch (err) {
             }
        }
        if (code) {
             resolve(code);
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

export function extractCodeBlock(text: string): string {
  const regex = /```(?:[a-z]+\n)?([\s\S]*?)```/m;
  const match = text.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
}
