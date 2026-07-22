import { resourceTemplate } from "../resource";

export const docs = resourceTemplate(
  {
    name: "docs",
    title: "Firebase Docs",
    description:
      "loads plain text content from Firebase documentation, e.g. `https://firebase.google.com/docs/functions` becomes `firebase://docs/functions`",
    uriTemplate: `firebase://docs/{path}`,
    match: `firebase://docs/`,
  },
  async (uri) => {
    const path = uri.replace("firebase://docs/", "");
    try {
      const response = await fetch(`https://firebase.google.com/docs/${path}.md.txt`);

      if (response.status >= 400) {
        return {
          contents: [
            {
              uri,
              text: `Received a ${response.status} error while fetching '${uri}':\n\n${await response.text()}`,
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri,
            text: await response.text(),
          },
        ],
      };
    } catch (e) {
      return {
        contents: [
          {
            uri,
            text: `ERROR: There was an error fetching content for ${uri}`,
          },
        ],
      };
    }
  },
);
