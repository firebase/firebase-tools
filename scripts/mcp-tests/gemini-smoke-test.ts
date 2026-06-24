import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

if (!process.env.GEMINI_API_KEY) {
  console.error("Must set GEMINI_API_KEY to run this smoke test.");
  process.exit(1);
}

const client = new Client({
  name: "firebase-mcp-smoke-tester",
  version: "0.0.1",
});

await client.connect(
  new StdioClientTransport({
    command: "../../lib/bin/firebase.js",
    args: [
      "mcp",
      "--only",
      "firestore,dataconnect,messaging,remoteconfig,crashlytics,auth,storage,apphosting",
    ],
  }),
);

const { tools } = await client.listTools();

const geminiTools = tools.map((tool) => {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  };
});

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      toolConfig: {
        functionCallingConfig: { mode: "auto" },
      },
      tools: [{ functionDeclarations: geminiTools }],
      contents: [
        {
          parts: [{ text: "Call the firebase_list_apps tool." }],
        },
      ],
    }),
  },
);

if (response.status === 200) {
  console.dir(await response.json(), { depth: null });

  console.log("✅ Passed smoke test!");
  process.exit(0);
} else {
  const rtext = await response.text();
  try {
    console.dir(JSON.parse(rtext), { depth: null });
  } catch (e) {
    console.log(rtext);
  }
  console.error("ERROR: Got non-200 response from smoke test.");
  process.exit(1);
}
