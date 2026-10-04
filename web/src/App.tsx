import { useState } from "react";
import { motion } from "motion/react";
import { FOOTER, NAV, PASSAGE, TAGLINE, UI, type LandmarkId } from "@/lib/copy";
import type { Stitch } from "@/lib/types";
import { useAppData } from "@/hooks/useAppData";
import { useJourneySelection } from "@/hooks/useJourneySelection";
import { useMobile } from "@/hooks/useMobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClauseCard } from "@/components/ClauseCard";
import { CompareView } from "@/components/CompareView";
import { DocumentsView } from "@/components/DocumentsView";
import { StageLoader } from "@/components/StageLoader";
import { ViewSwitch } from "@/components/ViewSwitch";
import { JourneyView } from "@/views/JourneyView";
import { PlanView } from "@/views/PlanView";

type Tab = keyof typeof NAV;
const TABS = Object.keys(NAV) as Tab[];

/**
 * OralCompass — "Your care journey. Your coverage. Clearly mapped."
 * The shell (spec §6): data from `useAppData`, selection from `useJourneySelection`, navigation as shadcn Tabs (line variant, 44 px,
 * `motion.span layoutId="nav-underline"` glides between tabs — it snaps under reduced motion), one `ViewSwitch` for the four views,
 * the error and loading banners, the ClauseCard and the footer. `<MotionConfig reducedMotion="user">` wraps the app in main.tsx.
 * Everything shown is information: what the documents say, what your records say, what the arithmetic yields.
 */
export default function App() {
  const mobile = useMobile();
  const data = useAppData();
  const selection = useJourneySelection(data.view);
  const [tab, setTab] = useState<Tab>("journey");
  const [landmark, setLandmark] = useState<LandmarkId | null>(null);
  const [stitch, setStitch] = useState<Stitch | undefined>();

  function openLandmark(id: LandmarkId) { setLandmark(id); setTab("plan"); }
  function openDocuments() { setTab("documents"); }
  const { plans, planRef, selectPlan, items, benefits, evidence, stitches, estimate, loading, error, loadBase } = data;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="app gap-0">
      {/* the target exists in every segment of a loaded journey (map: the chart's controls; care timeline and overview: their content) */}
      {tab === "journey" && data.view && <a href="#passage-islands" className="skip-link">{PASSAGE.skipToRoute}</a>}
      <header className="appbar">
        <div className="brand"><h1>{UI.appName}</h1><p className="tagline">{TAGLINE}</p></div>
        <nav className="topnav" aria-label="Views">
          <TabsList variant="line" className="h-11 w-full justify-between gap-0 md:w-auto md:justify-start md:gap-1">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} aria-current={tab === t ? "page" : undefined} className="relative min-w-0 flex-1 rounded-full px-1.5 text-[15px] after:hidden md:min-w-[90px] md:flex-none md:px-3 md:text-base">
                {NAV[t]}
                {tab === t && <motion.span layoutId="nav-underline" aria-hidden="true" className="absolute inset-x-3 -bottom-[3px] h-0.5 rounded-full bg-gold" transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }} />}
              </TabsTrigger>
            ))}
          </TabsList>
        </nav>
        {data.view?.is_sample && <span className="ribbon" role="note">{UI.sampleRibbon}</span>}
      </header>
      {error && <div className="error" role="alert"><p>{error}</p><button type="button" onClick={() => loadBase()}>{UI.retry}</button></div>}
      {loading && <div className="processing"><StageLoader label={loading} size="sm" /></div>}

      <TabsContent value={tab} forceMount asChild>
        <main className={`view view-${tab} ${mobile ? "is-mobile" : ""}`}>
          <ViewSwitch index={TABS.indexOf(tab)}>
            <JourneyView data={data} selection={selection} mobile={mobile} onOpenLandmark={openLandmark} onOpenDocuments={openDocuments} onSelectStitch={setStitch} />
            <PlanView data={data} mobile={mobile} landmark={landmark} onLandmark={setLandmark} stitch={stitch} onStitch={setStitch} onOpenDocuments={openDocuments} />
            <CompareView plans={plans} items={items} benefits={benefits} initial={[planRef, ...plans.map((p) => p.plan_code).filter((c) => c !== planRef)].slice(0, 3)} />
            <DocumentsView planCode={planRef} plans={plans} onPlan={selectPlan} evidence={evidence} stitches={stitches} selected={stitch} onSelect={setStitch}
                           onRetry={() => { data.setView(null); loadBase(); }} />
          </ViewSwitch>
        </main>
      </TabsContent>

      {stitch && <ClauseCard stitch={stitch} lines={estimate?.ledger.lines ?? []} askScope={{ plan_ref: planRef, stitch: `${stitch.doc}#p${stitch.page}`, estimate_id: estimate?.id }} onClose={() => setStitch(undefined)} onOpenOnPage={(s) => { setStitch(s); setTab("documents"); }} />}
      <footer className="footer">{FOOTER}</footer>
    </Tabs>
  );
}
