#!/usr/bin/env node
/*
  Keeps the download page truthful, and refuses to let it ship otherwise.

  The page states a version and, for each platform, a download URL, a file
  size and a checksum. Left to hand editing those drift the moment a release
  is cut, and the failure is silent: the page keeps advertising a build that
  no longer exists. This reads the actual latest release, rewrites every one
  of those facts, and — the part that matters — fails if any file it is about
  to advertise cannot be fetched.

  A landing page whose only job is handing over binaries has exactly one
  unacceptable bug, which is a dead download button. This is the check for it.

  Checksums come from the API's own `digest` field rather than from
  downloading ninety megabytes of installers on every deploy. That field was
  verified against a local `shasum -a 256` of the published file before being
  trusted here.

  Usage:
    node sync-release.mjs                 verify only, report drift
    node sync-release.mjs --write         rewrite index.html in place
*/

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = process.env.ARCHBOARD_REPO ?? "archdex-art/archboard";
const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, "index.html");
const write = process.argv.includes("--write");

/**
 * The downloads the page offers, in the order it offers them.
 *
 * `.app.tar.gz` is deliberately absent: it is the updater artifact, not
 * something a person should be handed.
 */
const WANTED = [
  { id: "mac", label: "macOS", match: (n) => n.endsWith(".dmg") },
  { id: "win", label: "Windows", match: (n) => n.endsWith("-setup.exe") },
  { id: "msi", label: "Windows (MSI)", match: (n) => n.endsWith(".msi") },
  { id: "deb", label: "Debian / Ubuntu", match: (n) => n.endsWith(".deb") },
  { id: "rpm", label: "Fedora", match: (n) => n.endsWith(".rpm") },
  { id: "appimage", label: "AppImage", match: (n) => n.endsWith(".AppImage") },
];

/** Bytes to the one-decimal megabytes the page displays, as Finder counts. */
const megabytes = (bytes) => (bytes / 1_000_000).toFixed(1);

function fail(message, detail) {
  console.error(`\n  ✗ ${message}`);
  if (detail) console.error(`    ${detail}`);
  process.exit(1);
}

const headers = { "User-Agent": "archboard-web-sync", Accept: "application/vnd.github+json" };
// A token lifts the 60/hour anonymous limit and is the only way to read a
// private repository. CI supplies it; locally it is optional.
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const api = `https://api.github.com/repos/${REPO}/releases/latest`;
let release;
try {
  const res = await fetch(api, { headers });
  if (res.status === 404) {
    fail(
      `No published release found for ${REPO}.`,
      "A private repository also answers 404 without a token. Set GITHUB_TOKEN, or publish a release.",
    );
  }
  if (!res.ok) fail(`GitHub API returned ${res.status} for ${api}`);
  release = await res.json();
} catch (error) {
  if (error instanceof TypeError) fail("Could not reach the GitHub API.", error.message);
  throw error;
}

const version = release.tag_name.replace(/^v/, "");
const assets = release.assets ?? [];

console.log(`\n  repository  ${REPO}`);
console.log(`  release     ${release.tag_name}${release.prerelease ? " (pre-release)" : ""}`);

const resolved = [];
for (const want of WANTED) {
  const asset = assets.find((a) => want.match(a.name));
  if (!asset) {
    fail(
      `Release ${release.tag_name} has no ${want.label} download.`,
      `Assets present: ${assets.map((a) => a.name).join(", ") || "none"}`,
    );
  }
  const digest = (asset.digest ?? "").replace(/^sha256:/, "");
  if (!digest) {
    fail(`GitHub published no checksum for ${asset.name}.`, "Nothing to show a downloader.");
  }
  resolved.push({ ...want, name: asset.name, size: megabytes(asset.size), url: asset.browser_download_url, sha: digest });
}

// The whole point of the exercise: prove each button works before shipping
// it. Anonymous, because that is how a visitor will ask — a token here would
// happily confirm a file the public cannot reach. One byte is enough to prove
// the object is served; the checksum is the API's.
let broken = 0;
for (const r of resolved) {
  const probe = await fetch(r.url, { method: "GET", headers: { Range: "bytes=0-0" } });
  const ok = probe.ok || probe.status === 206;
  if (!ok) broken += 1;
  console.log(`  ${r.label.padEnd(16)} ${r.name.padEnd(34)} ${r.size.padStart(5)} MB  ${ok ? "ok" : `HTTP ${probe.status}`}`);
}

let html = await readFile(page, "utf8");
const before = html;

html = html.replace(/(<span data-rel="version">)[^<]*(<\/span>)/g, `$1${version}$2`);
for (const r of resolved) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  html = html
    .replace(new RegExp(`(<a[^>]*\\sdata-dl="${esc(r.id)}"[^>]*\\shref=")[^"]*(")`, "g"), `$1${r.url}$2`)
    .replace(new RegExp(`(<a[^>]*\\shref=")[^"]*("[^>]*\\sdata-dl="${esc(r.id)}")`, "g"), `$1${r.url}$2`)
    .replace(new RegExp(`(<span data-size="${esc(r.id)}">)[^<]*(</span>)`, "g"), `$1${r.size}$2`)
    .replace(new RegExp(`(<code data-sha="${esc(r.id)}">)[^<]*(</code>)`, "g"), `$1${r.sha}$2`)
    .replace(new RegExp(`(<span data-file="${esc(r.id)}">)[^<]*(</span>)`, "g"), `$1${r.name}$2`);
}

const drifted = html !== before;

if (write) {
  if (drifted) {
    await writeFile(page, html);
    console.log(`  page        updated to ${version}`);
  } else {
    console.log("  page        already current");
  }
} else if (drifted) {
  fail("index.html does not match the latest release.", "Run: node archboard-web/sync-release.mjs --write");
} else {
  console.log("  page        matches the release");
}

if (broken > 0) {
  fail(
    `${broken} of ${resolved.length} downloads this page advertises are not publicly reachable.`,
    "Make the repository public, or publish the assets somewhere that is.",
  );
}

console.log("\n  ✓ download page is publishable\n");
