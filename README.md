# @sabbour/adaptive-ui-azure-pack

[![CI](https://github.com/sabbour/adaptive-ui-azure-pack/actions/workflows/ci.yml/badge.svg)](https://github.com/sabbour/adaptive-ui-azure-pack/actions/workflows/ci.yml)

An [Adaptive UI](https://github.com/sabbour/adaptive-ui-framework) component pack for **Azure Cloud** integration. Provides authentication, ARM API interaction, dynamic resource forms, and architecture diagram icons.

## Components

| Component | Props | Description |
|-----------|-------|-------------|
| `azureLogin` | `title?`, `description?` | Microsoft sign-in card via MSAL popup. Sets `__azureToken` and fetches subscriptions. |
| `azureResourceForm` | `resourceType`, `bind` | Dynamic form auto-generated from ARM provider metadata (no hardcoded schemas). |
| `azurePicker` | `api`, `bind`, `label?`, `labelKey?`, `valueKey?`, `filterKey?`, `filterValue?`, ... | Dropdown that fetches options from an ARM endpoint at render time. Use for regions, resource groups, SKUs. |
| `azureQuery` | `api`, `bind`, `method?`, `body?`, `confirm?`, `loadingLabel?`, `showResult?` | ARM API caller for write operations with user confirmation dialog. |

## Tools

| Tool | Description |
|------|-------------|
| `azure_arm_get` | Read-only ARM REST API queries. Use when the LLM needs data to reason about (check resources, validate config). |
| `azure_pricing` | Azure retail pricing API queries. Look up VM SKUs, managed service costs by region. Returns up to 10 matching price records. |

## Intent Resolvers

| Resolver | Description |
|----------|-------------|
| `azure-regions` | Pre-configured `azurePicker` for Azure regions |
| `azure-resource-groups` | Pre-configured `azurePicker` for resource groups |
| `azure-skus` | Pre-configured `azureResourceForm` for SKU/tier selection |
| `azure-subscriptions` | Pre-configured `azurePicker` for subscriptions |

## Skills

The pack includes a **skills resolver** that dynamically fetches Azure domain knowledge from the agent-skills catalog based on conversation context (AKS, App Service, networking, etc.).

## Diagram Icons

Provides 27 Azure service icons for use in Mermaid architecture diagrams with the `%%icon:azure/service-name%%` syntax. Includes icons for AKS, VMs, App Service, SQL, Cosmos DB, Key Vault, Front Door, and more.

## Installation

```bash
npm install @sabbour/adaptive-ui-azure-pack
```

```typescript
import { createAzurePack } from '@sabbour/adaptive-ui-azure-pack';

const azurePack = createAzurePack();
// Register with your AdaptiveApp
```

## Prerequisites

- User must sign in via the `azureLogin` component (sets `__azureToken` in state)
- Subscription is auto-selected if only one is available
- All API calls use `/api/` prefixed paths routed through the Azure Functions proxy (handles CORS for Azure AD, pricing API)
- The `azurePicker` guards against unresolved state interpolation (shows "Waiting for selection..." instead of making broken API calls)

## License

MIT
