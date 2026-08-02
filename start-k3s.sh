#!/bin/bash

# Determine real (non-root) user calling the script via sudo
REAL_USER=${SUDO_USER:-$USER}
REAL_HOME=$(eval echo ~$REAL_USER)

echo "🔄 Cleaning up stale processes, locks, mounts, and root log files..."
# 1. Kill lingering processes
sudo killall -9 k3s containerd-shim-runc-v2 runc 2>/dev/null || true

# 2. Delete old log files to avoid permission conflicts
sudo rm -f /tmp/k3s.log /tmp/argocd-pf.log /tmp/port-forward.log

# 3. Unmount locked overlay filesystems to prevent 'device busy' errors
sudo grep /run/k3s /proc/mounts | awk '{print $2}' | xargs -r sudo umount -f -l 2>/dev/null || true
sudo grep /workspaces/k3s-data /proc/mounts | awk '{print $2}' | xargs -r sudo umount -f -l 2>/dev/null || true

# 4. Clean runtime socket files and stale PID locks
sudo rm -rf /run/k3s /run/containerd /var/run/k3s*.pid
sudo rm -f /workspaces/k3s-data/data/*/management-state/k3s*.pid 2>/dev/null || true
sudo rm -f /workspaces/k3s-data/server/db/state.db-lock 2>/dev/null || true

echo "🚀 Starting K3s server..."
sudo k3s server --disable traefik --data-dir /workspaces/k3s-data --write-kubeconfig-mode 644 > /tmp/k3s.log 2>&1 &

# 5. Wait for API server to become responsive
echo "⏳ Waiting for K3s API server to become ready..."
until sudo kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes >/dev/null 2>&1; do
    sleep 2
done
echo "✅ K3s API server is ready!"

# 6. Copy and set kubeconfig permissions for the regular non-root user
mkdir -p "$REAL_HOME/.kube"
sudo cp /etc/rancher/k3s/k3s.yaml "$REAL_HOME/.kube/config"
sudo chown -R "$REAL_USER":"$REAL_USER" "$REAL_HOME/.kube"
chmod 600 "$REAL_HOME/.kube/config"

# Ensure KUBECONFIG path is preserved in user's bash profile across terminal sessions
if ! grep -q "KUBECONFIG=" "$REAL_HOME/.bashrc" 2>/dev/null; then
    echo "export KUBECONFIG=$REAL_HOME/.kube/config" >> "$REAL_HOME/.bashrc"
fi

export KUBECONFIG="$REAL_HOME/.kube/config"

echo "🧹 Cleaning up any orphaned 'Unknown' state pods..."
kubectl delete pods -A --field-selector status.phase=Unknown --force --grace-period=0 2>/dev/null || true

# 7. Safely set --insecure flag without duplicating it if Argo CD is installed
if kubectl get ns argocd >/dev/null 2>&1; then
    echo "🔒 Ensuring Argo CD server deployment uses clean --insecure mode..."
    kubectl patch deployment argocd-server -n argocd --type='json' -p='[
      {"op": "replace", "path": "/spec/template/spec/containers/0/args", "value": ["--insecure"]}
    ]' 2>/dev/null || true
fi

echo "🔌 Restarting Argo CD port-forward (Port 8080)..."
pkill -f "port-forward" 2>/dev/null || true
nohup kubectl port-forward svc/argocd-server -n argocd 8080:80 --address 0.0.0.0 > /tmp/argocd-pf.log 2>&1 &

echo "----------------------------------------------------"
echo "✅ K3s Cluster is UP & Argo CD port-forward active!"
echo "----------------------------------------------------"
kubectl get nodes

chmod +x start-k3s.sh