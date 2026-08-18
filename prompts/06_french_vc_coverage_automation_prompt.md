# Useful Companies — French VC Coverage Automation

## Objective
Build exhaustive coverage of the French VC-backed startup ecosystem by processing French VC funds one by one, analysing every operating portfolio company in depth, updating the canonical database immediately after each company, then moving to the next fund until the execution/tool budget is exhausted.

No conversational filler. No narration of internal work. Final output must contain results only.

## Persistent sources of truth
GitHub:
- Repository: `romain-netizen/useful.vc`
- Methodology prompts: `prompts/02_classifier_system_prompt.md` and `prompts/06_french_vc_coverage_automation_prompt.md`
- Production branch: `main`

Neon Postgres:
- Project ID: aged-unit-27578806
- Branch: main
- Database: neondb
- The public site reads the `public.public_companies` view

Use Neon Postgres as the canonical operational database. Every write described in
this document must land in Neon.
Use the Markdown files committed in the GitHub repository as the canonical
methodology. A methodology change is not active until it is committed. Do not use
Google Drive, Google Sheets, Railway, Harmonic or an unversioned local file as an
execution source of truth.

## Public classification rules
There are exactly three public states:

MAIN
- all 8 structural criteria = PASS
- core product is commercialised
- actual product is sufficiently demonstrated/proven for its intended use
- material safety/regulatory/externality questions are sufficiently resolved

PENDING
- all 8 structural criteria = PASS
- but product is not yet commercialised OR not yet sufficiently proven/validated OR a readiness condition remains
- every Pending company must have a precise, falsifiable “What it needs to qualify” statement

EXCLUDED
- ANY of the 8 structural criteria is FAIL
- company-level exclusion details remain internal
- public product shows only aggregate excluded count
- do not downgrade a structural FAIL into Pending

If the company's design or business model is too unclear to decide a structural criterion:
- research the product design and business model further;
- if the structural fact itself remains unknown, use UNCLEAR;
- never use missing outcome evidence as a structural UNCLEAR or FAIL.

If the structural mechanism passes but outcome proof is incomplete:
- keep the structural verdict PASS;
- classify Pending;
- route the precise, falsifiable evidence condition to `what_it_needs_to_qualify`;
- never invent facts.



<!-- SELECTIVITY_DOCTRINE_START -->
## Selectivity doctrine — three non-compensating tests

This doctrine supersedes the five-point rule of 2026-08-18 and every earlier formulation of the selectivity bar, including the single additionality question.

The directory answers one question about each company:

> **What serious deficit does the world still have, that this company's own product removes?**

Three tests decompose the question. All three must pass. They are not a score: there is no averaging or compensation. Readiness never enters a test; it decides Main versus Pending and nothing else.

### Test 1 — Gravity: is the deficit serious, and can the affected party escape it?

Assess the specific deficit the company removes and the party who bears it, not whether the sector is important or noble.

Answer all three sub-questions:

1. **Involuntariness:** Can the party bearing the deficit avoid or exit it? A patient does not choose illness. A smallholder with no route to market cannot conjure one. A restaurant can change supplier; a fleet manager can choose another lessor.
2. **Severity:** Does the deficit reach health, safety, subsistence, rights or ecological capacity, or only cost, margin and effort?
3. **Consequence:** Left unaddressed, does it compound into lasting harm, or is it recoverable tomorrow at ordinary cost?

#### The productivity rule, stated so it can be contested

When the paying customer is also the primary beneficiary, the deficit is cost or effort, and the customer can act on it themselves, the product is productivity. Productivity is a real good; it is not what this directory records.

The burden then shifts to the company: name a third party who bears an involuntary deficit and show that party is materially better off. This is an evidentiary claim a founder can contest. “Ordinary productivity” alone is not a verdict.

Djoli is the calibration. Better procurement for an Abidjan restaurant is productivity. Its qualifying claim concerns producers whose income is captured by intermediaries and who cannot otherwise reach the market. The evidence condition is therefore producer income and post-harvest loss, not restaurant satisfaction.

### Test 2 — Realisation: is the benefit produced by using the product?

Ask whether use of the product as designed produces the benefit, or whether the benefit requires a later decision by someone else in order to exist at all. Almost every product passes through decisions; the discriminator is realisation at use.

- Use BioHive's skin organoids: an animal is not used. The substitution is realised at use.
- Use AZmed: a fracture is seen. Treatment is downstream, but the immediate information benefit has one purpose.
- Use AQEMIA: a candidate molecule exists, but no human benefit is realised. Any benefit requires years and many later decisions by others.

#### Default and dominant use corollary

The beneficial use must be the product's default and dominant use. A product whose optimisation target is customer revenue does not have the benefit as its purpose merely because revenue and benefit can correlate.

Orus Energy and Tilt genuinely actuate load shifts, but they optimise flexibility-market revenue and share it with the customer. Price spreads and marginal carbon correlate in France without being the same quantity. Maximising euros while collecting carbon benefits incidentally fails this corollary and also raises a C4 incentive-alignment failure.

#### Commons exception — a rule, not a door

Mechanical application of Test 2 would remove every upstream field, including abandoned fields where market failure is greatest. Test 2 is decisive except when both conditions below are met:

1. the deficit is a commons harm from which the market has documentably withdrawn, established through named exits and failures rather than a general complaint; and
2. capacity at the abandoned step is the binding constraint.

The company must then show that the beneficial application is structurally durable rather than contingent. If durability is not yet shown, the company is Pending with durability as the falsifiable condition; the exception never creates Main by itself.

Generare is the calibration. Antibiotic-market withdrawal is documentable through named exits by Novartis, AstraZeneca and Sanofi and Achaogen's bankruptcy after FDA approval. Generare has produced more than 1,000 genetic recipes and 100 novel molecules, some with antibiotic activity, and has a named antibiotic-development partner. But its co-founder states that the company may refocus on more guaranteed indications within five years if the market does not change. The beneficial application is therefore contingent: Pending, using the company's statement and horizon as the testable condition.

### Test 3 — Additionality: what is worse without this company, against what?

Ask:

> **What gets materially worse if this company disappears — against which named substitute, on which named dimension?**

Every answer must name both the realistic substitute and the material comparison dimension. A verdict without them is an opinion, cannot be contested by the company and must not be published.

Reject two failure modes explicitly:

1. **The substitute absorbs demand:** if a realistic alternative serves the same need at comparable quality on the named dimension, additionality is weak however distinctive the technology. Pelikan Mobility's claim depends on electrification that would not otherwise occur, while Ayvens and Arval already lease EVs at scale.
2. **Cost reduction is not constraint removal:** making an activity cheaper is a cost improvement. Multi-site analysis without centralising identifiable patient data, or continuous structural monitoring where only periodic inspection existed, removes a constraint. State which is present.

Write:

- `additionality_state = demonstrated` when advantage over the named substitute is established strongly enough for Main;
- `additionality_state = plausible` when the design-level advantage passes structurally but readiness proof remains open, supporting Pending with a falsifiable condition;
- `additionality_state = weak` when the substitute absorbs demand at comparable quality on the named dimension, requiring Excluded.

### Composition of the tests

| Result | Required verdict |
|---|---|
| Fails Test 1 | Excluded — name the party, the deficit and why the party can act on it themselves |
| Fails Test 2; no commons exception | Excluded — name the later decision required before benefit exists |
| Commons exception applies; durability unproven | Pending — durability is the falsifiable condition |
| Fails Test 3 | Excluded — name the substitute and dimension |
| Passes all three; readiness proven | Main |
| Passes all three; readiness open | Pending — write a falsifiable `what_it_needs_to_qualify` |

### Relationship to the eight criteria and fact classes

Test 1 is how C1 is asked. Test 2 is how C2 is asked. Test 3 populates the `additionality_*` fields. The default-and-dominant-use corollary is also a C4 question. The remaining criteria are unchanged; one FAIL still means Excluded.

Every proposed fact carries exactly one closed `fact_class`: `structural`, `readiness`, `liveness`, `scope` or `finance`. Only `structural` may target C1-C8. Route readiness to `what_it_needs_to_qualify`, liveness to lifecycle/proceeding fields, scope to `publication_scope`, and finance to funding/exit records.

The write-time fact-class gate and its Poppins C2, Remedee Labs C2/C7, Ava C7 and 20 C8 liveness fixtures enforce this separation. Liveness, scope, finance and readiness must never reach C1-C8.

### Required record for every verdict

Every Main, Pending and Excluded judgement writes, without exception:

- `additionality_substitute`: the named realistic alternative;
- `additionality_dimension`: the named dimension of comparison;
- `additionality_rationale`: why the company is or is not better on it;
- in the C1 rationale, the party bearing the deficit and whether that party can escape it; and
- for Pending, a falsifiable `what_it_needs_to_qualify` naming the evidence that would settle the issue.

A judgement missing the substitute, dimension, deficit-bearing party or escapability finding is incomplete and must not be published. This applies equally to companies kept and excluded.

### What this doctrine forbids

- No category rules: “we do not need more restaurants”, “leasing is not useful”, “industry is not useful” and “ordinary productivity” as a stated reason are prohibited.
- No verdict from customer identity. Selling to a hospital confers nothing; selling to pharma condemns nothing. The customer is never the test; the beneficiary is.
- No readiness inside a criterion. Absence of proof is Pending, never a structural FAIL or C7 externality.
- No liveness inside a criterion. Liquidation, safeguard procedure, listing and acquisition belong to lifecycle and publication-scope fields.

### Calibration set

| Company | Test 1 | Test 2 | Test 3 | Verdict |
|---|---|---|---|---|
| Omnidoc | Patient cannot escape delayed specialist access | Advice obtained on use | Versus phone/letter referral on time-to-advice | Main |
| BioHive | Animals used in testing; patients whose phototype is underrepresented | Substitution realised at use | Versus animal models on human relevance and phototype coverage | Main |
| CAEmate | Infrastructure users face irreversible failure | Continuous detection realised at use | Versus periodic inspection on between-inspection degradation detection | Main |
| AZmed | Patient with an undetected fracture | Detection realised at use; single purpose | Versus unaided reading on miss rate | Main |
| Generare | AMR commons harm; market documentably withdrawn | Commons exception applies; founder declares durability contingent | Versus the 97% of microbial chemistry left undecoded | Pending |
| Jèko | Informal merchant structurally excluded from credit | Credit would be realised when the credit product is used; non-delivery today is readiness, not C2 | Versus Wave, Orange Money and MTN MoMo on acceptance; no payment advantage, case rests on credit | Pending |
| Djoli | Producer without a route to market, not the restaurant | Shortened chain realised at use | Versus wholesale chain on producer income share and post-harvest loss | Pending |
| Orus Energy / Tilt | Grid-emissions commons | Fails dominant-use corollary: optimises revenue, not marginal carbon | Cost reduction, not constraint removal | Excluded |
| Pelikan Mobility | Fleet operator bears an avoidable business cost | Not determinative | Ayvens and Arval already lease EVs | Excluded |
| AQEMIA | Not determinative | Nothing realised at use; no documented oncology-market withdrawal | Not reached | Excluded |

Calibration shorthand never waives the required record. A row marked “not reached”, “not determinative” or lacking an explicit substitute and dimension is not write-ready; complete the mandatory additionality fields before storing or publishing the verdict, without inventing them from the table.

### Re-judgement order

After this doctrine is committed, re-judge the 13 former editorial exclusions first, then all 154 published companies judged under the earlier bar, then the remainder. Every verdict—including a retained company—must carry its substitute, dimension and deficit-bearing party.
<!-- SELECTIVITY_DOCTRINE_END -->

## The 8 structural criteria
Every company must be tested methodically, independently, one criterion at a time.

1. Gravity of the deficit
Is the specific deficit serious, and can the party bearing it escape it? Name the party and assess involuntariness/escapability, severity and lasting consequence. When the payer is the beneficiary, the deficit is cost or effort and the payer can act themselves, require a demonstrated involuntary third-party deficit; otherwise FAIL as productivity.

2. Realisation at use
Is the benefit produced by using the product as designed, without a later independent decision being required for the benefit to exist, and is beneficial use the default and dominant use? Apply the narrow documented-withdrawal commons exception exactly as stated above.

3. 100× scale is good
Would humanity clearly benefit if the company’s core activity/adoption became 100× larger?

4. Economic incentive alignment
Does long-term enterprise value increase mainly when outcomes for users/beneficiaries/humanity improve?

5. Solves rather than perpetuates
Can the company become more valuable by solving the problem rather than depending on its persistence?

6. Value creation rather than extraction
Does the company mainly earn by creating better outcomes/capability/access/safety/efficiency rather than exploiting vulnerability, dependency, artificial scarcity, behavioural weakness or information asymmetry?

7. No material externalised harm
Does the model avoid relying on significant costs shifted to society, workers, public health, taxpayers, ecosystems or future generations?

8. Observed conduct consistent with alignment
Does actual behaviour avoid a material repeated pattern of sacrificing welfare, safety, environment or truth for returns?

One FAIL => EXCLUDED.
No averaging. No weighted score. No compensation.

## Mandatory adversarial review
Before any MAIN or PENDING classification, actively try to disprove eligibility:

- What exactly generates revenue?
- What behaviour maximises enterprise value?
- Would 100× more of the actual activity clearly be good?
- What happens when profit conflicts with welfare?
- Would solving the underlying problem damage economics?
- Are customers captive, vulnerable or poorly informed?
- Who bears costs outside the transaction?
- Does scale create harmful second-order effects?
- Has the company been sanctioned, sued, recalled, criticised by regulators, found misleading, or repeatedly fined?
- Is a claimed impact only company marketing?
- Is the benefit really intrinsic or merely a possible downstream use?

Then run a reverse-adversarial check before exclusion:
- Is this essential infrastructure?
- Is the niche problem more important than it first appears?
- Is there a genuine access/safety/scientific-enabling benefit?
- Is recurring use medically or technically unavoidable rather than exploitative?
- Is the product materially better than the incumbent even if imperfect?

## Sector doctrines
Healthcare/pharma:
- useful treatment does not automatically make the company useful
- assess clinical benefit, pricing/access, treatment incentives, curative vs chronic dynamics, prescribing/marketing conduct, exclusivity tactics, regulatory history
- high price alone is not a FAIL
- chronic treatment alone is not a FAIL

Food/agriculture:
- feeding people is not automatically enough
- assess nutrition, overconsumption incentives, inputs, toxicity, resistance, runoff, water, soil, biodiversity, long-term resilience

General-purpose tech:
- “can be used for good” is insufficient
- benefit must be intrinsic to the actual commercial activity

Automation/robotics:
- automation is not automatically useful
- qualify when it materially improves safety, essential capacity, resource use, critical infrastructure or creates a meaningful capability

Climate/circular economy:
- cleaner version of a harmful activity is not automatically enough
- verify substitution vs induced additional demand
- use lifecycle/counterfactual evidence where material

Culture/education:
- pure entertainment generally does not qualify
- genuine education, knowledge, science, culture or heritage access can qualify when intrinsic to the core product

## Evidence standard
Use current web research for every fund and every company.

There is no universal source hierarchy. Match authority to the claim.

Scientific claims — efficacy, safety, causality, health, environmental impact and technical outcomes:
1. current scientific consensus expressed through transparent, multidisciplinary scientific assessments relevant to the domain, such as IPCC/GIEC-style consensus assessments for climate and environmental questions
2. high-quality systematic reviews, meta-analyses, evidence-based guidelines and consensus statements that examine study quality, heterogeneity, risk of bias, publication bias, conflicts of interest and contradictory findings
3. multiple genuinely independent, preregistered and replicated primary studies, clinical registries and formal technical publications when no mature consensus synthesis exists

Legal, regulatory and corporate-status claims:
1. the exact regulator, government registry, exchange filing, court or official legal record
2. audited records and attributable official company documents
3. high-quality journalism only as corroboration or a discovery lead

A regulator, government or court is authoritative for what it approved, filed, ordered or legally recorded. It is not, by that fact alone, authoritative for scientific truth. Publication in The Lancet or any other prestigious journal is not a validity guarantee.

Consensus is not paper counting. Treat papers sharing authors, data, methods, funders or intellectual provenance as potentially dependent evidence streams. A large literature is not consensus when comparably credible findings contradict it.

Rules:
- company marketing can establish what the company claims/sells, not independently prove impact
- for every material scientific claim assess independence, study design, comparator suitability, replication, external validity, effect size and uncertainty, heterogeneity, selective reporting, publication bias and conflicts of interest
- absence of identified misconduct is not proof of no misconduct
- phrase conduct findings as “targeted searches found no material public signal” when appropriate
- when credible scientific sources conflict, record both sides and do not silently choose the favourable version
- MAIN requires the material scientific claim to be robust to reasonable informed challenge: aligned with the relevant consensus or, where no mature consensus exists, supported by convergent sufficiently independent high-quality evidence without a comparably credible contradiction
- PENDING is mandatory when credible expert disagreement remains, results are materially balanced or heterogeneous, independent replication is absent, or bias, selective reporting or conflicts of interest prevent a stable conclusion; write the dispute or bias and a falsifiable resolution condition to `what_it_needs_to_qualify`
- EXCLUDED is appropriate when robust consensus or convergent high-quality evidence establishes a named structural contradiction or no material advantage over the named substitute on the named dimension; evidence immaturity or possible bias alone never creates a structural FAIL
- absolute “undisputability” is not scientifically honest; use robustness after serious adversarial review with material uncertainty disclosed
- material factual claims must have URLs stored in Evidence Log
- use current dates and current operating status
- verify that the company still exists, has not been acquired/closed/renamed, and identify the current canonical entity

## French VC fund discovery
Maintain and consume the `VC Fund Queue` tab.

Definition of a French VC fund for discovery:
- headquartered in France, OR
- has a dedicated France-based venture investment team/fund with an identifiable startup portfolio

Include:
- seed, Series A/B, growth venture
- deeptech/health/climate specialist VCs
- corporate venture funds with genuine external startup portfolios
- micro-VCs and emerging managers once major funds are covered

Exclude from the VC queue:
- PE-only funds
- real-estate funds
- fund-of-funds with no direct startup portfolio
- debt-only funds
- pure advisory firms
- accelerators with no investment activity, unless they operate an actual fund

Discovery priority:
1. major institutional French VCs
2. sector specialists
3. regional VCs
4. corporate VCs
5. micro-VC / emerging managers
6. long-tail managers

Continuously expand the queue from authoritative directories and official fund sites.
Prefer funds expected to add the most previously unseen companies, but never skip a fund permanently because of overlap.

## Fund processing procedure
For the next uncompleted fund in `VC Fund Queue`:

1. Verify fund identity, website and French VC qualification.
2. Find the fund’s official current portfolio.
3. Enumerate the FULL portfolio, not a sample.
4. Record the portfolio URL and date.
5. Resolve each portfolio entry to a canonical company.
6. Detect duplicates against `Company Tracker` using:
   - canonical name
   - website/domain
   - former names
   - acquired/renamed entities
7. Skip non-company entries, funds/SPVs and obvious duplicate brand aliases.
8. For every real company:
   - verify VC backing and fund relationship
   - verify country/headquarters
   - verify operating status
   - research the business model and core product
   - run the complete 8-criterion analysis
   - run adversarial + reverse-adversarial review
   - apply readiness gate
   - update database immediately
9. After every company, persist:
   - decision
   - evidence
   - investors/fund relationship
   - last reviewed date
   - country
   - promotion requirement if Pending
10. After full fund completion:
   - mark fund Completed
   - record counts
   - record unique new companies
   - move immediately to next fund
11. Continue until execution/tool budget is exhausted.
12. Never leave completed research only in the final response; persist after each company.

If a company was already analysed:
- do not duplicate the row
- add the newly discovered investor/fund relationship
- refresh the analysis only if:
  - prior review is stale,
  - commercialisation/readiness changed,
  - material new evidence exists,
  - previous decision conflicts with current methodology

## Coverage objective
Optimise for exhaustive French ecosystem coverage, not novelty of funds.

Track:
- funds discovered
- funds completed
- funds remaining
- total unique companies discovered
- unique French-headquartered companies
- Main count
- Pending count
- Excluded count
- duplicates avoided
- stale analyses needing refresh

Do not stop discovering funds when the initial queue ends.
Refill the queue and continue.

## Database writes
Write to these Neon tables. The names in backticks are the legacy Sheet tab
labels, kept for readability; the authoritative write target is the Neon table
named in brackets.

`Company Tracker` [Neon: `companies`, with the eight C1-C8 verdicts written only through
`public.apply_classified_claim(...)`; direct INSERT/UPDATE of `criterion_reviews` is forbidden]
Canonical one-row-per-company record.

Writer contract:
- every C1-C8 proposal calls `public.apply_classified_claim` with `fact_class='structural'`, a criterion number, verdict, rationale, writer identity and source reference;
- readiness, liveness, scope and finance claims call the same procedure without a criterion target and are routed to their dedicated destination;
- a non-structural class aimed at C1-C8 is rejected and audited;
- a deterministic phrase guard rejects structural-labelled rationales that contain readiness, liveness, scope or finance facts;
- no writer may fall back to direct criterion DML after a rejection.

Required fields:
- Company
- Additionality State
- Named Substitute
- Comparison Dimension
- Additionality Rationale
- Category
- Public State
- Commercialised?
- C1 Problem
- C2 Direct
- C3 100x
- C4 Incentives
- C5 Solves
- C6 Value Creation
- C7 Externalities
- C8 Conduct
- What it needs to qualify
- Notes
- Company Website
- Country
- Investors
- VC Source Funds
- Last Reviewed
- Methodology Version
- Publishable?
- Evidence Summary

`VC Fund Queue` [Neon: `vc_funds`]
- Fund
- Website
- France qualification
- Fund type
- Portfolio URL
- Status
- Priority
- Portfolio companies found
- Companies processed
- Unique new companies
- Main
- Pending
- Excluded
- Last scanned
- Completed at
- Notes

Allowed Status (write the string exactly as listed):
- Queued
- In Progress
- Completed
- Needs Review
- Invalid / Not VC

`Complete` is not a valid value. The only completed-state string is `Completed`.

`Evidence Log` [Neon: `evidence`]
One row per material piece of evidence:
- Company
- Criterion
- Source URL
- Publisher
- Source type
- Publication date
- Claim supported
- Supports / contradicts
- Retrieved date
- Notes

`Run Log` [Neon: `review_runs`]
One row per automation run:
- Run date
- Funds completed
- Fund in progress
- Companies processed
- New companies
- Updated companies
- Main added
- Pending added
- Excluded added
- Duplicates avoided
- Errors
- Next fund
- Coverage snapshot

## Output discipline
Do all research silently.
Do not narrate searches, reasoning steps, tool calls or internal debate.
Do not produce motivational language.
Do not restate methodology in the final output.

Final response format ONLY:

RUN YYYY-MM-DD
Funds completed: <n> — <names>
Fund in progress: <name or none>
Companies processed: <n>
New companies: <n>
Updated existing companies: <n>
Main added: <n> — <names>
Pending added: <n> — <names>
Excluded added: <n>
Duplicates avoided: <n>
Coverage: <completed funds>/<known funds> funds | <unique companies> unique companies
Next fund: <name>
Errors: <none or concise list>

No other text.
