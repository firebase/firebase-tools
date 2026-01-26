# Hosting Configuration (`firebase.json`)

The `hosting` section of `firebase.json` configures how your site is deployed and served.

## Key Attributes

### `public` (Required)
Specifies the directory to deploy to Firebase Hosting.
```json
"hosting": {
  "public": "public"
}
```

### `ignore` (Optional)
Files to ignore on deploy. Uses glob patterns (like `.gitignore`).
**Default ignores:** `firebase.json`, `**/.*`, `**/node_modules/**`

### `redirects` (Optional)
URL redirects to prevent broken links or shorten URLs.
```json
"redirects": [
  {
    "source": "/foo",
    "destination": "/bar",
    "type": 301
  }
]
```

### `rewrites` (Optional)
Serve the same content for multiple URLs, useful for SPAs or Dynamic Content.
```json
"rewrites": [
  {
    "source": "**",
    "destination": "/index.html"
  },
  {
    "source": "/api/**",
    "function": "apiFunction"
  },
  {
    "source": "/container/**",
    "run": {
      "serviceId": "helloworld",
      "region": "us-central1"
    }
  }
]
```

### `headers` (Optional)
Custom response headers.
```json
"headers": [
  {
    "source": "**/*.@(eot|otf|ttf|ttc|woff|font.css)",
    "headers": [
      {
        "key": "Access-Control-Allow-Origin",
        "value": "*"
      }
    ]
  }
]
```

### `cleanUrls` (Optional)
If `true`, drops `.html` extension from URLs.
```json
"cleanUrls": true
```

### `trailingSlash` (Optional)
Controls trailing slashes in static content URLs.
- `true`: Adds trailing slash.
- `false`: Removes trailing slash.

## Full Example

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "cleanUrls": true,
    "trailingSlash": false
  }
}
```
