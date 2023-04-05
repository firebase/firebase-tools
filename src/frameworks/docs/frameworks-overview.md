Project: /docs/hosting/_project.yaml
Book: /docs/_book.yaml
page_type: guide

{% include "_shared/apis/console/_local_variables.html" %}
{% include "_local_variables.html" %}
{% include "docs/hosting/_local_variables.html" %}

<link rel="stylesheet" type="text/css" href="/styles/docs.css" />

# Integrate web frameworks with {{hosting}}

{{firebase_hosting}} integrates with popular modern web frameworks including Angular
and Next.js. Using {{firebase_hosting}} and {{cloud_functions_full}} with these
frameworks, you can develop apps and microservices in your preferred framework
environment, and then deploy them in a managed, secure server environment.
Support during this early preview includes the following functionality:

* Deploy Web apps comprised of static web content
* Deploy Web apps that use pre-rendering / Static Site Generation (SSG)
* Deploy Web apps that use server-side Rendering (SSR)—full server rendering on demand

Firebase provides this functionality through the {{firebase_cli}}. When initializing
{{hosting}} on the command line, you provide information about your new or existing
Web project, and the {{cli}} sets up the right resources for your chosen Web
framework.

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

## Serve locally

You can test your integration locally by following these steps:

1. Run `firebase emulators:start` from the terminal. This builds your app and
   serves it using the {{firebase_cli}}.
2. Open your web app at the local URL returned by the {{cli}} (usually http://localhost:5000).

## Deploy your app to {{firebase_hosting}}

When you're ready to share your changes with the world, deploy your app to your
live site:

1. Run `firebase deploy` from the terminal.
2. Check your website on: `SITE_ID.web.app` or `PROJECT_ID.web.app` (or your custom domain, if you set one up).

## Next steps

See the detailed guide for your preferred framework:

* [Angular Universal](/docs/hosting/frameworks/angular)
* [Next.js] (/docs/hosting/frameworks/nextjs)
* [Frameworks with Express.js](/docs/hosting/frameworks/ßexpress)
