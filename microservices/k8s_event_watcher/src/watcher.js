import { watch } from './config/k8s.js';
import { handleK8sEvent } from './services/eventHandler.js';

export async function startEventWatcher() {
  console.log('Starting Kubernetes event watcher stream...');
  const watchUrl = '/api/v1/events';

  return await watch.watch(
    watchUrl,
    {},
    (type, event) => {
      if (type === 'ADDED' || type === 'MODIFIED') {
        handleK8sEvent(type, event);
      }
    },
    (err) => {
      if (err) {
        console.error('Event stream error:', err);
      } else {
        console.log('Event stream ended. Reconnecting...');
      }
      setTimeout(startEventWatcher, 5000);
    }
  );
}