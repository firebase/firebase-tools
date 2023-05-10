Project: /docs/hosting/_project.yaml
Book: /docs/_book.yaml
page_type: guide

{% include "_shared/apis/console/_local_variables.html" %}
{% include "_local_variables.html" %}
{% include "docs/hosting/_local_variables.html" %}

<link rel="stylesheet" type="text/css" href="/styles/docs.css" />

# Integrate Flask

With the Firebase framework-aware {{cli}}, you can deploy your Flask application
to Firebase and serve dynamic content to your users.

Note: Flask support in Framework-aware {{hosting}} is coming soon.

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

- Billing enabled on your Firebase project

<<_includes/_initialize-firebase.md>>

1. Choose your hosting source directory; this could be an existing Flask app.
1. Choose "Dynamic web hosting with web framework."
1. Choose Flask.

### Initialize an existing project

Change your hosting config in `firebase.json` to have a `source` option, rather
than a `public` option. For example:

```json
{
  "hosting": {
    "source": "./path-to-your-flask-app"
  }
}
```

## Serve fully dynamic content

After initializing Firebase, you can serve dynamic content with the standard
deployment command:

```shell
firebase deploy
```

You can [view your deployed app](/docs/hosting/test-preview-deploy#view-changes)
on its live site.

## Serve static content

When you call deploy, your Flask applications's
[static files](https://flask.palletsprojects.com/en/2.3.x/quickstart/#static-files)
will be deployed to Firebase Hosting automatically—these files will be served
from the CDN.
