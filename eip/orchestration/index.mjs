// Public surface of the orchestration layer. Deliberately one function: workflow
// coordination, planners and multi-agent protocols are PROPOSED, not built — see
// README.md. A module that exports a plan it cannot run is a lie with a nice name.
export { createAgentGateway, parseEntry } from './gateway.mjs';
