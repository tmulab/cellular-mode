// Public SDK surface. A plugin imports from here and from nothing else in the
// runtime: never from eip/kernel (the kernel is not privileged, it is a peer
// that happens to do the wiring), and never from a sibling plugin's
// implementation — siblings are known by CONTRACT, through `inject`.
export { SDK_VERSION } from './version.mjs';
export {
  CODES, PASSTHROUGH_CODES, KernelError, ContractError,
  isKernelError, messageOf, passthroughOf, stackOf,
} from './errors.mjs';
export {
  KEYWORDS as SCHEMA_KEYWORDS,
  TYPES as SCHEMA_TYPES,
  check,
  validate as validateValue,
  validateSchema,
} from './schema.mjs';
export {
  CAPABILITY_ID_PATTERN,
  KEY_PATTERN,
  MAX_DEV_UI_BYTES,
  PERMISSIONS,
  describeManifest,
  validateManifest,
} from './manifest.mjs';
export { definePlugin } from './define.mjs';
