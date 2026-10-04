// ONE model call, with a deadline the plugin owns.
//
// Split out of the plugin because it carries a decision worth reading on its own: the
// deadline is ENFORCED, not requested. An adapter is handed an `AbortSignal` and should
// honour it, but "should" is not a property of code somebody else wrote - so the call is
// RACED against the abort, and this function settles either way. A test found this: an
// adapter that simply ignored the signal hung the whole test runner, which is exactly what
// would have happened to the dashboard.
//
// Two signals compose into one: the capability's own (cancellation from the kernel) and the
// advisor's timeout. `AbortSignal.any` would say this in one line and is not used: the
// explicit wiring is what the `finally` below can undo, handle by handle.
//
// TWO WAYS THIS FUNCTION ONCE FAILED TO SETTLE, both fixed below and both proved by
// observer-advisor-deadline.test.mjs, in a child process:
//   1. the deadline timer was `unref`'d, so when the model call was the only pending work
//      Node judged the loop idle and tore it down before the timer could fire. The call never
//      settled: on Node 22 `node --test` reported "Promise resolution is still pending but the
//      event loop has already resolved" and CANCELLED the test. A timer the correctness of
//      this function depends on must keep the process alive; `clearTimeout` in the `finally`
//      is what keeps it from outliving the call.
//   2. a signal that was ALREADY aborted when the call began aborted `deadline` before the
//      `expired` listener was attached — and `addEventListener('abort')` on an aborted signal
//      never fires. The state is therefore read, not only awaited.
//
// Nothing here reads the answer. Whatever comes back is `unknown` on purpose: the validator
// is the only thing allowed to have an opinion about a model's text.

/** @typedef {import('./types.mjs').ModelAdapter} ModelAdapter */

/**
 * @param {object} input
 * @param {ModelAdapter} input.adapter
 * @param {string} input.system the instruction the adapter is given
 * @param {string} input.context the bounded context, already measured and capped
 * @param {string} input.question
 * @param {number} input.maxOutputChars
 * @param {number} input.timeoutMs
 * @param {AbortSignal} [input.signal] the capability's own signal, when the caller gave one
 * @returns {Promise<unknown>} whatever the adapter put in `text`, unexamined
 */
export async function callModel({
  adapter, system, context, question, maxOutputChars, timeoutMs, signal,
}) {
  const deadline = new AbortController();
  const forward = () => deadline.abort();
  if (signal?.aborted === true) deadline.abort();
  else signal?.addEventListener('abort', forward, { once: true });
  // REF'd on purpose: see note 1 in the header. The timer is cleared on every exit path.
  const timer = setTimeout(forward, timeoutMs);
  /** @type {Promise<never>} */
  const expired = new Promise((_resolve, reject) => {
    const give = () => reject(new Error(
      `the model adapter "${adapter.id}" did not answer within ${timeoutMs} ms`,
    ));
    // Read the state first: an already-aborted signal emits no event (note 2).
    if (deadline.signal.aborted) give();
    else deadline.signal.addEventListener('abort', give, { once: true });
  });
  try {
    const answer = await Promise.race([
      adapter.complete({ system, context, question, maxOutputChars, signal: deadline.signal }),
      expired,
    ]);
    return /** @type {{ text?: unknown }} */ (answer ?? {}).text;
  } finally {
    // No timer survives the call: nothing in this plugin ever runs on its own.
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}
