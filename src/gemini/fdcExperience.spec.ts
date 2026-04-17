import { expect } from "chai";
import { extractCodeBlock, generateSchema, generateOperation } from "./fdcExperience";
import * as nock from "nock";

describe("fdcExperience", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  after(() => {
    nock.cleanAll();
  });

  describe("extractCodeBlock", () => {
    it("should extract a basic GraphQL query block", () => {
      const text =
        'Here is a GraphQL query:\n```graphql\nquery GetUser { user(id: "1") { name email } }\n```\nThanks!';
      const expected = 'query GetUser { user(id: "1") { name email } }';
      expect(extractCodeBlock(text)).to.eq(expected);
    });

    it("should extract a multi-line GraphQL mutation block", () => {
      const text = `
      Some preamble.
      \`\`\`graphql
      mutation CreatePost($title: String!, $content: String!) {
        createPost(title: $title, content: $content) {
          id
          title
        }
      }
      \`\`\`
      Followed by some description.
      `;
      const expected = `mutation CreatePost($title: String!, $content: String!) {
        createPost(title: $title, content: $content) {
          id
          title
        }
      }`;
      expect(extractCodeBlock(text)).to.eq(expected);
    });

    it("should extract a GraphQL fragment block", () => {
      const text = "```graphql\nfragment UserFields on User { id name }\n```";
      const expected = "fragment UserFields on User { id name }";
      expect(extractCodeBlock(text)).to.eq(expected);
    });

    it("should extract an empty GraphQL code block", () => {
      const text = "```graphql\n\n```";
      const expected = "";
      expect(extractCodeBlock(text)).to.eq(expected);
    });

    it("should extract a GraphQL schema definition block", () => {
      const text = `
      \`\`\`graphql
      type Query {
        hello: String
      }
      schema {
        query: Query
      }
      \`\`\`
      `;
      const expected = `type Query {
        hello: String
      }
      schema {
        query: Query
      }`;
      expect(extractCodeBlock(text)).to.eq(expected);
    });
  });

  describe("generateSchema", () => {
    it("should make a streaming POST request and return parsed code", async () => {
      const prompt = "Create a blog";
      const project = "my-project";
      const location = "us-central1";
      const responseObj = {
        part: {
          codeChunk: {
            code: "type User { id: String }",
            languageCode: "graphql"
          }
        }
      };

      nock("https://staging-firebasedataconnect.sandbox.googleapis.com")
        .post(`/v1/projects/${project}/locations/${location}/services/-:generateSchema`, {
          name: `projects/${project}/locations/${location}/services/-`,
          prompt
        })
        .reply(200, JSON.stringify(responseObj));

      const result = await generateSchema(prompt, project, location);
      expect(result).to.equal("type User { id: String }");
      expect(nock.isDone()).to.be.true;
    });

    it("should call onStatus callback when status updates are received", async () => {
      const prompt = "Create a blog";
      const project = "my-project";
      const location = "us-central1";
      const statusObj = {
        status: {
          state: "ANALYZING_SCHEMA",
          message: "Analyzing schema..."
        }
      };
      const responseObj = {
        part: {
          codeChunk: {
            code: "type User { id: String }",
            languageCode: "graphql"
          }
        }
      };

      let statusCalledWith: any = null;
      const onStatus = (status: any) => {
          statusCalledWith = status;
      };

      nock("https://staging-firebasedataconnect.sandbox.googleapis.com")
        .post(`/v1/projects/${project}/locations/${location}/services/-:generateSchema`, {
          name: `projects/${project}/locations/${location}/services/-`,
          prompt
        })
        .reply(200, JSON.stringify(statusObj) + "\n" + JSON.stringify(responseObj));

      const result = await generateSchema(prompt, project, location, onStatus);
      expect(result).to.equal("type User { id: String }");
      expect(statusCalledWith).to.deep.equal(statusObj.status);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("generateOperation", () => {
    it("should make a streaming POST request and return parsed code", async () => {
      const prompt = "Get users";
      const service = "projects/my-project/locations/us-central1/services/my-service";
      const project = "my-project";
      const responseObj = {
        part: {
          codeChunk: {
            code: "query GetUsers { users { id } }",
            languageCode: "graphql"
          }
        }
      };

      nock("https://staging-firebasedataconnect.sandbox.googleapis.com")
        .post(`/v1/projects/my-project/locations/us-central1/services/my-service:generateQuery`, {
          name: `projects/my-project/locations/us-central1/services/my-service`,
          prompt
        })
        .reply(200, JSON.stringify(responseObj));

      const result = await generateOperation(prompt, service, project);
      expect(result).to.equal("query GetUsers { users { id } }");
      expect(nock.isDone()).to.be.true;
    });

    it("should use '-' as serviceId when schemas are provided", async () => {
      const prompt = "Get users";
      const service = "projects/my-project/locations/us-central1/services/my-service";
      const project = "my-project";
      const schemas = [{ source: { files: [{ path: "schema.gql", content: "type User { id: String }" }] } }];
      const responseObj = {
        part: {
          codeChunk: {
            code: "query GetUsers { users { id } }",
            languageCode: "graphql"
          }
        }
      };

      nock("https://staging-firebasedataconnect.sandbox.googleapis.com")
        .post(`/v1/projects/my-project/locations/us-central1/services/-:generateQuery`, {
          name: `projects/my-project/locations/us-central1/services/-`,
          prompt,
          schemas
        })
        .reply(200, JSON.stringify(responseObj));

      const result = await generateOperation(prompt, service, project, schemas);
      expect(result).to.equal("query GetUsers { users { id } }");
      expect(nock.isDone()).to.be.true;
    });
  });
});
