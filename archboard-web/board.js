/*
  The hero board, made to behave like the product rather than depict it.

  Everything here is an enhancement over markup that already stands on its
  own: the rows, their state and the filters are in the HTML, and with
  scripting off the board is a complete, readable picture. This adds the three
  things that make it a demonstration instead of a screenshot — search,
  filters and keyboard selection — and derives every count from the rows, so
  the sidebar cannot claim a number the list does not show.
*/

document.documentElement.classList.add("js");

const board = document.getElementById("rows");
const search = document.getElementById("demo-search");

if (board && search) {
  const rows = [...board.querySelectorAll(".row")].map((el) => ({
    el,
    label: el.querySelector(".row__label"),
    name: el.querySelector(".row__label").textContent.trim(),
    path: el.querySelector(".row__path").textContent.trim(),
    branch: el.querySelector(".row__branch")?.textContent.trim() ?? "",
    stack: el.querySelector(".row__stack")?.textContent.trim() ?? "",
    lang: el.dataset.lang ?? "",
    dirty: el.dataset.state === "dirty",
    favorite: "fav" in el.dataset,
    recent: "recent" in el.dataset,
  }));

  const rail = [...document.querySelectorAll("[data-filter]")];
  const counts = new Map([...document.querySelectorAll("[data-count]")].map((el) => [el.dataset.count, el]));
  let filter = "all";
  let cursor = 0;

  /**
   * The app's matching rule: every character of the query must appear in
   * order, not necessarily together. That is what lets `pxforge` find
   * `pixel-forge`, and it is why the demo highlights the characters it
   * actually matched rather than a substring.
   */
  function subsequence(haystack, needle) {
    const hay = haystack.toLowerCase();
    const hits = [];
    let n = 0;
    for (let i = 0; i < hay.length && n < needle.length; i += 1) {
      if (hay[i] === needle[n]) {
        hits.push(i);
        n += 1;
      }
    }
    return n === needle.length ? hits : null;
  }

  /** Builds the label with matched characters marked, never as raw HTML. */
  function paint(row, hits) {
    row.label.textContent = "";
    if (!hits) {
      row.label.textContent = row.name;
      return;
    }
    const marked = new Set(hits);
    for (let i = 0; i < row.name.length; i += 1) {
      const ch = row.name[i];
      if (marked.has(i)) {
        const b = document.createElement("b");
        b.textContent = ch;
        row.label.append(b);
      } else {
        row.label.append(ch);
      }
    }
  }

  const passesFilter = (row) => {
    if (filter === "all" || filter === "git") return true;
    if (filter === "favorites") return row.favorite;
    if (filter === "recent") return row.recent;
    if (filter === "dirty") return row.dirty;
    if (filter.startsWith("lang:")) return row.lang === filter.slice(5);
    return true;
  };

  function apply() {
    const query = search.value.trim().toLowerCase();
    let shown = 0;

    for (const row of rows) {
      let hits = null;
      let matched = true;

      if (query) {
        // The name is where a match is worth showing; the other fields decide
        // whether the row belongs, the way the app searches paths and
        // branches without highlighting them.
        hits = subsequence(row.name, query);
        matched =
          hits !== null ||
          subsequence(row.path, query) !== null ||
          subsequence(row.branch, query) !== null ||
          subsequence(row.stack, query) !== null;
      }

      const visible = matched && passesFilter(row);
      row.el.hidden = !visible;
      paint(row, visible ? hits : null);
      if (visible) shown += 1;
    }

    // Counts describe the whole board, not the current view — the same as
    // the sidebar in the app, where they tell you what is there rather than
    // what survived the filter. They are derived either way, so they cannot
    // claim a number the list does not have.
    counts.get("all").textContent = String(rows.length);
    counts.get("git").textContent = String(rows.length);
    counts.get("favorites").textContent = String(rows.filter((r) => r.favorite).length);
    counts.get("recent").textContent = String(rows.filter((r) => r.recent).length);
    counts.get("dirty").textContent = String(rows.filter((r) => r.dirty).length);
    for (const lang of ["TypeScript", "Rust", "Python"]) {
      counts.get(`lang:${lang}`).textContent = String(rows.filter((r) => r.lang === lang).length);
    }

    board.dataset.empty = shown === 0 ? "true" : "false";
    moveCursor(0);
  }

  const visibleRows = () => rows.filter((r) => !r.el.hidden);

  function moveCursor(delta) {
    const shown = visibleRows();
    if (shown.length === 0) {
      for (const row of rows) row.el.classList.remove("is-selected");
      return;
    }
    cursor = Math.max(0, Math.min(cursor + delta, shown.length - 1));
    for (const row of rows) row.el.classList.remove("is-selected");
    shown[cursor].el.classList.add("is-selected");
  }

  search.addEventListener("input", apply);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      apply();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCursor(1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCursor(-1);
    }
  });

  for (const button of rail) {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      for (const other of rail) {
        const on = other === button;
        other.classList.toggle("is-active", on);
        other.setAttribute("aria-pressed", String(on));
      }
      cursor = 0;
      apply();
    });
  }

  for (const row of rows) {
    row.el.addEventListener("click", () => {
      const shown = visibleRows();
      cursor = Math.max(0, shown.indexOf(row));
      moveCursor(0);
    });
  }

  // ⌘K / Ctrl+K is the app's own shortcut, and the chrome advertises it, so
  // it should do something here rather than open the browser's own search.
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      search.focus();
      search.select();
    }
  });

  apply();
}

/* Hold the arrival sequence until the board is actually on screen. */
if (board) {
  const reveal = () => board.classList.add("is-live");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal();
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(board);

    /*
      The rows start hidden so they can arrive in sequence, which makes the
      observer load-bearing: on a short window, or any case where 12% of the
      board never comes into view, they would stay hidden for good. Content
      must not depend on an animation trigger, so this shows them regardless.
    */
    setTimeout(reveal, 1500);
  } else {
    reveal();
  }
}

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const text = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard is blocked outside a secure context; select it instead so
      // the command can still be copied by hand rather than silently failing.
      const code = button.parentElement?.querySelector("code");
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      return;
    }
    const original = button.textContent;
    button.textContent = "Copied";
    button.dataset.done = "true";
    setTimeout(() => {
      button.textContent = original;
      delete button.dataset.done;
    }, 1600);
  });
}
