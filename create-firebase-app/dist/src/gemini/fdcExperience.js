"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCodeBlock = exports.generateOperation = exports.chatWithFirebase = exports.generateSchema = exports.PROMPT_GENERATE_SEED_DATA = exports.PROMPT_GENERATE_CONNECTOR = void 0;
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const error_1 = require("../error");
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.cloudAiCompanionOrigin)(), auth: true });
const SCHEMA_GENERATOR_EXPERIENCE = "/appeco/firebase/fdc-schema-generator";
const GEMINI_IN_FIREBASE_EXPERIENCE = "/appeco/firebase/firebase-chat/free";
const OPERATION_GENERATION_EXPERIENCE = "/appeco/firebase/fdc-query-generator";
const FIREBASE_CHAT_REQUEST_CONTEXT_TYPE_NAME = "type.googleapis.com/google.cloud.cloudaicompanion.v1main.FirebaseChatRequestContext";
exports.PROMPT_GENERATE_CONNECTOR = "Create 4 operations for an app using the instance schema with proper authentication.";
exports.PROMPT_GENERATE_SEED_DATA = "Create a mutation to populate the database with some seed data.";
/**
 * generateSchema generates a schema based on the users app design prompt.
 * @param prompt description of the app the user would like to generate.
 * @param project project identifier.
 * @return graphQL schema for a Firebase Data Connect Project.
 */
async function generateSchema(prompt, project, chatHistory = []) {
    const res = await apiClient.post(`/v1beta/projects/${project}/locations/global/instances/default:completeTask`, {
        input: { messages: [...chatHistory, { content: prompt, author: "USER" }] },
        experienceContext: {
            experience: SCHEMA_GENERATOR_EXPERIENCE,
        },
    });
    return extractCodeBlock(res.body.output.messages[0].content);
}
exports.generateSchema = generateSchema;
/**
 * chatWithFirebase interacts with the Gemini in Firebase integration providing deeper knowledge on Firebase.
 * @param prompt the interaction that the user would like to have with the service.
 * @param project project identifier.
 * @return ChatExperienceResponse includes not only the message from the service but also links to the resources used by the service.
 */
async function chatWithFirebase(prompt, project, chatHistory = []) {
    const res = await apiClient.post(`/v1beta/projects/${project}/locations/global/instances/default:completeTask`, {
        input: { messages: [...chatHistory, { content: prompt, author: "USER" }] },
        experienceContext: {
            experience: GEMINI_IN_FIREBASE_EXPERIENCE,
        },
    });
    return res.body;
}
exports.chatWithFirebase = chatWithFirebase;
/**
 * generateOperation generates an operation based on the users prompt and deployed Firebase Data Connect Service.
 * @param prompt description of the operation the user would like to generate.
 * @param service the name or service id of the deployed Firebase Data Connect service.
 * @param project project identifier.
 * @return graphQL operation for a deployed Firebase Data Connect Schema.
 */
async function generateOperation(prompt, service, project, chatHistory = []) {
    const res = await apiClient.post(`/v1beta/projects/${project}/locations/global/instances/default:completeTask`, {
        input: { messages: [...chatHistory, { content: prompt, author: "USER" }] },
        experienceContext: {
            experience: OPERATION_GENERATION_EXPERIENCE,
        },
        clientContext: {
            additionalContext: {
                "@type": FIREBASE_CHAT_REQUEST_CONTEXT_TYPE_NAME,
                fdcInfo: { fdcServiceName: service, requiresQuery: true },
            },
        },
    });
    return extractCodeBlock(res.body.output.messages[0].content);
}
exports.generateOperation = generateOperation;
/**
 * extractCodeBlock extracts the code block from the generated response.
 * @param text the generated response from the service.
 * @return the code block from the generated response.
 */
function extractCodeBlock(text) {
    const regex = /```(?:[a-z]+\n)?([\s\S]*?)```/m;
    const match = text.match(regex);
    if (match && match[1]) {
        return match[1].trim();
    }
    throw new error_1.FirebaseError(`No code block found in the generated response: ${text}`);
}
exports.extractCodeBlock = extractCodeBlock;
