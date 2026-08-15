import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();

try {
  kc.loadFromDefault();
} catch (err) {
  console.error('Failed to load Kubernetes configuration:', err.message);
  process.exit(1);
}

export const watch = new k8s.Watch(kc);