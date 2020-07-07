# How to contribute

We'd love to accept your patches and contributions to this project. There are
just a few small guidelines you need to follow.

## Contributor License Agreement

Contributions to this project must be accompanied by a Contributor License
Agreement. You (or your employer) retain the copyright to your contribution,
this simply gives us permission to use and redistribute your contributions as
part of the project. Head over to <https://cla.developers.google.com/> to see
your current agreements on file or to sign a new one.

You generally only need to submit a CLA once, so if you've already submitted one
(even if it was for a different project), you probably don't need to do it
again.

## Code reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult [GitHub Help] for more
information on using pull requests.

[github help]: https://help.github.com/articles/about-pull-requests/

## Development setup

When working on the Firebase CLI, you will want to [fork the project](https://help.github.com/articles/fork-a-repo/), clone the forked repository, make sure you're using `node >= 8.16.0` and `npm >= 6.9.0`, and then use `npm link` to globally link your working directory. This allows you to use the firebase command anywhere with your work-in-progress code.

```
node --version # Make sure it is >= 8.16.0
npm install -g 'npm@>=6.9.0'

git clone <your_forked_repo>
cd firebase-tools # navigate to your local repository
npm link
npm test # runs linter and tests
```

Now, whenever you run the firebase command, it is executing against the code in your working directory. This is great for manual testing.
