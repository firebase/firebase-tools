The code in this directory is a very slightly modified version of https://github.com/supabase-community/pg-gateway/tree/next.
Full credit for this code goes to @gregnr and the other contributors on that repo.

Due to some known issues with how PGLite handles prepared statements, this versiom of pg-gateway includes middleware
to remove the extra Ready for Query messages that break schema migration. Once these underlying issues with PGLite are fixed,
we'll migrate to a normal dependency on pg-gateway.
