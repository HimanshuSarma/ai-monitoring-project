import * as k8s from '@kubernetes/client-node';
import prisma from './db/connection.js';
import express from 'express';
import promClient from "prom-client";

// Register Custom Metric
const errorCounter = new promClient.Counter({
  name: 'k8s_error_events_total',
  help: 'Total Kubernetes error events detected and dispatched',
  labelNames: ['severity']
});

const app = express();

// 1. Initialize Kubernetes Client Configuration
const kc = new k8s.KubeConfig();

try {
  kc.loadFromDefault();
} catch (err) {
  console.error('Failed to load Kubernetes configuration:', err.message);
  process.exit(1);
}

const watch = new k8s.Watch(kc);

// Global synchronous cache (stores keys mapped to active promises or timestamps)
const inFlightEvents = new Set();
const recentFailureCache = new Map();

async function handleK8sEvent(type, event) {
  try {

    console.log(event, 'handleK8sEvent');

    const isWarning = event.type === 'Warning';
    const isCritical = ['OOMKilled', 'FailedScheduling', 'CrashLoopBackOff', 'ErrImagePull', 'Unhealthy', 'BackOff', 'Failed'].includes(event.reason);

    if (!isWarning && !isCritical) return;

    const namespace = event.involvedObject?.namespace || event.metadata?.namespace || 'default';
    const kind = event.involvedObject?.kind || 'Unknown';
    const name = event.involvedObject?.name || 'Unknown';
    const reason = event.reason || 'UnknownReason';
    const message = event.message || event.note || 'No event description provided';

    const serviceName = `k8s-${kind.toLowerCase()}-${name}`;
    const resourcePath = `/namespaces/${namespace}/${kind.toLowerCase()}s/${name}`;
    const formattedMessage = `[K8S ${reason}] Resource: ${kind}/${name} (Namespace: ${namespace}). Details: ${message}`;

    // Unique key for this specific incident state
    const dedupeKey = `${serviceName}:${formattedMessage}`;
    const now = Date.now();

    // 1. SYNCHRONOUS LOCK: Check if this exact key is already processing or in cache
    if (inFlightEvents.has(dedupeKey)) {
      return; // Skip immediately synchronously before hitting DB or async boundary
    }

    if (recentFailureCache.has(dedupeKey)) {
      const lastSeen = recentFailureCache.get(dedupeKey);
      const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
      if (now - lastSeen < CACHE_TTL_MS) {
        return;
      }
    }

    // 2. SET LOCK SYNCHRONOUSLY BEFORE ANY AWAIT
    inFlightEvents.add(dedupeKey);
    recentFailureCache.set(dedupeKey, now);

    try {
      // 3. Database Pre-Check
      const existingLog = await prisma.error_log.findFirst({
        where: {
          service: serviceName,
          path: resourcePath,
          isProcessed: false
        }
      });

      if (existingLog) {
        console.log(`ℹ️ [K8S EVENT SKIPPED] Open log already exists in DB for ${kind}/${name}`);
        return;
      }

      console.log(`🚨 [K8S EVENT RECORDED] ${event.type} | ${reason} on ${kind}/${name} in ${namespace}`);

      // 4. Create single error log entry
      await prisma.error_log.create({
        data: {
          service: serviceName,
          message: formattedMessage,
          path: resourcePath,
          method: 'EVENT',
          statusCode: 500,
          isProcessed: false,
          aiAnalysis: null
        }
      });

      errorCounter.inc({ 
        severity: 'critical', 
      });
    } finally {
      // 5. Release in-flight lock after async operations finish
      inFlightEvents.delete(dedupeKey);
    }

  } catch (err) {
    console.error('Error saving K8s event to database:', err.message);
  }
}

async function startEventWatcher() {
  console.log('👀 Starting K8s Event Watcher Stream...');

  const watchUrl = '/api/v1/events';

  const req = await watch.watch(
    watchUrl,
    {},
    (type, event) => {
      if (type === 'ADDED' || type === 'MODIFIED') {
        handleK8sEvent(type, event);
      }
    },
    (err) => {
      if (err) {
        console.error('Event stream disconnected with error:', err);
      } else {
        console.log('Event stream ended gracefully. Reconnecting...');
      }
      setTimeout(startEventWatcher, 5000);
    }
  );

  return req;
}

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down event watcher...');
  await prisma.$disconnect();
  process.exit(0);
});

startEventWatcher();

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
app.listen(8000);