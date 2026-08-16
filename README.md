Kubernetes AI-Driven Error Monitoring & Autoscaling System
1. Project Overview & Purpose
Purpose
This project is a Kubernetes monitoring and automated triage system designed to detect application and cluster-level errors in real time, expose operational metrics, dynamically scale an AI agent for incident analysis, and manage releases using GitOps and progressive delivery practices.

Key Features
Real-time Error Collection: A long-running service uses the Kubernetes API (k8sclient) to capture application-level and cluster-level error events as they occur.

Prometheus Metrics & KEDA Autoscaling: Error event counts are exposed as custom Prometheus metrics. KEDA (Kubernetes Event-driven Autoscaling) monitors these metrics to dynamically scale the AI Agent microservice—scaling up on error spikes and scaling down to 0 pods during idle periods to save resources.

AI-Powered Incident Triage: When scaled up, the AI Agent fetches log contexts and stack traces, passing them to an LLM to generate instant 2-sentence root-cause summaries and fix recommendations.

GitOps via ArgoCD: Cluster configurations and application manifests are declaratively synchronized using ArgoCD, keeping Git as the single source of truth.

Progressive Delivery via Argo Rollouts: Manages releases and deployment monitoring using Argo Rollouts configured with a Blue/Green deployment strategy for zero-downtime updates and instant rollbacks.

Infrastructure as Code: Underlying cloud infrastructure and cluster components are provisioned completely as code using Terraform.