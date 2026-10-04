#!/usr/bin/env python3
"""Data audit: what exists, what is missing, what is unsupported — across plans, procedures, coverage rules, fees, documents,
users, journeys and their relationships. Writes fixtures/audit_report.json and docs/DATA_AUDIT.md.

Checks: identifier integrity (every class_of / frequency / excluded / treatment-item key is an internal procedure key), duplicate ids,
records without a source, fields left UNKNOWN/AMBIGUOUS/CONFLICT in real presets, documents that may be outdated for the plan
year, mappings flagged for review, benchmark coverage, fictional data labeling, and relationship integrity (journeys → users →
treatment items → documents).  Run: python3 tools/audit_data.py
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "fixtures"
sys.path.insert(0, str(ROOT / "engine"))
from oralcompass_engine import load_plan  # noqa: E402

TODAY = date(2026, 10, 3)
PLAN_YEAR = 2026


def jload(p: Path):
    return json.loads(p.read_text())


def main() -> int:
    procedures = jload(FIX / "procedures.json")["items"]
    keys = [p["key"] for p in procedures]
    findings: list[dict] = []
    add = lambda sev, area, record, issue, detail="": findings.append({"severity": sev, "area": area, "record": record, "issue": issue, "detail": detail})

    # ---- procedures ----
    dup = [k for k, n in Counter(keys).items() if n > 1]
    for k in dup:
        add("high", "procedures", k, "duplicate procedure key")
    for p in procedures:
        if "(fictional)" in (p.get("fee_source") or ""):
            add("info", "procedures", p["key"], "dentist fee is a fictional demo figure", p["fee_source"])
        if "varies" in (p.get("category_hint") or ""):
            add("info", "procedures", p["key"], "category varies by plan — class must come from each plan document", p["category_hint"])

    # ---- plans ----
    plans = {}
    for path in sorted((FIX / "plans").glob("*.json")):
        j = jload(path); plans[j["plan_code"]] = (path, j)
    codes_dup = [c for c, n in Counter(j["plan_code"] for _, j in plans.values()).items() if n > 1]
    for c in codes_dup:
        add("high", "plans", c, "duplicate plan_code")
    real, fictional = [], []
    for code, (path, j) in plans.items():
        (fictional if j.get("is_fictional") else real).append(code)
        src = j.get("source_document", {})
        if not src.get("url") and not src.get("path"):
            add("high", "plans", code, "no source document (url or stored path)")
        if not src.get("sha256"):
            add("medium", "plans", code, "source document SHA-256 not recorded", src.get("sha256_note", ""))
        if not j.get("is_fictional") and not src.get("path"):
            add("medium", "plans", code, "source PDF not stored locally — Page view falls back to quote + page reference + link", "binary download blocked in the build environment")
        cat = j.get("catalog", {})
        py = cat.get("plan_year")
        if py and py < PLAN_YEAR and not j.get("is_fictional"):
            add("medium", "plans", code, f"document plan year {py} is older than {PLAN_YEAR} — possibly outdated", cat.get("currency_note", ""))
        for k in list(j.get("class_of", {})) + [f["procedure_key"] for f in j.get("frequency", [])] + list(j.get("excluded", {})) + list(j.get("allowed_amounts", {})):
            if k not in keys:
                add("high", "plans", code, f"unsupported mapping: '{k}' is not an internal procedure key")
        class_names = {c["name"] for c in j.get("classes", [])}
        for k, v in j.get("class_of", {}).items():
            if v.get("value") is not None and v["value"] not in class_names:
                add("high", "plans", code, f"class_of.{k} → '{v['value']}' has no class rule")
            if v.get("status") in ("AMBIGUOUS", "UNKNOWN", "CONFLICT"):
                add("info", "plans", code, f"class_of.{k} is {v['status']}", (v.get("note") or "")[:160])
        missing = [k for k in keys if k not in j.get("class_of", {}) and k not in j.get("excluded", {})]
        if missing:
            add("medium", "plans", code, "procedures with no class or exclusion in this plan (estimates for them are unresolved)", ", ".join(missing))
        for field in ("deductible_individual", "deductible_family", "annual_max", "waiting_months", "benefit_year_start_month", "dos_rule", "oon_rule"):
            v = j.get(field)
            if isinstance(v, dict) and v.get("status") in ("UNKNOWN", "AMBIGUOUS", "CONFLICT"):
                add("info", "plans", code, f"{field} is {v['status']}", (v.get("note") or "")[:160])
        ab = j.get("alternate_benefit", {})
        if ab.get("status") == "UNKNOWN":
            add("info", "plans", code, "alternate_benefit UNKNOWN", (ab.get("note") or "")[:160])
        mt = j.get("missing_tooth", {})
        if mt.get("status") == "UNKNOWN":
            add("info", "plans", code, "missing_tooth clause UNKNOWN", (mt.get("note") or "")[:120])
        if not j.get("allowed_amounts"):
            add("info", "plans", code, "no allowed amounts (fee schedule) in the document — user must supply allowed amounts", j.get("allowed_amounts_note", "")[:160])
        for k, v in j.get("premium_monthly", {}).items():
            if v.get("status") != "DOC":
                add("info", "plans", code, f"premium {k} is {v.get('status')}", (v.get("note") or "")[:160])
        if j.get("conflicts"):
            add("info", "plans", code, f"{len(j['conflicts'])} documented conflict(s) preserved", "; ".join(c.get("field", "") for c in j["conflicts"])[:200])
        try:
            load_plan(path)
        except Exception as ex:  # noqa: BLE001
            add("high", "plans", code, "fixture does not load", repr(ex))

    # ---- procedure codes & benchmarks ----
    pc = jload(FIX / "procedure_codes.json") if (FIX / "procedure_codes.json").exists() else {"items": []}
    for it in pc["items"]:
        if not it["primary_code"]:
            add("medium", "procedure_codes", it["procedure_key"], "no external code found in any opened document")
        elif it["review_required"]:
            add("info", "procedure_codes", it["procedure_key"], "mapping requires review", f"codes seen: {', '.join(it['distinct_codes_seen'])}")
    fb = jload(FIX / "fee_benchmarks.json") if (FIX / "fee_benchmarks.json").exists() else {"rows": []}
    absent = [r["code"] for r in fb["rows"] if r["status"] != "DOC"]
    if absent:
        add("info", "fee_benchmarks", "NC Medicaid", "codes absent from the published schedule (no benchmark)", ", ".join(absent))
    covered_keys = set()
    for r in fb["rows"]:
        if r["status"] == "DOC":
            covered_keys.update(r["mapped_internal_keys"])
    for k in keys:
        if k not in covered_keys:
            add("info", "fee_benchmarks", k, "no published benchmark row maps to this procedure")

    # ---- documents ----
    extraction_fixtures = [jload(p) for p in sorted((FIX / "extractions").glob("*.json"))] if (FIX / "extractions").is_dir() else []
    for path in sorted((FIX / "documents").glob("*.pdf")):
        owner = [c for c, (_, j) in plans.items() if (j.get("source_document", {}).get("path") or "").endswith(path.name)]
        owner += [j["source_document"]["path"] for j in extraction_fixtures if (j.get("source_document", {}).get("path") or "").endswith(path.name)]
        if not owner:
            add("medium", "documents", path.name, "stored PDF not referenced by any plan")
    # ---- users / journeys relationships ----
    users = {p.stem: jload(p) for p in sorted((FIX / "users").glob("*.json"))}
    for uid, u in users.items():
        docs = {d["id"] for d in u.get("documents", [])}
        items = {t["id"] for t in u.get("treatment_items", [])}
        plan_code = u.get("benefits", {}).get("plan_code")
        if plan_code and plan_code not in plans:
            add("high", "users", uid, f"benefits.plan_code '{plan_code}' is not a preset")
        for t in u.get("treatment_items", []):
            if t.get("procedure_key") not in keys:
                add("high", "users", uid, f"treatment item {t.get('id')} has unknown procedure_key '{t.get('procedure_key')}'")
            if t.get("allowed_amount", {}).get("status") == "UNKNOWN":
                add("info", "users", uid, f"treatment item {t.get('id')}: allowed amount unknown (dentist fee and allowed amount kept separate)")
        for c in u.get("benefits", {}).get("claims", []):
            if c.get("procedure_key") and c["procedure_key"] not in keys:
                add("high", "users", uid, f"claim {c.get('id')} unknown procedure_key '{c.get('procedure_key')}'")
        b = u.get("benefits", {})
        if b and not b.get("source"):
            add("medium", "users", uid, "benefits usage has no source/date")
        for jp in sorted((FIX / "journeys").glob("*.json")):
            jj = jload(jp)
            if jj.get("user_ref") != uid:
                continue
            for s in jj.get("stages", []):
                for ti in s.get("linked_treatment_items", []):
                    if ti not in items:
                        add("high", "journeys", jj["id"], f"stage {s['id']} links missing treatment item {ti}")
                for c in s.get("checkpoints", []):
                    d = (c.get("links") or {}).get("document")
                    if d and d not in docs:
                        add("high", "journeys", jj["id"], f"checkpoint {c['id']} links missing document {d}")
                    if c.get("status") == "completed" and not c.get("completed_by"):
                        add("medium", "journeys", jj["id"], f"checkpoint {c['id']} completed without attribution (user vs dental team)")
                    if c.get("date") and not (c["date"] or {}).get("source"):
                        add("medium", "journeys", jj["id"], f"checkpoint {c['id']} date without source")
                if s.get("instructions") and not (s["instructions"] or {}).get("source"):
                    add("high", "journeys", jj["id"], f"stage {s['id']} has instructions without a dental-team source")

    sev = Counter(f["severity"] for f in findings)
    report = {"date": TODAY.isoformat(), "counts": {"procedures": len(keys), "plans": len(plans), "real_plans": sorted(real), "fictional_plans": sorted(fictional),
                                                     "users": len(users), "journeys": len(list((FIX / "journeys").glob("*.json"))), "documents_stored": len(list((FIX / "documents").glob("*.pdf"))),
                                                     "procedure_codes_mapped": sum(1 for it in pc["items"] if it["primary_code"]), "benchmark_rows": len(fb["rows"])},
              "findings_by_severity": dict(sev), "findings": findings}
    (FIX / "audit_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")

    md = ["# OralCompass data audit", "", f"Generated {TODAY.isoformat()} by `tools/audit_data.py` (re-run after any fixture change).", "",
          "## Inventory", ""]
    for k, v in report["counts"].items():
        md.append(f"- {k}: {v if not isinstance(v, list) else ', '.join(v) or '—'}")
    md += ["", "## Findings by severity", ""] + [f"- {k}: {v}" for k, v in sorted(sev.items())] + ["", "## Findings", "", "| severity | area | record | issue | detail |", "|---|---|---|---|---|"]
    for f in sorted(findings, key=lambda f: ({"high": 0, "medium": 1, "info": 2}[f["severity"]], f["area"], f["record"])):
        md.append(f"| {f['severity']} | {f['area']} | {f['record']} | {f['issue']} | {str(f['detail']).replace('|', '/')} |")
    (ROOT / "docs" / "DATA_AUDIT.md").write_text("\n".join(md) + "\n")
    print(json.dumps({"counts": report["counts"], "findings_by_severity": report["findings_by_severity"]}, indent=1))
    high = [f for f in findings if f["severity"] == "high"]
    for f in high:
        print("HIGH:", f)
    return 1 if high else 0


if __name__ == "__main__":
    sys.exit(main())
