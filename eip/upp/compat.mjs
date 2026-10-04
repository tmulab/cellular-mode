// The compat layer: an existing `definePlugin` manifest, described as a UPP manifest.
//
// This is the cheapest possible proof that UPP is the SAME contract and not a second one. No
// plugin changes, no file under `eip/plugins/` is touched, and the mapping is a PURE
// function, so "every existing plugin is expressible" is a test rather than a claim
// (`tests/upp-compat.test.mjs`, criterion U6).
//
// Two mapping decisions worth defending, because both are lossy on purpose:
//
//   `entry.module` is the plugin's own KEY, not a filesystem path. For an in-process plugin
//   the host already holds the module object; the manifest is a DESCRIPTION of a plugin, not
//   an instruction for loading one, and a path in it would be a path somebody could change
//   underneath the hash that pins it.
//
//   `devUi` does not cross. A UPP manifest has no field for markup (`docs/upp/SPEC.md` §4),
//   so only the dev-UI TITLE is recorded, in `extensions` — the one tolerant container. The
//   body stays where it is served from, in the process that owns the document.
import { describeManifest } from '../sdk/index.mjs';
import { assertUppManifest } from './manifest.mjs';
import { UPP_VERSION } from './version.mjs';

/** @typedef {import('../sdk/types.mjs').Manifest} Manifest */

/** Every `definePlugin` manifest maps to this runtime: it is already in the process. */
export const COMPAT_RUNTIME = 'in-process';

/**
 * `definePlugin` manifest -> UPP manifest. Throws `TypeError` if the result would not
 * validate, so a mapping defect is loud at the moment it is introduced rather than at the
 * moment a plugin in another language disagrees with it.
 *
 * @param {Manifest} manifest a manifest that has already passed `validateManifest`
 * @param {{ module?: string }} [options] override the declared module specifier
 * @returns {Record<string, unknown>} the frozen UPP manifest
 */
export function toUppManifest(manifest, options = {}) {
  // `describeManifest` is the SDK's own projection: metadata, no `apply`, no dev-UI body. It
  // is reused so this function cannot see — let alone copy — anything a host would not
  // publish, and so the capability projection has one implementation and not two.
  const described = describeManifest(manifest);
  /** @type {Record<string, unknown>} */
  const mapped = {
    upp: UPP_VERSION,
    id: described.name,
    version: described.version,
    description: described.description,
    type: 'capability',
    runtime: COMPAT_RUNTIME,
    entry: { module: options.module ?? described.name },
    capabilities: described.capabilities,
  };
  // `ManifestDescription` types these as optional because the SDK manifest does; the SDK's
  // own projection always sets them, and the defaults say so without assuming it.
  const permissions = described.permissions ?? [];
  if (permissions.length > 0) mapped.permissions = [...permissions];
  const dependencies = Object.entries(described.inject ?? {});
  if (dependencies.length > 0) {
    mapped.dependencies = Object.fromEntries(
      dependencies.map(([key, spec]) => [key, { required: spec.required }]),
    );
  }
  if (described.config !== undefined) mapped.config = described.config;
  /** @type {Record<string, unknown>} */
  const extensions = { sdk: described.sdk };
  if (described.devUi !== undefined) extensions.devUi = { title: described.devUi.title };
  mapped.extensions = extensions;
  return assertUppManifest(mapped);
}

/**
 * The reverse reading a reviewer actually needs: does this UPP manifest still describe the
 * SDK manifest it came from? Returns `[{path, message}]` — empty means yes. It exists
 * because a round trip through `toUppManifest` is not a proof on its own: a mapping that
 * dropped `consequential` would round-trip perfectly and be catastrophic.
 *
 * @param {Manifest} manifest @param {Record<string, unknown>} upp
 * @returns {Array<{ path: string, message: string }>}
 */
export function compatBreaches(manifest, upp) {
  const expected = toUppManifest(manifest, { module: String(
    /** @type {{ module?: unknown }} */ (upp.entry ?? {}).module ?? manifest.name,
  ) });
  /** @type {Array<{ path: string, message: string }>} */
  const out = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(upp)])) {
    const left = JSON.stringify(/** @type {Record<string, unknown>} */ (expected)[key]);
    const right = JSON.stringify(upp[key]);
    if (left !== right) out.push({ path: key, message: `expected ${left}, got ${right}` });
  }
  return out;
}
