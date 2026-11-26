// Fire-and-forget New Relic integration
// Requires NR_LICENSE_KEY in env; optionally NR_REGION ('eu' for EU data center)

export type NREnv = { NR_LICENSE_KEY?: string; NR_REGION?: string }

function endpoints(env: NREnv) {
  const prefix = env.NR_REGION === 'eu' ? 'eu.' : ''
  return {
    logs: `https://log-api.${prefix}newrelic.com/log/v1`,
    metrics: `https://metric-api.${prefix}newrelic.com/metric/v1`,
  }
}

export function nrLog(env: NREnv, level: 'info' | 'warn' | 'error', message: string, attrs?: Record<string, string | number>): Promise<void> {
  if (!env.NR_LICENSE_KEY) return Promise.resolve()
  const body = [{
    common: { attributes: { service: 'skillmesh-api', hostname: 'skillmesh-workers' } },
    logs: [{ timestamp: Date.now(), message, attributes: { level, ...(attrs ?? {}) } }],
  }]
  return fetch(endpoints(env).logs, {
    method: 'POST',
    headers: { 'Api-Key': env.NR_LICENSE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(() => {}).catch(() => {})
}

export function nrMetric(env: NREnv, name: string, value: number, attrs?: Record<string, string | number>): Promise<void> {
  if (!env.NR_LICENSE_KEY) return Promise.resolve()
  const body = [{
    metrics: [{
      name,
      type: 'count',
      value,
      timestamp: Math.floor(Date.now() / 1000),
      'interval.ms': 1000,
      attributes: { service: 'skillmesh', ...(attrs ?? {}) },
    }],
  }]
  return fetch(endpoints(env).metrics, {
    method: 'POST',
    headers: { 'Api-Key': env.NR_LICENSE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(() => {}).catch(() => {})
}
