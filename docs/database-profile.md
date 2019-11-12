# database:profile

Profile the Realtime Database and generate a usage report

## Usage
```
firebase database:profile [options]
```

## Options
```
-o, --output <filename>   save the output to the specified file
-d, --duration <seconds>  collect database usage information for the specified number of seconds
--raw                     output the raw stats collected as newline delimited json
--no-collapse             prevent collapsing similar paths into $wildcard locations
-i, --input <filename>    generate the report based on the specified file instead of streaming logs from the database
--instance <instance>     use the database <instance>.firebaseio.com (if omitted, use default database instance)
-h, --help                output usage information
```
