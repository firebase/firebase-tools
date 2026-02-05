---
name: firebase-ai-logic
description: Official skill for integrating Firebase AI Logic (Gemini API) into web applications. Covers setup, multimodal inference, structured output, and security.
version: 1.0.0
---

# Firebase AI Logic Basics

## Description
Official skill for integrating Firebase AI Logic (Gemini API) into applications. Covers setup, multimodal inference, structured output, and security.

## Overview
Firebase AI Logic is the client-side SDK for calling Gemini models directly from your web or mobile application without managing a dedicated backend. Firebase AI Logic, which was previously known as "Vertex AI for Firebase", represents the evolution of Google's AI integration platform for mobile and web developers.

Prior to its rebranding in May 2025, the service focused primarily on direct access to the Vertex AI Gemini API. However, as Firebase AI Logic, the platform expanded its scope to act as a comprehensive AI SDK for client-side applications.

It supports two primary providers:
- **Gemini Developer API**: Free tier/Pay-as-you-go, ideal for prototyping.
- **Vertex AI Gemini API**: Enterprise-grade, requires Blaze plan

Use the Gemini Developer API as a default, and only Vertex AI Gemini API if the application requires it.

## Setup & Initialization

### Installation
The library is part of the standard Firebase Web SDK.

`npm install -g firebase@latest`

Note the currently selected project with  

`firebase projects:list`

Ensure there's at least one app associated with the current project 

`firebase apps:list`

Initialize AI logic SDK with the init command

`firebase init # Choose AI logic`

This will automatically enable the Gemini Developer API in the Firebase console.

More info in [Firebase AI Logic Getting Started](https://firebase.google.com/docs/ai-logic/get-started.md.txt)


## Core Capabilities
### Text-Only Generation
### Multimodal (Text + Images/Audio/Video/PDF input)
Firebase AI Logic allows Gemini models to analyze image files directly from your app. This enables features like creating captions, answering questions about images, detecting objects, and categorizing images. Beyond images, Gemini can analyze other media types like audio, video, and PDFs by passing them as inline data with their MIME type. For files larger than 20 megabytes (which can cause HTTP 413 errors as inline data), store them in Cloud Storage for Firebase and pass their URLs to the Vertex AI Gemini API.
### Chat Session (Multi-turn)
Maintain history automatically using startChat.
### Streaming Responses
To improve the user experience by showing partial results as they arrive (like a typing effect), use generateContentStream instead of generateContent for faster display of results.
### Generate Images with Nano Banana
Start with Gemini for most use cases, and choose Imagen for specialized tasks where image quality and specific styles are critical. (gemini-2.5-flash-image)
### Search Grounding with the built in googleSearch tool
### Native Audio
Gemini 2.5 Flash supports direct processing of audio, offering low-latency real-time voice interactions and 30 high-definition voices.

## Advanced Features
### Structured Output (JSON)
Enforce a specific JSON schema for the response.

### On-Device AI (Hybrid)
Hybrid on-device inference for web apps, where the Firebase Javascript SDK automatically checks for Gemini Nano's availability (after installation) and switches between on-device or cloud-hosted prompt execution. This requires specific steps to enable model usage in the Chrome browser, more info in the [hybrid-on-device-inference documentation](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference.md.txt).

## Security & Production
### App Check
Recommended: The developer must enable Firebase App Check to prevent unauthorized clients from using their API quota. see [App-check recaptcha enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider.md.txt).

**Note:**: Live API (Audio/Video streaming) is not compatible with App Check

### Remote Config
Consider that you do not need to hardcode model names (e.g., gemini-2.5-flash-lite). Use Firebase Remote Config to update model versions dynamically without deploying new client code.  See [Changing model names remotely](https://firebase.google.com/docs/ai-logic/change-model-name-remotely.md.txt) 

## References
[Web SDK code examples and usage patterns](references/usage_patterns_web.md)



