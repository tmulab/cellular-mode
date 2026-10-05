// index.mjs — one address for every Builder fixture, so a later cell adds a scenario in one
// place and every test sees it. Data only: this module imports nothing but its neighbours and
// runs nothing at load time.
export { SCENARIOS, scenario, simpleNew, complexUndecided, unknownTech, sensitiveData, injection } from './scenarios.mjs';
export { REPOSITORIES, repository, existingRepo, pausedProject, missingOptional, injectionRepo } from './repositories.mjs';
export { CONTRACT_FIXTURES, conflicting, invalidContract, readyContract } from './contracts.mjs';
export { APPROVED_AT, approve, exportable, playScenario } from './prompts.mjs';
