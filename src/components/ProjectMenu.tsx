import {
  Copy,
  FolderOpen,
  Globe,
  RefreshCw,
  Square,
  SquareTerminal,
  Star,
  Trash2,
} from "lucide-react";

import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useActions } from "@/features/projects/useActions";
import { useApp } from "@/stores/app";
import type { GitStatus, Project } from "@/types";

/**
 * The action panel, opened with ⌘K on the selected project or from the ⋯ button.
 * Every launcher the machine actually has is listed, so "Open with" never
 * offers something that will fail.
 */
export function ProjectMenu({
  project,
  status,
  children,
  onRemove,
}: {
  project: Project;
  status?: GitStatus;
  children: React.ReactNode;
  onRemove?: (project: Project) => void;
}) {
  const launchers = useApp((s) => s.launchers);
  const actions = useActions();

  const ides = launchers.filter((l) => l.kind === "ide" && l.enabled);
  const terminals = launchers.filter((l) => l.kind === "terminal" && l.enabled);
  const remote = status?.remote;

  return (
    <Menu>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuContent>
        <MenuLabel>Open with</MenuLabel>
        {ides.length === 0 ? (
          <MenuItem disabled>No editors found</MenuItem>
        ) : (
          ides.map((ide) => (
            <MenuItem
              key={ide.id}
              icon={<Square className="h-3 w-3" strokeWidth={2} />}
              onSelect={() => void actions.openIde(project, ide.id)}
            >
              {ide.name}
            </MenuItem>
          ))
        )}

        <MenuSeparator />
        <MenuLabel>Terminal</MenuLabel>
        {terminals.length === 0 ? (
          <MenuItem disabled>No terminals found</MenuItem>
        ) : (
          terminals.map((terminal) => (
            <MenuItem
              key={terminal.id}
              icon={<SquareTerminal className="h-3.5 w-3.5" strokeWidth={2} />}
              onSelect={() => void actions.openTerminal(project, terminal.id)}
            >
              {terminal.name}
            </MenuItem>
          ))
        )}

        <MenuSeparator />
        <MenuItem
          icon={<FolderOpen className="h-3.5 w-3.5" strokeWidth={2} />}
          onSelect={() => void actions.openFolder(project)}
        >
          Reveal in Finder
        </MenuItem>
        <MenuItem
          icon={<Globe className="h-3.5 w-3.5" strokeWidth={2} />}
          disabled={!remote?.webUrl}
          onSelect={() => void actions.openRemote(project)}
        >
          {remote?.webUrl ? `Open on ${remote.service}` : "No remote"}
        </MenuItem>
        <MenuItem
          icon={<Copy className="h-3.5 w-3.5" strokeWidth={2} />}
          onSelect={() => void actions.copyPath(project)}
        >
          Copy path
        </MenuItem>

        <MenuSeparator />
        <MenuItem
          icon={
            <Star
              className="h-3.5 w-3.5"
              strokeWidth={2}
              fill={project.isFavorite ? "currentColor" : "none"}
            />
          }
          onSelect={() => void actions.toggleFavorite(project)}
        >
          {project.isFavorite ? "Remove from favorites" : "Add to favorites"}
        </MenuItem>
        <MenuItem
          icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
          shortcut="⌘R"
          onSelect={() => void actions.refresh(project)}
        >
          Refresh git status
        </MenuItem>
        <MenuItem
          icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={2} />}
          className="data-[highlighted]:text-alert"
          onSelect={() => onRemove?.(project)}
        >
          Remove from Archboard
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
