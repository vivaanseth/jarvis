const crypto = require('node:crypto');

class ActionCoordinator {
  constructor() { this.active = null; }

  cancel(runId = this.active?.id) {
    if (this.active?.id !== runId) return false;
    this.active.cancelled = true;
    this.active.controller.abort();
    return true;
  }

  async run(steps, execute, options = {}) {
    if (this.active) throw new Error('Jarvis is already running another action plan.');
    const run = { id: options.id || crypto.randomUUID(), cancelled: false, controller: new AbortController(), completed: [], startedAt: new Date().toISOString() };
    this.active = run;
    try {
      for (const [index, step] of steps.entries()) {
        if (run.cancelled) break;
        const startedAt = new Date().toISOString();
        try {
          const output = await execute(step, { runId: run.id, index, signal: run.controller.signal });
          run.completed.push({ step, status: 'succeeded', output, startedAt, completedAt: new Date().toISOString() });
        } catch (error) {
          if (run.cancelled || error.name === 'AbortError') {
            run.completed.push({ step, status: 'cancelled', message: 'Cancelled.', startedAt, completedAt: new Date().toISOString() });
            break;
          }
          run.completed.push({ step, status: 'failed', message: error.message, startedAt, completedAt: new Date().toISOString() });
          if (!options.continueOnError) break;
        }
      }
      return { id: run.id, status: run.cancelled ? 'cancelled' : run.completed.some(item => item.status === 'failed') ? 'partial' : 'succeeded', completed: run.completed, startedAt: run.startedAt, completedAt: new Date().toISOString() };
    } finally { this.active = null; }
  }
}

module.exports = { ActionCoordinator };
