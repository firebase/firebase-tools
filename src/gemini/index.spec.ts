import { expect } from "chai";
import { redact } from "./index";

describe("redact", () => {
  it("should redact JSON-like keys, preserving quotes", () => {
    const input = '{"apiKey": "secret123", "client_secret": "supersecret"}';
    const expected = '{"apiKey": "<REDACTED>", "client_secret": "<REDACTED>"}';
    expect(redact(input)).to.equal(expected);
  });

  it("should redact various token formats in JSON", () => {
    const input = `
        "access_token": "token1",
        "refreshToken": "token2",
        "GCP_TOKEN": "token3",
        "FIREBASE_TOKEN": "token4"
      `;
    const expected = `
        "access_token": "<REDACTED>",
        "refreshToken": "<REDACTED>",
        "GCP_TOKEN": "<REDACTED>",
        "FIREBASE_TOKEN": "<REDACTED>"
      `;
    expect(redact(input)).to.equal(expected);
  });

  it("should redact environment variable-like strings", () => {
    const input = "GOOGLE_API_KEY=secret-google-key\nFIREBASE_AUTH_TOKEN=secret-firebase-key";
    const expected = "GOOGLE_API_KEY=<REDACTED>\nFIREBASE_AUTH_TOKEN=<REDACTED>";
    expect(redact(input)).to.equal(expected);
  });

  it("should redact Bearer tokens", () => {
    const input = "Authorization: Bearer my-secret-token";
    const expected = "Authorization: Bearer <REDACTED>";
    expect(redact(input)).to.equal(expected);
  });

  it("should redact PEM private keys", () => {
    const input = `
        Some text before
        -----BEGIN PRIVATE KEY-----
        MIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGB...
        -----END PRIVATE KEY-----
        Some text after
      `;
    const expected = `
        Some text before
        <REDACTED PEM PRIVATE KEY>
        Some text after
      `;
    expect(redact(input)).to.equal(expected);
  });

  it("should not redact non-sensitive information", () => {
    const input = '{"projectId": "my-project", "user": "test@example.com"}';
    expect(redact(input)).to.equal(input);
  });
});
