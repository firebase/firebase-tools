import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../prompt";
import { handleBuildErrors } from "./build";
import { GraphqlError } from "./types";

describe("handleBuildErrors", () => {
  let selectStub: sinon.SinonStub;
  beforeEach(() => {
    selectStub = sinon.stub(prompt, "select").throws("unexpected call to prompt.select");
  });
  afterEach(() => {
    sinon.verifyAndRestore();
  });
  const cases: {
    desc: string;
    graphqlErr: GraphqlError[];
    nonInteractive: boolean;
    force: boolean;
    dryRun: boolean;
    promptAnswer?: string;
    expectErr: boolean;
    expectedErrorMessage?: string;
  }[] = [
    {
      desc: "Only build error",
      graphqlErr: [{ message: "build error" }],
      nonInteractive: false,
      force: true,
      dryRun: false,
      expectErr: true,
      expectedErrorMessage: "There are errors in your schema and connector files",
    },
    {
      desc: "Build error with evolution error",
      graphqlErr: [
        { message: "build error" },
        { message: "evolution error", extensions: { warningLevel: "INTERACTIVE_ACK" } },
      ],
      nonInteractive: false,
      force: true,
      dryRun: false,
      expectErr: true,
      expectedErrorMessage: "There are errors in your schema and connector files",
    },
    {
      desc: "Interactive ack evolution error, prompt and accept",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "INTERACTIVE_ACK" } }],
      nonInteractive: false,
      force: false,
      dryRun: false,
      promptAnswer: "proceed",
      expectErr: false,
    },
    {
      desc: "Interactive ack evolution error, prompt and reject",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "INTERACTIVE_ACK" } }],
      nonInteractive: false,
      force: false,
      dryRun: false,
      promptAnswer: "abort",
      expectErr: true,
      expectedErrorMessage: "Aborted.",
    },
    {
      desc: "Interactive ack evolution error, nonInteractive=true",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "INTERACTIVE_ACK" } }],
      nonInteractive: true,
      force: false,
      dryRun: false,
      expectErr: false,
    },
    {
      desc: "Interactive ack evolution error, force=true",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "INTERACTIVE_ACK" } }],
      nonInteractive: false,
      force: true,
      dryRun: false,
      expectErr: false,
    },
    {
      desc: "Interactive ack evolution error, dryRun=true",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "INTERACTIVE_ACK" } }],
      nonInteractive: false,
      force: false,
      dryRun: true,
      expectErr: false,
    },
    {
      desc: "Required ack evolution error, prompt and accept",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "REQUIRE_ACK" } }],
      nonInteractive: false,
      force: false,
      dryRun: false,
      promptAnswer: "proceed",
      expectErr: false,
    },
    {
      desc: "Required ack evolution error, prompt and reject",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "REQUIRE_ACK" } }],
      nonInteractive: false,
      force: false,
      dryRun: false,
      promptAnswer: "abort",
      expectErr: true,
      expectedErrorMessage: "Aborted.",
    },
    {
      desc: "Required ack evolution error, nonInteractive=true, force=false",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "REQUIRE_ACK" } }],
      nonInteractive: true,
      force: false,
      dryRun: false,
      expectErr: true,
      expectedErrorMessage: "Rerun this command with --force to proceed with these changes.",
    },
    {
      desc: "Required ack evolution error, nonInteractive=true, force=true",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "REQUIRE_ACK" } }],
      nonInteractive: true,
      force: true,
      dryRun: false,
      expectErr: false,
    },
    {
      desc: "Required ack evolution error, nonInteractive=false, force=true",
      graphqlErr: [{ message: "evolution error", extensions: { warningLevel: "REQUIRE_ACK" } }],
      nonInteractive: false,
      force: true,
      dryRun: false,
      expectErr: false,
    },
    {
      desc: "Required force evolution error, force=false",
      graphqlErr: [
        { message: "inaccessible error", extensions: { warningLevel: "REQUIRE_FORCE" } },
      ],
      nonInteractive: false,
      force: false,
      dryRun: false,
      expectErr: true,
      expectedErrorMessage: "Rerun this command with --force to proceed with these changes.",
    },
    {
      desc: "Required force evolution error, force=true",
      graphqlErr: [
        { message: "inaccessible error", extensions: { warningLevel: "REQUIRE_FORCE" } },
      ],
      nonInteractive: false,
      force: true,
      dryRun: false,
      expectErr: false,
    },
    {
      desc: "ALWAYS_REQUIRED error, force=false",
      graphqlErr: [{ message: "fatal error", extensions: { warningLevel: "ALWAYS_REQUIRED" } }],
      nonInteractive: false,
      force: false,
      dryRun: false,
      expectErr: true,
      expectedErrorMessage: "Failed due to unbypassable requirements.",
    },
    {
      desc: "ALWAYS_REQUIRED error, force=true",
      graphqlErr: [{ message: "fatal error", extensions: { warningLevel: "ALWAYS_REQUIRED" } }],
      nonInteractive: false,
      force: true,
      dryRun: false,
      expectErr: true,
      expectedErrorMessage: "Failed due to unbypassable requirements.",
    },
  ];
  for (const c of cases) {
    it(c.desc, async () => {
      if (c.promptAnswer) {
        selectStub.resolves(c.promptAnswer);
      }
      if (c.expectErr) {
        let threw = false;
        try {
          await handleBuildErrors(c.graphqlErr, c.nonInteractive, c.force, c.dryRun);
        } catch (err: unknown) {
          threw = true;
          if (c.expectedErrorMessage) {
            expect(err).to.be.an.instanceOf(Error);
            expect((err as Error).message).to.include(c.expectedErrorMessage);
          }
        }
        expect(threw, "Expected handleBuildErrors to throw an error").to.be.true;
      } else {
        await handleBuildErrors(c.graphqlErr, c.nonInteractive, c.force, c.dryRun);
      }
    });
  }
});
