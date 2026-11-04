# Conference Presentation Script
## Archon Specs — Live Demo Walkthrough
### "Drop Your Diagram. Get Your Backend."

---

> **Format:** Technical conference talk or product demo slot  
> **Length:** 8–12 minutes  
> **Slide deck needed:** None — the browser IS the presentation  
> **Setup:** Open `show.html` in full-screen Chrome. Start at the top of the page.  

---

## BEFORE YOU GO ON STAGE

- Full-screen the browser (`F11` or `Cmd+Shift+F` on macOS)
- Set display zoom to 100% — the sticky-scroll needs the full viewport
- Test the scroll speed: slow, deliberate, one act at a time
- Have `archonspecs.dev` ready in a second tab for the close

---

## THE SCRIPT

---

### [OPENING — Standing still, no scroll yet]

*"Quick question. Show of hands — how many of you have written the same backend more than three times?"*

*(pause, look around)*

*"Auth. CRUD. DTOs. Migrations. Dockerfile. The whole thing. Different project, same backend. Every. Single. Time."*

*(pause)*

*"That's what I want to talk about today. Not AI. Not prompts. Not agents. I want to talk about what happens when you treat your architecture diagram like what it actually is — a compiler input."*

---

### [SCROLL — slowly enter `#act-oldway`, Beat 0 appears]

**[BEAT 0 — The Manual Grind]**

*"This is how we build backends today. 47 files. Minimum. And every one of them — entities, services, DTOs, controllers, migrations, auth guards, Dockerfile, CI pipeline — every one of them has to be written by a human. Or hoped into existence by a language model."*

*(pause)*

*"Let me tell you what that actually costs. A senior engineer. Three to five days. For setup. Before a single line of business logic."*

---

### [SCROLL — Beat 1 appears: LLM trap]

**[BEAT 1 — The LLM Trap]**

*"So you try an AI agent. Makes sense. You ask it to generate the backend. And it works — for file one, file two, file three..."*

*(beat)*

*"By file thirty, the LLM has forgotten what it decided at file one. Context window degradation. The auth guard doesn't match the controller. The DTO doesn't match the entity. TypeScript won't compile."*

*"You spend two days fixing what the agent generated in two minutes. That's not a productivity gain. That's a different kind of debt."*

---

### [SCROLL — Beat 2 appears: Diagram drift]

**[BEAT 2 — Diagram Drift]**

*"And here's the one that really hurts. The architecture diagram."*

*(let the comparison sit for a second)*

*"You drew it in Week 1. Clean. Elegant. Everyone agreed on it. By Month 3, the codebase has gone one direction and the diagram is... documentation. Historical fiction. Nobody trusts it anymore."*

*"Your architecture is now whatever the most recent engineer thought was a good idea at 11pm."*

---

### [SCROLL — Beat 3 appears: The insight/unlock]

**[BEAT 3 — The Insight]**

*"But here's the thing that changes everything."*

*(slow down, let it land)*

*"The diagram was ALWAYS the spec. You just didn't have a compiler for it."*

*(pause 3 seconds)*

*"What if you did?"*

---

### [SCROLL — enter `#act-drop`, UML begins drawing in]

**[ACT 2 — The Enterprise UML Drop]**

*"This is a real SaaS backend. Not a tutorial with three tables. This is what a production system looks like."*

*(let the IDENTITY entities draw in)*

*"Identity domain. User, Profile, Organization, Role."*

*(AUTH draws in)*

*"Auth. Sessions, API keys, audit log."*

*(WORKSPACE draws in)*

*"Workspace. Documents, teams, team members."*

*(BILLING draws in)*

*"Billing. Plans, subscriptions, invoices."*

*(INTEGRATION draws in)*

*"Webhooks. Notifications."*

*(let the relationship lines animate)*

*"Sixteen entities. Eighteen relationships. Five bounded contexts."*

*(stat badge appears)*

*"This is the input."*

*(compile CTA pulses)*

*"One command: `archon compile diagram.uml`"*

*(pause — let it breathe)*

*"Watch what comes out."*

---

### [SCROLL — enter `#act-pipeline`, personas activate one by one]

**[ACT 3 — The 5 Personas]**

*(as ANALYST activates)*

*"First, the Analyst. Takes your diagram, resolves ambiguities, produces a locked Requirements Contract. Seven conflicts flagged and resolved automatically."*

*(ARCHITECT activates)*

*"Architect. Takes that contract, produces the UML class diagram. You review it. You approve it. That diagram is now LAW — it has a SHA-256 fingerprint and nothing downstream can contradict it."*

*(TECH LEAD activates)*

*"Tech Lead. Compiles the approved architecture. Plans 47 files. Zero conflicts. Clean."*

*(ORCHESTRATOR activates)*

*"Orchestrator. Shows you the execution plan. You approve it. You are the last human gate before generation runs."*

*(DEVELOPER activates)*

*"Developer. Materializes every file. Runs drift detection against the state manifest. If anything doesn't match the spec — it stops and tells you."*

*(pause)*

*"Every decision is traceable. Every phase is logged. No phase is skippable — not for the agent, not for you, not for us."*

---

### [SCROLL — enter `#act-boot`, terminal lines appear]

**[ACT 4 — The Boot]**

*(terminal starts printing)*

*"This is what actually runs."*

*(let the terminal breathe — don't narrate every line, let people read)*

*(as Docker builds)*

*"It detects your environment. Generates a 64-character JWT secret. Builds the containers."*

*(as services start)*

*"Three services come up: the API, PostgreSQL, Qdrant."*

*(migrations run)*

*"Sixteen entities migrated. Eighteen foreign key constraints. Six indexes."*

*(READY appears)*

*"47 files. 3 services. Zero errors."*

*(pause)*

*"From the locked diagram. That's it. That's the whole thing."*

---

### [SCROLL — enter `#act-wins`, cards reveal]

**[ACT 5 — The Three Numbers]**

*(~97% card appears)*

*"Ninety-seven percent fewer tokens. The LLM only runs during elicitation and architecture. Code generation — zero model calls. This is not AI-generated code. This is compiled code."*

*(4ms card appears)*

*"Four milliseconds to generate 47 files. A GPT-4 agent doing the same thing takes two to six minutes — and it hallucinates along the way. We're thirty thousand times faster because there's no model in the critical path."*

*(0 card appears)*

*"Zero hallucinations. Not 'very few'. Zero. Templates are functions. Functions can be tested. This template has a test suite. It broke once, we fixed it, and every generation since then benefits from that fix."*

*(final punchline appears)*

---

### [PAUSE — look up from the screen]

*"Templates can be tested."*

*(pause)*

*"Hallucinations can't."*

---

### [CLOSING — no more scrolling]

*"Here's what you walk away with. Standard NestJS. Standard TypeScript. Standard PostgreSQL. Archon is not in your package.json in production. You own the code. You can delete the `.archon/` folder tomorrow and you have a clean repo that passes CI."*

*"The cost of leaving should always be lower than the cost of staying for the wrong reasons. That's a design principle, not a sales pitch."*

*(pull up archonspecs.dev in the browser)*

*"Drop your diagram. Get your backend."*

*"`archonspecs.dev`"*

*"I'll be around after the talk if you want to run it on your own diagram."*

---

## TIMING GUIDE

| Act | Scroll pace | Target time |
|-----|------------|-------------|
| Opening (standing still) | — | ~1 min |
| Act 1 — Old Way (4 beats) | Slow, one beat per 15–20s of talk | ~2.5 min |
| Act 2 — UML Diagram | Let animations run, narrate domains | ~1.5 min |
| Act 3 — Personas | One persona per 20s | ~1.5 min |
| Act 4 — Terminal Boot | Let it print, light narration | ~1 min |
| Act 5 — Three Numbers | Pause on each card | ~1 min |
| Closing | — | ~1 min |
| **Total** | | **~10 min** |

---

## AUDIENCE Q&A PREP

**"Does it only work with NestJS?"**  
*"Currently yes — NestJS + TypeScript + PostgreSQL is the production-ready target. The template engine is language-agnostic by design, so Spring Boot and FastAPI targets are on the roadmap."*

**"What if my architecture doesn't fit a standard pattern?"**  
*"The Architect persona handles custom entity relationships and non-standard module boundaries. You draw the diagram — Archon compiles it. If you can express it as a UML class diagram, you can compile it."*

**"Isn't this just a scaffold generator?"**  
*"A scaffold runs once and you throw it away. Archon's DesignSpec.json is a living contract — it diffs against every re-run, detects drift, and reconciles. The spec and the codebase stay in sync. That's a compiler, not a scaffold."*

**"What about the code you write on top?"**  
*"Archon generates the infrastructure layer — modules, entities, controllers, DTOs, guards, migrations, Docker, CI. Your business logic goes in the service methods. Those files are preserved across re-generations. The Developer persona runs drift detection to protect your manual code."*

**"How do I trust the 94% TypeScript compile rate number?"**  
*"We ran the booking system spec 1,000 times. 940 compiled clean on first run. The 6% failures were edge cases in the migration generator — one template bug that was fixed in that same test run. Since that fix: 100% on the booking spec. We publish the methodology at archonspecs.dev/benchmarks."*

---

## KEY PHRASES TO MEMORIZE

These are the lines that land. Say them slowly.

1. *"The diagram was always the spec. You just didn't have a compiler for it."*
2. *"No phase is skippable — not for the agent, not for you, not for us."*
3. *"Templates can be tested. Hallucinations can't."*
4. *"The cost of leaving should always be lower than the cost of staying for the wrong reasons."*
5. *"Drop your diagram. Get your backend."*

---

*Last updated: 2026-05-26*
