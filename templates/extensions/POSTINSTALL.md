<!-- 
This file provides your users an overview of how to use your extension after they've installed it. All content is optional, but this is the recommended format. Your users will see the contents of this file in the Firebase console after they install the extension.

Include instructions for using the extension and any important functional details. Also include **detailed descriptions** for any additional post-installation setup required by the user. 

Learn more about the POSTINSTALL.md file in the docs
-->

# See it in action
You can test out this extension right away:

Visit the following URL: 

<!-- Reference parameter values with the ${PARAMETER_NAME} syntax  -->
${function:greetTheWorld.url}

# Using the extension
When triggered by an HTTP request, this extension responds with the following specified greeting: "${param:GREETING} World from ${param:EXT_INSTANCE_ID}"

To learn more about HTTP functions, visit the [functions documentation](https://firebase.google.com/docs/functions/http-events).

<!-- We recommend keeping the following section to explain how to monitor extensions with Firebase -->
# Monitoring
As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.
