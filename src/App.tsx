import { listen } from "@tauri-apps/api/event";
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
import { useShortcuts } from "@/features/shortcuts/useShortcuts";
import type { SettingsTab } from "@/stores/app";
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

  // The tray menu can ask for Settings while the window is hidden.
  useEffect(() => {
    const unlisten = listen<string>("open-settings", (e) =>
      openSettings((e.payload as SettingsTab) || "general"),
    );
    return () => void unlisten.then((fn) => fn());
  }, [openSettings]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  // Application-scope bindings. The project-scope ones live in Dashboard,
  // which is where the selected project is known.
  useShortcuts({
    palette: () => setPaletteOpen((open) => !open),
    add: () => void addProject.start(),
    scan: () => setScanOpen(true),
    settings: () => openSettings(),
    view: () => useApp.getState().setView(useApp.getState().view === "list" ? "grid" : "list"),
  });

  // Git state is re-read on a timer, and immediately whenever the window comes
  // back to the front. Committing in a terminal and switching to Archboard
  // should show the result straight away, not up to a minute later.
  useEffect(() => {
    if (!autoRefresh) return;

    let lastRun = 0;
    const refreshLoaded = (minGapMs: number) => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastRun < minGapMs) return;
      lastRun = now;
      const loaded = Object.keys(useApp.getState().git).map(Number);
      if (loaded.length > 0) void refreshGit(loaded, true);
    };

    // Alt-tabbing rapidly must not fire a refresh per switch.
    const onFocus = () => refreshLoaded(3_000);
    const timer = window.setInterval(() => refreshLoaded(0), REFRESH_INTERVAL_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
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
