#!/bin/bash
set -e

REAL_USER=${SUDO_USER:-$USER}
REAL_HOME=$(eval echo ~$REAL_USER)

echo "===================================================="
echo "🚀 Starting K3s & Argo CD Setup Workflow"
echo "===================================================="

# ----------------------------------------------------
# 1. Clean up stale K3s processes and locks
# ----------------------------------------------------
echo "🔄 Cleaning up stale processes, mounts, and lock files..."
sudo killall -9 k3s containerd-shim-runc-v2 runc 2>/dev/null || true
sudo grep /run/k3s /proc/mounts | awk '{print $2}' | xargs -r sudo umount -f -l 2>/dev/null || true
sudo grep /workspaces/k3s-data /proc/mounts | awk '{print $2}' | xargs -r sudo umount -f -l 2>/dev/null || true
sudo rm -rf /run/k3s /run/containerd /var/run/k3s*.pid /tmp/*.log
sudo rm -f /workspaces/k3s-data/data/*/management-state/k3s*.pid 2>/dev/null || true
sudo rm -f /workspaces/k3s-data/server/db/state.db-lock 2>/dev/null || true

# ----------------------------------------------------
# 2. Install K3s (if not present) and start Server
# ----------------------------------------------------
if ! command -v k3s &> /dev/null; then
    echo "📦 K3s binary not found. Downloading and installing..."
    curl -sfL https://get.k3s.io | sh -s - server \
      --disable traefik \
      --data-dir /workspaces/k3s-data \
      --write-kubeconfig-mode 644 > /tmp/k3s.log 2>&1 &
else
    echo "⚡ Starting existing K3s server..."
    sudo k3s server \
      --disable traefik \
      --data-dir /workspaces/k3s-data \
      --write-kubeconfig-mode 644 > /tmp/k3s.log 2>&1 &
fi

# ----------------------------------------------------
# 3. Wait for API Server (Explicit Kubeconfig Path)
# ----------------------------------------------------
echo "⏳ Waiting for K3s API server to become ready..."
until sudo kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes >/dev/null 2>&1; do
    sleep 2
done
echo "✅ K3s API server is ready!"

# ----------------------------------------------------
# 4. Setup Kubeconfig Permissions for User
# ----------------------------------------------------
echo "🔑 Setting up kubeconfig for user: $REAL_USER..."
mkdir -p "$REAL_HOME/.kube"
sudo cp /etc/rancher/k3s/k3s.yaml "$REAL_HOME/.kube/config"
sudo chown -R "$REAL_USER":"$REAL_USER" "$REAL_HOME/.kube"
export KUBECONFIG="$REAL_HOME/.kube/config"

# ----------------------------------------------------
# 5. Install Helm (if not present)
# ----------------------------------------------------
if ! command -v helm &> /dev/null; then
    echo "📦 Helm binary not found. Installing Helm..."
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

# ----------------------------------------------------
# 6. Add Argo CD Helm Repo & Install Chart
# ----------------------------------------------------
echo "⚓ Adding Argo CD Helm repository..."
helm repo add argo https://argoproj.github.io/argo-helm --force-update
helm repo update

echo "🚀 Installing Argo CD (ClusterIP, no Dex, no Notifications)..."
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  --set server.service.type=ClusterIP \
  --set dex.enabled=false \
  --set notifications.enabled=false \
  --set configs.params."server\.insecure"=true

# ----------------------------------------------------
# 7. Wait for Deployment & Patch Insecure Mode
# ----------------------------------------------------
echo "⏳ Waiting for argocd-server deployment..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=180s

echo "🔒 Patching Argo CD server container args for --insecure mode..."
kubectl patch deployment argocd-server -n argocd --type='json' -p='[
  {"op": "replace", "path": "/spec/template/spec/containers/0/args", "value": ["--insecure"]}
]' 2>/dev/null || true

# ----------------------------------------------------
# 8. Start Port Forwarding
# ----------------------------------------------------
echo "🔌 Starting background port-forward (Port 8080)..."
pkill -f "port-forward" 2>/dev/null || true
nohup kubectl port-forward svc/argocd-server -n argocd 8080:80 --address 0.0.0.0 > /tmp/argocd-pf.log 2>&1 &

sleep 2

echo "===================================================="
echo "✅ Setup Completed Successfully!"
echo "===================================================="
echo "Argo CD Admin Password:"
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
echo "===================================================="
EOF

chmod +x setup-platform.sh