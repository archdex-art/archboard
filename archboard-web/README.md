# archboard-web

The download page for Archboard. Three static files, no build step and no
dependencies — it is a page whose whole job is to hand over a 7.3 MB file, and
a toolchain would be more machinery than the thing it ships.

```
index.html    content and structure
styles.css    the whole design
board.js      the board's load sequence, and the copy button
```

## Running it

```sh
python3 -m http.server 4173 --directory archboard-web
```

Any static host works: GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket.
There is nothing to configure.

## Before it is useful to anyone

**The download link points at a release in a private repository, so it returns
404 for every visitor.** Verified, not assumed:

```
$ curl -sIL -o /dev/null -w '%{http_code}' \
    https://github.com/archdex-art/archboard/releases/download/v0.1.0/Archboard_0.1.0_universal.dmg
404
```

Making `archdex-art/archboard` public fixes it with no change to this page —
the URLs are already correct. Until then the page is complete and the button is
dead.

## Design notes

The page inherits the application's rule rather than inventing a second visual
language: **colour marks state, never decoration.** Amber means uncommitted
work, violet means a branch has drifted, and everything else is graphite. The
download button is deliberately ink rather than amber; making the loudest
control on the page a state colour would break the one rule the product is
built on.

Type follows the same split as the app — prose in IBM Plex Sans, anything a
machine said in JetBrains Mono. Branches, paths, counts, versions and commands
are all machine text.

The signature is the hero board. It holds ten real repositories and paints the
way Archboard actually does: rows arrive from the database immediately, then
the git state resolves a beat later and the amber gutters snap in. It is a
re-enactment rather than a screenshot, and it is the only animated thing on the
page. Branch names are middle-truncated (`feat/c…onomics`) because that is what
the app does — right-clipping them here would advertise a bug that was fixed.

The counter-case section is deliberate. If someone already knows which project
they want, Raycast and `zoxide` are faster, and saying so is more persuasive
than pretending otherwise.

## Quality floor

- Zero `axe-core` violations
- Keyboard reachable throughout, with a visible focus ring and a skip link
- `prefers-reduced-motion` removes the sequence and shows the board complete
- Readable to 390 px, where the board drops its rail and secondary columns and
  keeps the gutter and the change count — the same priority the app uses
- Works with JavaScript disabled; the sequence is an enhancement, not the thing
  that makes content visible
