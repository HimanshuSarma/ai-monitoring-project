import express from 'express';
import promClient from 'prom-client';

promClient.collectDefaultMetrics({ prefix: 'k8s_watcher_' });

export const errorCounter = new promClient.Counter({
  name: 'k8s_error_events_total',
  help: 'Total Kubernetes error events detected and dispatched',
  labelNames: ['severity'],
});

const app = express();
const METRICS_PORT = parseInt(process.env.METRICS_PORT, 10) || 8000;

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

export function startMetricsServer() {
  return new Promise((resolve) => {
    const server = app.listen(METRICS_PORT, '0.0.0.0', () => {
      console.log(`Metrics server listening on port ${METRICS_PORT}`);
      resolve(server);
    });
  });
}