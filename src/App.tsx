import { useEffect, useState } from "react";

import { CommandPalette } from "@/components/CommandPalette";
import { DetailPane } from "@/components/DetailPane";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/Toaster";
import { TopBar } from "@/components/TopBar";
import { TooltipProvider } from "@/components/ui/controls";
import { ScanDialog } from "@/features/projects/ScanDialog";
import { useAddProject } from "@/features/projects/useAddProject";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { Dashboard } from "@/pages/Dashboard";
import { useApp } from "@/stores/app";

const REFRESH_INTERVAL_MS = 60_000;

export default function App() {
  const bootstrap = useApp((s) => s.bootstrap);
  const projects = useApp((s) => s.projects);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const refreshGit = useApp((s) => s.refreshGit);
  const theme = useApp((s) => s.settings.theme ?? "dark");
  const settingsTab = useApp((s) => s.settingsTab);
  const openSettings = useApp((s) => s.openSettings);
  const closeSettings = useApp((s) => s.closeSettings);
  const autoRefresh = useApp((s) => s.settings.auto_refresh_git !== "false");

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const addProject = useAddProject();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  // Global shortcuts stay inside the window: registering a system-wide hotkey
  // would prompt for macOS Accessibility access, which this app does not need.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (key === "n") {
        e.preventDefault();
        void addProject.start();
      } else if (key === ",") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addProject]);

  // Periodic refresh of whatever git state is already loaded, paused while the
  // window is in the background so a hidden app costs nothing.
  useEffect(() => {
    if (!autoRefresh) return;
    const tick = () => {
      if (document.hidden) return;
      const loaded = Object.keys(useApp.getState().git).map(Number);
      if (loaded.length > 0) void refreshGit(loaded, true);
    };
    const timer = window.setInterval(tick, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refreshGit]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <div className="flex h-full flex-col bg-canvas">
        <TopBar
          onAdd={() => void addProject.start()}
          onScan={() => setScanOpen(true)}
          onSettings={() => openSettings()}
        />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            <Dashboard onAdd={() => void addProject.start()} onScan={() => setScanOpen(true)} />
          </main>
          {selected ? <DetailPane project={selected} onClose={() => select(null)} /> : null}
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onAdd={() => void addProject.start()}
        onScan={() => setScanOpen(true)}
        onSettings={() => openSettings()}
      />
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} />
      <SettingsDialog
        open={settingsTab !== null}
        onOpenChange={(next) => (next ? openSettings() : closeSettings())}
        tab={settingsTab ?? "general"}
        onTabChange={openSettings}
      />
      {addProject.element}
      <Toaster />
    </TooltipProvider>
  );
}
