# deploy

Deploy code and assets to your firebase project

## Usage
```
firebase deploy [options]
```

## Options
```
-p, --public <path>      override the Hosting public directory specified in firebase.json
-m, --message <message>  an optional message describing this deploy
-f, --force              delete Cloud Functions missing from the current working directory without confirmation
--only <targets>         only deploy to specified, comma-separated targets (e.g. "hosting,storage"). For functions, can specify filters with colons to scope function deploys to only those functions (e.g. "--only functions:func1,functions:func2"). When filtering based on export groups (the exported module object keys), use dots to specify group names (e.g. "--only functions:group1.subgroup1,functions:group2)"
--except <targets>       deploy to all targets except specified (e.g. "database")
-h, --help               output usage information
```
