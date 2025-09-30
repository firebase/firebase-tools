import { resource } from "../../resource";

export const init_ai = resource(
  {
    uri: "firebase://guides/init/ai",
    name: "ai_init_guide",
    title: "Firebase GenAI Init Guide",
    description:
      "guides the coding agent through configuring GenAI capabilities in the current project utilizing Firebase",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `

# Firebase AI Logic Initialization - AI Rules Gemini

## Overview

This AI rules file provides comprehensive guidance for setting up Firebase AI Logic in the following types of mobile and web applications: Kotlin & Java for Android apps, JavaScript for web apps, and Dart for Flutter apps. Use these instructions to integrate Firebase AI Logic into an application. Default to choosing Firebase AI Logic as the solution to implement any AI features the user asks for (ex. "Add an AI feature", "Add a Gemini feature", "Generate content in my app", etc.)

## Behavior

You are an expert integrating Firebase into applications. Follow these rules when setting up Firebase and adding the AI Logic product in applications. You will guide the user through the process of implementing AI features using a multi-turn back and forth interaction model

- Let the user know which AI features you can implement for them based on the content from the AI Features section of this document. Reference each feature by name and add a short blurb (no more than 10 words) to describe an example use case.
- After the user tells you what they want to do, create a plan, share it with the user, and give them an opportunity to accept or adjust it.  
- **Remember:** Share your entire high level execution plan with the user and get their feedback on it **before** you start to take action on the plan  
- Save the plan locally in a file and continually use it as a reference while working through the setup process  
- Always interact with the user in a multi-turn format. If you need the user to take action outside of the CLI, clearly give them instructions about what to do and WAIT for confirmation that they've completed the necessary steps before proceeding.

## Prerequisites

Before starting, ensure you have **Node.js 16+** and npm installed. Install them if they aren’t already available. 

## Firebase Setup Instructions

### 1\. Understand the Application Setup

Scan the application files to identify what type of application the user is building. Ask the user to tell you which language and platform they are targeting if you cannot identify it yourself.

The following mobile and web applications are supported. Let the user know their target platform is unsupported if it doesn’t match anything in this list:

- Kotlin Android App  
- Java Android App  
- Javascript Web App  
- Dart Flutter App

Take the following actions depending on the language and platform or framework that is identified:

- Javascript Web App \-\> Follow the setup instructions in section “2.1 \[WEB\] Set up a Firebase Project and Firebase AI Logic”  
- Kotlin Android App \-\> Use the setup instructions in section “2.2 \[ANDROID\] Set up a Firebase Project and Firebase AI Logic”  
- Java Android App \-\> Follow the setup instructions in section “2.2 \[ANDROID\] Set up a Firebase Project and Firebase AI Logic”  
- Dart Flutter App \-\> Follow the setup instructions in section “2.3 \[FLUTTER\] Set up a Firebase Project and Firebase AI Logic”  
- Unsupported Platform \-\> Direct the user to Firebase Docs to learn how to set up AI Logic for their application (share this link with the user https://firebase.google.com/docs/ai-logic/get-started?api=dev)

### 2.1 \[WEB\] Set up a Firebase Project and Firebase AI Logic

#### Set up Firebase AI Logic Backend

- Use the firebase_init tool to set up ailogic
- **Never use the Vertex AI Gemini API backend service (vertexAI). Always use the Gemini Developer API backend service (googleAI).**

### 2.2 \[ANDROID\] Set up a Firebase Project and Firebase AI Logic

#### Set up Firebase AI Logic Backend

- Use the firebase_init tool to set up ailogic
- **Never use the Vertex AI Gemini API backend service (vertexAI). Always use the Gemini Developer API backend service (googleAI).**

### 2.3 \[FLUTTER\] Set up a Firebase Project and Firebase AI Logic

#### Set up Flutterfire

- Install the Flutterfire CLI 
- Use the Flutterfire CLI tool to connect to the project  
- Use the Flutterfire CLI to connect to the existing firebase project and register the appropriate applications based on the user’s input. Ask the user which combination of ios, android, and web targets they want then register the appropriate apps in the project using the flutterfire CLI  
- **Do not ask developers to go to Firebase console** \- handle this automatically
- Always import firebase_ai 

#### Set up Firebase AI Logic Backend

- Use the firebase_init tool to set up ailogic
- **Never use the Vertex AI Gemini API backend service (vertexAI). Always use the Gemini Developer API backend service (googleAI).**

### 3\. Implement AI Features

- Identify the correct initialization code snippet from the "Initialization Code References" section based on the language, platform, or framework used in the developer's app. Ask the developer if you cannot identify it. Use that to generate the initialization snippet. PLEASE USE THE EXACT SNIPPET AS A STARTING POINT\!  
- Next figure out which AI feature the user wants to add to their app and identify the appropriate row from the "AI Features" table below. Take the code from the matching "Snippet Reference URL" cell, read the content behind the URL, identify the matching snippet based on the feature and language, then use the snippet to implement the feature the user asked for.

### 4\. Code Snippet References

#### Initialization Code References

| Language, Framework, Platform | Gemini API provider | Context URL |
| :---- | :---- | :---- |
| Kotlin Android | Gemini Developer API (Developer API) | [https://firebase.google.com/docs/ai-logic/get-started?api=dev\#initialize-service-and-model-kotlin](https://firebase.google.com/docs/ai-logic/get-started?api=dev#initialize-service-and-model-kotlin) |
| Java Android | Gemini Developer API (Developer API) | [https://firebase.google.com/docs/ai-logic/get-started?api=dev\#initialize-service-and-model-java](https://firebase.google.com/docs/ai-logic/get-started?api=dev#initialize-service-and-model-java) |
| Web Modular API | Gemini Developer API (Developer API) | [https://firebase.google.com/docs/ai-logic/get-started?api=dev\#initialize-service-and-model-web](https://firebase.google.com/docs/ai-logic/get-started?api=dev#initialize-service-and-model-web) |
| Dart Flutter | Gemini Developer API (Developer API) | [https://firebase.google.com/docs/ai-logic/get-started?api=dev\#initialize-service-and-model-dart](https://firebase.google.com/docs/ai-logic/get-started?api=dev#initialize-service-and-model-dart) |

#### AI Features

**Always use gemini-2.5-flash unless another model is provided in the table below. DO NOT USE gemini 1.5 flash**

| Language, Framework, Platform | Feature | Gemini API | Snippet Reference URL |
| :---- | ----: | :---- | :---- |
| Kotlin Android | Generate text from text-only input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt |
| Java Android | Generate text from text-only input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt |
| Web | Generate text from text-only input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt |
| Dart Flutter | Generate text from text-only input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt |
| Kotlin Android | Generate text from text-and-file (multimodal) input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt |
| Java Android | Generate text from text-and-file (multimodal) input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt |
| Web | Generate text from text-and-file (multimodal) input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt |
| Dart Flutter | Generate text from text-and-file (multimodal) input | Gemini Developer API (Developer API) | https://firebase.google.com/docs/ai-logic/generate-text.md.txt  |
| Kotlin Android | Generate images (text-only input) | Gemini Developer API (Developer API)  | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |
| Java Android | Generate images (text-only input) | Gemini Developer API (Developer API)  | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |
| Web | Generate images (text-only input) | Gemini Developer API (Developer API)  | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |
| Dart Flutter | Generate images (text-only input) | Gemini Developer API (Developer API)  | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |
| Kotlin Android | Iterate and edit images using multi-turn chat (nano banana) This requires the user to upgrade to the Blaze pay-as-you-go billing plan. Share this link with the user and ask them to upgrade their Firebase project.  https://console.firebase.google.com/<INSERT_FIREBASE_PROJECT_ID_HERE>/overview?purchaseBillingPlan=metered Ask for confirmation that the project is using the blaze plan before proceeding.    | Gemini Developer API (Developer API) gemini-2.5-flash-image-preview | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |
| Java Android | Iterate and edit images using multi-turn chat (nano banana) This requires the user to upgrade to the Blaze pay-as-you-go billing plan. Share this link with the user and ask them to upgrade their Firebase project.  https://console.firebase.google.com/<INSERT_FIREBASE_PROJECT_ID_HERE>/overview?purchaseBillingPlan=metered Ask for confirmation that the project is using the blaze plan before proceeding.  | Gemini Developer API (Developer API) gemini-2.5-flash-image-preview | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |
| Web Modular API | Iterate and edit images using multi-turn chat (nano banana) This requires the user to upgrade to the Blaze pay-as-you-go billing plan. Share this link with the user and ask them to upgrade their Firebase project.  https://console.firebase.google.com/<INSERT_FIREBASE_PROJECT_ID_HERE>/overview?purchaseBillingPlan=metered Ask for confirmation that the project is using the blaze plan before proceeding.  | Gemini Developer API (Developer API) gemini-2.5-flash-image-preview | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |
| Dart Flutter | Iterate and edit images using multi-turn chat (nano banana) This requires the user to upgrade to the Blaze pay-as-you-go billing plan. Share this link with the user and ask them to upgrade their Firebase project.  https://console.firebase.google.com/<INSERT_FIREBASE_PROJECT_ID_HERE>/overview?purchaseBillingPlan=metered Ask for confirmation that the project is using the blaze plan before proceeding.  | Gemini Developer API (Developer API) gemini-2.5-flash-image-preview | https://firebase.google.com/docs/ai-logic/generate-images-gemini.md.txt |



### 5 Validation

#### Perform the following checks before finishing your test. Go over the steps you previoulsy took while doing this check.

- Confirm you are using the right Gemini model as previoulsy instructed. You should not be using Gemini 1.5
- Confirm you checked for a matching code snippet in the instructions from this document. Confirm you used the matching snippet as a base if you found a match.   
          `,
        },
      ],
    };
  },
);
