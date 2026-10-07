// verification-argv.mjs — PURE. The one question "is this an argument array, or a shell string
// wearing an array's clothes?", kept apart from the contract's shape for the same reason
// `rules.mjs` is kept apart from `boundaries.mjs`: a reviewer checks a refusal rule and a
// document schema one at a time.
//
// ARGV, NEVER A SHELL STRING (decision BS3). A check runs with `shell: false`, so a `;`, a `&&`
// or a `$(…)` inside an argument is DATA: it reaches the program as text and nothing interprets
// it. That property is worth nothing if the program itself is an interpreter, so `sh -c …`,
// `bash -lc …`, `cmd /c …` and `powershell -Command …` are refused BY NAME — they smuggle a
// shell string back in through a legal-looking array. A target that needs a script runs the
// script directly; a target that needs a pipeline puts the pipeline in a file and names it.
//
// `bash deploy.sh` is NOT refused: the shell is being used as an interpreter for a file, not as
// a way to hide a command line. The refusal is the pair (wrapper program, command-string flag).

/** How many arguments a check may hold, and how long each may be. A command, not a program. */
export const MAX_ARGV = 32;
export const MAX_ARG_LENGTH = 300;

/** Programs whose job is to turn a STRING into a program. Matched on the basename with a Windows
 * extension stripped, so `/bin/sh` and `C:\…\cmd.exe` give the same answer. */
export const WRAPPERS = Object.freeze(['sh', 'bash', 'zsh', 'ksh', 'dash', 'ash', 'fish', 'csh',
  'tcsh', 'cmd', 'command', 'powershell', 'pwsh', 'busybox', 'nu', 'xonsh']);

/** The flags those programs use to mean "the next argument is a program". */
export const COMMAND_FLAGS = Object.freeze(['-c', '-ec', '-lc', '--command', '-command',
  '-commandwithargs', '-encodedcommand', '/c', '/k']);

/** Control characters, NUL and newline included: an argument carrying one could forge a line of
 * any report that prints it, and no legitimate command needs one. */
const CONTROL = /[\u0000-\u001f\u007f]/;

/** PURE. The basename of a program, lower-cased, with a Windows extension removed.
 * @param {string} program @returns {string} */
export function programName(program) {
  const last = String(program).split(/[\\/]/).pop() ?? String(program);
  return last.toLowerCase().replace(/\.(?:exe|com|cmd|bat|ps1)$/, '');
}

/**
 * PURE and TOTAL. Why `value` is not an argument array, or `null` when it is one. The ONE place
 * the shell-wrapper refusal lives, in this repository and in every target that copies it.
 * @param {unknown} value @returns {string | null}
 */
export function argvProblem(value) {
  if (!Array.isArray(value) || value.length === 0) return 'must be a non-empty array of strings';
  if (value.length > MAX_ARGV) return `must hold at most ${MAX_ARGV} arguments`;
  for (const part of value) {
    if (typeof part !== 'string' || part === '') return 'every argument must be a non-empty string';
    if (part.length > MAX_ARG_LENGTH) return `an argument may not exceed ${MAX_ARG_LENGTH} characters`;
    if (CONTROL.test(part)) return 'an argument may not hold a control character, a NUL or a newline';
  }
  const program = String(value[0]);
  // A program may be an absolute path, and on Windows a path may well contain a space.
  // What it may NOT be is a command LINE: whitespace with no path separator anywhere is
  // `npm run test` crammed into one element, which is the shell string this schema exists to
  // refuse. A path separator is what tells the two apart, and nothing else here guesses.
  if (/\s/.test(program) && !/[\\/]/.test(program)) {
    return 'the first element is the PROGRAM, not a command line: "npm run test" is a shell string, ["npm","run","test"] is an argv';
  }
  if (WRAPPERS.includes(programName(program))) {
    const flag = value.slice(1).find((part) => COMMAND_FLAGS.includes(String(part).toLowerCase()));
    if (flag !== undefined) {
      return `${programName(program)} ${String(flag)} is a shell string, not an argv: name the program itself`;
    }
  }
  return null;
}
