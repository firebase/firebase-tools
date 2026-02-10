# Firebase AI Logic Basics

## Initialization Pattern
You must initialize the ai-logic service after the main Firebase App.
```JavaScript
import { initializeApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";


// If running in Firebase App Hosting, you can skip Firebase Config and instead use:
// const app = initializeApp();

const firebaseConfig = {
  // ... your firebase config
};

const app = initializeApp(firebaseConfig);

// Initialize the AI Logic service (defaults to Gemini Developer API)
// To set the AI provider, set the backend as the second parameter
const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

const generationConfig = {
  candidate_count: 1,
  maxOutputTokens: 2048,
  stopSequences: [],
  temperature: 0.7,      // Balanced: creative but focused
  topP: 0.95,            // Standard: allows a wide range of probable tokens
  topK: 40,              // Standard: considers the top 40 tokens
};

// Specify the config as part of creating the `GenerativeModel` instance
const model = getGenerativeModel(ai, { model: "gemini-2.5-flash-lite",  generationConfig });
```

## Core Capabilities
Text-Only Generation
```JavaScript
async function generateText(prompt) {
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}
```

## Multimodal (Text + Images/Audio/Video/PDF input)
Firebase AI Logic accepts Base64 encoded data or specific file references.
```JavaScript
// Helper to convert file to base64 generic object
async function fileToGenerativePart(file) {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
  
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
}

async function analyzeImage(prompt, imageFile) {
  const imagePart = await fileToGenerativePart(imageFile);
  const result = await model.generateContent([prompt, imagePart]);
  return result.response.text();
}
```

## Chat Session (Multi-turn)
Maintain history automatically using startChat.
```JavaScript
const chat = model.startChat({
  history: [
    {
      role: "user",
      parts: [{ text: "Hello, I am a developer." }],
    },
    {
      role: "model",
      parts: [{ text: "Great to meet you. How can I help with code?" }],
    },
  ],
});

async function sendMessage(msg) {
  const result = await chat.sendMessage(msg);
  return result.response.text();
}
```

## Streaming Responses
For real-time UI updates (like a typing effect).
```JavaScript
async function streamResponse(prompt) {
  const result = await model.generateContentStream(prompt);
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    console.log("Stream chunk:", chunkText);
    // Update UI here
  }
}
```

Generate Images with Nano Banana

```Javascript
import { initializeApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend, ResponseModality } from "firebase/ai";


// Initialize FirebaseApp
const firebaseApp = initializeApp(firebaseConfig);

// Initialize the Gemini Developer API backend service
const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

// Create a `GenerativeModel` instance with a model that supports your use case
const model = getGenerativeModel(ai, {
  model: "gemini-2.5-flash-image",
  // Configure the model to respond with text and images (required)
  generationConfig: {
    responseModalities: [ResponseModality.TEXT, ResponseModality.IMAGE],
  },
});

// Provide a text prompt instructing the model to generate an image
const prompt = 'Generate an image of the Eiffel Tower with fireworks in the background.';

// To generate an image, call `generateContent` with the text input
const result = model.generateContent(prompt);

// Handle the generated image
try {
  const inlineDataParts = result.response.inlineDataParts();
  if (inlineDataParts?.[0]) {
    const image = inlineDataParts[0].inlineData;
    console.log(image.mimeType, image.data);
  }
} catch (err) {
  console.error('Prompt or candidate was blocked:', err);
}
```

## Advanced Features
Structured Output (JSON)
Enforce a specific JSON schema for the response.
```JavaScript
import { getGenerativeModel, Schema } from "firebase/ai";
const jsonModel = getGenerativeModel(ai, {
    model: "gemini-2.5-flash-lite",
    generationConfig: {
        responseMimeType: "application/json",
        // Optional: Define a schema
        schema = Schema.object({ ... });
    }
});

async function getJsonData(prompt) {
    const result = await jsonModel.generateContent(prompt);
    return JSON.parse(result.response.text());
}
```

On-Device AI (Hybrid)
Automatically switch between local Gemini Nano and cloud models based on device capability.
```JavaScript
import {getGenerativeModel, InferenceMode } from "firebase/ai";

const hybridModel = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });
```

