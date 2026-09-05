# archboard-web

The download page for Archboard. Static files, no bundler — a page whose whole
job is handing over an 8 MB binary does not need a toolchain.

```
index.html          content and structure
styles.css          the whole design
board.js            the board's load sequence, and the copy button
404.html            self-contained, works at any base path
fonts/              two variable woff2 files, self-hosted
sync-release.mjs    keeps the stated release true, and gates the deploy
robots.txt          crawler policy
sitemap.xml         one URL; it is a one-page site
.nojekyll           GitHub Pages must not run Jekyll over this
```

## Running it

```sh
python3 -m http.server 4173 --directory archboard-web
```

`index.html` also opens straight off disk. Nothing is fetched from another
origin at runtime.

## Deploying

`.github/workflows/deploy-web.yml` publishes to GitHub Pages on every push that
touches this folder, and again whenever a release is published — the page
states a version and a file size, and both change when you cut one.

The deploy is **gated on the download actually working**:

```
node archboard-web/sync-release.mjs          verify; non-zero if wrong
node archboard-web/sync-release.mjs --write  rewrite index.html
```

It reads the latest release, rewrites the version, size and URL, then fetches
that URL anonymously — the way a visitor would — and fails if it does not come
back. A landing page whose one job is handing over a binary has exactly one
unacceptable bug, and this is the check for it.

Enable Pages once, under Settings → Pages → Source: **GitHub Actions**.

### Where it will live

`https://archdex-art.github.io/archboard/`. Three files name that URL: the
`canonical` and `og:url` tags in `index.html`, `robots.txt`, and `sitemap.xml`.
Change all three together if it moves. Everything else is relative and will
follow.

## The blocker

**The download link returns 404 for the public, because the release lives in a
private repository.** Verified rather than assumed:

```
$ curl -s -o /dev/null -w '%{http_code}' \
    https://github.com/archdex-art/archboard/releases/download/v0.1.0/Archboard_0.1.0_universal.dmg
404
```

`sync-release.mjs` fails on exactly this, so the deploy will refuse to publish
until it is fixed. Making the repository public resolves it with no change to
this page — the URLs are already correct.

GitHub Pages from a private repository also requires a paid plan; a public
repository serves Pages for free.

## Design notes

The page inherits the application's rule rather than inventing a second visual
language: **colour marks state, never decoration.** Amber is uncommitted work,
violet is a drifted branch, everything else is graphite. The download button is
ink, not amber — making the loudest control on the page a state colour would
break the one rule the product is built on.

Type follows the app's split: prose in IBM Plex Sans, anything a machine said in
JetBrains Mono. Branches, paths, counts, versions and commands are machine text.

The signature is the hero board. Ten repositories, painting the way Archboard
actually does — rows arrive from the database at once, then the git state
resolves a beat later and the amber gutters snap in. A re-enactment rather than
a screenshot, and the only animated thing on the page.

The repositories are invented. The page was first built from the author's own
board, which meant publishing the names of private work to anyone who visited;
they are now plausible stand-ins. Everything else about them is faithful —
branch names are middle-truncated (`feat/r…ipeline`) because that is what the
app does, and the fuzzy match shown in the palette (`pxforge` finding
`pixel-forge`) is a real match under the app's own rules, not a mock-up.

## What holds it to a standard

- **No third-party origins.** Fonts are two self-hosted variable files, 80 KB
  for every weight, so no CDN sees the visitor and the policy below can be
  absolute.
- **`default-src 'none'`**, widened only to `'self'` for styles, fonts, scripts
  and images. There is not one inline style or inline script; the board's
  stagger index lives in the stylesheet as `nth-child` rules rather than a
  `style` attribute, because weakening the policy to animate a list would be
  the wrong trade.
- **Zero `axe-core` violations**, on both pages.
- **Keyboard reachable** throughout, visible focus ring, skip link.
- **`prefers-reduced-motion`** removes the sequence and shows the board whole.
- **Readable to 390 px**, where the board drops its rail and secondary columns
  and keeps the gutter and the change count — the same priority the app uses.
- **Content never depends on the animation.** With no JavaScript the rows are
  simply present, and with JavaScript a fallback timer reveals them even if the
  intersection observer never fires.

There is no social preview image. The renderer available here produced a
clipped card, and a broken `og:image` is worse than none; the tags that are
present are correct.
