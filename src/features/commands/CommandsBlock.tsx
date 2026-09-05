import { Play, Plus, Rocket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/ipc";
import { useApp } from "@/stores/app";
import type { ProjectCommand } from "@/types";

/**
 * Saved commands for one project.
 *
 * Running one opens the user's terminal in the project and types it. Archboard
 * does not own the process: there is no stop button and no output here,
 * because that is what the terminal is for.
 */
export function CommandsBlock({
  projectId,
  onCommandsChange,
}: {
  projectId: number;
  onCommandsChange?: (commands: ProjectCommand[]) => void;
}) {
  const [commands, setCommands] = useState<ProjectCommand[]>([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [running, setRunning] = useState<number | null>(null);
  const fail = useApp((s) => s.fail);

  useEffect(() => {
    let live = true;
    setAdding(false);
    void api
      .listCommands(projectId)
      .then((next) => live && setCommands(next))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId]);

  useEffect(() => {
    onCommandsChange?.(commands);
  }, [commands, onCommandsChange]);

  const save = useCallback(async () => {
    if (!label.trim() || !text.trim()) return;
    try {
      setCommands(
        await api.upsertCommand({
          id: 0,
          projectId,
          label: label.trim(),
          command: text.trim(),
          position: 0,
          inWorkspace: false,
          createdAt: 0,
        }),
      );
      setLabel("");
      setText("");
      setAdding(false);
    } catch (e) {
      fail(e);
    }
  }, [fail, label, projectId, text]);

  return (
    <div className="space-y-1.5">
      {commands.length === 0 && !adding ? (
        <p className="text-[12.5px] text-ink-faint">
          Save a command you run often here — it opens in your terminal, in this folder.
        </p>
      ) : null}

      {commands.map((command) => (
        <div key={command.id} className="group flex items-center gap-2">
          <Checkbox
            checked={command.inWorkspace}
            aria-label={`Include "${command.label}" in workspace launch`}
            onCheckedChange={async () => {
              try {
                setCommands(
                  await api.upsertCommand({ ...command, inWorkspace: !command.inWorkspace }),
                );
              } catch (e) {
                fail(e);
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            className="min-w-0 flex-1 justify-start"
            disabled={running === command.id}
            title={command.command}
            onClick={async () => {
              setRunning(command.id);
              try {
                await api.runCommand(command.id);
              } catch (e) {
                fail(e);
              } finally {
                setRunning(null);
              }
            }}
          >
            {command.inWorkspace ? (
              <Rocket className="h-3 w-3 shrink-0 text-ink" strokeWidth={2.5} />
            ) : (
              <Play className="h-3 w-3 shrink-0" strokeWidth={2.5} />
            )}
            <span className="shrink-0 truncate">{command.label}</span>
            <span className="mono ml-auto min-w-0 truncate pl-3 text-right text-[10.5px] text-ink-faint">
              {command.command}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${command.label}`}
            className="shrink-0 opacity-0 group-hover:opacity-100"
            onClick={async () => {
              try {
                setCommands(await api.deleteCommand(command.id, projectId));
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {adding ? (
        <form
          className="space-y-1.5 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            value={label}
            placeholder="Name, e.g. Dev server"
            onChange={(e) => setLabel(e.target.value)}
          />
          <Input
            value={text}
            className="mono"
            placeholder="bun run dev"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <div className="flex gap-1.5">
            <Button type="submit" variant="primary" size="sm" disabled={!label.trim() || !text.trim()}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="mt-1" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add command
        </Button>
      )}
    </div>
  );
}
