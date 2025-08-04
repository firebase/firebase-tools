import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";

const resourceContent = `
To instrument an app with Google Analytics, you'll need to integrate the appropriate SDK and configure it to track user interactions. The process differs slightly between web and mobile apps.

### For Mobile Apps:

Google recommends using the Firebase SDK to integrate Google Analytics 4 (GA4) with mobile apps. Here's a general overview of the steps:

1.  **Set up a Firebase project**. If you don't have one already, create a new project in the Firebase console.
2.  **Add your app to the project**. Register your iOS or Android app within the Firebase project, providing your app's bundle ID (for iOS) or package name (for Android).
3.  **Download the configuration file**. Firebase will provide a 	GoogleService-Info.plist	 file for iOS or a 	google-services.json	 file for Android. Add this file to your app's project.
4.  **Integrate the Firebase SDK**. Add the necessary Firebase dependencies to your app's build files.
5.  **Enable Google Analytics**. In your Firebase project settings, ensure that Google Analytics is enabled.
6.  **Start logging events**. You can now use the Firebase SDK to log both automatically collected and custom events in your app.

### For Web Apps:

For websites, you can add Google Analytics using either the Global Site Tag (gtag.js) or Google Tag Manager.

**Using the Global Site Tag (gtag.js):**

1.  **Get your Measurement ID**. In your Google Analytics account, find your unique Measurement ID, which starts with "G-".
2.  **Add the gtag.js snippet**. Copy the provided JavaScript snippet and paste it into the 	<head>	 section of every page on your website you want to track.

**Using Google Tag Manager:**

1.  **Set up a Google Tag Manager account**.
2.  **Create a new tag**. In your Tag Manager container, create a new tag and select "Google Analytics: GA4 Configuration".
3.  **Enter your Measurement ID**.
4.  **Set up a trigger**. Configure a trigger to fire the tag on all pages.

### Key Concepts:

*   **Events**: User interactions with your app, such as screen views, button clicks, or purchases.
*   **User properties**: Attributes you define to describe segments of your user base, like language preference or geographic location.
*   **Data Streams**: A flow of data from your app or website to Google Analytics.

By following these steps, you can start collecting valuable data about how users interact with your app, which can help you make informed decisions to improve your app's performance and user experience.
`;

export const instrument_with_analytics = tool(
  {
    name: "instrument_with_analytics",
    description: "Describes how to instrument an app with Google Analytics.",
    inputSchema: z.object({}),
    annotations: {
      title: "How to instrument an app with Google Analytics",
      readOnlyHint: true,
    },
  },
  async () => {
    return toContent(resourceContent);
  },
);
