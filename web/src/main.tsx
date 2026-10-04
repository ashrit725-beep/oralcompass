import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "./App";
import "./styles.css";

// Root motion policy (component plan §1.6): one tempo, no bounce, and the user's reduced-motion preference is honoured for every
// transform/layout animation. Motion values, SVG attributes and CSS loops still carry their own useReducedMotion() guards.
// The root ErrorBoundary keeps a labelled recovery message on screen if anything outside the per-view boundaries throws (web-correctness-3).
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: "spring", visualDuration: 0.35, bounce: 0 }}>
      <TooltipProvider delayDuration={300}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </TooltipProvider>
    </MotionConfig>
  </React.StrictMode>,
);
