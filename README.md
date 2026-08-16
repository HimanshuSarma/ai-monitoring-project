# 🚀 Cloud-Native AI Observability & Microservices Platform

An enterprise-grade, high-concurrency microservices platform featuring automated AWS infrastructure via Terraform, GitOps deployment via ArgoCD on Kubernetes, and an **LLM-driven AI Observability Watcher** for real-time cluster incident response.

---

## 🏛️ High-Level System Architecture

```mermaid
flowchart TD
    subgraph AWS_Cloud ["AWS Cloud Infrastructure (Provisioned via Terraform)"]
        direction TB
        
        subgraph Network ["VPC Network (10.0.0.0/16)"]
            PublicSubnet["Public Subnets<br/>(Internet Gateway, NAT Gateways)"]
            PrivateSubnet["Private Subnets<br/>(Worker Nodes, Internal DBs)"]
        end

        subgraph EKS_Cluster ["Amazon EKS Cluster"]
            direction LR
            Ingress["NGINX Ingress Controller"]
            
            subgraph App_Namespace ["Application Namespace"]
                API["Node.js API Gateway"]
                Backend["Laravel Backend Service"]
                AI_Agent["AI LLM Watcher Microservice"]
            end
            
            subgraph Platform_Namespace ["Platform Namespace"]
                ArgoCD["ArgoCD / Rollouts"]
                Redis["Redis Master-Replica Cluster"]
                DB[("PostgreSQL Database")]
            end
        end
    end

    %% External Connections
    User([External Client / Frontend]) -->|HTTPS| Ingress
    Ingress -->|HTTP Traffic| API
    
    %% Service Connections
    API -->|REST / WebSockets| Backend
    API <-->|Pub/Sub & Locks| Redis
    Backend <-->|SQL Queries| DB
    
    %% Observability Loop
    AI_Agent -.->|K8s Events API| EKS_Cluster
    AI_Agent -->|Stack Traces| LLM[("External / Local LLM")]
    LLM -->|Incident Triage| AI_Agent
    AI_Agent -->|Alert Summaries| Slack([Slack / Notification Webhook])

    %% Styling
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#fff;
    classDef k8s fill:#326CE5,stroke:#fff,stroke-width:2px,color:#fff;
    classDef db fill:#336791,stroke:#fff,stroke-width:2px,color:#fff;
    class EKS_Cluster aws;
    class API,Backend,AI_Agent,ArgoCD k8s;
    class Redis,DB db;