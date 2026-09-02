import { Clock, GitBranch, LayoutGrid, Pencil, Star, Trash2, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KNOWN_LANGUAGES } from "@/features/projects/ranking";
import { useFilterCounts } from "@/features/projects/useProjectList";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/format";
import { useApp, type FilterId } from "@/stores/app";

function Entry({
  id,
  label,
  count,
  icon,
}: {
  id: FilterId;
  label: string;
  count?: number;
  icon?: ReactNode;
}) {
  const filter = useApp((s) => s.filter);
  const setFilter = useApp((s) => s.setFilter);
  const active = filter === id;

  return (
    <button
      onClick={() => setFilter(id)}
      className={cn(
        "flex h-[26px] w-full items-center gap-2 rounded-[6px] px-2 text-[12.5px] transition-colors duration-120",
        active ? "bg-raised text-ink" : "text-ink-dim hover:bg-panel hover:text-ink",
      )}
    >
      {icon ? <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span> : null}
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="mono text-[11px] text-ink-faint">{count}</span>
      ) : null}
    </button>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="space-y-0.5 px-2 py-2">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </div>
      {children}
    </div>
  );
}

function TagRow({ id, name, count }: { id: number; name: string; count: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const reloadTags = useApp((s) => s.reloadTags);
  const reloadProjects = useApp((s) => s.reloadProjects);
  const fail = useApp((s) => s.fail);

  async function commit() {
    setEditing(false);
    if (draft.trim() === name || !draft.trim()) return setDraft(name);
    try {
      await api.renameTag(id, draft);
      await Promise.all([reloadTags(), reloadProjects()]);
    } catch (e) {
      setDraft(name);
      fail(e);
    }
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        className="h-[26px] text-[12.5px]"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div className="group relative">
      <Entry id={`tag:${name}`} label={`#${name}`} count={count} />
      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Rename ${name}`}
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${name}`}
          onClick={async () => {
            try {
              await api.deleteTag(id);
              await Promise.all([reloadTags(), reloadProjects()]);
            } catch (e) {
              fail(e);
            }
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const counts = useFilterCounts();
  const tags = useApp((s) => s.tags);
  const projects = useApp((s) => s.projects);
  const reloadTags = useApp((s) => s.reloadTags);
  const fail = useApp((s) => s.fail);
  const [newTag, setNewTag] = useState("");

  const tagCounts: Record<string, number> = {};
  for (const project of projects) {
    for (const tag of project.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }

  const languages = KNOWN_LANGUAGES.filter((l) => counts.languages[l]);

  return (
    <nav className="flex h-full w-[212px] shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas pb-4">
      <Section title="Projects">
        <Entry id="all" label="All projects" count={counts.total} icon={<LayoutGrid className="h-3.5 w-3.5" />} />
        <Entry id="favorites" label="Favorites" count={counts.favorites} icon={<Star className="h-3.5 w-3.5" />} />
        <Entry id="recent" label="Recently opened" count={counts.recent} icon={<Clock className="h-3.5 w-3.5" />} />
        <Entry id="git" label="Git repositories" count={counts.repos} icon={<GitBranch className="h-3.5 w-3.5" />} />
        <Entry
          id="dirty"
          label="Uncommitted work"
          count={counts.dirty}
          icon={<TriangleAlert className="h-3.5 w-3.5" />}
        />
      </Section>

      {languages.length > 0 || counts.other > 0 ? (
        <Section title="Stack">
          {languages.map((language) => (
            <Entry
              key={language}
              id={`lang:${language}`}
              label={language}
              count={counts.languages[language]}
            />
          ))}
          {counts.other > 0 ? <Entry id="lang:Other" label="Other" count={counts.other} /> : null}
        </Section>
      ) : null}

      <Section title="Tags">
        {tags.map((tag) => (
          <TagRow key={tag.id} id={tag.id} name={tag.name} count={tagCounts[tag.name] ?? 0} />
        ))}
        <form
          className="px-2 pt-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTag.trim()) return;
            try {
              await api.createTag(newTag);
              setNewTag("");
              await reloadTags();
            } catch (err) {
              fail(err);
            }
          }}
        >
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="New tag"
            className="h-[26px] text-[12px]"
          />
        </form>
      </Section>
    </nav>
  );
}
