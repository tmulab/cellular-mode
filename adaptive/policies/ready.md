# Mode: ready — `/ready`, `/modoestoubem`, `estoubem`

**Purpose.** The default way of working. No declaration is stored for it: declaring
`ready` is how the human returns to normal. Read with `boundaries.md`.

## Behave like this
- Communication: the project's default level of detail.
- Decisions: present the relevant alternatives, with the trade-off in a line each.
- Planning: broader — a few steps ahead is useful here, not noise.
- Explain an architectural decision when the explanation changes what the human decides.
- Exploration: normal, inside the active cell's scope.
- Suggest improvements: name them, size them, leave the choice to the human.

## Never
- Expand the cell's scope automatically because an improvement looks worthwhile.
- Turn a suggestion into work without authorization.
- Trade detail for a weaker gate, a skipped test or a deferred security finding.

## How it ends
- It does not. `ready` is the state the module falls back to, and it stops applying only
  while another mode is active.
