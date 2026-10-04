import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyRedaction, classifyTerm, detectIdentifiers, IDENTIFIER_CATEGORIES, maskValue, pageTextFromItems, placeholder, REDACTION_VERSION,
  type FoundIdentifier, type IdentifierCategory,
} from "./redact";

const ROOT = join(__dirname, "../../..");
const pick = (found: FoundIdentifier[]) => found.map((f) => [f.category, f.value]);
const detect1 = (text: string) => pick(detectIdentifiers([text]));
const removeAll = (pages: string[]) => applyRedaction(pages, detectIdentifiers(pages), new Set(), []);

// ------------------------------------------------------------------------------------------------------------------------------
// A fictional member benefits statement with exactly the 12 identifiers of design point 5, a carrier toll-free number and plan dates.
// ------------------------------------------------------------------------------------------------------------------------------
const HEADER = [
  "FICTIONAL SAMPLE: Harborview Dental PPO 2026 member benefits statement (not a real person or plan)",
  "Member: Avery Rowan    Member ID: HB26-4471-902    Group No.: HBV-20931",
].join("\n");
const SAMPLE = [
  [
    HEADER,
    "Avery Rowan",
    "1902 Harbor Light Lane, Apt 4B",
    "Wilmington, NC 28401",
    "Date of birth: 07/19/1986",
    "Phone: (910) 555-0142   Email: avery.rowan@example.com",
    "Dependent: Jordan Rowan",
    "Subscriber SSN: 123-45-6789",
    "Claim No.: CLM-2026-118842   Account #: 7712-0045-33",
    "Dear Avery Rowan,",
    "Questions? Call Member Services at 1-800-555-0199 (TTY 711), Monday to Friday.",
  ].join("\n"),
  [
    HEADER,
    "Deductible: $50 per person, $150 per family. Annual maximum: $1,500 per person.",
    "Class I preventive 100%, Class II basic 80% after deductible, Class III major 50%.",
    "D0120 periodic oral evaluation: 2 per plan year. D1110 prophylaxis: 1 per 6 months.",
    "D2740 crown: 1 per tooth per 5 years; 12-month waiting period for major services. Tooth #14.",
    "Plan year: 01/01/2026 to 12/31/2026. Effective date 01/01/2026.",
    "Policy period: January 1, 2026 through December 31, 2026. This is a group dental plan.",
    "Exclusions: cosmetic services; services before the effective date.",
  ].join("\n"),
  [
    HEADER,
    "Avery Rowan's claim for Jordan",
    "Rowan was processed on March 4, 2026. Member ID HB26 4471 902 is on file.",
  ].join("\n"),
];
const SAMPLE_EXPECTED: [IdentifierCategory, string][] = [
  ["name", "Avery Rowan"],
  ["member_id", "HB26-4471-902"],
  ["group_number", "HBV-20931"],
  ["address", "1902 Harbor Light Lane, Apt 4B"],
  ["address", "Wilmington, NC 28401"],
  ["dob", "07/19/1986"],
  ["phone", "(910) 555-0142"],
  ["email", "avery.rowan@example.com"],
  ["name", "Jordan Rowan"],
  ["ssn", "123-45-6789"],
  ["claim_number", "CLM-2026-118842"],
  ["account_number", "7712-0045-33"],
];
/** Plan facts the AI needs; every one must survive redaction verbatim. */
const PLAN_FACTS = [
  "$50 per person", "$150 per family", "$1,500 per person", "100%", "80% after deductible", "50%", "D0120", "D1110", "D2740",
  "2 per plan year", "1 per 6 months", "1 per tooth per 5 years", "12-month waiting period", "Tooth #14", "01/01/2026 to 12/31/2026",
  "Effective date 01/01/2026", "January 1, 2026 through December 31, 2026", "group dental plan", "Member Services at 1-800-555-0199",
  "TTY 711", "Exclusions: cosmetic services", "March 4, 2026", "Harborview Dental PPO 2026",
];

describe("the fictional sample statement", () => {
  it("finds exactly the 12 distinct identifiers, in reading order", () => {
    expect(pick(detectIdentifiers(SAMPLE))).toEqual(SAMPLE_EXPECTED);
  });
  it("counts occurrences separately from the distinct total (header on every page, reuse in prose)", () => {
    const found = detectIdentifiers(SAMPLE);
    const by = Object.fromEntries(found.map((f) => [f.value, f]));
    expect(by["Avery Rowan"]).toMatchObject({ occurrences: 6, pages: [1, 2, 3] });
    expect(by["HB26-4471-902"]).toMatchObject({ occurrences: 4, pages: [1, 2, 3] });
    expect(by["HBV-20931"]).toMatchObject({ occurrences: 3, pages: [1, 2, 3] });
    expect(by["Jordan Rowan"]).toMatchObject({ occurrences: 2, pages: [1, 3] });
    expect(by["07/19/1986"]).toMatchObject({ occurrences: 1, pages: [1] });
  });
  it("removes all 12 and leaves every plan fact the AI needs", () => {
    const r = removeAll(SAMPLE);
    expect(r.total).toBe(12);
    expect(r.removed).toHaveLength(12);
    expect(r.byCategory).toEqual({ name: 2, address: 2, member_id: 1, group_number: 1, claim_number: 1, account_number: 1, ssn: 1, dob: 1, phone: 1, email: 1 });
    expect(r.occurrences).toBe(r.removed.reduce((n, f) => n + f.occurrences, 0));
    const out = r.pages.join("\n");
    for (const fact of PLAN_FACTS) expect(out).toContain(fact);
    for (const [, value] of SAMPLE_EXPECTED) expect(out).not.toContain(value);
    for (const leak of ["Avery", "Rowan", "4471", "20931", "Harbor Light", "28401", "1986", "0142", "example.com", "6789", "118842", "0045"]) {
      expect(out).not.toContain(leak);
    }
    expect(r.pages[0]).toContain("Member: [name removed]    Member ID: [member ID removed]    Group No.: [group number removed]");
    expect(r.pages[0]).toContain("[address removed]\n[address removed]\nDate of birth: [date of birth removed]");
    expect(r.pages[0]).toContain("Phone: [phone removed]   Email: [email removed]");
    expect(r.pages[0]).toContain("Dear [name removed],");
    expect(r.pages[2]).toContain("[name removed]'s claim for [name removed] was processed");
    expect(r.pages[2]).toContain("Member ID [member ID removed] is on file.");
  });
  it("finds the same 12 in whitespace-collapsed text (a pdf.js page joined with spaces)", () => {
    const flat = SAMPLE.map((p) => p.replace(/\s+/g, " "));
    expect(pick(detectIdentifiers(flat))).toEqual(SAMPLE_EXPECTED);
    expect(removeAll(flat).total).toBe(12);
  });
  it("is idempotent: redacted text has nothing left to find", () => {
    expect(detectIdentifiers(removeAll(SAMPLE).pages)).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// Positive cases: every category, several formats each.
// ------------------------------------------------------------------------------------------------------------------------------
const POSITIVE: [string, [IdentifierCategory, string][]][] = [
  // names (label-anchored)
  ["Patient: Avery Rowan", [["name", "Avery Rowan"]]],
  ["Patient Name: Avery Rowan", [["name", "Avery Rowan"]]],
  ["Member Name: AVERY J. ROWAN", [["name", "AVERY J. ROWAN"]]],
  ["Subscriber: Rowan, Avery", [["name", "Rowan, Avery"]]],
  ["Insured: Mr. Casey Morgan-Lee", [["name", "Casey Morgan-Lee"]]],
  ["Employee Name: Dana O'Neil", [["name", "Dana O'Neil"]]],
  ["Dependent: Jordan Rowan (Child)", [["name", "Jordan Rowan"]]],
  ["Dependents: Jordan Rowan", [["name", "Jordan Rowan"]]],
  ["Policyholder: Avery Rowan", [["name", "Avery Rowan"]]],
  ["Primary Subscriber: Avery Rowan", [["name", "Avery Rowan"]]],
  ["Primary Insured Name: Avery Rowan", [["name", "Avery Rowan"]]],
  ["Name: Élodie Fournier", [["name", "Élodie Fournier"]]],
  ["NAME: AVERY ROWAN", [["name", "AVERY ROWAN"]]],
  ["Name of Patient: Avery A. Rowan Jr.", [["name", "Avery A. Rowan Jr."]]],
  ["Patient Name:\nAvery Rowan", [["name", "Avery Rowan"]]],
  ["Dear Avery Rowan,", [["name", "Avery Rowan"]]],
  ["Dear Ms. Rowan:", [["name", "Rowan"]]],
  ["Dear Avery,\nThank you for your claim.", [["name", "Avery"]]],
  ["Attn: Avery Rowan", [["name", "Avery Rowan"]]],
  ["ATTN AVERY ROWAN", [["name", "AVERY ROWAN"]]],
  ["First Name: Avery\nLast Name: Rowan", [["name", "Avery"], ["name", "Rowan"]]],
  ["Patient: Avery Rowan.", [["name", "Avery Rowan"]]],
  ["Patient: Avery Rowan. Northside Dental billed the claim.", [["name", "Avery Rowan"]]],
  ["Member Name: AVERY J ROWAN", [["name", "AVERY J ROWAN"]]],
  ["Insured: Avery Rowan Employer: Northside Tools", [["name", "Avery Rowan"]]],
  ["Patient: Avery Rowan Birthdate: 07/19/1986", [["name", "Avery Rowan"], ["dob", "07/19/1986"]]],
  ["Subscriber: Avery Rowan Coverage Tier: Family", [["name", "Avery Rowan"]]],
  ["Patient: Avery Rowan Tooth 14", [["name", "Avery Rowan"]]],
  ["Patient: Jordan Rowan, age 9", [["name", "Jordan Rowan"]]],
  ["Name: Dr. Lena Ortiz, DDS", [["name", "Lena Ortiz"]]],
  ["Avery Rowan, 1902 Harbor Light Lane, Wilmington, NC 28401", [["address", "1902 Harbor Light Lane"], ["address", "Wilmington, NC 28401"]]],
  // addresses
  ["1902 Harbor Light Lane", [["address", "1902 Harbor Light Lane"]]],
  ["77 W. Elm St., Apt 4B", [["address", "77 W. Elm St., Apt 4B"]]],
  ["4410 Old Mill Road Suite 200", [["address", "4410 Old Mill Road Suite 200"]]],
  ["12 Oak Ct", [["address", "12 Oak Ct"]]],
  ["805 N Magnolia Avenue", [["address", "805 N Magnolia Avenue"]]],
  ["3 Cedar Pkwy Unit 12", [["address", "3 Cedar Pkwy Unit 12"]]],
  ["1902 HARBOR LIGHT LANE", [["address", "1902 HARBOR LIGHT LANE"]]],
  ["Wilmington, NC 28401", [["address", "Wilmington, NC 28401"]]],
  ["Winston Salem, NC 27101-1234", [["address", "Winston Salem, NC 27101-1234"]]],
  ["Raleigh NC 27601", [["address", "Raleigh NC 27601"]]],
  ["1902 Harbor Light Lane\nWilmington, NC 28401", [["address", "1902 Harbor Light Lane"], ["address", "Wilmington, NC 28401"]]],
  ["Robin Ashby 12 Oak Ct", [["address", "12 Oak Ct"]]],
  // member IDs
  ["Member ID: HB26-4471-902", [["member_id", "HB26-4471-902"]]],
  ["Member ID #: W123456789", [["member_id", "W123456789"]]],
  ["MEMBER ID W123456789", [["member_id", "W123456789"]]],
  ["Subscriber No. 884412907", [["member_id", "884412907"]]],
  ["ID: XQZ8842019", [["member_id", "XQZ8842019"]]],
  ["Identification Number: 55120-8871", [["member_id", "55120-8871"]]],
  ["Policy ID: P-0092231", [["member_id", "P-0092231"]]],
  ["Member ID:\nHB26-4471-902", [["member_id", "HB26-4471-902"]]],
  ["Member ID: HB26-4471-\n902", [["member_id", "HB26-4471-902"]]],
  // group numbers
  ["Group No.: HBV-20931", [["group_number", "HBV-20931"]]],
  ["Group Number: 0045521", [["group_number", "0045521"]]],
  ["Grp #: 778812", [["group_number", "778812"]]],
  ["Member ID: HB26-4471-902; Group: 20931", [["member_id", "HB26-4471-902"], ["group_number", "20931"]]],
  ["Group ID: G-55102", [["group_number", "G-55102"]]],
  ["Group Policy Number: 165756-1-G", [["group_number", "165756-1-G"]]],
  // claim numbers
  ["Claim No.: CLM-2026-118842", [["claim_number", "CLM-2026-118842"]]],
  ["Claim #: 2026031400917", [["claim_number", "2026031400917"]]],
  ["Claim Number: 7781-2210-04", [["claim_number", "7781-2210-04"]]],
  ["Claim ID: E99812", [["claim_number", "E99812"]]],
  // account numbers
  ["Account #: 7712-0045-33", [["account_number", "7712-0045-33"]]],
  ["Acct. No. 0099812", [["account_number", "0099812"]]],
  ["Patient Account Number: PA-55102", [["account_number", "PA-55102"]]],
  ["Account: 99120011", [["account_number", "99120011"]]],
  // SSNs
  ["123-45-6789", [["ssn", "123-45-6789"]]],
  ["SSN: 123456789", [["ssn", "123456789"]]],
  ["Social Security Number: 123 45 6789", [["ssn", "123 45 6789"]]],
  ["SSN: XXX-XX-6789", [["ssn", "XXX-XX-6789"]]],
  // dates of birth
  ["DOB: 07/19/1986", [["dob", "07/19/1986"]]],
  ["Date of Birth: July 19, 1986", [["dob", "July 19, 1986"]]],
  ["Birth date: 1986-07-19", [["dob", "1986-07-19"]]],
  ["D.O.B. 19 Jul 1986", [["dob", "19 Jul 1986"]]],
  ["Born: 7/19/86", [["dob", "7/19/86"]]],
  ["Birthday: 7/19/86", [["dob", "7/19/86"]]],
  ["Date of birth (MM/DD/YYYY): 07/19/1986", [["dob", "07/19/1986"]]],
  ["Date of birth:\n07/19/1986", [["dob", "07/19/1986"]]],
  ["Birthdate: Sept. 3rd, 1990", [["dob", "Sept. 3rd, 1990"]]],
  // phones
  ["(910) 555-0142", [["phone", "(910) 555-0142"]]],
  ["910-555-0142", [["phone", "910-555-0142"]]],
  ["910.555.0142", [["phone", "910.555.0142"]]],
  ["+1 (910) 555-0142", [["phone", "+1 (910) 555-0142"]]],
  ["Phone: +1 910 555 0142", [["phone", "+1 910 555 0142"]]],
  ["Mobile: 9105550142", [["phone", "9105550142"]]],
  ["Fax: (910) 555-0199", [["phone", "(910) 555-0199"]]],
  ["Questions? Member Services 1-800-555-0199. Your phone on file: (910) 555-0142", [["phone", "(910) 555-0142"]]],
  ["Member Services: 1-800-555-0199   Phone: (910) 555-0142", [["phone", "(910) 555-0142"]]],
  // emails
  ["avery.rowan@example.com", [["email", "avery.rowan@example.com"]]],
  ["Email: a_r+dental@mail.example.org.", [["email", "a_r+dental@mail.example.org"]]],
  ["AVERY@EXAMPLE.COM", [["email", "AVERY@EXAMPLE.COM"]]],
];

describe("positive cases", () => {
  for (const [text, expected] of POSITIVE) {
    it(JSON.stringify(text), () => {
      expect(detect1(text)).toEqual(expected);
    });
  }
  it("covers every category", () => {
    const seen = new Set(POSITIVE.flatMap(([, e]) => e.map(([c]) => c)));
    expect([...seen].sort()).toEqual([...IDENTIFIER_CATEGORIES].sort());
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// Negative cases: what the AI needs, carrier details and plan prose survive untouched.
// ------------------------------------------------------------------------------------------------------------------------------
const NEGATIVE: string[] = [
  "D0120 periodic oral evaluation - established patient",
  "Codes D0210, D0330 and D2740 are covered.",
  "Annual maximum: $1,500 per person; deductible $50 per person / $150 per family.",
  "The plan pays $12345 toward orthodontia.",
  "Class I 100%, Class II 80%, Class III 50% after the deductible.",
  "Plan year: 01/01/2026 – 12/31/2026",
  "Effective date: January 1, 2026",
  "Coverage begins 2026-01-01 and ends 2026-12-31.",
  "Statement date: March 4, 2026",
  "Date of service 03/04/2026",
  "Policy period: January 1, 2026 through December 31, 2026",
  "The deductible applies to basic and major services. The annual maximum is $1,000.",
  "Limited to 1 per 6 months; 2 per calendar year; once every 36 months.",
  "12-month waiting period for major services; 6 months for basic services.",
  "Tooth #14; teeth 2, 3, 14 and 15; tooth 30 mesial.",
  "Member Services: 1-800-555-0199",
  "Call (888) 555-0100 or 877.555.0123, TTY 711.",
  "Customer Service: (910) 555-0100",
  "Call us at 910-555-0100 Monday to Friday.",
  "Member Services",
  "This is a group dental plan.",
  "MEMBER INFORMATION",
  "Subscriber Information",
  "Group Dental Plan Summary of Benefits",
  "Member: means a person who is covered under this Plan.",
  "Dependent: Your spouse and your children under age 26.",
  "Employee: Any person employed by the Policyholder.",
  "Plan Name: Harborview Dental PPO 2026",
  "Name: Harborview Dental PPO",
  "Policyholder: North Carolina Office of State Human Resources",
  "Mail claims to: Harborview Benefits Company, 400 Harbor Plaza Drive, Wilmington, NC 28401",
  "Underwritten by Delta Dental Insurance Company 1130 Sanctuary Parkway Alpharetta, GA 30009",
  "Delta Dental of North Carolina, 3737 Glenwood Avenue, Suite 320, Raleigh, NC 27612",
  "P.O. Box 1809, Alpharetta, GA 30023",
  "Questions: claims@harborview.example.com",
  "Email us at help@harborview.example.com",
  "Member Services Phone: (910) 555-0100",
  "Subscriber: Same as Patient",
  "Dependent: N/A",
  "Claim 2026-118842 was paid.",
  "Children born 01/01/2020 or later are covered to age 26.",
  "Dear May,\nYour plan year starts May 1, 2026.",
  "Dear Friday,",
  "Tax ID: 56-1234567",
  "NPI 1234567893",
  "Form PPO-ENT-MS-E-R23, version 2.1.3",
  "Class II 80 Percent After Deductible",
  "2 Cleanings Per Plan Year",
  "Page 3 of 14; Section 4.2",
  "Your Member ID card is enclosed.",
  "Policy ID card",
  "Claim forms must be filed within 12 months.",
  "Group No. 5",
  "Deductible 100 250 1500",
  "Dear Member,",
  "Dear Valued Customer:",
  "Dear Plan Participant,",
  "Attn: Claims Department",
  "Primary: Delta Dental PPO",
  "Install react@0.6.2 and motion@12.x",
  "Benefits are paid at 80% of the maximum allowed amount.",
  "Waiting period: 12 months. Frequency: 1 per 60 months.",
  "Missing tooth clause applies to teeth extracted before 01/01/2026.",
  "Orthodontia lifetime maximum $1,500; age limit 19.",
  "Will Park and May Day are not names here: you will park in May.",
];

describe("negative cases (must survive untouched)", () => {
  for (const text of NEGATIVE) {
    it(JSON.stringify(text), () => {
      expect(detect1(text)).toEqual([]);
      expect(removeAll([text]).pages[0]).toBe(text);
    });
  }
});

// ------------------------------------------------------------------------------------------------------------------------------
// Repetition, line breaks and reuse in prose.
// ------------------------------------------------------------------------------------------------------------------------------
describe("distinct identifiers and occurrences", () => {
  it("de-duplicates by normalised value: case, whitespace and punctuation", () => {
    const found = detectIdentifiers([
      "Member ID: HB26-4471-902\nPatient: Avery Rowan",
      "MEMBER ID: hb26 4471 902\nNAME: AVERY  ROWAN",
      "Phone: (910) 555-0142 / 910.555.0142 / +1 910-555-0142",
    ]);
    expect(pick(found)).toEqual([["member_id", "HB26-4471-902"], ["name", "Avery Rowan"], ["phone", "(910) 555-0142"]]);
    expect(found.map((f) => f.occurrences)).toEqual([2, 2, 3]);
    expect(found.map((f) => f.pages)).toEqual([[1, 2], [1, 2], [3]]);
  });
  it("finds a detected name again later, across a line break, in capitals and with a possessive", () => {
    const pages = ["Patient: Avery Rowan", "We wrote to Avery\nRowan. AVERY ROWAN's claim was paid. Avery Rowanberry is someone else."];
    const [name] = detectIdentifiers(pages);
    expect(name).toMatchObject({ category: "name", value: "Avery Rowan", occurrences: 3, pages: [1, 2] });
    const out = removeAll(pages).pages[1];
    expect(out).toBe("We wrote to [name removed]. [name removed]'s claim was paid. Avery Rowanberry is someone else.");
  });
  it("only removes a name where its words are capitalised (a name made of ordinary words leaves prose alone)", () => {
    const pages = ["Patient: Will Park", "You will park at the office. Will Park signed."];
    const r = removeAll(pages);
    expect(r.pages[1]).toBe("You will park at the office. [name removed] signed.");
  });
  it("finds a member ID printed elsewhere without its label, in another spacing", () => {
    const r = removeAll(["Member ID: W123456789", "Reference W 1234 56789 on your card; W123456789 again; W1234567890 is another number."]);
    expect(r.removed[0]).toMatchObject({ value: "W123456789", occurrences: 3 });
    expect(r.pages[1]).toBe("Reference [member ID removed] on your card; [member ID removed] again; W1234567890 is another number.");
  });
  it("never removes a dollar amount or a percentage that happens to share an identifier's digits", () => {
    const r = removeAll(["Account #: 1500250", "The plan paid $1500250 last year; 1500250% is not a number either; account 1500250 closed."]);
    expect(r.pages[1]).toBe("The plan paid $1500250 last year; 1500250% is not a number either; account [account number removed] closed.");
  });
  it("never matches inside a grouped amount", () => {
    const r = removeAll(["Account #: 50000", "Paid $1,500.00 and 2,500.00; 50000.5 units; account 50000 closed."]);
    expect(r.pages[1]).toBe("Paid $1,500.00 and 2,500.00; 50000.5 units; account [account number removed] closed.");
  });
  it("keeps the opening parenthesis and the country code with a phone number", () => {
    const r = removeAll(["Phone: (910) 555-0142", "Call +1 (910) 555-0142 or 1-910-555-0142."]);
    expect(r.pages[1]).toBe("Call [phone removed] or [phone removed].");
  });
  it("an SSN also printed as a member ID is one identifier (the SSN)", () => {
    expect(detect1("Subscriber ID: 123-45-6789\nSSN 123-45-6789")).toEqual([["ssn", "123-45-6789"]]);
  });
  it("ids are stable hashes of category + normalised value", () => {
    const a = detectIdentifiers(["Member ID: HB26-4471-902"])[0];
    const b = detectIdentifiers(["intro", "MEMBER ID: hb26-4471-902"])[0];
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^rid-[0-9a-f]{16}$/);
    const c = detectIdentifiers(["Claim #: HB26-4471-902"])[0];
    expect(c.id).not.toBe(a.id);
  });
  it("handles empty input and empty pages", () => {
    expect(detectIdentifiers([])).toEqual([]);
    expect(detectIdentifiers(["", ""])).toEqual([]);
    expect(applyRedaction([], [], new Set(), [])).toEqual({ pages: [], identifiers: [], removed: [], total: 0, byCategory: {}, occurrences: 0 });
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// applyRedaction: keep switch and added terms.
// ------------------------------------------------------------------------------------------------------------------------------
describe("applyRedaction", () => {
  const found = detectIdentifiers(SAMPLE);
  const idOf = (value: string) => found.find((f) => f.value === value)!.id;

  it("'Keep in text' leaves that identifier in place and lowers the count live", () => {
    const r = applyRedaction(SAMPLE, found, new Set([idOf("HBV-20931")]), []);
    expect(r.total).toBe(11);
    expect(r.byCategory.group_number).toBeUndefined();
    expect(r.pages[0]).toContain("Group No.: HBV-20931");
    expect(r.removed.some((f) => f.value === "HBV-20931")).toBe(false);
    const kept = r.identifiers.find((f) => f.value === "HBV-20931")!;
    expect(kept.occurrences).toBe(3);
  });
  it("added terms are found case- and spacing-insensitively and count as names unless they have a shape", () => {
    const pages = ["Seen at Northside Dental Group by Dr. Lena Ortiz.", "NORTHSIDE   DENTAL group, Durham"];
    const r = applyRedaction(pages, [], new Set(), ["Northside Dental", "  ", "x", "Lena Ortiz", "not in the text", "#$%"]);
    expect(r.total).toBe(2);
    expect(r.removed.map((f) => [f.category, f.value, f.occurrences])).toEqual([["name", "Northside Dental", 2], ["name", "Lena Ortiz", 1]]);
    expect(r.pages).toEqual(["Seen at [name removed] Group by Dr. [name removed].", "[name removed] group, Durham"]);
    // a term that is not in the text is listed with 0 places and not counted
    expect(r.identifiers.find((f) => f.value === "not in the text")).toMatchObject({ occurrences: 0 });
    expect(r.identifiers).toHaveLength(3);
  });
  it("a term equal to a detected identifier is not counted twice, and removes it even if it was kept", () => {
    const keep = new Set([idOf("Avery Rowan")]);
    const r = applyRedaction(SAMPLE, found, keep, ["AVERY  ROWAN", "hb26 4471 902"]);
    expect(r.total).toBe(12);
    expect(r.identifiers).toHaveLength(12);
    expect(r.pages.join("\n")).not.toContain("Avery");
  });
  it("classifies added terms by shape", () => {
    expect(classifyTerm("avery@example.com")).toBe("email");
    expect(classifyTerm("123-45-6789")).toBe("ssn");
    expect(classifyTerm("(910) 555-0142")).toBe("phone");
    expect(classifyTerm("07/19/1986")).toBe("dob");
    expect(classifyTerm("1902 Harbor Light Lane")).toBe("address");
    expect(classifyTerm("Wilmington, NC 28401")).toBe("address");
    expect(classifyTerm("HB26-4471-902")).toBe("member_id");
    expect(classifyTerm("Northside Dental")).toBe("name");
    expect(classifyTerm("hb26 4471 902")).toBe("member_id");
    expect(classifyTerm("2026")).toBe("name");
  });
  it("a typed phone term removes the number in any punctuation", () => {
    const r = applyRedaction(["Call 910.555.0142 or (910) 555-0142."], [], new Set(), ["910-555-0142"]);
    expect(r.pages[0]).toBe("Call [phone removed] or [phone removed].");
    expect(r.removed[0]).toMatchObject({ category: "phone", occurrences: 2 });
  });
  it("ignores terms longer than 64 characters", () => {
    const long = "A".repeat(65);
    expect(applyRedaction([long], [], new Set(), [long]).total).toBe(0);
  });
  it("is pure: same inputs, same output; inputs are not mutated", () => {
    const copy = JSON.parse(JSON.stringify(found));
    const a = applyRedaction(SAMPLE, found, new Set(), ["Harborview"]);
    const b = applyRedaction(SAMPLE, found, new Set(), ["Harborview"]);
    expect(a).toEqual(b);
    expect(found).toEqual(copy);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// Display helpers and constants.
// ------------------------------------------------------------------------------------------------------------------------------
describe("placeholders and masks", () => {
  it("placeholder strings", () => {
    expect(IDENTIFIER_CATEGORIES.map(placeholder)).toEqual([
      "[name removed]", "[address removed]", "[member ID removed]", "[group number removed]", "[claim number removed]",
      "[account number removed]", "[SSN removed]", "[date of birth removed]", "[phone removed]", "[email removed]",
    ]);
    expect(REDACTION_VERSION).toBe(1);
  });
  it("masked values never show the identifier", () => {
    expect(maskValue("name", "Avery Rowan")).toBe("A•••• R••••");
    expect(maskValue("name", "Rowan, Avery J.")).toBe("R••••, A•••• J.");
    expect(maskValue("email", "avery.rowan@example.com")).toBe("••••@example.com");
    expect(maskValue("phone", "(910) 555-0142")).toBe("•••• 0142");
    expect(maskValue("member_id", "HB26-4471-902")).toBe("•••• 1902");
    expect(maskValue("ssn", "123-45-6789")).toBe("•••• 6789");
    expect(maskValue("group_number", "1234")).toBe("••••");
    expect(maskValue("dob", "07/19/1986")).toBe("••/••/••••");
    expect(maskValue("dob", "July 19, 1986")).toBe("•••• ••, ••••");
    expect(maskValue("address", "1902 Harbor Light Lane, Apt 4B")).toBe("•••• H••••• L•••• Lane, Apt 4•");
    expect(maskValue("address", "Wilmington, NC 28401")).toBe("W•••••••••, NC •••••");
  });
});

describe("pageTextFromItems", () => {
  it("keeps pdf.js line ends and joins items on a line with one space", () => {
    const items = [
      { str: "Member:", hasEOL: false }, { str: "Avery Rowan", hasEOL: true }, { type: "beginMarkedContent" },
      { str: "Member ID:", hasEOL: false }, { str: " HB26-4471-902", hasEOL: true }, { str: "", hasEOL: true }, { str: "", hasEOL: true },
      { str: "", hasEOL: true }, { str: "Deductible  $50", hasEOL: false },
    ];
    expect(pageTextFromItems(items)).toBe("Member: Avery Rowan\nMember ID: HB26-4471-902\n\nDeductible $50");
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// Linear time: hostile pages of 200 KB finish in well under 200 ms.
// ------------------------------------------------------------------------------------------------------------------------------
/**
 * CPU milliseconds spent by `fn` (best of three). The suite runs ~30 files in parallel processes, so wall-clock time measures contention
 * for the machine; CPU time of this process measures the algorithm. A quadratic pattern on 200 KB costs seconds, not milliseconds.
 */
function cpuMs(fn: () => void): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const t0 = process.cpuUsage();
    fn();
    const d = process.cpuUsage(t0);
    best = Math.min(best, (d.user + d.system) / 1000);
  }
  return best;
}

describe("linear time", () => {
  const SIZE = 200_000;
  const fill = (unit: string) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);
  const hostile: [string, string][] = [
    ["letters", fill("a")],
    ["capitals", fill("A")],
    ["capital words", fill("Aaaa ")],
    ["name labels", fill("Member: ")],
    ["label then capitals", ("Patient: " + fill("Aaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).slice(0, SIZE)],
    ["comma names", fill("Aa, Bb ")],
    ["digits", fill("1")],
    ["digit words", fill("1 ")],
    ["street-like", fill("12 Aaaa Bbbb Cccc Dddd Eeee ")],
    ["city-like", fill("Aaaa Bbbb Cccc, NC ")],
    ["hyphens", fill("1-")],
    ["id labels", fill("ID: 1")],
    ["at signs", fill("a@")],
    ["dots", fill("a.")],
    ["email-ish", fill("a.b@c.d")],
    ["phone-ish", fill("(910) 555-")],
    ["dob labels", fill("DOB: 1/1/")],
    ["dear", fill("Dear Aaaa Bbbb ")],
    ["newlines", fill("Member ID:\n")],
    ["carrier addresses", fill("Dental Group 12 Aaaa St Bbbb, NC 12345 ")],
    ["mixed", fill("Member ID: HB26-44 Group No. 1 $1, 910-555 Patient: Aa Bb DOB 7/19 a@b. ")],
  ];
  it.each(hostile)("%s", (_label, text) => {
    expect(text.length).toBe(SIZE);
    const ms = cpuMs(() => {
      const found = detectIdentifiers([text]);
      applyRedaction([text], found, new Set(), ["Aaaa Bbbb"]);
    });
    expect(ms).toBeLessThan(200);
  });
  it("many distinct identifiers stay linear (10,000 emails)", () => {
    const text = Array.from({ length: 10_000 }, (_, i) => `p${i}@ex${i}.com`).join(" ");
    let found: FoundIdentifier[] = [];
    let total = 0;
    const ms = cpuMs(() => {
      found = detectIdentifiers([text]);
      total = applyRedaction([text], found, new Set(), []).total;
    });
    expect(ms).toBeLessThan(400);
    expect(found).toHaveLength(10_000);
    expect(total).toBe(10_000);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
// Real documents: nothing the AI needs is removed.
// ------------------------------------------------------------------------------------------------------------------------------
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => strings(v, out));
  return out;
}

describe("real plan documents", () => {
  it("the verbatim quotes from every real plan document flag only the printed group policy numbers", () => {
    const dirs = [join(ROOT, "sources/extracted"), join(ROOT, "fixtures/evidence"), join(ROOT, "fixtures/plans")];
    const flagged = new Set<string>();
    let docs = 0;
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
        docs += 1;
        const pages = strings(JSON.parse(readFileSync(join(dir, f), "utf8")));
        for (const id of detectIdentifiers(pages)) flagged.add(`${id.category}:${id.value}`);
      }
    }
    expect(docs).toBeGreaterThan(20);
    // "Group Policy Number: 165756-1-G" (NCFlex MetLife) and "Group No: 01125" (Delta Dental MSU): group numbers the AI does not need.
    expect([...flagged].sort()).toEqual(["group_number:01125", "group_number:165756-1-G"]);
  });

  it("the fictional plan certificates read with pdf.js contain no personal identifiers", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const dir = join(ROOT, "fixtures/documents");
    const certificates = readdirSync(dir).filter((n) => /_certificate\.pdf$/.test(n));
    expect(certificates.length).toBeGreaterThanOrEqual(4);
    for (const name of certificates) {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(dir, name))), useSystemFonts: false, verbosity: 0 }).promise;
      const lines: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) lines.push(pageTextFromItems((await (await doc.getPage(i)).getTextContent()).items));
      await doc.destroy();
      expect(lines.join("").length).toBeGreaterThan(1000);
      expect(detectIdentifiers(lines)).toEqual([]);
      expect(detectIdentifiers(lines.map((p) => p.replace(/\s+/g, " ")))).toEqual([]);
    }
  }, 30_000);
});
