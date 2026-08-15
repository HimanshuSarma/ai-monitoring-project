import prisma from '../db/connection.js';
import { errorCounter } from './metricsService.js';

const inFlightEvents = new Set();
const recentFailureCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

const CRITICAL_REASONS = [
  'OOMKilled',
  'FailedScheduling',
  'CrashLoopBackOff',
  'ErrImagePull',
  'Unhealthy',
  'BackOff',
  'Failed',
];

export async function handleK8sEvent(type, event) {
  try {
    const isWarning = event.type === 'Warning';
    const isCritical = CRITICAL_REASONS.includes(event.reason);

    if (!isWarning && !isCritical) return;

    const namespace = event.involvedObject?.namespace || event.metadata?.namespace || 'default';
    const kind = event.involvedObject?.kind || 'Unknown';
    const name = event.involvedObject?.name || 'Unknown';
    const reason = event.reason || 'UnknownReason';
    const message = event.message || event.note || 'No event description provided';

    if (name.includes('qwen-llm-engine') || name.includes('k8s-event-watcher')) {
      return;
    }

    const serviceName = `k8s-${kind.toLowerCase()}-${name}`;
    const resourcePath = `/namespaces/${namespace}/${kind.toLowerCase()}s/${name}`;
    const formattedMessage = `[K8S ${reason}] Resource: ${kind}/${name} (Namespace: ${namespace}). Details: ${message}`;
    const dedupeKey = `${serviceName}:${formattedMessage}`;
    const now = Date.now();

    if (inFlightEvents.has(dedupeKey)) return;

    if (recentFailureCache.has(dedupeKey)) {
      const lastSeen = recentFailureCache.get(dedupeKey);
      if (now - lastSeen < CACHE_TTL_MS) return;
    }

    inFlightEvents.add(dedupeKey);
    recentFailureCache.set(dedupeKey, now);

    try {
      const existingLog = await prisma.error_log.findFirst({
        where: {
          service: serviceName,
          path: resourcePath,
          isProcessed: false,
        },
      });

      if (existingLog) return;

      console.log(`Recorded event: ${event.type} | ${reason} on ${kind}/${name} in ${namespace}`);

      await prisma.error_log.create({
        data: {
          service: serviceName,
          message: formattedMessage,
          path: resourcePath,
          method: 'EVENT',
          statusCode: 500,
          isProcessed: false,
          aiAnalysis: null,
        },
      });

      errorCounter.inc({ severity: 'critical' });
    } finally {
      inFlightEvents.delete(dedupeKey);
    }
  } catch (err) {
    console.error('Error saving Kubernetes event:', err.message);
  }
}