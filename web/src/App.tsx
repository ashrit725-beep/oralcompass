import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { FOOTER, NAV, PASSAGE, TAGLINE, UI, type LandmarkId } from "@/lib/copy";
import { defaultCompareColumns } from "@/lib/appData";
import type { Stitch } from "@/lib/types";
import { useAppData } from "@/hooks/useAppData";
import { useJourneySelection } from "@/hooks/useJourneySelection";
import { useKeyboardInset, useTabChangeReset } from "@/hooks/useNativeShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dock, DockIcon } from "@/components/eldoraui/dock";
import { AssistDataProvider } from "@/components/assistant/AssistData";
import { AskDockLazy as AskDock, preloadAssistant } from "@/components/assistant/lazy";
import { askBoxScope } from "@/lib/assistant";
import { useMeasuredVar } from "@/hooks/useAskKeyboardInset";
import { ClauseCard } from "@/components/ClauseCard";
import { CompareView } from "@/components/CompareView";
import { DocumentsView } from "@/components/DocumentsView";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NavIcon } from "@/components/NavIcon";
import { StageLoader } from "@/components/StageLoader";
import { ViewSwitch } from "@/components/ViewSwitch";
import { JourneyView } from "@/views/JourneyView";
import { PlanView } from "@/views/PlanView";

type Tab = keyof typeof NAV;
preloadAssistant();
const TABS = Object.keys(NAV) as Tab[];

/**
 * OralCompass — "Your care journey. Your coverage. Clearly mapped."
 * The shell (spec §6): data from `useAppData`, selection from `useJourneySelection`, navigation as shadcn Tabs (line variant, 44 px,
 * `motion.span layoutId="nav-underline"` glides between tabs — it snaps under reduced motion), one `ViewSwitch` for the four views,
 * the error and loading banners, the ClauseCard and the footer. `<MotionConfig reducedMotion="user">` wraps the app in main.tsx.
 * Mobile-only (owner direction 2026-10-04, "its fully a mobile app"): the phone layout is the only layout. The four tab triggers sit in the
 * bottom dock (Eldora UI dock, orchestrator note 7) with an icon and a visible label at every width; on a window wider than 480 px the same
 * phone app renders in the centred `.app` column and the painted journey backdrop fills the window behind it (`.cinema`, decorative).
 * A tab change opens the new view at the top and, after a tap on the dock, focuses its heading (useTabChangeReset, note 19a); the
 * on-screen keyboard never covers a field (useKeyboardInset).
 * Landmarks (a11y-4): `<main id="main">` always exists and holds the tab panel, which is not a tab stop of its own (it always contains
 * focusable content); a "Skip to content" link reaches it on every view.
 * Everything shown is information: what the documents say, what your records say, what the arithmetic yields.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>("journey");
  const { onDockPointerDown } = useTabChangeReset(tab);
  useKeyboardInset();
  const data = useAppData({ planNeeded: tab !== "journey" });
  const selection = useJourneySelection(data.view);
  const [landmark, setLandmark] = useState<LandmarkId | null>(null);
  const [stitch, setStitch] = useState<Stitch | undefined>();

  function openLandmark(id: LandmarkId) { setLandmark(id); setTab("plan"); }
  function openDocuments() { setTab("documents"); }
  // stable callbacks: ClauseCard's Escape listener must not re-subscribe (and restore focus) on every App render (web-correctness-15)
  const closeStitch = useCallback(() => setStitch(undefined), []);
  const openOnPage = useCallback((s: Stitch) => { setStitch(s); setTab("documents"); }, []);
  const { plans, planRef, selectPlan, items, benefits, evidence, stitches, estimate, loading, error, retry, resetPrivate } = data;
  const dockRef = useRef<HTMLDivElement>(null);
  useMeasuredVar(dockRef, "--dock-h", true);
  // "Ask in plain words" on every tab: the journey-level scope (plan + the journey's estimate + the journey, no line)
  // the ask box never compares plans (owner): its scope is one plan; the Compare tab's columns no longer reach it
  const [, setCompared] = useState<string[]>([]);
  const askScope = useMemo(() => askBoxScope(planRef, estimate, data.view?.id), [planRef, estimate, data.view?.id]);
  const openStitchById = useCallback((id: string) => { const s = stitches.find((x) => x.id === id); if (s) setStitch(s); }, [stitches]);

  const list = (
    <TabsList variant="line" className="dock-list grid! h-auto! w-full grid-cols-4 gap-1">
      {TABS.map((t) => (
        <DockIcon key={t}>
          <TabsTrigger value={t} className="relative h-auto! min-h-[52px] w-full flex-col gap-0.5 rounded-xl px-1 py-1 text-[12.5px] leading-tight after:hidden">
            <NavIcon tab={t} />
            <span>{NAV[t]}</span>
            {tab === t && <motion.span layoutId="nav-underline" aria-hidden="true" className="absolute inset-x-5 -top-[5px] h-0.5 rounded-full bg-gold" transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }} />}
          </TabsTrigger>
        </DockIcon>
      ))}
    </TabsList>
  );
  // web-correctness-34: the assistant resolves refs against the payloads the shell already holds (no refetch per question)
  const assistValue = useMemo(() => ({ planRef, estimate, plan: data.plan, benefits: benefits.find((b) => b.plan_code === planRef) ?? null, rules: data.rules, items, stitches }),
    [planRef, estimate, data.plan, benefits, data.rules, items, stitches]);

  return (
    <AssistDataProvider value={assistValue}>
    {/* the cinema: on windows wider than the app column, the painting fills the window behind the phone app (decorative; styles.css) */}
    <div className="cinema" aria-hidden="true" />
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="app gap-0">
      <a href="#main" className="skip-link">{UI.skipToContent}</a>
      {/* the target exists in every segment of a loaded journey (map: the chart's controls; care timeline and overview: their content) */}
      {tab === "journey" && data.view && <a href="#passage-islands" className="skip-link">{PASSAGE.skipToRoute}</a>}
      <header className="appbar">
        <div className="brand"><h1>{UI.appName}</h1><p className="tagline">{TAGLINE}</p></div>
        <div className="topnav"><Dock aria-label={UI.viewsLabel} ref={dockRef} onPointerDownCapture={onDockPointerDown}>{list}</Dock></div>
        {data.view?.is_sample && <span className="ribbon" role="note">{UI.sampleRibbon}</span>}
      </header>
      {error && <div className="error" role="alert"><p>{error}</p><button type="button" onClick={() => void retry()}>{UI.retry}</button></div>}
      {/* an overlay, not an in-flow row: it appearing and leaving must not move the page (mobile-18) */}
      {loading && <div className="processing"><StageLoader label={loading} size="sm" /></div>}

      <main id="main" tabIndex={-1} className={`view view-${tab} is-mobile`}>
        <TabsContent value={tab} forceMount tabIndex={-1} className="view-panel">
          <ViewSwitch index={TABS.indexOf(tab)}>
            <div data-view="journey" className="view-pane">
              <ErrorBoundary label={NAV.journey} resetKey={tab}>
                <JourneyView data={data} selection={selection} onOpenLandmark={openLandmark} onOpenDocuments={openDocuments} onSelectStitch={setStitch} />
              </ErrorBoundary>
            </div>
            <div data-view="plan" className="view-pane">
              <ErrorBoundary label={NAV.plan} resetKey={tab}>
                <PlanView data={data} landmark={landmark} onLandmark={setLandmark} stitch={stitch} onStitch={setStitch} onOpenDocuments={openDocuments} />
              </ErrorBoundary>
            </div>
            <div data-view="compare" className="view-pane">
              <ErrorBoundary label={NAV.compare} resetKey={tab}>
                <CompareView plans={plans} items={items} benefits={benefits} initial={defaultCompareColumns(planRef, plans)} onColumns={setCompared} />
              </ErrorBoundary>
            </div>
            <div data-view="documents" className="view-pane">
              <ErrorBoundary label={NAV.documents} resetKey={tab}>
                <DocumentsView planCode={planRef} plans={plans} onPlan={selectPlan} evidence={evidence} stitches={stitches} selected={stitch} onSelect={setStitch}
                               onRetry={() => { void resetPrivate(); }} />
              </ErrorBoundary>
            </div>
          </ViewSwitch>
        </TabsContent>
      </main>

      {stitch && <ClauseCard stitch={stitch} lines={estimate?.ledger.lines ?? []} askScope={{ plan_ref: planRef, stitch: `${stitch.doc}#p${stitch.page}`, estimate_id: estimate?.id }} onClose={closeStitch} onOpenOnPage={openOnPage} />}
      <AskDock tab={tab} scope={askScope} onOpenStitch={openStitchById} />
      <footer className="footer">{FOOTER}</footer>
    </Tabs>
    </AssistDataProvider>
  );
}
