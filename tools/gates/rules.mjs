// rules.mjs — the LAYERING RULES of this repository, as data.
//
// They live apart from `boundaries.mjs` for the reason that file already gives about its
// exceptions: a rule and the algorithm that applies it are different things to review. A
// reviewer comes here to learn how the layers are shaped and reads a table; nobody has to
// read a matcher to find out what is allowed. A new rule is a new object, never a new branch.
//
// `eip/` may not exist yet, and a gate that fails on an absent directory would block the cell
// building it, so absence is "no files matched, nothing to say". Every rule is tested on
// in-memory fixtures, which is the other reason it has to be data.
import { ADAPTIVE_PURE_IMPORTS, HOST_GATE_IMPORTS, OBSERVER_PURE_IMPORTS } from './allowlists.mjs';

/**
 * One layering rule, as data. An ALLOW list or a DENY list, never both: `hasAllowList` in
 * `boundaries.mjs` decides which reading applies.
 * @typedef {{ id: string, why: string, from: RegExp, allowPrefixes?: string[],
 *   allowExact?: string[], allowSelfDepth?: number, denyPrefixes?: string[],
 *   denyExact?: string[] }} Rule
 */

/**
 * The rules. Each has `from` (which files it governs) and either an ALLOW list (anything else
 * is a violation) or a DENY list (everything else is fine).
 *   allowPrefixes - permitted target path prefixes · allowExact - permitted exact targets (a
 *   public entry point) · allowSelfDepth - target shares the file's first N segments (own
 *   module) · denyPrefixes / denyExact - forbidden targets
 * `node:` built-ins pass every ALLOW rule: this is a Node project and the standard library is
 * not a layering concern. A DENY rule may still name one (see the two transport rules).
 * @type {Rule[]}
 */
export const RULES = [
  {
    id: 'sdk-depends-on-nothing',
    why: 'eip/sdk is the floor: contract plus validators. If it imports the kernel, the contract stops being independently usable.',
    from: /^eip\/sdk\//,
    allowPrefixes: ['eip/sdk/'],
  },
  {
    id: 'kernel-imports-sdk-only',
    why: 'the kernel composes the contract; it must not know about hosts, plugins or orchestration.',
    from: /^eip\/kernel\//,
    allowPrefixes: ['eip/sdk/', 'eip/kernel/'],
  },
  {
    id: 'plugin-imports-sdk-and-own-dir',
    why: 'a plugin is replaceable: it may use the SDK, its own directory and shared domain code, never kernel internals, the host, orchestration, or a sibling plugin (siblings arrive through inject). An observer-* plugin and an adaptive-* plugin are each governed by their own rule instead, so that an extra allowance is read as an exception and not as the norm.',
    from: /^eip\/plugins\/(?!observer-|adaptive-)[^/]+\//,
    allowPrefixes: ['eip/sdk/', 'examples/text-stats/src/'],
    allowSelfDepth: 3,
  },
  {
    id: 'observer-plugin-imports-only-named-pure-modules',
    why: 'the observer reads a Cellular Mode vault, and a second parser of that vault would be a second truth; so it may import the SDK, its own directory and the NAMED pure modules listed in OBSERVER_PURE_IMPORTS - never state.mjs, never paths.mjs, never the CLI, never a disk-reading gate shell, never the kernel or the host.',
    from: /^eip\/plugins\/observer-[^/]+\//,
    allowPrefixes: ['eip/sdk/'],
    allowExact: [...OBSERVER_PURE_IMPORTS],
    allowSelfDepth: 3,
  },
  {
    id: 'adaptive-plugin-imports-only-named-pure-modules',
    why: 'the optional adaptive plugin reports a mode the human declared and how long that declaration still stands, and a second implementation of temporal validity would be a second answer to a one-answer question; so it may import the SDK, its own directory and the NAMED pure modules listed in ADAPTIVE_PURE_IMPORTS - never io.mjs (the only module that writes), never main.mjs, cli.mjs or hook.mjs, never context.mjs, never the kernel or the host. It reads the state through a path-confined host PORT, so it needs no disk module at all.',
    from: /^eip\/plugins\/adaptive-[^/]+\//,
    allowPrefixes: ['eip/sdk/'],
    allowExact: [...ADAPTIVE_PURE_IMPORTS],
    allowSelfDepth: 3,
  },
  {
    id: 'upp-imports-sdk-only',
    why: 'eip/upp is the Universal Plugin Protocol as PURE rules over data - manifest validation, version negotiation, message envelopes, the error mapping, the compat layer. It may import the SDK (whose key format, schema subset and closed error list it reuses rather than restates) and its own directory, and nothing else: a protocol module that knew the kernel, a plugin or the host would make the wire contract depend on one particular composition.',
    from: /^eip\/upp\//,
    allowPrefixes: ['eip/sdk/', 'eip/upp/'],
  },
  {
    id: 'upp-is-transport-free',
    why: 'the protocol and its transports are different things, and keeping them apart is what lets the same messages travel in-process, over NDJSON and over HTTP. So eip/upp holds no socket, no server, no host and no disk: node:http/https/http2/net/tls/dgram and node:fs are denied by name, because a rule that reads disk cannot be replayed against a fixture, and a conformance suite that cannot be replayed proves nothing.',
    from: /^eip\/upp\//,
    denyPrefixes: ['eip/host/'],
    denyExact: ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dgram', 'node:fs', 'node:fs/promises', 'node:child_process'],
  },
  {
    id: 'upp-is-imported-by-the-host-only',
    why: 'composition is the only layer entitled to know that an external plugin exists. The SDK, the kernel, orchestration, every plugin and the whole methodology side are denied eip/upp BY NAME, so the denial survives someone later widening an allow list: the kernel must keep working with no protocol layer at all, and a plugin must never learn which transport carried its caller.',
    from: /^(eip\/(sdk|kernel|orchestration|plugins)\/|tools\/(cellmode|adaptive)\/|skills\/|docs\/|adapters\/|templates\/)/,
    denyPrefixes: ['eip/upp/'],
  },
  {
    id: 'upp-host-imports-protocol-kernel-entry-and-sdk',
    why: 'eip/upp-host is where the protocol stops being pure: it spawns processes, opens sockets and reads the operator configuration from disk. It may import eip/upp (the contract it implements - the whole directory, because the protocol is one module in spirit and restating closedObject or checkBaseUrl here would create a second rule), eip/sdk (the closed error list and definePlugin, which build the manifest it hands the kernel), its own directory, and the kernel PUBLIC ENTRY only. Never a kernel internal, never a plugin, never eip/host: a transport that knew one composition would stop being a transport.',
    from: /^eip\/upp-host\//,
    allowPrefixes: ['eip/sdk/', 'eip/upp/', 'eip/upp-host/'],
    allowExact: ['eip/kernel/index.mjs'],
  },
  {
    id: 'upp-host-is-imported-by-the-host-only',
    why: 'the transports are the one part of this architecture that spawns a program and opens a socket, so the layer entitled to know they exist is composition and nothing else. The SDK, the kernel, orchestration, every plugin, the pure protocol layer and the whole methodology side are denied eip/upp-host BY NAME, so the denial survives someone later widening an allow list: the kernel must keep working with no transport in the repository, and eip/upp must stay replayable against a fixture.',
    from: /^(eip\/(sdk|kernel|orchestration|plugins|upp)\/|tools\/(cellmode|adaptive|gates)\/|skills\/|docs\/|adapters\/|templates\/)/,
    denyPrefixes: ['eip/upp-host/'],
  },
  {
    id: 'orchestration-uses-kernel-public-entry',
    why: 'the agent gateway is a client of the kernel, not a part of it: it may import the kernel public entry and the SDK, not kernel internals.',
    from: /^eip\/orchestration\//,
    allowPrefixes: ['eip/sdk/'],
    allowExact: ['eip/kernel/index.mjs'],
    allowSelfDepth: 2,
  },
  {
    id: 'host-composes-everything',
    why: 'composition is the one place allowed to know all the parts - that is what makes the other layers independent. It may additionally import the three NAMED leaf modules of tools/gates listed in HOST_GATE_IMPORTS (the exclusion list, the evidence shape and the git-head reader), because those are facts about this repository that the host read ports and the gates must agree on exactly; everything else in tools/ stays out of reach.',
    from: /^eip\/host\//,
    allowPrefixes: ['eip/', 'examples/'],
    allowExact: [...HOST_GATE_IMPORTS],
  },
  {
    id: 'kernel-and-sdk-are-transport-free',
    why: 'the runtime must not depend on a frontend or a transport. HTTP, sockets and the host live in eip/host.',
    from: /^eip\/(sdk|kernel)\//,
    denyPrefixes: ['eip/host/'],
    denyExact: ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dgram'],
  },
  {
    id: 'cellular-mode-is-runtime-independent',
    why: 'Cellular Mode is a methodology. It must run in a repository that has no eip/ directory at all, so neither the CLI, the skills, the docs nor the optional adaptive module may import the runtime.',
    from: /^(tools\/cellmode\/|tools\/adaptive\/|skills\/|docs\/|adapters\/|templates\/)/,
    denyPrefixes: ['eip/'],
  },
  {
    id: 'cellmode-does-not-depend-on-the-gates',
    why: 'the method must keep working in a repository that has no tools/gates directory at all, so the CLI records a ✔ and PRINTS that completion is not yet authorized instead of checking the authorization itself. Article 8 is enforced by tools/gates, which may read the CLI; the arrow never points back.',
    from: /^tools\/cellmode\//,
    denyPrefixes: ['tools/gates/'],
  },
  {
    id: 'adaptive-is-optional-and-isolated',
    why: 'Cellular Adaptive is an OPTIONAL, experimental module: the method, the CLI, the Observer and the runtime must all keep working with tools/adaptive deleted, so none of them may import it. The host reads it through a port instead, and its own ALLOW rule already refuses the direct import; eip/plugins/adaptive-* is left out of THIS rule because cell 5 granted it one named allowlist in one place (adaptive-plugin-imports-only-named-pure-modules); every other plugin directory, including every observer-*, stays refused here.',
    from: /^(tools\/cellmode\/|skills\/|docs\/|adapters\/|templates\/|eip\/(sdk|kernel)\/|eip\/plugins\/(?!adaptive-)[^/]+\/)/,
    denyPrefixes: ['tools/adaptive/'],
  },
  {
    id: 'prompt-builder-is-optional-and-isolated',
    why: 'the Cellular Prompt Builder is an OPTIONAL module: the method, the CLI, the gates, the Observer and the runtime must all keep working with tools/prompt-builder deleted, so NOTHING outside that directory may import it. This rule governs every file in the repository EXCEPT the Builder itself, so the Builder\'s own modules, tests and fixtures are excepted by construction and no name has to be added to an allowlist. In particular tools/cellmode may not import it: the arrow between the method and the Builder points one way only (PB1), because `cellmode` has to keep running in a checkout that never installed the Builder.',
    from: /^(?!tools\/prompt-builder\/)./,
    denyPrefixes: ['tools/prompt-builder/'],
  },
  {
    id: 'prompt-builder-depends-on-the-method-only',
    why: 'the Builder interviews a human and writes a contract; it may use node built-ins and the PURE modules of tools/cellmode, and nothing else. eip/ is denied because the Builder is methodology and must work in a repository with no runtime (the same promise cellular-mode-is-runtime-independent makes for the CLI, restated here so the Builder\'s independence is ONE rule to read). tools/adaptive/ is denied because an optional module that depended on another optional module would make both load-bearing. tools/gates/ is denied because the gates may read the method and never the other way round: a Builder that checked its own gate would be the bypass.',
    from: /^tools\/prompt-builder\//,
    denyPrefixes: ['eip/', 'tools/adaptive/', 'tools/gates/'],
  },
  {
    id: 'prompt-builder-is-transport-free',
    why: 'the Builder asks a human questions and writes two files; it has no business opening a socket or starting a program, and the narrowest privilege is the one it is never granted. node:http/https/http2/net/tls/dgram are denied so a prompt it assembled can never be sent anywhere, and no answer a human typed can leave the machine; node:child_process is denied so a project path, a technology name or a decision text can never reach a command line — the classic way quoted data turns back into instructions. A separate rule from the layering one above, as upp-is-transport-free is separate from upp-imports-sdk-only: "which layers may it see" and "which capabilities does it hold" are two questions a reviewer asks one at a time. Its own CLI tests run the CLI in process, so nothing here is an inconvenience the suite has to work around.',
    from: /^tools\/prompt-builder\//,
    denyExact: ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dgram', 'node:child_process'],
  },
  {
    id: 'bootstrap-is-optional-and-isolated',
    why: 'Cellular Bootstrap is an OPTIONAL module (BS1): the method, the CLI, the gates, the Builder, the Observer and the runtime must all keep working with tools/bootstrap deleted, so NOTHING outside that directory may import it. In particular tools/cellmode may not — `cellmode init` is untouched by Bootstrap and has to keep running in a checkout that never installed it — and neither may tools/gates, because the gates read the method and never the other way round. Bootstrap\'s own directory is excepted by the `from` pattern, not by an allowlist, so its modules, tests and fixtures need no name anywhere. TWO other names are excepted, and both are files the removal rehearsal DELETES WITH THE MODULE (./removal-paths.mjs): tests/verification-contract.test.mjs round-trips the BS3 verification contract across its generator (Bootstrap) and its reader (the gates), and tests/verification-shim.test.mjs holds the two H7 Windows shim resolvers — one in tools/gates/verification-suite.mjs, one in tools/bootstrap/exec-shim.mjs — to identical answers, which is a drift guard that cannot exist without both halves. Each is part of the bootstrap file set rather than part of the repository that must survive without it; the gate-side resolver keeps surviving coverage in tests/gates-verification-suite.test.mjs. Excepting a surviving file here would be a relaxation; excepting one that goes away with the module states the same arrow once.',
    from: /^(?!tools\/bootstrap\/|tests\/verification-(?:contract|shim)\.test\.mjs$)./,
    denyPrefixes: ['tools/bootstrap/'],
  },
  {
    id: 'bootstrap-depends-on-the-method-only',
    why: 'Bootstrap installs the METHOD into another directory; it may use node built-ins and the pure modules of tools/cellmode, and nothing else. eip/ is denied because the method must be installable into a repository with no runtime. tools/adaptive/ and tools/prompt-builder/ are denied because an optional module that imported another optional module would make both load-bearing — the Builder is reached as a SUBPROCESS through exec.mjs and judged on its exit codes (BS4), so there is no import edge of either kind and the PB3 gate needed no exception. tools/gates/ is denied because a gate file is COPIED as data by the article-8 component and never executed or imported here: an installer that imported the gate it installs could not be run in a checkout where that gate was deleted, and an installer that checked its own gate would be the bypass.',
    from: /^tools\/bootstrap\//,
    denyPrefixes: ['eip/', 'tools/adaptive/', 'tools/gates/', 'tools/prompt-builder/'],
  },
  {
    id: 'bootstrap-is-transport-free',
    why: 'Bootstrap reads an untrusted target tree and writes files into it. It must never be able to send any of that anywhere: node:http/https/http2/net/tls/dgram are denied by name in EVERY file of the module, so a target path, a detected command, a repository name or a line of somebody else\'s source can never leave the machine, and no part of an install can ever be fetched from a network instead of from this checkout. A separate rule from the layering one above, as upp-is-transport-free is separate from upp-imports-sdk-only: "which layers may it see" and "which capabilities does it hold" are two questions a reviewer asks one at a time.',
    from: /^tools\/bootstrap\//,
    denyExact: ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dgram'],
  },
  {
    id: 'bootstrap-starts-a-process-in-exec-only',
    why: 'Bootstrap does start programs — git probes, human-approved project checks, the optional Builder\'s CLI — so unlike the Builder it cannot deny node:child_process outright. It denies it EVERYWHERE BUT ONE FILE instead: the `from` pattern governs every module of tools/bootstrap except exactly exec.mjs, which is the single place that holds the capability and the single place a reviewer has to read to know that shell: false, an argv array, a timeout and an output cap are always applied. A second spawner would be a second set of those four decisions. The exception is in the pattern rather than in an allowlist, so it is one name that cannot go stale: delete exec.mjs and the rule simply governs the whole directory.',
    from: /^tools\/bootstrap\/(?!exec\.mjs$)/,
    denyExact: ['node:child_process'],
  },
];
