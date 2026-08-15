const express = require('express');
const promClient = require('prom-client');
const config = require('../config/env');

// Collect default Node.js process metrics (CPU, Memory, Event Loop)
promClient.collectDefaultMetrics({ prefix: 'error_dispatcher_' });

const app = express();

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

function startMetricsServer() {
  return new Promise((resolve) => {
    const server = app.listen(config.METRICS_PORT, '0.0.0.0', () => {
      console.log(`Prometheus metrics available at http://0.0.0.0:${config.METRICS_PORT}/metrics`);
      resolve(server);
    });
  });
}

module.exports = { startMetricsServer, promClient };