# auth:import

Import users into your firebase project from a data file(.csv or .json)

## Usage
```
firebase auth:import [options] [dataFile]
```

## Options
```
--hash-algo <hashAlgo>               specify the hash algorithm used in password for these accounts
--hash-key <hashKey>                 specify the key used in hash algorithm
--salt-separator <saltSeparator>     specify the salt separator which will be appended to salt when verifying password. only used by SCRYPT now.
--rounds <rounds>                    specify how many rounds for hash calculation.
--mem-cost <memCost>                 specify the memory cost for firebase scrypt, or cpu/memory cost for standard scrypt
--parallelization <parallelization>  specify the parallelization for standard scrypt.
--block-size <blockSize>             specify the block size (normally is 8) for standard scrypt.
--dk-len <dkLen>                     specify derived key length for standard scrypt.
--hash-input-order <hashInputOrder>  specify the order of password and salt. Possible values are SALT_FIRST and PASSWORD_FIRST. MD5, SHA1, SHA256, SHA512, HMAC_MD5, HMAC_SHA1, HMAC_SHA256, HMAC_SHA512 support this flag.
-h, --help                           output usage information
```
