import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { FOOTER, NAV, PASSAGE, TAGLINE, UI, type LandmarkId } from "@/lib/copy";
import { defaultCompareColumns } from "@/lib/appData";
import type { Stitch } from "@/lib/types";
import { useAppData } from "@/hooks/useAppData";
import { useJourneySelection } from "@/hooks/useJourneySelection";
import { useMobile } from "@/hooks/useMobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dock, DockIcon } from "@/components/eldoraui/dock";
import { AssistDataProvider } from "@/components/assistant/AssistData";
import { AskBoxSlotLazy as AskBoxSlot, AskDockLazy as AskDock, preloadAssistant } from "@/components/assistant/lazy";
import { askBoxScope } from "@/lib/assistant";
import { useMeasuredVar } from "@/hooks/useKeyboardInset";
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
 * Phones (≤ 760 px): the SAME tab triggers sit in a bottom dock (Eldora UI dock, orchestrator note 7) with an icon and a visible label;
 * the DOM order is unchanged, so keyboard order and the tab names are the same on every width.
 * Landmarks (a11y-4): `<main id="main">` always exists and holds the tab panel, which is not a tab stop of its own (it always contains
 * focusable content); a "Skip to content" link reaches it on every view.
 * Everything shown is information: what the documents say, what your records say, what the arithmetic yields.
 */
export default function App() {
  const mobile = useMobile();
  const [tab, setTab] = useState<Tab>("journey");
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
  useMeasuredVar(dockRef, "--dock-h", mobile);
  // "Ask in plain words" on every tab: the journey-level scope (plan + the journey's estimate + the journey, no line)
  const askScope = useMemo(() => askBoxScope(planRef, estimate, data.view?.id), [planRef, estimate, data.view?.id]);
  const openStitchById = useCallback((id: string) => { const s = stitches.find((x) => x.id === id); if (s) setStitch(s); }, [stitches]);
  const askSlot = (t: Tab) => <AskBoxSlot mobile={mobile} tab={t} scope={askScope} onOpenStitch={openStitchById} fallback={mobile || !askScope ? null : <div className="askbox-pending" aria-hidden="true" />} />;

  const list = (
    <TabsList variant="line" className={mobile ? "dock-list grid! h-auto! w-full grid-cols-4 gap-1" : "h-11 w-full justify-between gap-0 md:w-auto md:justify-start md:gap-1"}>
      {TABS.map((t) => {
        const trigger = (
          <TabsTrigger key={t} value={t}
                       className={mobile
                         ? "relative h-auto! min-h-[52px] w-full flex-col gap-0.5 rounded-xl px-1 py-1 text-[12.5px] leading-tight after:hidden"
                         : "relative min-w-0 flex-1 rounded-full px-1.5 text-[15px] after:hidden md:min-w-[90px] md:flex-none md:px-3 md:text-base"}>
            {mobile && <NavIcon tab={t} />}
            <span>{NAV[t]}</span>
            {tab === t && <motion.span layoutId="nav-underline" aria-hidden="true" className={mobile ? "absolute inset-x-5 -top-[5px] h-0.5 rounded-full bg-gold" : "absolute inset-x-3 -bottom-[3px] h-0.5 rounded-full bg-gold"} transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }} />}
          </TabsTrigger>
        );
        return mobile ? <DockIcon key={t}>{trigger}</DockIcon> : trigger;
      })}
    </TabsList>
  );
  // web-correctness-34: the assistant resolves refs against the payloads the shell already holds (no refetch per question)
  const assistValue = useMemo(() => ({ planRef, estimate, plan: data.plan, benefits: benefits.find((b) => b.plan_code === planRef) ?? null, rules: data.rules, items, stitches }),
    [planRef, estimate, data.plan, benefits, data.rules, items, stitches]);

  return (
    <AssistDataProvider value={assistValue}>
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="app gap-0">
      <a href="#main" className="skip-link">{UI.skipToContent}</a>
      {/* the target exists in every segment of a loaded journey (map: the chart's controls; care timeline and overview: their content) */}
      {tab === "journey" && data.view && <a href="#passage-islands" className="skip-link">{PASSAGE.skipToRoute}</a>}
      <header className="appbar">
        <div className="brand"><h1>{UI.appName}</h1><p className="tagline">{TAGLINE}</p></div>
        <div className="topnav">{mobile ? <Dock ref={dockRef} aria-label={UI.viewsLabel}>{list}</Dock> : list}</div>
        {data.view?.is_sample && <span className="ribbon" role="note">{UI.sampleRibbon}</span>}
      </header>
      {error && <div className="error" role="alert"><p>{error}</p><button type="button" onClick={() => void retry()}>{UI.retry}</button></div>}
      {/* an overlay, not an in-flow row: it appearing and leaving must not move the page (mobile-18) */}
      {loading && <div className="processing"><StageLoader label={loading} size="sm" /></div>}

      <main id="main" tabIndex={-1} className={`view view-${tab} ${mobile ? "is-mobile" : ""}`}>
        <TabsContent value={tab} forceMount tabIndex={-1} className="view-panel">
          <ViewSwitch index={TABS.indexOf(tab)}>
            <ErrorBoundary label={NAV.journey} resetKey={tab}>
              <JourneyView data={data} selection={selection} mobile={mobile} onOpenLandmark={openLandmark} onOpenDocuments={openDocuments} onSelectStitch={setStitch} askSlot={askSlot("journey")} />
            </ErrorBoundary>
            <ErrorBoundary label={NAV.plan} resetKey={tab}>
              <PlanView data={data} mobile={mobile} landmark={landmark} onLandmark={setLandmark} stitch={stitch} onStitch={setStitch} onOpenDocuments={openDocuments} askSlot={askSlot("plan")} />
            </ErrorBoundary>
            <ErrorBoundary label={NAV.compare} resetKey={tab}>
              <CompareView plans={plans} items={items} benefits={benefits} initial={defaultCompareColumns(planRef, plans)} askSlot={askSlot("compare")} />
            </ErrorBoundary>
            <ErrorBoundary label={NAV.documents} resetKey={tab}>
              <DocumentsView planCode={planRef} plans={plans} onPlan={selectPlan} evidence={evidence} stitches={stitches} selected={stitch} onSelect={setStitch}
                             onRetry={() => { void resetPrivate(); }} askSlot={askSlot("documents")} />
            </ErrorBoundary>
          </ViewSwitch>
        </TabsContent>
      </main>

      {stitch && <ClauseCard stitch={stitch} lines={estimate?.ledger.lines ?? []} askScope={{ plan_ref: planRef, stitch: `${stitch.doc}#p${stitch.page}`, estimate_id: estimate?.id }} onClose={closeStitch} onOpenOnPage={openOnPage} />}
      {mobile && <AskDock tab={tab} scope={askScope} onOpenStitch={openStitchById} />}
      <footer className="footer">{FOOTER}</footer>
    </Tabs>
    </AssistDataProvider>
  );
}
