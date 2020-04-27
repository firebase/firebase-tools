<!-- 
This file provides your users an overview of how to use your extension after they've installed it. All content is optional, but this is the recommended format. Your users will see the contents of this file in the Firebase console after they install the extension.

Include instructions for using the extension and any important functional details. Also include **detailed descriptions** for any additional post-installation setup required by the user.

Reference values for the extension instance using the ${param:PARAMETER_NAME} or ${function:VARIABLE_NAME} syntax.
Learn more in the docs: https://firebase.google.com/docs/extensions/alpha/create-user-docs#reference-in-postinstall

Learn more about writing a POSTINSTALL.md file in the docs:
https://firebase.google.com/docs/extensions/alpha/create-user-docs#writing-postinstall
-->

# Post-installation configuration

Before you can use this extension, follow these steps to make the Cloud Function deployed for this extension publicly accessible:

1. Go to the Cloud Functions dashboard for your project in the [Google Cloud console](https://console.cloud.google.com/functions/list?project=${PROJECT_ID}).
1. Click the checkbox next to the function called `ext-${EXT_INSTANCE_ID}-greetTheWorld`.
1. If it's not already expanded, click **Show Info Panel** (in the top-right corner) to show the *Permissions* tab.
1. Click **Add Member**. Then, in the *New members* field, enter the user `allUsers`.
1. Select the role `Cloud Functions Invoker` from the role dropdown list. You may need to type in this role's name to pull it into the list.
1. Click **Save**.

# See it in action

You can test out this extension right away!

Visit the following URL:
${function:greetTheWorld.url}

# Using the extension

When triggered by an HTTP request, this extension responds with the following specified greeting: "${param:GREETING} World from ${param:EXT_INSTANCE_ID}".

To learn more about HTTP functions, visit the [functions documentation](https://firebase.google.com/docs/functions/http-events).

<!-- We recommend keeping the following section to explain how to monitor extensions with Firebase -->
# Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.
