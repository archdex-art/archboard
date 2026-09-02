import { ArrowDownUp, LayoutGrid, List, Plus, Search, Settings2, Telescope } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/controls";
import { Menu, MenuCheckItem, MenuContent, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { useApp, type SortMode } from "@/stores/app";

const SORTS: [SortMode, string][] = [
  ["frecency", "Most used"],
  ["recent", "Recently opened"],
  ["name", "Name"],
  ["changes", "Most changes"],
];

export function TopBar({
  onAdd,
  onScan,
  onSettings,
}: {
  onAdd: () => void;
  onScan: () => void;
  onSettings: () => void;
}) {
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const sort = useApp((s) => s.sort);
  const setSort = useApp((s) => s.setSort);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);

  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(query);

  // Typing is never blocked on filtering; the store settles 110ms later.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft), 110);
    return () => clearTimeout(timer);
  }, [draft, setQuery]);

  useEffect(() => {
    if (query === "" && draft !== "") setDraft("");
    // Only reacts to the store clearing the query, e.g. from the palette.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="drag-region flex h-[46px] shrink-0 items-center gap-2 border-b border-line bg-canvas pl-[84px] pr-3">
      <div className="no-drag relative w-full max-w-[380px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setDraft("")}
          placeholder="Search projects, paths, branches, tags"
          spellCheck={false}
          className="h-7 w-full rounded-[7px] border border-line bg-panel pl-8 pr-14 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-line-strong focus:bg-raised"
        />
        <kbd className="mono pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-ink-faint">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Sort projects" className="no-drag">
              <ArrowDownUp className="h-3.5 w-3.5" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Sort by</MenuLabel>
            {SORTS.map(([id, label]) => (
              <MenuCheckItem key={id} checked={sort === id} onSelect={() => setSort(id)}>
                {label}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>

        <Tooltip label={view === "list" ? "Switch to cards" : "Switch to list"}>
          <Button
            variant="ghost"
            size="icon"
            className="no-drag"
            aria-label="Toggle layout"
            onClick={() => setView(view === "list" ? "grid" : "list")}
          >
            {view === "list" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          </Button>
        </Tooltip>

        <Tooltip label="Find projects on this Mac">
          <Button variant="ghost" size="icon" className="no-drag" aria-label="Scan for projects" onClick={onScan}>
            <Telescope className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>

        <Tooltip label="Settings" shortcut="⌘,">
          <Button variant="ghost" size="icon" className="no-drag" aria-label="Settings" onClick={onSettings}>
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>

        <Button variant="primary" size="sm" className="no-drag ml-1" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Add project
        </Button>
      </div>
    </header>
  );
}
