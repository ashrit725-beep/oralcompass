import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const banned = /from\s+["'](framer-motion|gsap|@gsap\/react|react-spring|@react-spring\/web|animejs)["']/;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(t|j)sx?$/.test(f) ? [p] : []; });
const hits = walk("src").filter((p) => banned.test(readFileSync(p, "utf8")));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = ["framer-motion", "gsap", "@gsap/react", "react-spring", "@react-spring/web", "animejs", "motion-plus"]
  .filter((n) => (pkg.dependencies ?? {})[n] || (pkg.devDependencies ?? {})[n]);
if (hits.length || declared.length) { console.error("second animation engine:", { hits, declared }); process.exit(1); }
if (!(pkg.dependencies ?? {}).motion) { console.error("motion is not declared"); process.exit(1); }
console.log("OK-one-engine");
