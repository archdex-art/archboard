/*
  Two small jobs, no dependencies.

  1. Mark the document as scripted, so the board's load sequence only runs
     where it can complete. Without JS the rows are visible immediately
     rather than stuck at opacity 0.
  2. Copy the quarantine command, since that is the one thing every first-time
     user has to run and retyping it is where they will make a mistake.
*/

document.documentElement.classList.add("js");

/* Hold the sequence until the board is actually on screen. Someone who lands
   deep-linked at #download should not scroll up to an animation that already
   finished without them. */
const board = document.getElementById("rows");

if (board) {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          board.classList.add("is-live");
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(board);
  } else {
    board.classList.add("is-live");
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
