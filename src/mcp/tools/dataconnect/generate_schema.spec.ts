import { expect } from "chai";
import * as sinon from "sinon";
import { generate_schema } from "./generate_schema";
import * as fdcExperience from "../../../gemini/fdcExperience";
import { toContent } from "../../util";

describe("generate_schema tool", () => {
  const projectId = "test-project";
  const prompt = "generate a schema for a blog";
  const generatedSchema = "type Post { id: ID! }";

  let generateSchemaStub: sinon.SinonStub;

  beforeEach(() => {
    generateSchemaStub = sinon.stub(fdcExperience, "generateSchema");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should generate a schema successfully", async () => {
    generateSchemaStub.resolves(generatedSchema);

    const result = await (generate_schema as any)._fn({ prompt }, { projectId });

    expect(generateSchemaStub).to.be.calledWith(prompt, projectId);
    expect(result).to.deep.equal(toContent(generatedSchema));
  });
});
