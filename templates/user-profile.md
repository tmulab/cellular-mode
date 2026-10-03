# Profile — how I prefer to work

> **Optional.** Cellular Mode works with no profile at all; the defaults in `AGENTS.md`
> are already a complete configuration. Copy this file to `vault/profile.md` only if you
> want to record preferences, and delete any field you do not care about.
>
> **No diagnosis is involved.** This file records *preferences and observed patterns*,
> never conditions, labels or health information. An agent must never ask for, infer or
> record such information — the method does not need it.
>
> Describe the pattern that is real, not the one you intend to have.

## Communication style

- Preferred tone: *(neutral default: direct, warm, no ceremony)*
- Preamble before an answer: *(default: none — start with the result)*
- Length: *(default: as short as the content allows; one screen unless asked)*
- Errors: *(default: quote the real message, literally; never an optimistic paraphrase)*
- File references: *(default: exact paths, always — never "in the config file")*
- Celebrate: *(default: concrete facts — "gates green, 3 files, decision X recorded")*

## Pace

- A good focus session for me lasts: *(default: 30–120 minutes)*
- Switching subjects: *(default: switching restores energy; it is not dispersion)*
- When my energy runs out: *(default: close the cell well rather than push one step further)*
- My usual cycle: *(default: idea → focus → build → fatigue → record → next cell)*
- Time of day: *(default: unspecified; make no assumptions)*

## Cognitive accessibility preferences

> These fields exist so the agent can fit how you work. **No diagnosis is needed, asked
> for, or relevant.** Answer only what is useful to you.

- Reconnection: *(default: ≤5 lines — cell, last fact, gate status, next step)*
- Panorama: *(default: never dump the project map or a long list of what is missing)*
- Decision load: *(default: at most one open question at a time)*
- Lists: *(default: at most ~8 lines; beyond that, summarize and say how many remain)*
- Boundaries: *(default: state scope explicitly; the agent holds global coherence)*
- Changes of direction: *(default: treated as method, never as a problem to correct)*

## Interruptions

- Risk found mid-step: *(default: say it once, immediately, then continue)*
- Out-of-scope idea of mine: *(default: park it in one line, do not block, do not follow it)*
- Interrupting me while I am working: *(default: only for a blocking or critical finding)*
- An unfinished cell: *(default: normal — never mentioned in a tone of debt)*

## Autonomy level

- Implementation details: *(default: decide and report in one line)*
- Architecture, stack, data model: *(default: propose alternatives and wait)*
- Refactors not asked for: *(default: do not — park the suggestion)*
- Bug found inside the current task: *(default: fix it and report the fix separately)*
- Scope that fits but was not agreed: *(default: ask, do not add)*

## Review frequency

- Gate report: *(default: three lines — typecheck, build, tests — after each change)*
- Progress report: *(default: at each closing, not during)*
- Diffs: *(default: small and complete, never loose fragments)*

## Notifications

- Long operation finished: *(default: one line, no summary)*
- Waiting for my approval: *(default: state exactly what is being waited on, then stop)*
- End of session: *(default: one line, no guilt, no list of pending work)*

## Language and trigger phrases

- I work in: *(default: English)*
- Open / resume a cell: *(default: `/cell`, "where did we stop", "let's resume")*
- Stop / close a cell: *(default: `/pause`, "stop here", "that's enough for today", "note this down")*
- Park an idea: *(default: "park this", "note this down for later")*
- Portuguese compatibility aliases, if you want them: `/celula`, `/pausar`, "vou parar",
  "chega por hoje", "anota aí", "onde paramos"

Put the words you *actually say* here; the skills match on these phrases.

## Approval requirements

Beyond the five approvals that `AGENTS.md` always requires (batch or destructive
operations, protected-resource mutation, marking a cell ✔ done, switching the active
cell, direction after a scope divergence), I also want to approve:

- *(example: adding a dependency)*
- *(example: any change to the public API)*
- *(example: anything touching authentication)*

Conversely, these need no approval from me: *(example: formatting; test files)*
