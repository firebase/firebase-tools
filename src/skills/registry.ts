import { SkillRegistry } from "./types";

const HARDCODED_REGISTRY: SkillRegistry = {
  skills: {
    "firestore-query": "sha-abc1234567890",
    "auth-google-sign-in": "sha-def4567890123",
    "firebase-firestore": "sha-ghi7890123456",
  },
  tombstones: {
    "old-skill": "firestore-query",
  },
};

export async function fetchRegistry(): Promise<SkillRegistry> {
  // In the future, this will fetch from a remote URL.
  return Promise.resolve(HARDCODED_REGISTRY);
}
