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

<<_includes/_preview-disclaimer.md>>

<<_includes/_before-you-begin.md>>

- Billing enabled on your Firebase project

<<_includes/_initialize-firebase.md>>

1. Answer yes to "Do you want to use a web framework? (experimental)"
1. Choose your hosting source directory; this could be an existing Flask app, 
in this case you can specify the name of the app entry point file (e.g. main.py)
1. If prompted, choose Flask.

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

#### Troubleshooting initialization

If you experience any issues while initializing your application, here are some tips on using our tools with your Flask project:

1. You have correctly specified your app entry point file (e.g. main.py) and it
exists in firebase.json under `hosting.frameworksBackend.flask.entryFile`.
1. You have created and activated a virtual environment
`python -m venv venv && . venv/bin/activate`.
1. You have run `pip install -t requirements.txt` at least once and are able 
to start a standalone Flask server.

## Serve fully dynamic content

After initializing Firebase, you can serve dynamic content with the standard
deployment command:

```shell
firebase deploy
```

You can [view your deployed app](/docs/hosting/test-preview-deploy#view-changes)
on its live site.

## Serve static content

When you deploy, your Flask applications's
[static files](https://flask.palletsprojects.com/en/2.3.x/quickstart/#static-files)
will be deployed to Firebase Hosting automatically—these files will be served
from the CDN.
