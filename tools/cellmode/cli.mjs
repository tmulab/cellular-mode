#!/usr/bin/env node
// cli.mjs — entry point. No self-execution guard: this file exists only to be
// run, so it always runs. Importable logic lives in main.mjs.
import { main } from './main.mjs';

process.exitCode = main(process.argv);
