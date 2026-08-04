import * as k8s from '@kubernetes/client-node';
import prisma from './db/connection.js';

const kc = new k8s.KubeConfig();

try {
  kc.loadFromDefault();
} catch (err) {
  console.error('Failed to load Kubernetes configuration:', err.message);
  process.exit(1);
}

const watch = new k8s.Watch(kc);

// 1. Time-based cache to prevent duplicate inserts for the same resource within a 60-second window
const recentFailureCache = new Map(); // Key: "namespace/kind/name/reason", Value: timestamp

async function handleK8sEvent(type, event) {
  try {
    const isWarning = event.type === 'Warning';
    const isCritical = ['OOMKilled', 'FailedScheduling', 'CrashLoopBackOff', 'ErrImagePull', 'Unhealthy', 'BackOff'].includes(event.reason);

    if (!isWarning && !isCritical) {
      return;
    }

    const namespace = event.involvedObject?.namespace || event.metadata?.namespace || 'default';
    const kind = event.involvedObject?.kind || 'Unknown';
    const name = event.involvedObject?.name || 'Unknown';
    const reason = event.reason || 'UnknownReason';
    const message = event.message || event.note || 'No event description provided';

    // 2. Create a unique resource signature
    const dedupeKey = `${namespace}/${kind}/${name}/${reason}`;
    const now = Date.now();

    // 3. Skip if we already recorded this exact issue for this resource in the last 60 seconds
    if (recentFailureCache.has(dedupeKey)) {
      const lastSeen = recentFailureCache.get(dedupeKey);
      if (now - lastSeen < 60000) { // 60-second window
        return;
      }
    }

    console.log(`🚨 [K8S EVENT RECORDED] ${event.type} | ${reason} on ${kind}/${name} in ${namespace}`);

    // Update cache timestamp BEFORE database write to avoid race conditions
    recentFailureCache.set(dedupeKey, now);

    // Save to Prisma database
    await prisma.error_log.create({
      data: {
        service: `k8s-${kind.toLowerCase()}-${name}`,
        message: `[K8S ${reason}] Resource: ${kind}/${name} (Namespace: ${namespace}). Details: ${message}`,
        path: `/namespaces/${namespace}/${kind.toLowerCase()}s/${name}`,
        method: 'EVENT',
        statusCode: 500,
        isProcessed: false,
        aiAnalysis: null
      }
    });

    // Cleanup old keys from memory
    for (const [key, timestamp] of recentFailureCache.entries()) {
      if (now - timestamp > 60000) {
        recentFailureCache.delete(key);
      }
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
      // Process both ADDED and MODIFIED stream events with composite deduplication
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

process.on('SIGINT', async () => {
  console.log('Shutting down event watcher...');
  await prisma.$disconnect();
  process.exit(0);
});

startEventWatcher();