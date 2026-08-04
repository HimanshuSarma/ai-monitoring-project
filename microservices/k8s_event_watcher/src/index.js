import * as k8s from '@kubernetes/client-node';
import prisma from './db/connection.js';

// 1. Initialize Kubernetes Client Configuration
const kc = new k8s.KubeConfig();

try {
  kc.loadFromDefault();
} catch (err) {
  console.error('Failed to load Kubernetes configuration:', err.message);
  process.exit(1);
}

const watch = new k8s.Watch(kc);

// Fast in-memory cache to skip DB calls for rapid stream retries
const recentFailureCache = new Map(); 

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

    const serviceName = `k8s-${kind.toLowerCase()}-${name}`;
    const formattedMessage = `[K8S ${reason}] Resource: ${kind}/${name} (Namespace: ${namespace}). Details: ${message}`;
    const path = `/namespaces/${namespace}/${kind.toLowerCase()}s/${name}`;

    // 1. In-Memory Cache Check (Fast path to prevent DB query spam on fast retries)
    const dedupeKey = `${serviceName}:${formattedMessage}`;
    const now = Date.now();

    if (recentFailureCache.has(dedupeKey)) {
      const lastSeen = recentFailureCache.get(dedupeKey);
      if (now - lastSeen < 60000) { // 60-second in-memory cooldown
        return;
      }
    }

    // Update in-memory cache timestamp
    recentFailureCache.set(dedupeKey, now);

    // 2. Database Pre-Check: Check if this exact error message for this resource already exists in DB
    const existingLog = await prisma.error_log.findFirst({
      where: {
        service: serviceName,
        message: formattedMessage,
      }
    });

    if (existingLog) {
      console.log(`ℹ️ [K8S EVENT SKIPPED] Error already recorded in database for ${kind}/${name}`);
      return;
    }

    console.log(`🚨 [K8S EVENT RECORDED] ${event.type} | ${reason} on ${kind}/${name} in ${namespace}`);

    // 3. Insert into database if not already present
    await prisma.error_log.create({
      data: {
        service: serviceName,
        message: formattedMessage,
        path: path,
        method: 'EVENT',
        statusCode: 500,
        isProcessed: false,
        aiAnalysis: null
      }
    });

    // Cleanup old keys from memory cache
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