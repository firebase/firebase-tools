# database:get

Fetch and print JSON data at the specified path

## Usage
```
firebase database:get [options] <path>
```

## Options
```
-o, --output <filename>  save output to the specified file
--pretty                 pretty print response
--shallow                return shallow response
--export                 include priorities in the output response
--order-by <key>         select a child key by which to order results
--order-by-key           order by key name
--order-by-value         order by primitive value
--limit-to-first <num>   limit to the first <num> results
--limit-to-last <num>    limit to the last <num> results
--start-at <val>         start results at <val> (based on specified ordering)
--end-at <val>           end results at <val> (based on specified ordering)
--equal-to <val>         restrict results to <val> (based on specified ordering)
--instance <instance>    use the database <instance>.firebaseio.com (if omitted, use default database instance)
-h, --help               output usage information
```
