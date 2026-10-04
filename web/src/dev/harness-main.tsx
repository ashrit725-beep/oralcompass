import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import "../styles.css";
import "./harness.css";
import { DrawerHarness } from "./DrawerHarness";

// DEV ONLY entry for web/drawer-harness.html: mounts the drawer harness only when the hash asks for it (`#drawer-harness`).
// The product entry is src/main.tsx; the integrator may mount <DrawerHarness/> from there under the same hash gate instead.
const root = document.getElementById("root")!;
if (location.hash === "#drawer-harness") {
  createRoot(root).render(
    <React.StrictMode>
      <MotionConfig reducedMotion="user" transition={{ type: "spring", visualDuration: 0.35, bounce: 0 }}>
        <TooltipProvider delayDuration={300}><DrawerHarness /></TooltipProvider>
      </MotionConfig>
    </React.StrictMode>,
  );
} else {
  root.textContent = "Add #drawer-harness to the URL to mount the drawer harness.";
}
