import * as k8s from '@kubernetes/client-node';
import prisma from './db/connection.js'; // Imports your Prisma client singleton

// 1. Initialize Kubernetes Client Configuration
const kc = new k8s.KubeConfig();

try {
  // Tries to load in-cluster config (when running inside K8s pod)
  // Falls back to local ~/.kube/config if running locally on your laptop
  kc.loadFromDefault();
} catch (err) {
  console.error('Failed to load Kubernetes configuration:', err.message);
  process.exit(1);
}

const watch = new k8s.Watch(kc);

// Keep track of recent events to avoid duplicate database inserts if K8s resends them
const processedEventUids = new Set();

async function handleK8sEvent(type, event) {
  try {
    // We only care about Warning events or critical reason states
    const isWarning = event.type === 'Warning';
    const isCritical = ['OOMKilled', 'FailedScheduling', 'CrashLoopBackOff', 'ErrImagePull', 'Unhealthy'].includes(event.reason);

    if (!isWarning && !isCritical) {
      return;
    }

    const eventUid = event.metadata?.uid;
    if (eventUid && processedEventUids.has(eventUid)) {
      return; // Skip duplicate event stream heartbeats
    }

    const namespace = event.involvedObject?.namespace || event.metadata?.namespace || 'default';
    const kind = event.involvedObject?.kind || 'Unknown';
    const name = event.involvedObject?.name || 'Unknown';
    const reason = event.reason || 'UnknownReason';
    const message = event.message || event.note || 'No event description provided';

    console.log(`🚨 [K8S EVENT] ${event.type} | ${reason} on ${kind}/${name} in ${namespace}`);

    // Create log object adhering to your Prisma database schema
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

    if (eventUid) {
      processedEventUids.add(eventUid);
      // Clean up local cache if memory grows too large
      if (processedEventUids.size > 2000) {
        const firstItem = processedEventUids.values().next().value;
        processedEventUids.delete(firstItem);
      }
    }
  } catch (err) {
    console.error('Error saving K8s event to database:', err.message);
  }
}

async function startEventWatcher() {
  console.log('👀 Starting K8s Event Watcher Stream...');

  // Watch endpoint for cluster events across all namespaces
  const watchUrl = '/api/v1/events';

  const req = await watch.watch(
    watchUrl,
    {}, // Query parameters (e.g. { fieldSelector: 'type=Warning' })
    (type, event) => {
      // Callback fired on ADDED, MODIFIED, or DELETED event streams
      if (type === 'ADDED' || type === 'MODIFIED') {
        handleK8sEvent(type, event);
      }
    },
    (err) => {
      // Reconnection handler if stream drops or times out
      if (err) {
        console.error('Event stream disconnected with error:', err);
      } else {
        console.log('Event stream ended gracefully. Reconnecting...');
      }
      setTimeout(startEventWatcher, 5000); // Attempt reconnect after 5 seconds
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