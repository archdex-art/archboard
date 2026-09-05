#!/usr/bin/env node
/*
  Keeps the download page truthful, and refuses to let it ship otherwise.

  The page states a version, a file size and a download URL. Left to hand
  editing those drift the moment a release is cut, and the failure is silent:
  the page keeps advertising a build that no longer exists. This reads the
  actual latest release, rewrites the three facts, and — the part that matters
  — fails if the file it is about to advertise cannot be fetched.

  A landing page whose only job is handing over a binary has exactly one
  unacceptable bug, which is a dead download button. This is the check for it.

  Usage:
    node sync-release.mjs                 verify only, report drift
    node sync-release.mjs --write         rewrite index.html in place
*/

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = process.env.ARCHBOARD_REPO ?? "archdex-art/archboard";
const ASSET = /\.dmg$/;
const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, "index.html");

const write = process.argv.includes("--write");

/** Bytes to the one-decimal megabytes the page displays. */
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

const asset = (release.assets ?? []).find((a) => ASSET.test(a.name));
if (!asset) {
  fail(
    `Release ${release.tag_name} has no .dmg asset.`,
    `Assets present: ${(release.assets ?? []).map((a) => a.name).join(", ") || "none"}`,
  );
}

const version = release.tag_name.replace(/^v/, "");
const size = megabytes(asset.size);
const url = asset.browser_download_url;

// The whole point of the exercise: prove the button works before shipping it.
// Anonymous, because that is how a visitor will ask for it — a token here
// would happily confirm a file the public cannot reach.
const probe = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
const reachable = probe.ok || probe.status === 206;

console.log(`\n  repository  ${REPO}`);
console.log(`  release     ${release.tag_name}${release.prerelease ? " (pre-release)" : ""}`);
console.log(`  asset       ${asset.name}  ${size} MB`);
console.log(`  public      ${reachable ? "yes" : `NO — HTTP ${probe.status}`}`);

let html = await readFile(page, "utf8");
const before = html;

html = html
  .replace(/(<span data-rel="version">)[^<]*(<\/span>)/g, `$1${version}$2`)
  .replace(/(<span data-rel="size">)[^<]*(<\/span>)/g, `$1${size}$2`)
  .replace(/(<a[^>]*\sdata-dl[^>]*\shref=")[^"]*(")/g, `$1${url}$2`)
  .replace(/(<a[^>]*\shref=")[^"]*("[^>]*\sdata-dl)/g, `$1${url}$2`);

const drifted = html !== before;

if (write) {
  if (drifted) {
    await writeFile(page, html);
    console.log(`  page        updated to ${version}`);
  } else {
    console.log("  page        already current");
  }
} else if (drifted) {
  fail(
    "index.html does not match the latest release.",
    "Run: node archboard-web/sync-release.mjs --write",
  );
} else {
  console.log("  page        matches the release");
}

if (!reachable) {
  fail(
    "The download this page advertises is not publicly reachable.",
    `${url}\n    Make the repository public, or publish the asset somewhere that is.`,
  );
}

console.log("\n  ✓ download page is publishable\n");
