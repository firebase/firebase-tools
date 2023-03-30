# Web frameworks docs on firebase.google.com

This directory contains the source of the Web frameworks documentation on
https://firebase.google.com/docs/.

We welcome your contributions! See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for general
guidelines.

This file has some information on how our documentation is organized and some
non-standard extensions we use.

## Standalone files vs. page fragments

There are two kinds of source file for our docs:

- **Standalone files** map one-to-one to a single page on firebase.google.com.
  These files are mostly-standard Markdown with filenames that correspond with
  the URL at which they're eventually published.

  Standalone pages must have filenames that don't begin with an
  underscore (`_`). For example, `angular.md` in this folder is
  a standalone file.

- **Page fragments** are included in other pages. We use page fragments either
  to include common text in multiple pages or to help organize large pages.
  Like standalone files, page fragments are also mostly-standard Markdown, but
  their filenames often don't correspond with the URL at which they're
  eventually published.

  Page fragments almost always have filenames that begin with an underscore
  (`_`). For example, `_before-you-begin.md` is a file of standard steps that
  should be included in all frameworks integration guides in this folder.

## Non-standard Markdown

### File includes

> Probably not useful to you as a contributor, but documented FYI.
> We use double angle brackets to include content from another file:

```
<<path/to/file>>
```

Note that the path is based on our internal directory structure, and not the
layout on GitHub. Also note that we sometimes use this to include non-Web frameworks
related content that's not on GitHub.

### Page metadata

> Probably not useful to you as a contributor, but documented FYI.
> Every standalone page begins with the following header:

```
Project: /docs/_project.yaml
Book: /docs/_book.yaml
```

These are non-standard metadata declarations used by our internal publishing
system. There's nothing you can really do with this, but it has to be on every
standalone page.

### Getting started writing

Unless the needs of your framework are radically different, you should
follow the outline and example presented in `angular.md`, which to date is
the most completely fleshed-out integration. Details for your framework are
likely to be different, but the overall outline should probably be similar.

Firebase follows the [Google developer documentation style guide](https://developers.google.com/style),
which you should read before writing substantial contributions.

Footer
© 2023 GitHub, Inc.
Footer navigation
Terms
Privacy
Security
Status
Docs
Contact GitHub
Pricing
API
Training
Blog
About
