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
- the problem is severity level 1, 2 or 3
- R1-R4 pass, with no exception except the level 1 R1 bypass described below
- an independent third party has measured the outcome
- for a service, the benefit is shown to persist after the engagement ends

PENDING
- all 8 structural criteria = PASS
- the problem is severity level 1, 2 or 3
- R1-R4 pass but nobody outside has measured the outcome yet, OR R1 alone is suspended by the level 1 bypass
- every Pending company must have a precise, falsifiable “What it needs to qualify” statement

EXCLUDED
- ANY of R1-R4 fires, except the level 1 R1 bypass
- severity level 4 or 5
- ANY remaining structural criterion is FAIL
- company-level exclusion details remain internal
- public product shows only aggregate excluded count
- do not downgrade a structural FAIL into Pending

If the company's design or business model is too unclear to decide a structural criterion:
- research the product design and business model further;
- if the structural fact itself remains unknown, use UNCLEAR;
- never use missing outcome evidence as a structural UNCLEAR or FAIL.

If the structural mechanism passes but independent outcome measurement is absent:
- keep the structural verdict PASS;
- classify Pending;
- route exactly what a third party must measure to `what_it_needs_to_qualify`;
- never invent facts.



<!-- ENGINE_METHODOLOGY_START -->
## useful.vc — engine methodology

**Status.** Replaces the three-test doctrine of commit fe4544f, the five-point rule, and every earlier selectivity formulation. Write into 02_classifier_system_prompt.md and 06_french_vc_coverage_automation_prompt.md, identically, and delete the commons exception — §5 supersedes it and removes the formal conflict with the one-FAIL rule that you correctly identified.

Nothing in here is negotiable case by case. See §9.

### 1. The question

> **Does the product do the thing, or does it help someone else maybe do it?**

### 2. The four exclusion rules

Any one fires and the company is Excluded. No averaging, no compensation.

#### R1 — The product must do the thing itself

If the benefit only exists after a third party decides, develops, finances or deploys something, Excluded.

Fails: discovery platforms, R&D tooling, models, datasets, plans, candidate molecules. The output is an input to somebody else's decision.

#### R2 — Whoever pays must not be the one who benefits

If the customer is also the beneficiary and what they gain is time or money, Excluded. Both conditions required.

#### R3 — The product must reduce the problem, not manage it

Insuring a risk, financing a purchase, compensating a loss, taking a fee on a transaction: the problem moves, it does not go away.

#### R4 — The company must lose money if the problem disappears

If it earns more while the problem lasts, Excluded. This is the success-collapse test.

### 3. Severity levels

Only levels 1 to 3 qualify. Levels 4 and 5 are Excluded without discussion.

#### Level 1 — kills or maims

Fatal disease, antimicrobial resistance, sepsis, cancers, epidemics, maternal and neonatal mortality, suicide, addiction, acute malnutrition, unsafe water, unbreathable air, lethal heat, occupational and road deaths, structural collapse, mines and unexploded ordnance.

#### Level 2 — lasting damage to health, capability or living things

Chronic disease, disability, loss of sight, hearing or mobility, persistent pain, mental illness short of death, occupational toxic exposure, loss of autonomy in old age, a child who does not learn to read or count, and industrial livestock production.

#### Level 3 — wears out what we live on

Energy, metals and critical minerals, capacity to produce food, fresh water, farmland, living soil, pollinators, persistent pollutants, species loss and ecosystem integrity.

#### Level 4 — secondary, proxy-measured, dependent on a policy framework

Carbon accounting, credits, offsetting, ESG scoring, regulatory reporting. Excluded.

#### Level 5 — comfort, productivity, entertainment

Excluded.

#### Ordering within qualifying levels

Severity × number × irreversibility.

A rare fatal condition beats a common mild one. A severe and common problem beats everything. Irreversible damage outweighs recoverable damage of the same size: extinction, aquifer depletion, farmland lost to concrete, permanent disability, pollutants that never degrade.

This is a precedence order for close calls, not a formula to compute.

#### Political dependency

If the benefit only exists because a regulation, or a market created by regulation, exists, it is not a physical benefit.

A carbon credit dies when the market dies. Insulation still insulates. An MRV provider has no product if the protocol changes; a company that restored an ecosystem has restored it.

Biodiversity outranks carbon, and this is stated deliberately. A lost species is lost permanently; an emitted molecule can in principle be recovered. Irreversibility decides.

Note: physical circular-economy work is unaffected. Fairmat, Néolithe, Murfy, NOWOS and Mint change material flows and depend on no regulatory market.

### 4. Main or Pending

**Main** — an independent third party has measured the outcome.

**Pending** — passes the four rules, nobody outside has measured anything yet.

State precisely which evidence is missing, in what_it_needs_to_qualify.

Readiness decides only this. It never excludes. Absence of proof is Pending, never a structural FAIL, never a C7 externality. This was the most frequent error in the previous engine; the classified write gate now blocks it and the fixtures stand.

### 5. The level 1 bypass

For level 1 problems only, R1 is suspended. An upstream platform may enter at Pending when the problem it targets kills people.

Nothing else is ever suspended. R2, R3 and R4 hold under all circumstances.

This admits Generare, AQEMIA, Basecamp Research and Kyron.bio at Pending — antibiotics and oncology. It does not admit Hephaestus (fusion is level 3) or Futurail (level 4-5).

### 6. Two kinds of exclusion — always state which

R1 says "not yet." Reversed by a result, not by an argument.

A platform does not enter on its promise. It enters on its first result.

Threshold, public and not self-declarable: a product originating from the company enters regulated clinical development, or reaches equivalent verifiable deployment, in a named programme. For Generare: a Generare-originated molecule entering regulated development. "A handful of molecules with antibiotic activity" is not the threshold — they already have that.

R2, R3 and R4 say "not like this." No evidence reverses them; only a change of business model does. Orus Energy does not become useful by measuring its marginal carbon better. An insurer would have to start reducing the hazard, which is a different business — Stoik is the instructive borderline, combining prevention, incident response and cover.

Founders excluded under R1 are owed the milestone. Founders excluded under R2–R4 are owed the truth about the model.

### 7. Business-model hierarchy — a modifier, never a fifth rule

What remains when the invoice stops?

1. Something built that exists without you: molecules, devices, materials, processes, varieties, restored ecosystems, repaired objects.
2. Something physical you built and operate: recycling plants, storage, production.
3. Software: the benefit lasts while the licence is paid and the company lives.
4. People's time: consulting, agencies, integration. Stops with the invoice, does not compound.

Contract form is irrelevant; what remains is what counts. MORFO sells a service and ranks at 1 because the forest stands on its own.

Inside software, the discriminator: did something have to be invented that nobody knew how to do, or were existing bricks assembled cleanly? Evidence: a patent, regulatory clearance, peer-reviewed validation, a prototype that took years — versus a good product team and some APIs.

This is a modifier, not an exclusion. Used as a rule it would remove human-delivered care (Oviva, Doccla, Epoca, Jinko Care, Annette), which passes the four rules. It does two things instead: it breaks ties between equivalent files, and it raises the bar for Main — a service must additionally show the benefit persists after the engagement ends. NICE already makes exactly that criticism of Oviva in our own record.

### 8. Every verdict must record

- which rule fired, and whether it is "not yet" or "not like this"
- for R1: the threshold that would reverse it
- for R2–R4: what in the model produces the failure
- additionality_substitute, additionality_dimension, additionality_rationale
- the party bearing the deficit, and whether they can escape it
- for Pending: what a third party would have to measure

A verdict naming no rule is not a verdict. A company kept without a written reason is the same defect as a company excluded without one, and it is harder to notice.

### 9. No exceptions

The rules are written. Borderline cases are settled with the rules as they stand. Disagreement about a case does not reopen the doctrine.

Do not add carve-outs. Do not create new statuses. Do not introduce a category label as a reason.

Prohibited as stated reasons: "we don't need more restaurants", "leasing is not useful", "fintech is not useful", "ordinary productivity". Each substitutes a judgement about a sector for a judgement about a company. The 13 editorial exclusions were made this way and not one survived contact with an actual rule.

Prohibited: verdicts derived from the customer's identity. Selling to a hospital confers nothing; selling to a pharma company condemns nothing.

Prohibited: readiness or liveness inside a criterion. Enforced by the write gate.

### 10. Re-judgement

Order: the 13 first, then the 154 published, then the rest.

Expect roughly 45 of the 154 to leave and 4 to return through the level 1 bypass. Concentrated in the carbon layer, the remaining finance and insurance, and the tooling layer of Main and Pending.

Two cases to settle explicitly, both currently inconsistent with decisions already in the database:

**Jèko against Wave Mobile Money, which is Excluded.** Jèko states it "optimises the experience of existing solutions rather than replacing them." If the named substitute is out, the company improving that substitute's experience cannot be in. R3 applies regardless.

**Flot against Tugende, which is Excluded on "authoritative independent evidence creating material contradiction on borrower outcomes."** Same lease-to-own model, same region, same population.

Companies that return under the corrected levels, having been wrongly dropped by earlier formulations: Oxyle (PFAS destruction, level 3 persistent pollutants), Verley (animal-free dairy proteins, level 2), Entocycle (feed substitution, level 2-3), Poppins (childhood dyslexia, level 2). MORFO and Coral Vita are confirmed by rule rather than by accident.
<!-- ENGINE_METHODOLOGY_END -->

## The 8 structural criteria
Every company must be tested methodically, independently, one criterion at a time.

1. Qualifying severity
Assign the problem to level 1, 2, 3, 4 or 5 under §3. Levels 1–3 PASS. Levels 4–5 FAIL without discussion. Record the party bearing the deficit and whether they can escape it. Political or regulation-created market dependency is level 4; physical circular-economy work is assessed on the material flow it changes.

2. R1 — the product does the thing itself
Does the product produce the benefit itself, or is its output an input to a later third-party decision, development, financing or deployment? Discovery platforms, R&D tooling, models, datasets, plans and candidate molecules FAIL. For level 1 problems only, suspend R1, mark the bypass explicitly and force Pending with the public reversal threshold. No other bypass exists.

3. 100× scale is good
Would humanity clearly benefit if the company’s core activity/adoption became 100× larger?

4. R4 — success-collapse
Would the company lose money if the problem disappeared? If it earns more while the problem lasts, FAIL and state what in the model creates the failure.

5. R3 — reduce rather than manage
Does the product reduce the problem itself? Insuring a risk, financing a purchase, compensating a loss or taking a transaction fee while leaving the underlying problem in place FAILS.

6. R2 — payer and beneficiary
Is the customer also the beneficiary, and is the gain time or money? Both conditions are required. When both hold, FAIL. State who pays, who benefits and what they gain; customer identity never decides the verdict.

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

Then run a reverse-adversarial check before exclusion, solely to catch factual or rule-application errors:
- Was the rule applied to the actual product and business model?
- Was the severity level assigned correctly?
- If R1 fired, is the problem truly level 1 and therefore eligible for the sole authorised bypass?
- Are the named payer, beneficiary, problem mechanics and revenue mechanics accurate?

The reverse check may correct an error. It may not create a carve-out, category exception or new status.

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
- apply R1: tooling, models, datasets, plans and candidate outputs fail when somebody else must act before the benefit exists
- only a level 1 problem can suspend R1, and only to Pending

Automation/robotics:
- automation is not automatically useful
- apply the severity levels and R1-R4 to the actual product; do not create an automation or infrastructure exception

Climate/circular economy:
- carbon accounting, credits, offsetting, ESG scoring and regulatory reporting are level 4 and Excluded
- physical circular-economy work remains eligible at level 3 when it changes material flows and passes R1-R4
- biodiversity outranks carbon where irreversibility decides

Culture/education:
- comfort and entertainment are level 5 and Excluded
- a child who does not learn to read or count is level 2; apply R1-R4 to the actual product

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
- EXCLUDED is appropriate when robust consensus or convergent high-quality evidence establishes that a named exclusion rule or structural criterion fires; evidence immaturity, possible bias or weak additionality alone never creates a structural FAIL
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
   - apply the Main/Pending independent-outcome evidence gate
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
- Additionality State (record-only compatibility field; never an admission gate)
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

Until dedicated columns are added by an approved schema migration, persist the
mandatory §8 record without inventing columns:
- severity level, party bearing the deficit and escapability in the C1 rationale;
- the fired rule and `not yet` / `not like this` class in the corresponding
  criterion rationale and Notes; write `none` for a retained verdict;
- the public R1 reversal threshold in `what_it_needs_to_qualify` and the C2
  rationale whenever R1 fires or is suspended;
- the named substitute, dimension and rationale in the existing
  `additionality_*` columns.

Populate `additionality_state` as required by the current writer contract, but
never use it to decide Main, Pending or Excluded. The four rules and remaining
structural criteria alone decide eligibility.

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
