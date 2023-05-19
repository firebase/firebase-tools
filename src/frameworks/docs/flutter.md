Project: /docs/hosting/_project.yaml
Book: /docs/_book.yaml
page_type: guide

{% include "_shared/apis/console/_local_variables.html" %}
{% include "_local_variables.html" %}
{% include "docs/hosting/_local_variables.html" %}

<link rel="stylesheet" type="text/css" href="/styles/docs.css" />

# Integrate Flutter Web

With the Firebase framework-aware {{cli}}, you can deploy your Flutter application
to Firebase and serve dynamic content to your users.

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

<<_includes/_initialize-firebase.md>>

1. Choose your hosting source directory; this could be an existing Angular app.
1. Choose "Dynamic web hosting with web framework."
1. Choose Flutter Web.

### Initialize an existing project

Change your hosting config in `firebase.json` to have a `source` option, rather
than a `public` option. For example:

```json
{
  "hosting": {
    "source": "./path-to-your-flutter-app"
  }
}
```

## Serve static content

After initializing Firebase, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```
