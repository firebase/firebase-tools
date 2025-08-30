import { expect } from "chai";
import * as sinon from "sinon";
import { list_projects } from "./list_projects";
import * as projects from "../../../management/projects";
import { toContent } from "../../util";

describe("list_projects tool", () => {
  const projectList = [{ projectId: "project1" }];
  const pageSize = 10;

  let getFirebaseProjectPageStub: sinon.SinonStub;

  beforeEach(() => {
    getFirebaseProjectPageStub = sinon.stub(projects, "getFirebaseProjectPage");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should list the first page of projects", async () => {
    const nextPageToken = "next-page-token";
    getFirebaseProjectPageStub.resolves({ projects: projectList, nextPageToken });

    const result = await list_projects.fn({ page_size: pageSize }, {} as any);

    expect(getFirebaseProjectPageStub).to.be.calledWith(pageSize, undefined);
    expect(result).to.deep.equal(
      toContent(
        { projects: projectList, next_page_token: nextPageToken },
        {
          contentPrefix: `Here are ${projectList.length} Firebase projects:\n\n`,
          contentSuffix:
            "\nThere are more projects available. To see the next page, call this tool again with the next_page_token shown above.",
        },
      ),
    );
  });

  it("should list a subsequent page of projects", async () => {
    const pageToken = "prev-page-token";
    getFirebaseProjectPageStub.resolves({ projects: projectList, nextPageToken: undefined });

    const result = await list_projects.fn(
      { page_size: pageSize, page_token: pageToken },
      {} as any,
    );

    expect(getFirebaseProjectPageStub).to.be.calledWith(pageSize, pageToken);
    expect(result).to.deep.equal(
      toContent(
        { projects: projectList, next_page_token: undefined },
        {
          contentPrefix: `Here are ${projectList.length} Firebase projects (continued):\n\n`,
          contentSuffix: "",
        },
      ),
    );
  });

  it("should handle the last page of projects", async () => {
    getFirebaseProjectPageStub.resolves({ projects: projectList, nextPageToken: undefined });

    const result = await list_projects.fn({ page_size: pageSize }, {} as any);

    const content = result.content[0].text;
    expect(content).to.not.include("There are more projects available.");
  });

  it("should throw a descriptive error on failure", async () => {
    const originalError = new Error("API call failed");
    getFirebaseProjectPageStub.rejects(originalError);

    await expect(list_projects.fn({}, {} as any)).to.be.rejectedWith(
      "Failed to list Firebase projects",
    );
  });
});
