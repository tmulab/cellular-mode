# 07 · Adaptation — making it yours

Cellular Mode ships with defaults, not with requirements. Adapting it is expected, takes
well under an hour, and has a concrete success test (below).

## The two layers

**The protocol layer — generic, keep it.** This is the method: cells and their lifecycle
(`02`), the state files and the projection principle (`03`), the two procedures
(`skills/cell`, `skills/pause`), the contract-based handoff (`04`), the context levels
(`06`), and the Level 1 bootstrap `AGENTS.md`. It contains no personal and no
project-specific information. You normally keep all of it unchanged.

What you may legitimately change in this layer: the **trigger phrases** (your language,
your words), the **state file names** (as long as `AGENTS.md` points at the right paths),
and the **symbols** if your tooling cannot render emoji.

**The profile layer — yours, replace it.** Two files hold everything specific:

| File | Holds | Shipped as |
|---|---|---|
| `vault/profile.md` | how *you* prefer to work: pace, interruptions, autonomy, review, language, trigger phrases | Optional and absent. Copy `templates/user-profile.md` if you want one. |
| `vault/policy.md` | *this project's* engineering values: line limits, gate commands, test runner, protected resources, approval list, commit policy | Optional and absent. Copy `templates/project-policy.md` to `vault/policy.md` and fill it in. |

The profile is **optional**. The method works with no profile at all; the defaults in
`AGENTS.md` are already a complete, usable configuration. An agent reads
`vault/profile.md` if it exists and never asks for one if it does not.

## Cognitive accessibility, framed neutrally

The protocol is built around working conditions that are ordinary and widespread:
**variable energy**, **non-linear focus**, and **interruptions that arrive without
warning**. Those are the design assumptions, for everybody.

Three consequences are worth naming explicitly, because they are the reason the profile
layer exists at all:

- **No diagnosis is involved.** The profile asks about *preferences and observed
  patterns* — "how long is a good session for you", "how do you prefer to be
  interrupted" — never about conditions, labels, health or medical history. An agent
  must never request, infer, or record such information, and the method never needs it.
- **Describe the real pattern, not the ideal one.** A profile that describes the person
  you intend to become produces reconnections that do not fit the person who shows up.
- **The method does not correct anyone.** It assumes your way of working is the engine,
  and builds the engineering around it. Non-linearity is made *safe* (everything
  recorded, everything resumable) rather than disciplined away.

## Writing your profile

Guiding questions — answer in a few lines each, concretely
(fields and neutral defaults: `templates/user-profile.md`):

- **Pace.** How long is a good focus session for you — 30 minutes? two hours? Does
  switching subjects restore your energy or drain it?
- **Your real cycle.** What does a working stretch look like from start to stop? Where
  does the idea come from, where does fatigue usually arrive?
- **What helps.** What does an assistant do that genuinely helps you? Be concrete:
  "exact file paths, always" is useful; "be helpful" is not.
- **What gets in the way.** Be even more concrete. Long preambles? Full project maps?
  Serial confirmation requests? Reopened decisions?
- **Interruptions.** Should the agent flag a risk immediately or hold it until the end
  of the step? How much ceremony is acceptable when stopping?
- **Autonomy and review.** Which decisions do you want to make yourself, and which do
  you prefer delegated with a one-line report?
- **Language and triggers.** Which language do you work in, and what do you actually say
  when you want to stop? ("stop here", "that's enough", "park this".) Put your real
  phrases in the profile; the skills will match them.

## Adapting the policy layer

`05-engineering-rules.md` is a default, not a law. Keep its *structure* — explicit
limits, a verification gate, a declared protocol for dangerous operations, a declared
data classification — and replace the numbers and commands with yours. If your project
has no code, you can drop the engineering layer entirely; cells, state and resumption
still work for writing, research, or planning.

Fill in the protected-resources table on day one, even partially. If you do not yet know
what belongs there, leave it empty and complete it during the first week of use — you
will find out quickly. Until then, everything mutable is treated as production.

## The adaptation test

Do not evaluate your adaptation by reading it. Run it:

1. Open the project in your agent and say your open-cell trigger (`/cell`, or your
   phrase).
2. **Work one real session** — real code, real decisions, real mess. Not a demo.
3. **Stop mid-way**, deliberately, before the work is finished: say your stop phrase
   ("stop here", `/pause`).
4. Close the session completely. Ideally come back the next day, with a fresh agent
   session, so no conversation memory is helping you.
5. Say your resume trigger.

**It passes if:** reconnection takes **under five minutes** and you had to **re-explain
nothing** — not your preferences, not the architecture, not where you had stopped, not
which decisions were already settled. The first thing you do after reconnecting should
be the recorded next step itself, not a conversation about what the next step is.

**If it fails, the diagnosis is usually one of four things:**

- The next step was not a single <5-minute action → step 6 of the pause ritual.
- The minimal context assumed knowledge that lived only in the conversation → write it
  for a stranger, with exact paths.
- You had to re-explain *how you work* → that belongs in `vault/profile.md`, not in the
  chat.
- The agent never read `AGENTS.md` → an adapter problem, not a method problem
  (see `adapters/README.md`).

Fix the one that failed and run the test again. When it passes, the method is yours.
