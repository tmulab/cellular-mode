// sanitize.mjs — PURE. One rule: a verification record never carries a machine-local path.
//
// A record may be read, quoted, pasted into an issue or scanned by this repository's own leak
// gate, which treats `.cellular/evidence/*` like any other file. Compiler and test output,
// however, is full of absolute paths. So every summary that reaches a record passes through
// here first: the known root is folded to `.`, then a Windows drive path and a POSIX home path
// are redacted by shape, and only the FIRST non-empty line survives, capped at 160 characters.
// A record is a record, not a transcript.

/** A machine-local absolute path has no business in a record that may be read, quoted or
 * pasted elsewhere; the repository's own leak gate scans this file like any other. Two shapes
 * are redacted — a Windows drive path and a POSIX home path — after the root is folded to `.`.
 * @param {unknown} text @param {string} [root] @returns {string} */
export function sanitizeSummary(text, root = '') {
  let out = String(text ?? '').replace(/\r/g, '');
  if (root !== '') {
    for (const form of [root, root.split('\\').join('/')]) {
      out = out.split(form).join('.');
    }
  }
  out = out.replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g, '<path>');
  out = out.replace(/\/(?:Users|home|root)\/[^\s"'<>|]*/g, '<path>');
  const line = out.split('\n').map((l) => l.trim()).filter((l) => l !== '')[0] ?? '';
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}
