// Starts the Episode 1 page's log bridge; main.ts imports it first so a failure while its other modules load is logged too.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { initTauriLogging } from '@lieutenant-fizz/engine/tauri-log';

// Inside the app, console output and uncaught errors join the native log (a no-op on the web).
void initTauriLogging({ prefix: 'episode-1' });
