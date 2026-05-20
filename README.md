# 🏥 University Medical Center Management System

A centralized, enterprise-grade management platform built for the University Medical Center (EE5206 Software Project). This system handles Role-Based Access Control (RBAC), clinical records, pharmacy inventory (7+3 prescription logic), and live ambulance dispatch.

## 👥 Development Team & Core Roles

To ensure isolated ownership and maximum velocity across our workspaces, the team is divided into the following key product and system leads:

* **Dilisha Madusha: Backend & Infrastructure Lead:** Core monorepo architecture, database schema design, cross-workspace shared type safety, custom edge session middleware, and automated CI/CD operations.
* **Risitha Oshada: Web Application Lead:** User interface layout, client-side state management, and core desktop workflows for the main administration and clinical medical web portal.
* **Patient Mobile App Specialist:** Native user experience, authentication routing integration, and mobile appointment features for the patient-facing mobile application.
* **Driver Mobile App Specialist:** Live telemetry UI elements, ambulance status mapping, and real-time response workflows for the emergency dispatch mobile application.

## 🏗️ Architecture

This project is structured as a **Monorepo** using [Turborepo](https://turbo.build/). It shares code, database schemas, and TypeScript interfaces across multiple applications to ensure zero "blast radius" discrepancies between the backend and frontends.

### Tech Stack
* **Framework:** Next.js (App Router)
* **Database:** PostgreSQL (hosted on Supabase)
* **ORM:** Prisma v7 (with Edge Connection Pooling)
* **Authentication:** Custom JWT with Edge Middleware & bcryptjs
* **Workspace:** Turborepo & npm workspaces

### Monorepo Structure
```text
medical-center-monorepo/
├── apps/
│   └── web/            # Next.js Frontend & Core API Routes
├── packages/
│   ├── db/             # Prisma schema, migrations, and seed scripts
│   └── typescript-config/ # Shared tsconfig
└── turbo.json          # Turborepo pipeline configuration
