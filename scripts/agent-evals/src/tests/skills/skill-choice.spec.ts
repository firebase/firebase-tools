
import * as path from "path";
import { startAgentTest, AgentTestRunner } from "../../runner/index.js";
import "../../helpers/hooks.js";

const FIREBASE_BASICS_PATH = path.resolve(process.cwd(), "../../skills/firebase-basics");
const FIRESTORE_BASICS_PATH = path.resolve(process.cwd(), "../../skills/firestore-basics");

const ALL_SKILLS = [FIREBASE_BASICS_PATH, FIRESTORE_BASICS_PATH];

describe("Skill Choice: Selection Logic", function (this: Mocha.Suite) {
  this.timeout(90000); // Increased timeout for multiple skill loading

  const testCases: {
    prompt: string,
    expectedSkill: string, // The skill that SHOULD be activated
    unexpectedSkills: string[], // Skills that should NOT be activated
  }[] = [
      // Firebase Basics Prompts (Instructional to avoid interactive hangs)
      {
        prompt: "Explain how to install the Firebase CLI.",
        expectedSkill: "firebase-basics",
        unexpectedSkills: ["firestore-basics"]
      },
      {
        prompt: "What is the command to log in to Firebase?",
        expectedSkill: "firebase-basics",
        unexpectedSkills: ["firestore-basics"]
      },
      {
        prompt: "How do I create a new Firebase project via CLI?",
        expectedSkill: "firebase-basics",
        unexpectedSkills: ["firestore-basics"]
      },

      // Firestore Basics Prompts
      {
        prompt: "How do I set up security rules for my database?",
        expectedSkill: "firestore-basics",
        unexpectedSkills: ["firebase-basics"]
      },
      {
        prompt: "Help me query for all active users over 18.",
        expectedSkill: "firestore-basics",
        unexpectedSkills: ["firebase-basics"]
      },
      {
        prompt: "Structure my NoSQL database for a chat app.",
        expectedSkill: "firestore-basics",
        unexpectedSkills: ["firebase-basics"]
      },
    ];

  for (const tc of testCases) {
    it(`should choose ${tc.expectedSkill} for prompt: ${tc.prompt}`, async function (this: Mocha.Context) {
      if (!process.env.GEMINI_API_KEY) {
        this.skip();
      }
      const run: AgentTestRunner = await startAgentTest(this, {
        skills: ALL_SKILLS,
        enableMcp: true,
      });

      await run.type(tc.prompt);

      // Verify expected skill activated
      await run.expectSkillActivated(tc.expectedSkill);

      // Verify unexpected skills DID NOT activate
      for (const unexpected of tc.unexpectedSkills) {
        await run.dont.expectSkillActivated(unexpected);
      }
    });
  }
});
