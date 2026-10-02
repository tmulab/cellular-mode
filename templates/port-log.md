# PORT_LOG — <new project name>

> Append-only record of what was ported from a legacy repository into this one, and what
> was deliberately left behind. Copy to `PORT_LOG.md` at the root of the **new**
> repository; never write it into the legacy. Newest entry last.
>
> Procedure: `skills/port/SKILL.md`. Without this file a refactor becomes archaeology;
> with it, anyone — including an agent in a later session — can reconstruct what came from
> where and why.

## Conventions

- One entry per ported module, dated.
- Record the legacy **commit** each file came from: the legacy keeps moving.
- "Discarded" and "not ported yet" are as important as "came over clean". An empty
  discard list usually means a one-to-one copy, which is not a port.
- The legacy is deprecated only after the gates are green in this repository **and** the
  agreed parallel-use period has passed.

---

## <YYYY-MM-DD> — <module X>

### Source
- `<legacy path>/<file>` (commit `<hash>`)
- `<legacy path>/<file>` (commit `<hash>`)

### Destination
- `<new path>/<file>`
- `<new path>/<file>` (tests)

### What came over clean
- `<the business logic, validation rule or expression that was already right>`
- `<an expression that preserves a hard-won fix — name the legacy commit so the reason
  survives>`

### What was discarded
- `<obsolete function — unused>`
- `<duplicated setup — redone per the new architecture>`

### What changed
- `<hand-written types -> generated from the contract>`
- `<old component style -> the new one>`
- `<naming, layout and tokens adopted from this repository, per "new architecture wins">`

### Not ported yet (slot)
- `<feature — blocked on a service this repository does not have yet>`

### Verification
- Trilateral: `<three lines with real counts>`
- Static sanity / accessibility: `<result>`
- Full-system rung: `<result, or "not applicable — see skills/coverage/SKILL.md">`

### Legacy status
- `<untouched and in production / deprecation comment added with approval on DATE /
  deprecated on DATE after N weeks of parallel use>`
