import type { ComponentPack } from '@sabbour/adaptive-ui-core';
import { trackedFetch } from '@sabbour/adaptive-ui-core';
import { AzureResourceForm, AzureLogin, AzureQuery, AzurePicker, getActiveSubscriptionId, setActiveSubscriptionId } from './components';
import { fetchSubscriptions } from './arm-introspection';
import { AzureSettings } from './AzureSettings';
import { resolveAzureSkills } from './skills-resolver';
import { getActiveAccount } from './auth';
import './css/azure-theme.css';

// ─── Azure Component Pack ───
// Minimal pack: one dynamic component + knowledge skills from the agent-skills catalog.
//
// - azureResourceForm: auto-generates forms from ARM provider metadata (no hardcoded schemas)
// - resolveSkills: fetches relevant Azure domain knowledge from the agent-skills catalog
//   based on what the user is asking about (AKS, App Service, etc.)
//
// Prerequisites:
// - Set `__azureToken` in state with a valid Azure access token
// - Set `__azureSubscription` in state with the subscription ID

const AZURE_SYSTEM_PROMPT = `
AZURE CLOUD PACK:

RUNTIME BEHAVIOR:
- Past turns render as read-only snapshots in disabled context. Component side effects are suppressed there.
- If you need fresh API-loaded UI (pickers/forms), emit those components in the CURRENT active turn.

TOOLS (inference-time, LLM sees results):
- azure_arm_get: Read-only ARM API query. Use ONLY when you need data to reason about (check resources, validate config). NOT for selection lists. Requires sign-in.
- azure_pricing: Look up Azure retail prices for any SKU in any region. Public API, no sign-in needed. Use to show cost estimates for VMs (especially GPU SKUs), managed services, and infrastructure comparisons.

COMPONENTS (use in "ask" as {type:"component",component:"name",props:{}}):

azureLogin — {title?,description?}
  Sign-in card with "Sign in with Microsoft" popup. Sets __azureToken, fetches __azureSubscriptions. Auto-selects single subscription. Self-managed — omit "next".
  Show FIRST when Azure resources needed and __azureToken not set.

azureResourceForm — {resourceType:"Microsoft.ContainerService/managedClusters"|..., bind:"key"}
  Dynamic form from ARM resource type schema. Stores values as {bind}_{prop}. Requires __azureToken + __azureSubscription.

azurePicker — {api, bind, label?, labelKey?, valueKey?, filterKey?, filterValue?, labelBind?, itemsPath?, loadingLabel?}
  Dropdown fetching options from ARM endpoint at render time. ALWAYS use for regions, resource groups, SKUs — NEVER hardcode in select.
  Region example: {type:"azurePicker", api:"/subscriptions/{{state.__azureSubscription}}/locations?api-version=2022-12-01", bind:"region", label:"Azure Region", labelKey:"displayName", valueKey:"name", filterKey:"metadata.regionType", filterValue:"Physical"}
  RG example: {type:"azurePicker", api:"/subscriptions/{{state.__azureSubscription}}/resourcegroups?api-version=2022-09-01", bind:"resourceGroup", label:"Resource Group", labelKey:"name", valueKey:"name"}

azureQuery — {api, bind, method?:"GET"|"PUT"|"POST"|"DELETE"|"PATCH", body?, loadingLabel?, showResult?, confirm?}
  ARM API caller for WRITES with user confirmation. NOT for reads — use azurePicker/azure_arm_get.
  API path supports {{state.key}}. Write ops show confirm dialog. Results stored as JSON under bind key.
  Rules: role assignment IDs must be GUIDs, body is JSON string with {{st.key}}, use __azureSubscription in paths.

Deploy flow: 1) azureLogin if no token → 2) azurePicker for RG + region → 3) azureResourceForm for config → 4) summary + confirm

IaC: Use Bicep unless user requests Terraform.
Structure: main.bicep (orchestrator), modules/*.bicep (per concern), parameters.json, deploy.sh
Practices: param with types/defaults, module composition, tag resources, managed identity, diagnostic→Log Analytics, @secure() for secrets, output endpoints/IDs.
Do NOT call ARM APIs to create resources — generate IaC instead. Read-only queries OK.

CI/CD: Azure DevOps → azure-pipelines.yml. AKS → Flux v2 GitOps. Use OIDC federated credentials.

DIAGRAM ICONS (prefix with %%icon:NAME%%):
azure/aks, azure/vm, azure/vmss, azure/container-instances, azure/acr, azure/sql, azure/cosmos-db, azure/postgresql, azure/mysql, azure/redis, azure/vnet, azure/load-balancer, azure/app-gateway, azure/front-door, azure/dns, azure/firewall, azure/nsg, azure/app-service, azure/function-app, azure/storage, azure/key-vault, azure/monitor, azure/log-analytics, azure/cognitive-services, azure/event-grid, azure/api-management, azure/subscription, azure/resource-group

Diagram example:
"flowchart TD\\n  User([\\"User\\"])\\n  subgraph networking[\\"Networking\\"]\\n    DNS[\\"%%icon:azure/dns%%DNS\\"]\\n    FD[\\"%%icon:azure/front-door%%Front Door\\"]\\n  end\\n  subgraph compute[\\"Compute\\"]\\n    App[\\"%%icon:azure/app-service%%App Service\\"]\\n  end\\n  subgraph data[\\"Data\\"]\\n    SQL[\\"%%icon:azure/sql%%SQL\\"]\\n    Redis[\\"%%icon:azure/redis%%Redis\\"]\\n  end\\n  User --> DNS --> FD --> App\\n  App --> SQL\\n  App --> Redis"`;

export function createAzurePack(): ComponentPack {
  return {
    name: 'azure',
    displayName: 'Azure Cloud',
    components: {
      azureLogin: AzureLogin,
      azureResourceForm: AzureResourceForm,
      azureQuery: AzureQuery,
      azQuery: AzureQuery,
      azurePicker: AzurePicker,
    },
    systemPrompt: AZURE_SYSTEM_PROMPT,
    resolveSkills: resolveAzureSkills,
    settingsComponent: AzureSettings,
    tools: [
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'azure_arm_get',
            description: 'Call the Azure Resource Manager REST API (GET only). Use to list existing resources, check infrastructure state, or read configuration. Works with or without user sign-in (falls back to workload identity).',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'ARM API path starting with /subscriptions/... Include api-version parameter. Use {sub-id} as a placeholder for the active subscription ID — it will be resolved automatically. Example: /subscriptions/{sub-id}/resourceGroups?api-version=2022-09-01',
                },
              },
              required: ['path'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const acct = await getActiveAccount();
          let path = String(args.path);
          // Auto-inject the active subscription ID into placeholder patterns
          let subId = getActiveSubscriptionId();
          // If not set yet (e.g. session restored before component mounted), resolve from API
          if (!subId && path.includes('{sub-id}') || path.includes('{subscription-id}') || path.includes('{subscriptionId}')) {
            try {
              const subs = await fetchSubscriptions(acct?.accessToken);
              const enabled = subs.filter((s) => s.state === 'Enabled');
              if (enabled.length > 0) {
                subId = enabled[0].id;
                setActiveSubscriptionId(subId);
              }
            } catch { /* fall through — placeholder will remain and ARM will return a clear error */ }
          }
          if (subId) {
            path = path.split('{sub-id}').join(subId)
              .split('{subscription-id}').join(subId)
              .split('{subscriptionId}').join(subId);
          }
          const url = `/api/arm-proxy${path.startsWith('/') ? '' : '/'}${path}`;
          try {
            const headers: Record<string, string> = { Accept: 'application/json' };
            if (acct) headers['Authorization'] = `Bearer ${acct.accessToken}`;
            const res = await trackedFetch(url, { headers });
            const data = await res.json();
            if (!res.ok) return `ARM API error (${res.status}): ${data?.error?.message ?? JSON.stringify(data)}`;
            const text = JSON.stringify(data, null, 2);
            return text.length > 8000 ? text.slice(0, 8000) + '\n[truncated]' : text;
          } catch (err) {
            return `Failed to call ARM API: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'azure_pricing',
            description: 'Look up Azure retail prices for VMs, managed services, or any Azure SKU. Public API — no sign-in required. Use to estimate infrastructure costs, compare GPU VM prices for KAITO model hosting, or show managed vs in-cluster cost trade-offs. Returns up to 10 matching price records with hourly rates in USD.',
            parameters: {
              type: 'object',
              properties: {
                armSkuName: {
                  type: 'string',
                  description: 'ARM SKU name (e.g., "Standard_NC24ads_A100_v4", "Standard_D4s_v5"). If querying a non-VM service, omit this.',
                },
                serviceName: {
                  type: 'string',
                  description: 'Azure service name (e.g., "Virtual Machines", "Azure Cosmos DB", "Redis Cache", "Azure Database for PostgreSQL"). Case-sensitive.',
                },
                armRegionName: {
                  type: 'string',
                  description: 'Azure region (e.g., "eastus", "westeurope"). If omitted, returns global/default prices.',
                },
                currencyCode: {
                  type: 'string',
                  description: 'Currency code (default: "USD"). Examples: "EUR", "GBP", "JPY".',
                },
              },
              required: [],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const filters: string[] = [];
          if (args.armSkuName) filters.push(`armSkuName eq '${String(args.armSkuName)}'`);
          if (args.serviceName) filters.push(`serviceName eq '${String(args.serviceName)}'`);
          if (args.armRegionName) filters.push(`armRegionName eq '${String(args.armRegionName)}'`);
          filters.push("priceType eq 'Consumption'");

          const currency = args.currencyCode ? `currencyCode='${String(args.currencyCode)}'&` : '';
          const filterStr = filters.join(' and ');
          const url = `/api/pricing-proxy/api/retail/prices?${currency}$filter=${encodeURIComponent(filterStr)}&meterRegion='primary'`;

          try {
            const res = await trackedFetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) return `Pricing API error (${res.status})`;
            const data = await res.json();
            const items = (data.Items || []).slice(0, 10);
            if (items.length === 0) return 'No pricing data found for the given filters. Check SKU name spelling and region availability.';
            const summary = items.map((item: Record<string, unknown>) =>
              `${item.armSkuName || item.skuName} | ${item.meterName} | $${item.retailPrice}/hr | ${item.armRegionName} | ${item.productName}`
            ).join('\n');
            return `SKU | Meter | Price | Region | Product\n${summary}`;
          } catch (err) {
            return `Failed to fetch pricing: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
    ],
  };
}

export { clearSchemaCache } from './arm-introspection';
export { clearSkillsCache } from './skills-resolver';
export { azureLogin, azureLogout, getActiveAccount } from './auth';
export type { AzureAuthResult } from './auth';
export { getAzureIconUrl, getAzureIconByKeyword } from './icon-resolver';
