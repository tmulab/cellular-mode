// Public surface of the UPP layer.
//
// Only the HOST composition may import this (`upp-is-imported-by-the-host-only`, a gate
// rule): the kernel must keep working with no protocol layer at all, and a plugin must never
// learn which transport carried its caller. Everything here is PURE — rules over data, no
// socket, no process, no disk. Cell 3 builds the transports on top of it.
export { UPP_VERSION, SUPPORTED_PROTOCOL_VERSIONS, PROTOCOL_VERSION_PATTERN } from './version.mjs';
export { compareProtocolVersions, negotiate, parseProtocolVersion } from './version.mjs';
export {
  JSONRPC_CODES, KERNEL_CODE_BY_RPC, REMOTE_FORBIDDEN_CODES, RPC_CODE_BY_KERNEL,
  SERVER_ERROR_RANGE, UPP_CODES, isServerErrorCode, kernelCodeFor, readDetails,
  remoteToResult, rpcCodeFor, toUppError, uppError,
} from './errors.mjs';
export {
  CAPABILITY_KEYS, MAX_DESCRIPTION_LENGTH, UPP_MANIFEST_FIELDS, UPP_MANIFEST_TYPES,
  assertUppManifest, validateUppManifest,
} from './manifest.mjs';
export { AUTH_MODES, ENTRY_KEYS, RUNTIMES } from './sections.mjs';
export {
  ERROR_SCHEMA, HEALTH_STATUSES, MANIFEST_SCHEMA, METHODS, NOTIFICATIONS,
  PARAMS_SCHEMA_BY_METHOD, RESULT_SCHEMA_BY_METHOD,
  PUBLISHED_SCHEMAS, manifestSchemaDocument, messageSchemaDocument, renderSchemaFile,
} from './schemas.mjs';
export {
  JSONRPC_VERSION, errorResponse, isMessageId, notification, request, response,
  validateMessage, validateResponse,
} from './messages.mjs';
export { MAX_MESSAGE_BYTES, createIdSequence, deserialize, serialize } from './framing.mjs';
export { COMPAT_RUNTIME, compatBreaches, toUppManifest } from './compat.mjs';
