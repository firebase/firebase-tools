- Fixes an issue where `ext:dev:init` would fail due to a missing CHANGELOG.md file (#5530).
- Adds support for multiple databases in Firestore commands `delete`, `indexes` with optional --database argument
Example:
firebase firestore:delete --all-collections --recursive --database="(default)"
firebase firestore:indexes --database="named"
- Adds multiple firestore database targets support in firebase.json
Example:
{
  "firestore": [
    {
      "database": "(default)",
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    },
    {
      "database": "named",
      "rules": "firestore.rules",
      "indexes": "named.indexes.json"
    }
  ]
}