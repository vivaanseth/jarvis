const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalResourceMonitor } = require('../services/local-resource-monitor.cjs');

function monitor(cpu = 20, memory = 60) { return new LocalResourceMonitor({ cpuSampler: async () => cpu, memorySampler: async () => memory }); }

test('local inference runs only inside conservative resource thresholds', async () => {
  const healthy = monitor(24, 55);
  healthy.updatePower({ thermalState: 'nominal', speedLimit: 100, onBattery: false });
  assert.equal((await healthy.assess({ localAIEnabled: true })).allowed, true);
  const busy = monitor(70, 55); busy.updatePower({ thermalState: 'nominal' });
  assert.equal((await busy.assess({ localAIEnabled: true })).code, 'CPU_BUSY');
  const lowMemory = monitor(20, 18); lowMemory.updatePower({ thermalState: 'nominal' });
  assert.equal((await lowMemory.assess({ localAIEnabled: true })).code, 'MEMORY_PRESSURE');
});

test('battery, thermal pressure, throttling, and concurrent work force cloud fallback', async () => {
  const resources = monitor();
  resources.updatePower({ thermalState: 'nominal', speedLimit: 100, onBattery: true });
  assert.equal((await resources.assess({ localAIEnabled: true })).code, 'ON_BATTERY');
  resources.updatePower({ onBattery: false, thermalState: 'fair' });
  assert.equal((await resources.assess({ localAIEnabled: true })).code, 'THERMAL_PRESSURE');
  resources.updatePower({ thermalState: 'nominal', speedLimit: 75 });
  assert.equal((await resources.assess({ localAIEnabled: true })).code, 'CPU_THROTTLED');
  resources.updatePower({ speedLimit: 100 });
  const lease = await resources.acquire({ localAIEnabled: true });
  assert.equal(lease.allowed, true);
  assert.equal((await resources.assess({ localAIEnabled: true })).code, 'LOCAL_BUSY');
  lease.release();
});

test('an active local request aborts when macOS reports serious thermal pressure', async () => {
  const resources = monitor(); resources.updatePower({ thermalState: 'nominal' });
  const lease = await resources.acquire({ localAIEnabled: true });
  resources.updatePower({ thermalState: 'serious' });
  assert.equal(lease.signal.aborted, true);
  lease.release();
});
