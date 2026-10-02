// clock.mjs — the only source of "now". Overridable so tests and examples are
// deterministic: CELLMODE_NOW="YYYY-MM-DD HH:MM".
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/** @type {(n: number) => string} */
const pad = (n) => String(n).padStart(2, '0');

/** @param {NodeJS.ProcessEnv} [env] @returns {string} */
export function now(env = process.env) {
  const override = env.CELLMODE_NOW;
  if (override !== undefined && String(override).trim() !== '') {
    const value = String(override).trim();
    if (!STAMP.test(value)) {
      throw new Error(`CELLMODE_NOW must look like "YYYY-MM-DD HH:MM", got: ${value}`);
    }
    return value;
  }
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + ` ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** @param {NodeJS.ProcessEnv} [env] @returns {string} */
export function today(env = process.env) {
  return now(env).slice(0, 10);
}

/** @param {unknown} value @returns {boolean} */
export function isStamp(value) {
  return STAMP.test(String(value ?? ''));
}
