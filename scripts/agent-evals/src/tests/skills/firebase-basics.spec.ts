
import * as path from "path";
import { startAgentTest, AgentTestRunner } from "../../runner/index.js";
import "../../helpers/hooks.js";

const FIREBASE_BASICS_PATH = path.resolve(process.cwd(), "../../skills/firebase-basics");

describe("Skill Activation: Firebase Basics", function (this: Mocha.Suite) {
  this.timeout(60000);

  const testCases: {
    prompt: string,
    expectSkillEnabled: boolean,
  }[] = [
      // Positive Cases (Should Activate)
      { prompt: "I want to install the Firebase CLI.", expectSkillEnabled: true },
      { prompt: "How do I log in to Firebase?", expectSkillEnabled: true },
      { prompt: "Create a new Firebase project.", expectSkillEnabled: true },
      { prompt: "Initialize Firebase in my current directory.", expectSkillEnabled: true },
      { prompt: "How do I add Firebase to my iOS app?", expectSkillEnabled: true },
      { prompt: "Set up Firebase for my Android project.", expectSkillEnabled: true },
      { prompt: "I need to configure Firebase for Flutter.", expectSkillEnabled: true },
      { prompt: "Show me the help command for firebase deploy.", expectSkillEnabled: true },
      { prompt: "What are the prerequisites for using Firebase tools?", expectSkillEnabled: true },
      { prompt: "Install nvm to manage my node version for Firebase.", expectSkillEnabled: true },

      // Negative Cases (Should NOT Activate)
      { prompt: "Write a Firestore security rule for users.", expectSkillEnabled: false },
      { prompt: "How do I query data in Firestore?", expectSkillEnabled: false },
      { prompt: "Set up Data Connect for my Postgres DB.", expectSkillEnabled: false },
      { prompt: "What is the weather today?", expectSkillEnabled: false },
      { prompt: "Write a TypeScript function to sort an array.", expectSkillEnabled: false },
      { prompt: "Explanation of React hooks.", expectSkillEnabled: false },
      { prompt: "Deploy a Next.js app to App Hosting.", expectSkillEnabled: false },
      { prompt: "How do I increase my Firestore quota?", expectSkillEnabled: false },
      { prompt: "Debug my detailed crashlytics stack trace.", expectSkillEnabled: false },
      { prompt: "Implement a deep learning model in Python.", expectSkillEnabled: false },
    ];

  for (const tc of testCases) {
    it(`${tc.expectSkillEnabled ? 'should' : 'should not'} activate firebase-basics skill for prompt: ${tc.prompt} ("MCP Enabled")`, async function (this: Mocha.Context) {
      if (!process.env.GEMINI_API_KEY) {
        this.skip();
      }
      const run: AgentTestRunner = await startAgentTest(this, {
        skills: [FIREBASE_BASICS_PATH],
        enableMcp: true,
      });

      await run.type(tc.prompt);

      if (tc.expectSkillEnabled) {
        await run.expectSkillActivated("firebase-basics");
      } else {
        await run.dont.expectSkillActivated("firebase-basics");
      }
    });

    it(`${tc.expectSkillEnabled ? 'should' : 'should not'} activate firebase-basics skill for prompt: ${tc.prompt} ("MCP Disabled")`, async function (this: Mocha.Context) {
      if (!process.env.GEMINI_API_KEY) {
        this.skip();
      }
      const run: AgentTestRunner = await startAgentTest(this, {
        skills: [FIREBASE_BASICS_PATH],
        enableMcp: false,
      });

      await run.type(tc.prompt);

      if (tc.expectSkillEnabled) {
        await run.expectSkillActivated("firebase-basics");
      } else {
        await run.dont.expectSkillActivated("firebase-basics");
      }
    });
  }
});
