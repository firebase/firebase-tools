import { expect } from "chai";
import { extractCodeBlock } from "./fdcExperience";

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
