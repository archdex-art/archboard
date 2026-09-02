import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";

import App from "@/App";
import { RecoveryScreen } from "@/components/RecoveryScreen";
import "@/index.css";

// React 19's root callbacks only observe errors — they cannot render a
// fallback — so the boundary below is what actually keeps the window alive.
ReactDOM.createRoot(document.getElementById("root")!, {
  onCaughtError: (error) => console.error("[archboard] recovered from", error),
  onUncaughtError: (error) => console.error("[archboard] uncaught", error),
}).render(
  <React.StrictMode>
    <ErrorBoundary
      FallbackComponent={RecoveryScreen}
      onReset={() => window.location.reload()}
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
