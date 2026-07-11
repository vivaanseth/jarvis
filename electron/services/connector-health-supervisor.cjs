const AUTH_ERROR = /(401|403|auth(?:entication|orization)?|invalid[_ -]?(?:grant|token)|expired|reconnect|connect .* first|rejected .* key)/i;

function publicError(error) {
  const message = String(error?.message || 'The connector health check failed.');
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 500);
}

class ConnectorHealthSupervisor {
  constructor({ registry, checks = {}, timeoutMs = 10_000, onChange = () => {} }) {
    this.registry = registry;
    this.checks = checks;
    this.timeoutMs = timeoutMs;
    this.onChange = onChange;
  }

  async refresh(connectorId) {
    const id = String(connectorId || '');
    const current = this.registry.record(id);
    if (!current) return { connectorId: id, state: 'needsSetup', summary: 'Not connected.', remediation: 'Connect this service from Connections.' };
    const check = this.checks[id];
    if (!check) return current;

    this.registry.upsert(id, { state: 'checking', remediation: '' });
    this.onChange();
    const started = Date.now();
    let timeout;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => check(current)),
        new Promise((_, reject) => { timeout = setTimeout(() => { const error = new Error(`${id} health check timed out.`); error.code = 'TIMEOUT'; reject(error); }, this.timeoutMs); })
      ]);
      const next = this.registry.upsert(id, {
        state: result?.state || 'ready',
        accountLabel: result?.accountLabel || current.accountLabel,
        grantedFeatures: result?.grantedFeatures || current.grantedFeatures || [],
        grantedScopes: result?.grantedScopes || current.grantedScopes || [],
        remediation: result?.remediation || '',
        latencyMs: Date.now() - started,
        lastCheckedAt: new Date().toISOString()
      });
      this.onChange();
      return next;
    } catch (error) {
      const message = publicError(error);
      const authenticationFailure = error?.code === 'AUTHENTICATION_FAILED' || AUTH_ERROR.test(message);
      const next = this.registry.upsert(id, {
        state: authenticationFailure ? 'needsSetup' : 'degraded',
        remediation: authenticationFailure ? 'Reconnect this service in Connections.' : 'Check your network and retry the health check.',
        latencyMs: Date.now() - started,
        lastCheckedAt: new Date().toISOString(),
        lastError: message
      });
      this.onChange();
      return next;
    } finally {
      clearTimeout(timeout);
    }
  }

  async refreshAll() {
    return Promise.all(this.registry.records().map(record => this.refresh(record.connectorId)));
  }
}

module.exports = { ConnectorHealthSupervisor, publicError };
