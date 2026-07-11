function nextOccurrence(schedule, after = new Date()) {
  const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(after); candidate.setDate(candidate.getDate() + offset); candidate.setHours(Number(schedule.hour || 0), Number(schedule.minute || 0), 0, 0);
    if (days.includes(candidate.getDay()) && candidate > after) return candidate.toISOString();
  }
  return null;
}

class RoutineScheduler {
  constructor({ getState, saveSchedule, onRun, onSuggestion, now = () => new Date() }) {
    this.getState = getState; this.saveSchedule = saveSchedule; this.onRun = onRun; this.onSuggestion = onSuggestion; this.now = now; this.timer = null; this.running = new Set();
  }

  start() { this.stop(); this.tick(); this.timer = setInterval(() => this.tick(), 30_000); }
  stop() { clearInterval(this.timer); this.timer = null; }

  async tick() {
    const state = this.getState(); const now = this.now();
    for (const schedule of state.schedules.filter(item => item.enabled !== false)) {
      if (this.running.has(schedule.id)) continue;
      let due = schedule.nextRunAt ? new Date(schedule.nextRunAt) : null;
      if (!due || Number.isNaN(due.getTime())) { schedule.nextRunAt = nextOccurrence(schedule, new Date(now.getTime() - 60_000)); this.saveSchedule(schedule); due = new Date(schedule.nextRunAt); }
      if (due > now) continue;
      const lateness = now.getTime() - due.getTime(); const routine = state.routines.find(item => item.id === schedule.routineId);
      schedule.lastRunAt = now.toISOString(); schedule.nextRunAt = nextOccurrence(schedule, now); this.saveSchedule(schedule);
      if (!routine) continue;
      if (lateness > 5 * 60_000 || routine.confirm) { this.onSuggestion(routine, lateness); continue; }
      this.running.add(schedule.id);
      try { await this.onRun(routine); } finally { this.running.delete(schedule.id); }
    }
  }
}

module.exports = { RoutineScheduler, nextOccurrence };
