# Kubernetes AI-Driven Error Monitoring & Autoscaling System

---

## 📄 Project Overview & Purpose

> ### **System Purpose**
> **Core Objective:** A Kubernetes monitoring and automated triage system designed to detect **application and cluster-level errors** in real time, expose operational metrics, dynamically scale an **AI agent** for incident analysis, and manage releases using **GitOps** and progressive delivery practices.

---

## ⚡ Core Architecture & Key Features

* **Real-time Error Collection**  
  A long-running service leverages the **Kubernetes API** (`k8sclient`) to capture both **application-level** and **cluster-level** error events asynchronously as they occur.

* **Prometheus Metrics & KEDA Autoscaling**  
  Error event counts are exposed as custom **Prometheus metrics** via the `k8s_event_watcher` service. **KEDA (Kubernetes Event-driven Autoscaling)** continuously monitors these metric spikes to dynamically scale the **AI Agent microservice**—automatically scaling up during error spikes and scaling down to **0 pods** during idle periods to eliminate resource wastage.

* **AI-Powered Incident Triage**  
  When triggered and scaled up by **KEDA**, the **AI Agent** extracts log contexts and stack traces, transmitting them to an **LLM** to generate instant **2-sentence root-cause summaries** and actionable fix recommendations.

* **GitOps via ArgoCD**  
  Cluster configurations, infrastructure policies, and application manifests are declaratively synchronized using **ArgoCD**, ensuring **Git** remains the single source of truth across environments.

* **Progressive Delivery via Argo Rollouts**  
  Release lifecycles and deployment health are managed using **Argo Rollouts** configured with a **Blue/Green deployment strategy** for zero-downtime rollouts, automated verification, and immediate rollback capabilities.

* **Infrastructure as Code (IaC)**  
  The underlying cloud infrastructure, network topology, and core cluster control components are completely provisioned and managed as code using **Terraform**.

---

## 🏗️ Implementation Flow & Microservices Architecture

### 🔄 Microservices Breakdown & Workflow

1. **`backend` Service**  
   Contains core application logic (e.g., sample `/users` endpoints configured to throw application-level errors for specific IDs). Captured errors are immediately written to the shared data store (Redis/Database).

2. **`k8s_event_watcher` Service**  
   A long-running listener that watches the Kubernetes API server for cluster-level error events in real time. Uses an **in-memory lookup map** to deduplicate events and prevent repetitive entries from cluttering the data store. It exposes the error event count directly to **Prometheus** through a `/metrics` endpoint.

3. **`error_dispatcher` Service**  
   Pulls unprocessed error payloads from the central data store, structures detailed prompts containing error logs and context, and dispatches them to the `ai-agent` service endpoint.

4. **`ai-agent` Service & KEDA Autoscaling**  
   Powered by the **Qwen LLM engine** to generate instant 2-sentence root-cause diagnoses and solution steps. Configured with strict CPU and memory limits to safeguard cluster resources. 
   
   A **KEDA ScaledObject** monitors Prometheus metrics (error events in the last 5 minutes):
   * **0 Errors:** Scales the `ai-agent` deployment down to **0 pods** to save resources.
   * **>= 1 Errors:** Scales up the required pods to process incoming error prompts instantly.

---

### 📐 Architecture Diagram

```mermaid
flowchart TD
    subgraph AppCluster["Kubernetes Cluster"]
        direction TB

        subgraph Sources["Error Sources"]
            BE["backend Service\n(App Logic & API Errors)"]
            K8sAPI["K8s API Server\n(Cluster Events)"]
        end

        subgraph Ingestion["Ingestion & Monitoring"]
            EW["k8s_event_watcher\n(Deduplication Cache Map)"]
            Store[("Data Store\n(Redis / DB)")]
        end

        subgraph Dispatch["Processing & Metrics"]
            Prom["Prometheus\n(Scrapes /metrics)"]
            ED["error_dispatcher Service"]
        end

        subgraph ScalingAI["Dynamic AI Layer"]
            KEDA["KEDA ScaledObject\n(Evaluates 5-min Prom Metrics)"]
            AI["ai-agent Deployment\n(Qwen LLM Engine)\n(Scales 0 ↔ N Pods | Strict Limits)"]
        end
    end

    %% Flow Connections
    BE -->|1. Push App Errors| Store
    K8sAPI -->|1. Event Stream| EW
    EW -->|2. Write Cluster Errors| Store
    EW -->|3. Expose /metrics| Prom

    Store -->|4. Pull Unprocessed Errors| ED

    Prom -->|5. Metrics Rule Check| KEDA
    KEDA -->|6. Trigger Scale Up/Down| AI

    ED -->|7. Forward Prompt Payload| AI