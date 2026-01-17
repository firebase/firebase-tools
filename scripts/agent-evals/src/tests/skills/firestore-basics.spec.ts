import * as path from "path";
import { startAgentTest, AgentTestRunner } from "../../runner/index.js";
import "../../helpers/hooks.js";

const FIRESTORE_BASICS_PATH = path.resolve(process.cwd(), "../../skills/firestore-basics");

describe("Skill Activation: Firestore Basics", function (this: Mocha.Suite) {
  this.timeout(60000);

  const testCases: {
    prompt: string,
    expectSkillEnabled: boolean,
  }[] = [
      // Positive Cases (Should Activate)
      { prompt: "I want to use Firestore in my project.", expectSkillEnabled: true },
      { prompt: "Store my apps user data in Firestore", expectSkillEnabled: true },
      { prompt: "How do I set up security rules for my database?", expectSkillEnabled: true },
      { prompt: "I need to add a document to the 'users' collection.", expectSkillEnabled: true },
      { prompt: "Help me query for all active users over 18.", expectSkillEnabled: true },
      { prompt: "What SDK should I use to connect to Firestore from iOS?", expectSkillEnabled: true },
      { prompt: "Deploy my firestore indexes.", expectSkillEnabled: true },
      { prompt: "How does offline data persistence work in the web SDK?", expectSkillEnabled: true },
      { prompt: "Create a function to listen for document changes in 'messages'.", expectSkillEnabled: true },
      { prompt: "Structure my NoSQL database for a chat app.", expectSkillEnabled: true },

      // Negative Cases (Should NOT Activate)
      { prompt: "I want to use Data Connect in my project", expectSkillEnabled: false },
      { prompt: "Deploy my Next.js application to App Hosting.", expectSkillEnabled: false },
      { prompt: "How do I set up Firebase Authentication with Google?", expectSkillEnabled: false },
      { prompt: "Create a Cloud Function to resize images on upload.", expectSkillEnabled: false },
      { prompt: "What is the command to login to Firebase CLI?", expectSkillEnabled: false },
      { prompt: "Initialize a new Firebase project.", expectSkillEnabled: false },
      { prompt: "Set up a rewrites rule in firebase.json for Hosting.", expectSkillEnabled: false },
      { prompt: "How do I use Crashlytics to track bugs?", expectSkillEnabled: false },
      { prompt: "Install the Firebase SDK for Unity.", expectSkillEnabled: false },
      { prompt: "What is the difference between Blaze and Spark plans?", expectSkillEnabled: false },
    ];

  for (const tc of testCases) {
    it(`${tc.expectSkillEnabled ? 'should' : 'should not'} activate firestore-basics skill for prompt: ${tc.prompt} ("MCP Enabled")`, async function (this: Mocha.Context) {
      if (!process.env.GEMINI_API_KEY) {
        this.skip();
      }
      const run: AgentTestRunner = await startAgentTest(this, {
        skills: [FIRESTORE_BASICS_PATH],
        enableMcp: true,
      });

      await run.type(tc.prompt);

      if (tc.expectSkillEnabled) {
        await run.expectSkillActivated("firestore-basics");
      } else {
        await run.dont.expectSkillActivated("firestore-basics");
      }
    });

    it(`${tc.expectSkillEnabled ? 'should' : 'should not'} activate firestore-basics skill for prompt: ${tc.prompt} ("MCP Disabled")`, async function (this: Mocha.Context) {
      if (!process.env.GEMINI_API_KEY) {
        this.skip();
      }
      const run: AgentTestRunner = await startAgentTest(this, {
        skills: [FIRESTORE_BASICS_PATH],
        enableMcp: false,
      });

      await run.type(tc.prompt);

      if (tc.expectSkillEnabled) {
        await run.expectSkillActivated("firestore-basics");
      } else {
        await run.dont.expectSkillActivated("firestore-basics");
      }
    });
  }
});
