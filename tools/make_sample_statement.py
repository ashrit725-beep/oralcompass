#!/usr/bin/env python3
"""Build the FICTIONAL sample member benefits statement used by "Try a fictional sample statement" in the upload step.

Writes, from one set of constants plus fixtures/plans/tw26.json (the fictional Tidewater Dental Select 2026 plan):
  fixtures/documents/tw26_fictional_sample_statement.pdf      the statement (pymupdf, base-14 fonts, byte-for-byte reproducible)
  fixtures/extractions/tw26_fictional_sample_statement.json   the demo-mode extraction fixture, keyed by the PDF's SHA-256: every cite
                                                              is a quote printed in the statement, on the page it is printed on
  web/src/lib/__fixtures__/sample-statement-text.ts           the statement's text as pdf.js reads it + the 12 expected identifiers

Everything on the statement is invented. The person (Riley Okafor), the dependent (Jamie Okafor), the address, every number that
identifies someone, the plan and the carrier do not exist; the page says so in a ribbon on every page and in a notice, and the file
name and PDF metadata say so too (CLAUDE.md rules 8 and 9). The statement carries EXACTLY 12 distinct personal identifiers
(IDENTIFIERS below), repeated the way a real statement repeats them (a header on every page, a salutation, a benefits table), next to
text the AI needs and that must never be removed: the plan's real fixture numbers (deductible, annual maximum, coinsurance by class,
waiting period, frequency limits, exclusions), CDT codes, dollar amounts, percentages, tooth numbers, plan dates and the carrier's
toll-free number. The builder audits its own output: each identifier is present, and nothing else on the page has the shape of one.

Run:  python3 tools/make_sample_statement.py            (writes the three files and prints a summary)
      python3 tools/make_sample_statement.py --check    (rebuilds in memory; non-zero exit if a committed file differs)
Needs pymupdf; the text fixture also needs node and web/node_modules (pdfjs-dist).
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "fixtures" / "plans" / "tw26.json"
PROCEDURES_PATH = ROOT / "fixtures" / "procedures.json"
CODES_PATH = ROOT / "fixtures" / "procedure_codes.json"
PDF_NAME = "tw26_fictional_sample_statement.pdf"
PDF_PATH = ROOT / "fixtures" / "documents" / PDF_NAME
FIXTURE_PATH = ROOT / "fixtures" / "extractions" / "tw26_fictional_sample_statement.json"
TS_PATH = ROOT / "web" / "src" / "lib" / "__fixtures__" / "sample-statement-text.ts"
PDFJS_SCRIPT = ROOT / "tools" / "sample_statement_text.mjs"

# ---------------------------------------------------------------- the 12 personal identifiers (all invented)
# category names are the web detector's IdentifierCategory (web/src/lib/redact.ts); values are exactly as printed.
MEMBER = "Riley Okafor"
DEPENDENT = "Jamie Okafor"
STREET = "418 Larkspur Lane Apt 3B"
CITY = "Port Ellery, NC 28480"
MEMBER_ID = "TWS-4471902"
GROUP = "TW-058213"
DOB = "03/14/1988"
SSN = "987-65-4321"                 # inside 987-65-4320..4329, the range reserved for advertising: never issued
PHONE = "(910) 555-0147"            # 555-0100..0199: reserved for fictional use
EMAIL = "rokafor.home@example.com"  # example.com: reserved for documentation
CLAIM = "C26-0812-4471"
ACCOUNT = "AC-55120093"

IDENTIFIERS: list[dict] = [
    {"category": "name", "value": MEMBER},
    {"category": "name", "value": DEPENDENT},
    {"category": "address", "value": STREET},
    {"category": "address", "value": CITY},
    {"category": "member_id", "value": MEMBER_ID},
    {"category": "group_number", "value": GROUP},
    {"category": "dob", "value": DOB},
    {"category": "ssn", "value": SSN},
    {"category": "phone", "value": PHONE},
    {"category": "email", "value": EMAIL},
    {"category": "claim_number", "value": CLAIM},
    {"category": "account_number", "value": ACCOUNT},
]

# ---------------------------------------------------------------- text the AI needs: never an identifier
TOLL_FREE = "1-800-555-0134"        # the carrier's member services line (toll-free 800 number, 555-01xx fictional range)
STATEMENT_DATE = "September 15, 2026"
PERIOD_START, PERIOD_END = "July 1, 2026", "June 30, 2027"
SERVICE_DATE, RECEIVED_DATE, PROCESSED_DATE = "08/12/2026", "08/18/2026", "08/29/2026"
CARRIER = "Tidewater Benefit Trust (fictional)"
PLAN_NAME = "Tidewater Dental Select 2026"
DENTIST = "Northside Dental Group (fictional)"
CLAIM_LINES = [("exam", None), ("cleaning", None), ("bitewing_xrays", None), ("composite", "30")]    # one visit, procedure key + tooth
RIBBON = "FICTIONAL SAMPLE  ·  The person, the identifiers and the plan on this statement do not exist  ·  Made for the OralCompass demo"
FICTIONAL_NOTICE = ("This is a fictional sample statement made for the OralCompass demo. Tidewater Dental Select 2026 and Tidewater Benefit "
                    "Trust do not exist, and this is not an offer of insurance. The people named on it, Riley Okafor and Jamie Okafor, are "
                    "invented, and so is every detail that identifies them: names, address, member ID, group number, date of birth, Social "
                    "Security number, phone, email, claim number and account number.")
CLASS_I_SERVICES = ("Class I Preventive services include oral examinations, cleanings, bitewing x-rays, fluoride treatment for children, "
                    "and sealants for children under 16.")

# ---------------------------------------------------------------- page geometry and colors (base-14 fonts: Latin-1 text only)
W, H = 612, 792
ML, MR = 54, 54
CW = W - ML - MR
BODY_TOP, BODY_BOTTOM = 92, 736
INK = (0.12, 0.15, 0.19)
MUTED = (0.36, 0.40, 0.45)
TEAL = (0.05, 0.31, 0.36)
TEAL_TINT = (0.92, 0.955, 0.955)
AMBER = (0.99, 0.93, 0.78)
AMBER_INK = (0.42, 0.27, 0.02)
RULE = (0.78, 0.81, 0.84)
SANS, SANS_B, SERIF_B = "helv", "hebo", "tibo"


def money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- inputs from the fixtures (the plan's real numbers)
def load_inputs() -> dict:
    plan = json.loads(PLAN_PATH.read_text())
    assert plan["plan_code"] == "TW26" and plan["is_fictional"] is True, "the sample statement is built on the fictional TW26 plan"
    procs = {p["key"]: p for p in json.loads(PROCEDURES_PATH.read_text())["items"]}
    codes = {c["procedure_key"]: c for c in json.loads(CODES_PATH.read_text())["items"]}
    q = lambda d: d["cite"]["quote"]
    by_class = {c["name"]: c for c in plan["classes"]}
    return {
        "plan": plan, "procs": procs, "codes": codes,
        "effective": q(plan["catalog"]["effective_dates"]),
        "benefit_year": q(plan["benefit_year_start_month"]),
        "deductible": q(plan["deductible_individual"]),
        "classes": q(plan["classes"][0]["plan_share_bp_in"]),
        "annual_max": q(plan["annual_max"]),
        "class2": by_class["Class II"]["cite"]["quote"],
        "class3": by_class["Class III"]["cite"]["quote"],
        "waiting": q(plan["waiting_months"]),
        "frequency": plan["frequency"][0]["cite"]["quote"],
        "alt": q(plan["alternate_benefit"]),
        "network_in": plan["oon_rule"]["value"]["in"],
        "network_out": q(plan["oon_rule"]),
        "exclusions": next(iter(plan["excluded"].values()))["cite"]["quote"],
        "missing_tooth": q(plan["missing_tooth"]),
        "dos": q(plan["dos_rule"]),
        "fee_lines": {k: plan["allowed_amounts"][k]["cite"]["quote"] for k, _ in CLAIM_LINES},
    }


def claim_rows(inp: dict) -> tuple[list[dict], dict]:
    """The one claim on the statement, figured with the plan's own rules (integer cents): Class I waives the Deductible, the
    Deductible applies first otherwise, then the class coinsurance on the rest. In-network, so the charge above the Allowed Amount
    is not billed. Every division must be exact; the engine cross-check lives in api/tests/test_sample_statement.py."""
    plan, procs, codes = inp["plan"], inp["procs"], inp["codes"]
    shares = {c["name"]: c["plan_share_bp_in"]["value"] for c in plan["classes"]}
    ded_left = plan["deductible_individual"]["value"]
    rows = []
    for key, tooth in CLAIM_LINES:
        cls = plan["class_of"][key]["value"]
        allowed = plan["allowed_amounts"][key]["value"]
        charge = procs[key]["dentist_fee_cents"]
        ded = 0 if cls in plan["deductible_waived_classes"] else min(ded_left, allowed)
        ded_left -= ded
        assert ((allowed - ded) * shares[cls]) % 10000 == 0, f"{key}: plan share is not a whole number of cents"
        plan_paid = (allowed - ded) * shares[cls] // 10000
        rows.append({"key": key, "code": codes[key]["primary_code"], "service": procs[key]["name"], "tooth": tooth, "class": cls,
                     "share_bp": shares[cls], "charge": charge, "allowed": allowed, "deductible": ded, "plan": plan_paid,
                     "you": allowed - plan_paid})
    tot = {k: sum(r[k] for r in rows) for k in ("charge", "allowed", "deductible", "plan", "you")}
    assert tot["plan"] <= plan["annual_max"]["value"]
    tot["ded_ind"], tot["ded_fam"], tot["annual_max"] = (plan["deductible_individual"]["value"], plan["deductible_family"]["value"],
                                                         plan["annual_max"]["value"])
    return rows, tot


# ---------------------------------------------------------------- a small flowing layout on pymupdf
class Statement:
    def __init__(self) -> None:
        self.doc = pymupdf.open()
        self.page: pymupdf.Page | None = None
        self.y = 0.0
        self.quote_page: dict[str, int] = {}

    @property
    def pno(self) -> int:
        return self.doc.page_count

    def new_page(self) -> None:
        self.page = self.doc.new_page(width=W, height=H)
        self.page.draw_rect(pymupdf.Rect(0, 0, W, 26), color=None, fill=AMBER)
        self._center(RIBBON, 16.5, SANS_B, 7.6, AMBER_INK)
        if self.pno > 1:
            self.page.draw_rect(pymupdf.Rect(0, 26, W, 62), color=None, fill=TEAL_TINT)
            self.text(ML, 48, f"Member: {MEMBER}  ·  Member ID: {MEMBER_ID}  ·  Group number: {GROUP}", SANS, 8.6, INK)
            self.text_right(W - MR, 48, CARRIER, SANS_B, 8.6, TEAL)
        self.y = BODY_TOP if self.pno > 1 else 44

    def text(self, x: float, baseline: float, s: str, font: str = SANS, size: float = 10, color=INK) -> None:
        self.page.insert_text((x, baseline), s, fontname=font, fontsize=size, color=color)

    def text_right(self, right: float, baseline: float, s: str, font: str = SANS, size: float = 10, color=INK) -> None:
        self.text(right - pymupdf.get_text_length(s, fontname=font, fontsize=size), baseline, s, font, size, color)

    def _center(self, s: str, baseline: float, font: str, size: float, color) -> None:
        self.text((W - pymupdf.get_text_length(s, fontname=font, fontsize=size)) / 2, baseline, s, font, size, color)

    @staticmethod
    def wrap(s: str, font: str, size: float, width: float) -> list[str]:
        lines, cur = [], ""
        for word in s.split():
            cand = f"{cur} {word}" if cur else word
            if cur and pymupdf.get_text_length(cand, fontname=font, fontsize=size) > width:
                lines.append(cur)
                cur = word
            else:
                cur = cand
        return lines + ([cur] if cur else [])

    def ensure(self, h: float) -> None:
        if self.page is None or self.y + h > BODY_BOTTOM:
            self.new_page()

    def para_height(self, s: str, font: str = SANS, size: float = 10, width: float = CW, leading: float = 1.42) -> float:
        return len(self.wrap(s, font, size, width)) * size * leading

    def para(self, s: str, font: str = SANS, size: float = 10, color=INK, x: float = ML, width: float = CW, leading: float = 1.42,
             after: float = 7, quote: bool = False) -> None:
        lines = self.wrap(s, font, size, width)
        self.ensure(len(lines) * size * leading)
        for ln in lines:
            self.text(x, self.y + size, ln, font, size, color)
            self.y += size * leading
        self.y += after
        if quote:
            self.record(s)

    def record(self, quote: str) -> None:
        assert self.quote_page.get(quote, self.pno) == self.pno, f"quote printed on two pages: {quote[:60]}"
        self.quote_page[quote] = self.pno

    def heading(self, s: str, size: float = 14, keep_with: float = 40) -> None:
        self.ensure(size * 1.6 + keep_with)
        self.y += 6
        self.text(ML, self.y + size, s, SERIF_B, size, TEAL)
        self.y += size * 1.55

    def section(self, label: str, *sentences: str, quote: bool = True) -> None:
        """A bold label over one or more printed sentences, kept together on one page."""
        h = 16 + sum(self.para_height(s) + 6 for s in sentences)
        self.ensure(h)
        self.text(ML, self.y + 9.5, label, SANS_B, 9.5, TEAL)
        self.y += 15
        for s in sentences:
            self.para(s, after=6, quote=quote)
        self.y += 3

    def rule(self, gap: float = 8) -> None:
        self.page.draw_line(pymupdf.Point(ML, self.y), pymupdf.Point(W - MR, self.y), color=RULE, width=0.6)
        self.y += gap

    def footers(self) -> None:
        n = self.doc.page_count
        for i in range(n):
            self.page = self.doc[i]
            self.page.draw_line(pymupdf.Point(ML, 752), pymupdf.Point(W - MR, 752), color=RULE, width=0.5)
            self.text(ML, 766, f"{PLAN_NAME}  ·  Fictional sample statement", SANS, 7.6, MUTED)
            self.text_right(W - MR, 766, f"Page {i + 1} of {n}", SANS, 7.6, MUTED)

    def save(self, path: Path) -> None:
        self.doc.set_metadata({
            "title": f"{PLAN_NAME} member benefits statement (FICTIONAL SAMPLE)",
            "author": "OralCompass team (fictional document)",
            "subject": "Fictional sample: the person, every identifier, the plan and the carrier on this statement are invented",
            "keywords": "fictional, sample, demo, OralCompass",
            "creator": "tools/make_sample_statement.py", "producer": "OralCompass (pymupdf)",
            "creationDate": "D:20261004000000Z", "modDate": "D:20261004000000Z",
        })
        path.parent.mkdir(parents=True, exist_ok=True)
        self.doc.save(str(path), garbage=4, deflate=True, no_new_id=True)


def build_pdf(path: Path, inp: dict) -> dict[str, int]:
    rows, tot = claim_rows(inp)
    s = Statement()
    s.new_page()
    pg = s.page

    # ---- page 1: mailing address (window), carrier block, title, member details, salutation, benefits used
    for i, line in enumerate((MEMBER, STREET, CITY)):
        s.text(ML, 70 + i * 14, line, SANS, 10.5, INK)
    s.text_right(W - MR, 66, CARRIER, SANS_B, 11.5, TEAL)
    s.text_right(W - MR, 80, PLAN_NAME, SANS, 9.2, MUTED)
    s.text_right(W - MR, 94, f"member services, toll-free: {TOLL_FREE}", SANS, 9.2, INK)
    s.text_right(W - MR, 107, "Monday to Friday, 8 a.m. to 6 p.m. Eastern", SANS, 9.2, MUTED)
    s.y = 132
    s.text(ML, s.y + 24, "Your Benefits Statement", SERIF_B, 24, INK)
    s.y += 36
    s.text(ML, s.y + 10, f"Statement date: {STATEMENT_DATE}", SANS, 9.6, MUTED)
    s.text(ML + 200, s.y + 10, f"Coverage period: {PERIOD_START} through {PERIOD_END}", SANS, 9.6, MUTED)
    s.y += 24

    panel_top = s.y
    left = [("Member:", MEMBER), ("Member ID:", MEMBER_ID), ("Group number:", GROUP), ("Date of birth:", DOB), ("Social Security number:", SSN)]
    right = [("Home phone:", PHONE), ("Email:", EMAIL), ("Account number:", ACCOUNT), ("Dependent:", f"{DEPENDENT} (spouse)")]
    pg.draw_rect(pymupdf.Rect(ML, panel_top, W - MR, panel_top + 18 + 17 * len(left)), color=None, fill=TEAL_TINT)
    for col_x, pairs in ((ML + 12, left), (ML + 268, right)):
        yy = panel_top + 19
        for label, value in pairs:
            s.text(col_x, yy, label, SANS, 9, MUTED)
            s.text(col_x + pymupdf.get_text_length(label, fontname=SANS, fontsize=9) + 5, yy, value, SANS_B, 9.6, INK)
            yy += 17
    s.y = panel_top + 18 + 17 * len(left) + 18

    s.para(f"Dear {MEMBER}, this statement lists the claims processed for your household from {PERIOD_START} through {STATEMENT_DATE}, "
           f"and how much of this Policy Year's benefits each Covered Person has used. It is not a bill.", size=10.4, after=10)

    s.heading("Benefits used this Policy Year", 14, keep_with=110)
    cols = [ML, ML + 128, ML + 258, ML + 392]
    heads = ["Covered Person", "Deductible met", "Annual Maximum used", "Annual Maximum left"]
    pg.draw_rect(pymupdf.Rect(ML, s.y, W - MR, s.y + 20), color=None, fill=TEAL_TINT)
    for x, h_ in zip(cols, heads):
        s.text(x + 8, s.y + 13.5, h_, SANS_B, 8.8, TEAL)
    s.y += 20
    ded_ind, amax = tot["ded_ind"], tot["annual_max"]
    for who, ded_met, used in ((MEMBER, 0, 0), (DEPENDENT, tot["deductible"], tot["plan"])):
        vals = [who, f"{money(ded_met)} of {money(ded_ind)}", f"{money(used)} of {money(amax)}", money(amax - used)]
        for x, v in zip(cols, vals):
            s.text(x + 8, s.y + 14, v, SANS, 9.4, INK)
        s.y += 21
        s.rule(0)
    s.text(ML + 8, s.y + 14, "Family Deductible", SANS, 9.4, INK)
    s.text(cols[1] + 8, s.y + 14, f"{money(tot['deductible'])} of {money(tot['ded_fam'])}", SANS, 9.4, INK)
    s.y += 30
    s.para("One claim was processed in this period. Its details are on page 2, and the plan rules that produced each amount are on "
           "pages 3 and 4, as printed in your Certificate of Coverage.", size=9.6, color=MUTED)

    # ---- page 2: the claim
    s.new_page()
    pg = s.page
    s.heading("Claim detail", 18, keep_with=200)
    for label, value in (("Claim number:", CLAIM), ("Patient:", f"{DEPENDENT} (spouse)"),
                         ("Dentist:", f"{DENTIST}, a participating dentist in the Tidewater Choice network"),
                         ("Received:", f"{RECEIVED_DATE}  ·  Processed: {PROCESSED_DATE}")):
        s.text(ML, s.y + 10, label, SANS, 9.6, MUTED)
        s.text(ML + 74, s.y + 10, value, SANS_B, 9.6, INK)
        s.y += 16
    s.y += 10
    tcols = [(ML, 72, "Date of service", "l"), (ML + 72, 42, "Code", "l"), (ML + 114, 140, "Service", "l"), (ML + 254, 32, "Tooth", "l"),
             (ML + 286, 56, "Charged", "r"), (ML + 342, 54, "Allowed", "r"), (ML + 396, 54, "Plan paid", "r"), (ML + 450, 54, "You owe", "r")]
    pg.draw_rect(pymupdf.Rect(ML, s.y, W - MR, s.y + 22), color=None, fill=TEAL_TINT)
    for x, w, h_, al in tcols:
        if al == "r":
            s.text_right(x + w - 6, s.y + 14.5, h_, SANS_B, 8.2, TEAL)
        else:
            s.text(x + 6, s.y + 14.5, h_, SANS_B, 8.2, TEAL)
    s.y += 22
    for r in rows:
        svc = Statement.wrap(r["service"], SANS, 8.6, 140 - 12)
        rh = 8 + 11.5 * len(svc)
        cells = [SERVICE_DATE, r["code"], None, r["tooth"] or "", money(r["charge"]), money(r["allowed"]), money(r["plan"]), money(r["you"])]
        for (x, w, _h, al), v in zip(tcols, cells):
            if v is None:
                for j, ln in enumerate(svc):
                    s.text(x + 6, s.y + 13 + 11.5 * j, ln, SANS, 8.6, INK)
            elif v and al == "r":
                s.text_right(x + w - 6, s.y + 13, v, SANS, 8.6, INK)
            elif v:
                s.text(x + 6, s.y + 13, v, SANS, 8.6, INK)
        s.y += rh
        s.rule(0)
    s.text(ML + 6, s.y + 14, "Total for this claim", SANS_B, 8.8, INK)
    for (x, w, _h, _al), v in zip(tcols[4:], (tot["charge"], tot["allowed"], tot["plan"], tot["you"])):
        s.text_right(x + w - 6, s.y + 14, money(v), SANS_B, 8.8, INK)
    s.y += 34

    s.heading("How this claim was figured", 13, keep_with=120)
    composite = next(r for r in rows if r["deductible"])
    rest = composite["allowed"] - composite["deductible"]
    pct = composite["share_bp"] // 100
    s.para("Class I Preventive services (the evaluation, the cleaning and the bitewing x-rays): the Deductible is waived and the Plan "
           "paid 100% of the Allowed Amount.")
    s.para(f"Resin composite filling on tooth {composite['tooth']} ({composite['class']} Basic): {money(composite['deductible'])} of the "
           f"{money(composite['allowed'])} Allowed Amount went to the Deductible. The Plan paid {pct}% of the remaining {money(rest)}, "
           f"which is {money(composite['plan'])}. Your share is the {money(composite['deductible'])} Deductible plus {100 - pct}% of "
           f"{money(rest)}, {money(composite['you'])} in total.")
    s.para(f"{DENTIST} is a participating dentist, so the difference between its charges and the Allowed Amounts "
           f"({money(tot['charge'] - tot['allowed'])}) is not billed to you.")
    s.y += 6
    box_top = s.y
    pg.draw_rect(pymupdf.Rect(ML, box_top, W - MR, box_top + 34), color=None, fill=TEAL_TINT)
    s.text(ML + 12, box_top + 21.5, "Amount you owe the dentist for this claim", SANS_B, 10.5, INK)
    s.text_right(W - MR - 12, box_top + 22, money(tot["you"]), SERIF_B, 15, INK)
    s.y = box_top + 48

    # ---- pages 3 and 4: the plan rules, printed as the certificate words them (the demo extraction cites these)
    s.new_page()
    s.heading("Your plan at a glance", 18, keep_with=60)
    s.para(f"The rules below are printed as they appear in the {PLAN_NAME} Certificate of Coverage (fictional).", size=9.6, color=MUTED, after=10)
    s.section("Plan and dates", inp["effective"])
    s.section("Benefit Year", inp["benefit_year"])
    s.section("Deductible", inp["deductible"])
    s.section("Coinsurance", inp["classes"])
    shares = [(c["name"], c["plan_share_bp_in"]["value"] // 100) for c in inp["plan"]["classes"]]
    s.ensure(20 + 18 * len(shares))
    pg = s.page
    pg.draw_rect(pymupdf.Rect(ML, s.y, ML + 300, s.y + 18), color=None, fill=TEAL_TINT)
    for x, h_ in ((ML + 8, "Class"), (ML + 140, "Plan pays"), (ML + 230, "You pay")):
        s.text(x, s.y + 12.5, h_, SANS_B, 8.6, TEAL)
    s.y += 18
    for name, p in shares:
        for x, v in ((ML + 8, name), (ML + 140, f"{p}%"), (ML + 230, f"{100 - p}%")):
            s.text(x, s.y + 12.5, v, SANS, 9, INK)
        s.y += 17
    s.y += 8
    s.section("Annual Maximum", inp["annual_max"])
    s.section("Covered services", CLASS_I_SERVICES, inp["class2"], inp["class3"])
    s.section("Waiting periods", inp["waiting"])
    s.section("Frequency limits", inp["frequency"])
    s.section("Alternate benefit", inp["alt"])
    s.section("Participating and non-participating dentists", inp["network_in"], inp["network_out"])
    s.section("Exclusions", inp["exclusions"], inp["missing_tooth"])
    s.section("Date of service", inp["dos"])
    s.heading("Allowed Amounts for the services on this statement", 12, keep_with=80)
    for key, _t in CLAIM_LINES:
        s.para(inp["fee_lines"][key], after=3, quote=True)
    s.y += 6

    s.heading("Payments and questions", 12, keep_with=90)
    s.ensure(20)
    s.text(ML, s.y + 10, "Account number:", SANS, 9.6, MUTED)
    s.text(ML + 80, s.y + 10, ACCOUNT, SANS_B, 9.6, INK)
    s.y += 20
    s.para(f"This statement is not a bill. {DENTIST} bills you directly for the {money(tot['you'])} shown on page 2.")
    s.para(f"Questions about this statement: member services, toll-free {TOLL_FREE}, Monday to Friday, 8 a.m. to 6 p.m. Eastern.")
    s.y += 6
    h_notice = s.para_height(FICTIONAL_NOTICE, size=9.4, width=CW - 24) + 30
    s.ensure(h_notice)
    s.page.draw_rect(pymupdf.Rect(ML, s.y, W - MR, s.y + h_notice), color=None, fill=AMBER)
    s.text(ML + 12, s.y + 16, "About this sample", SANS_B, 9.6, AMBER_INK)
    s.y += 22
    s.para(FICTIONAL_NOTICE, size=9.4, color=AMBER_INK, x=ML + 12, width=CW - 24)

    s.footers()
    s.save(path)
    return dict(s.quote_page)


# ---------------------------------------------------------------- self-audit of the printed text
LABEL_CONTEXT = re.compile(r"\b(member|patient|dependent|dear|group|claim|account|policy|social security|date of birth|subscriber|insured|"
                           r"employee|policyholder|primary|name|attn|identification|grp|acct|dob|ssn|birth date)\b", re.I)
ALLOWED_AFTER = {
    "member": [r"\s*:\s*" + re.escape(MEMBER), r"\s+ID\s*:\s*" + re.escape(MEMBER_ID), r" services\b", r" ID, group number\b"],
    "patient": [r"\s*:\s*" + re.escape(DEPENDENT)],
    "dependent": [r"\s*:\s*" + re.escape(DEPENDENT)],
    "dear": [r" " + re.escape(MEMBER) + ","],
    "group": [r" number\s*:\s*" + re.escape(GROUP), r" \(fictional\)", r" number, date of birth"],
    "claim": [r" number\s*:\s*" + re.escape(CLAIM), r" detail\b", r" was figured\b", r" was processed\b", r" number and account\b",
              r" \$\d"],
    "account": [r" number\s*:\s*" + re.escape(ACCOUNT), r" number\."],
    "policy": [r" Year\b"],
    "social security": [r" number\s*:\s*" + re.escape(SSN), r" number, phone\b"],
    "date of birth": [r"\s*:\s*" + re.escape(DOB), r", Social Security\b"],
}
STREET_SUFFIX = re.compile(r"\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Ter|Cir)\b\.?", re.I)
PHONE_SHAPE = re.compile(r"(?<!\d)(?:1[-. ])?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?!\d)")
SSN_SHAPE = re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)")
CITY_SHAPE = re.compile(r"\b[A-Z][a-z]+(?: [A-Z][a-z]+){0,3}, [A-Z]{2} \d{5}(?:-\d{4})?\b")
EMAIL_SHAPE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
MUST_KEEP = [TOLL_FREE, PERIOD_START, PERIOD_END, STATEMENT_DATE, SERVICE_DATE, "D0120", "D1110", "D0274", "D2392", "$1,500", "$50 per Covered Person",
             "80%", "50%", "100%", "12 months", "twice per Policy Year", "60-month", "tooth 30", "member services", "Tidewater Choice network",
             "Class III Major services", "dental implants"]


def audit(pages: list[str], where: str) -> list[str]:
    """Problems with the printed text: an identifier missing, or anything else that has the shape of one."""
    problems = []
    flat = " ".join(collapse(p) for p in pages)
    for ident in IDENTIFIERS:
        if ident["value"] not in flat:
            problems.append(f"{where}: identifier missing: {ident['category']}")
    for shape, allowed, label in ((PHONE_SHAPE, {PHONE, TOLL_FREE}, "phone-shaped"), (SSN_SHAPE, {SSN}, "SSN-shaped"),
                                  (CITY_SHAPE, {CITY}, "city/state/ZIP-shaped"), (EMAIL_SHAPE, {EMAIL}, "email-shaped")):
        for m in shape.finditer(flat):
            if m.group(0) not in allowed:
                problems.append(f"{where}: unexpected {label} text: {m.group(0)!r}")
    suffixes = [m.start() for m in STREET_SUFFIX.finditer(flat)]
    streets = [m.start() + STREET.index("Lane") for m in re.finditer(re.escape(STREET), flat)]
    if suffixes != streets:
        problems.append(f"{where}: a street-suffix word appears outside the street address ({len(suffixes)} vs {len(streets)})")
    for m in LABEL_CONTEXT.finditer(flat):
        word = m.group(1).lower()
        after = flat[m.end():m.end() + 80]
        if not any(re.match(p, after) for p in ALLOWED_AFTER.get(word, [])):
            problems.append(f"{where}: identifier label '{m.group(1)}' in an unexpected context: {flat[m.start():m.end() + 40]!r}")
    for keep in MUST_KEEP:
        if keep not in flat:
            problems.append(f"{where}: text the AI needs is missing: {keep!r}")
    return problems


def occurrences(pages: list[str], value: str) -> tuple[int, list[int]]:
    pat = re.compile(re.escape(value), re.I)
    per = [len(pat.findall(collapse(p))) for p in pages]
    return sum(per), [i + 1 for i, n in enumerate(per) if n]


# ---------------------------------------------------------------- the extraction fixture (demo mode, keyed by SHA-256)
def extraction_fixture(inp: dict, sha: str, n_pages: int, quote_page: dict[str, int]) -> dict:
    plan = copy.deepcopy(inp["plan"])
    printed_fees = {k for k, _ in CLAIM_LINES}
    plan["allowed_amounts"] = {k: v for k, v in plan["allowed_amounts"].items() if k in printed_fees}   # only what the statement prints
    for k in ("premium_monthly", "security_test", "unsupported_rules"):        # premiums are not on a statement; no injected sentence here
        plan.pop(k, None)
    missing = []

    def remap(o):
        if isinstance(o, dict):
            if "quote" in o and "page" in o and isinstance(o["quote"], str):
                if o["quote"] not in quote_page:
                    missing.append(o["quote"])
                else:
                    o["page"] = quote_page[o["quote"]]
            for v in o.values():
                remap(v)
        elif isinstance(o, list):
            for v in o:
                remap(v)
    remap(plan)
    assert not missing, f"cited quotes not printed on the statement: {missing}"
    plan["title"] = f"{PLAN_NAME} member benefits statement (fictional sample)"
    plan["catalog"]["verification"] = {"date": "2026-10-04", "method": "generated by tools/make_sample_statement.py; every citation is a sentence "
                                       "printed in the sample statement, on the page cited", "fields_verified": ["all"], "fields_unknown": ["premium_monthly"]}
    plan["source_document"] = {"title": f"{PLAN_NAME} member benefits statement (fictional sample)", "publisher": "OralCompass team", "url": None,
                               "retrieved_at": "2026-10-04", "sha256": sha, "pages": n_pages, "version_label": "TW26-SAMPLE",
                               "path": f"fixtures/documents/{PDF_NAME}", "document_type": "member_benefits_statement"}
    head = {"_about": ("Demo-mode extraction fixture for the FICTIONAL sample statement (tools/make_sample_statement.py). FixtureExtractor "
                       "returns it when an upload's SHA-256 matches source_document.sha256; quote verification still runs against the "
                       "uploaded PDF's text layer. Not a plan preset.")}
    return {**head, **plan}


# ---------------------------------------------------------------- the web text fixture
def pdfjs_text(pdf: Path) -> dict:
    out = subprocess.run(["node", str(PDFJS_SCRIPT), str(pdf)], capture_output=True, text=True, check=True, cwd=str(ROOT))
    return json.loads(out.stdout)


def ts_fixture(sha: str, text: dict) -> str:
    js = lambda o: json.dumps(o, ensure_ascii=False, indent=2)
    idents = []
    for ident in IDENTIFIERS:
        n, pages = occurrences(text["pages"], ident["value"])
        idents.append({**ident, "occurrences": n, "pages": pages})
    by_cat: dict[str, int] = {}
    for ident in IDENTIFIERS:
        by_cat[ident["category"]] = by_cat.get(ident["category"], 0) + 1
    return f"""// GENERATED by tools/make_sample_statement.py from fixtures/documents/{PDF_NAME}. Do not edit by hand: rerun the script.
// The FICTIONAL sample member benefits statement (TW26, Tidewater Dental Select 2026): the person, every identifier, the plan and the
// carrier are invented. Used by the identifier detector's tests and the upload UI's tests ("Try a fictional sample statement").

export type SampleIdentifierCategory =
  | "name" | "address" | "member_id" | "group_number" | "claim_number" | "account_number" | "ssn" | "dob" | "phone" | "email";

export interface SampleIdentifier {{
  category: SampleIdentifierCategory;
  /** exactly as printed */
  value: string;
  /** case-insensitive occurrences across SAMPLE_STATEMENT_PAGES */
  occurrences: number;
  /** 1-based pages it is printed on */
  pages: number[];
}}

export const SAMPLE_STATEMENT_FILE = "{PDF_NAME}";
/** served by the API (api/app/server.py) and by the dev/preview server once fixtures are copied into web/public/fixtures */
export const SAMPLE_STATEMENT_URL = "/fixtures/documents/{PDF_NAME}";
export const SAMPLE_STATEMENT_SHA256 = "{sha}";
export const SAMPLE_STATEMENT_PAGE_COUNT = {len(text["pages"])};

/** Per page, as web/src/lib/upload.ts inspectPdf() reads it today: pdf.js items joined with " ", whitespace collapsed. */
export const SAMPLE_STATEMENT_PAGES: readonly string[] = {js(text["pages"])};

/** The same text with a line break wherever pdf.js marks an end of line (TextItem.hasEOL). */
export const SAMPLE_STATEMENT_PAGE_LINES: readonly string[] = {js(text["lines"])};

/** EXACTLY these 12 distinct personal identifiers are on the statement; a detector finds these and nothing else. */
export const SAMPLE_STATEMENT_IDENTIFIERS: readonly SampleIdentifier[] = {js(idents)};

export const SAMPLE_STATEMENT_IDENTIFIER_COUNT = {len(IDENTIFIERS)};

export const SAMPLE_STATEMENT_BY_CATEGORY: Readonly<Partial<Record<SampleIdentifierCategory, number>>> = {js(by_cat)};

/** Text the AI needs that must survive redaction untouched (toll-free carrier number, plan dates, CDT codes, amounts, limits). */
export const SAMPLE_STATEMENT_MUST_KEEP: readonly string[] = {js(MUST_KEEP)};
"""


# ---------------------------------------------------------------- main
def build(out_dir: Path) -> dict:
    inp = load_inputs()
    pdf = out_dir / PDF_NAME
    quote_page = build_pdf(pdf, inp)
    sha = hashlib.sha256(pdf.read_bytes()).hexdigest()
    d = pymupdf.open(str(pdf))
    mu_pages = [d[i].get_text() for i in range(d.page_count)]
    d.close()
    problems = []
    for quote, page in quote_page.items():
        if collapse(quote) not in collapse(mu_pages[page - 1]):
            problems.append(f"pymupdf: quote not on page {page}: {quote[:70]}")
    problems += audit(mu_pages, "pymupdf")
    text = pdfjs_text(pdf)
    problems += audit(text["pages"], "pdf.js")
    for quote, page in quote_page.items():
        if collapse(quote) not in text["pages"][page - 1]:
            problems.append(f"pdf.js: quote not on page {page}: {quote[:70]}")
    fixture = json.dumps(extraction_fixture(inp, sha, len(mu_pages), quote_page), indent=2, ensure_ascii=False) + "\n"
    return {"pdf": pdf, "sha": sha, "pages": len(mu_pages), "fixture": fixture, "ts": ts_fixture(sha, text), "problems": problems,
            "quotes": len(quote_page)}


def main(argv: list[str]) -> int:
    check = "--check" in argv
    with tempfile.TemporaryDirectory() as tmp:
        out = build(Path(tmp))
        if out["problems"]:
            print("\n".join(out["problems"]))
            print(f"{len(out['problems'])} problem(s): nothing written")
            return 1
        if check:
            stale = [p for p, ok in ((PDF_PATH, PDF_PATH.exists() and PDF_PATH.read_bytes() == out["pdf"].read_bytes()),
                                     (FIXTURE_PATH, FIXTURE_PATH.exists() and FIXTURE_PATH.read_text() == out["fixture"]),
                                     (TS_PATH, TS_PATH.exists() and TS_PATH.read_text() == out["ts"])) if not ok]
            for p in stale:
                print(f"out of date: {p.relative_to(ROOT)} (rerun python3 tools/make_sample_statement.py)")
            if not stale:
                print(f"sample statement up to date: {PDF_NAME} sha256 {out['sha'][:12]}..., {out['pages']} pages, 12 identifiers")
            return 1 if stale else 0
        PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
        PDF_PATH.write_bytes(out["pdf"].read_bytes())
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(out["fixture"])
    TS_PATH.parent.mkdir(parents=True, exist_ok=True)
    TS_PATH.write_text(out["ts"])
    print(f"{PDF_NAME}: {out['pages']} pages, sha256 {out['sha']}, {len(IDENTIFIERS)} identifiers, {out['quotes']} cited sentences")
    print(f"wrote {PDF_PATH.relative_to(ROOT)}, {FIXTURE_PATH.relative_to(ROOT)}, {TS_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
