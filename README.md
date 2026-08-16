Project Overview & Purpose
System Purpose
Core Objective: A Kubernetes monitoring and automated triage system designed to detect application and cluster-level errors in real time, expose operational metrics, dynamically scale an AI agent for incident analysis, and manage releases using GitOps and progressive delivery practices.

Core Architecture & Key Features
Real-time Error Collection

A long-running service leverages the Kubernetes API (k8sclient) to capture both application-level and cluster-level error events asynchronously as they occur.

Prometheus Metrics & KEDA Autoscaling

Error event counts are exposed as custom Prometheus metrics. KEDA (Kubernetes Event-driven Autoscaling) continuously monitors these metric spikes to dynamically scale the AI Agent microservice—automatically scaling up during error spikes and scaling down to 0 pods during idle periods to eliminate resource wastage.

AI-Powered Incident Triage

When triggered and scaled up by KEDA, the AI Agent extracts log contexts and stack traces, transmitting them to an LLM to generate instant 2-sentence root-cause summaries and actionable fix recommendations.

GitOps via ArgoCD

Cluster configurations, infrastructure policies, and application manifests are declaratively synchronized using ArgoCD, ensuring Git remains the single source of truth across environments.

Progressive Delivery via Argo Rollouts

Release lifecycles and deployment health are managed using Argo Rollouts configured with a Blue/Green deployment strategy for zero-downtime rollouts, automated verification, and immediate rollback capabilities.

Infrastructure as Code (IaC)

The underlying cloud infrastructure, network topology, and core cluster control components are completely provisioned and managed as code using Terraform.