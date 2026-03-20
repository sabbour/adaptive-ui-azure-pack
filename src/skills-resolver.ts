// ─── Agent Skills Resolver ───
// Injects curated Azure domain knowledge into the LLM context:
// - ARM PUT body templates for common resource types
// - Role assignment rules
//
// Note: the LLM also has access to the fetch_webpage tool and can
// read Azure Learn docs or the agent-skills catalog URLs directly.

// Map of keywords → ARM resource types for schema injection
const RESOURCE_TYPE_TRIGGERS: Record<string, { resourceType: string; apiVersion: string }> = {
  'aks|kubernetes|managed cluster|managedcluster': {
    resourceType: 'Microsoft.ContainerService/managedClusters',
    apiVersion: '2025-03-01',
  },
  'aks automatic|aks auto|managed system|hostedsystem': {
    resourceType: 'Microsoft.ContainerService/managedClusters',
    apiVersion: '2025-03-01',
  },
  'app service|web app|webapp|microsoft.web/sites': {
    resourceType: 'Microsoft.Web/sites',
    apiVersion: '2023-12-01',
  },
  'container app|containerapp': {
    resourceType: 'Microsoft.App/containerApps',
    apiVersion: '2024-03-01',
  },
  'acr|container registry': {
    resourceType: 'Microsoft.ContainerRegistry/registries',
    apiVersion: '2023-07-01',
  },
  'cosmos|cosmosdb': {
    resourceType: 'Microsoft.DocumentDB/databaseAccounts',
    apiVersion: '2024-02-15-preview',
  },
  'sql server|azure sql': {
    resourceType: 'Microsoft.Sql/servers',
    apiVersion: '2023-08-01-preview',
  },
  'storage account': {
    resourceType: 'Microsoft.Storage/storageAccounts',
    apiVersion: '2023-05-01',
  },
  'key vault|keyvault': {
    resourceType: 'Microsoft.KeyVault/vaults',
    apiVersion: '2023-07-01',
  },
  'role assignment|rbac|acrpull|acr pull|permission|principalid': {
    resourceType: 'Microsoft.Authorization/roleAssignments',
    apiVersion: '2022-04-01',
  },
};

/** Resolve relevant Azure skills for a given prompt */
export async function resolveAzureSkills(prompt: string): Promise<string | null> {
  const lower = prompt.toLowerCase();

  // Inject ARM resource schemas when deploying/creating resources
  const deployKeywords = ['deploy', 'create', 'provision', 'put ', 'azurequery', 'bicep', 'template', 'infrastructure', 'role', 'rbac', 'acr pull', 'acrpull', 'permission'];
  const isDeployContext = deployKeywords.some((kw) => lower.includes(kw));
  if (isDeployContext) {
    const schemas = resolveArmSchemas(lower);
    if (schemas.length > 0) {
      return `\n--- AZURE DOMAIN KNOWLEDGE ---\n${schemas.join('\n\n')}`;
    }
  }

  // Inject AKS Automatic domain knowledge when AKS is discussed
  const aksKeywords = ['aks', 'kubernetes', 'managed cluster', 'aks automatic', 'gateway api', 'deployment safeguard', 'workload identity'];
  const isAksContext = aksKeywords.some((kw) => lower.includes(kw));
  if (isAksContext) {
    return '\n' + AKS_AUTOMATIC_KNOWLEDGE;
  }

  return null;
}

/** Clear the skills cache */
export function clearSkillsCache(): void {
  // No-op — ARM templates are static, no cache to clear
}

// ─── ARM Schema Injection ───
// When the conversation is about deploying/creating resources,
// inject the ARM PUT body template so the LLM knows the correct shape.

function resolveArmSchemas(prompt: string): string[] {
  const results: string[] = [];

  for (const [pattern, info] of Object.entries(RESOURCE_TYPE_TRIGGERS)) {
    const parts = pattern.split('|');
    if (parts.some((p) => prompt.includes(p))) {
      const template = ARM_BODY_TEMPLATES[info.resourceType];
      if (template && template !== 'SPECIAL') {
        results.push(
          `[ARM PUT Body Template for ${info.resourceType} (api-version=${info.apiVersion})]\n` +
          `When creating this resource with azureQuery PUT, use this body structure:\n` +
          '```json\n' + template + '\n```\n' +
          `API path: /subscriptions/{{st.__azureSubscription}}/resourceGroups/{{st.rg}}/providers/${info.resourceType}/{name}?api-version=${info.apiVersion}`
        );
      } else if (info.resourceType === 'Microsoft.Authorization/roleAssignments') {
        results.push(
          `[ARM Role Assignment Rules]\n` +
          `Role assignments have special ARM requirements:\n` +
          `1. The ID in the URL path MUST be a GUID (use crypto.randomUUID() or a deterministic GUID)\n` +
          `2. The API path scope must MATCH the scope in the body.\n` +
          `   - To scope to a specific resource (e.g., ACR): PUT on /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.ContainerRegistry/registries/{acrName}/providers/Microsoft.Authorization/roleAssignments/{guid}\n` +
          `   - To scope to a resource group: PUT on /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Authorization/roleAssignments/{guid}\n` +
          `3. Body: { "properties": { "roleDefinitionId": "/subscriptions/{sub}/providers/Microsoft.Authorization/roleDefinitions/{roleId}", "principalId": "{managedIdentityPrincipalId}" } }\n` +
          `4. Common role IDs: AcrPull=7f951dda-4ed3-4680-a7ca-43fe172d538d, AcrPush=8311e382-0749-4cb8-b61a-304f252e45ec, Contributor=b24988ac-6180-42a0-ab88-20f7382dd24c\n` +
          `5. api-version=2022-04-01`
        );
      }
    }
  }

  return results;
}

// Minimal correct PUT body templates for common resource types.
// These are the minimum required fields for a successful ARM PUT.
const ARM_BODY_TEMPLATES: Record<string, string> = {
  'Microsoft.ContainerService/managedClusters': JSON.stringify({
    location: '{{location}}',
    sku: { name: 'Automatic', tier: 'Standard' },
    properties: {
      dnsPrefix: '{{dnsPrefix}}',
      hostedSystemProfile: { enabled: true },
      networkProfile: {
        networkPlugin: 'azure',
        networkPluginMode: 'overlay',
        loadBalancerSku: 'standard',
      },
      ingressProfile: {
        webAppRouting: {
          enabled: true,
          nginx: { defaultIngressControllerType: 'None' },
          defaultDomain: { enabled: true },
          gatewayAPIImplementations: {
            appRoutingIstio: { mode: 'Enabled' },
          },
        },
        gatewayAPI: { installation: 'Standard' },
      },
    },
  }, null, 2),

  'Microsoft.Web/sites': JSON.stringify({
    location: '{{location}}',
    kind: 'app,linux',
    properties: {
      serverFarmId: '{{appServicePlanId}}',
      siteConfig: {
        linuxFxVersion: 'DOTNETCORE|8.0',
      },
      httpsOnly: true,
    },
  }, null, 2),

  'Microsoft.ContainerRegistry/registries': JSON.stringify({
    location: '{{location}}',
    sku: { name: 'Basic' },
    properties: {
      adminUserEnabled: false,
    },
  }, null, 2),

  'Microsoft.App/containerApps': JSON.stringify({
    location: '{{location}}',
    properties: {
      managedEnvironmentId: '{{managedEnvironmentId}}',
      configuration: {
        ingress: {
          external: true,
          targetPort: 8080,
          transport: 'auto',
        },
      },
      template: {
        containers: [{
          name: '{{appName}}',
          image: '{{image}}',
          resources: { cpu: 0.5, memory: '1Gi' },
        }],
        scale: { minReplicas: 1, maxReplicas: 3 },
      },
    },
  }, null, 2),

  'Microsoft.Storage/storageAccounts': JSON.stringify({
    location: '{{location}}',
    sku: { name: 'Standard_LRS' },
    kind: 'StorageV2',
    properties: {
      supportsHttpsTrafficOnly: true,
      minimumTlsVersion: 'TLS1_2',
    },
  }, null, 2),

  'Microsoft.KeyVault/vaults': JSON.stringify({
    location: '{{location}}',
    properties: {
      tenantId: '{{tenantId}}',
      sku: { family: 'A', name: 'standard' },
      accessPolicies: [],
      enableRbacAuthorization: true,
      enableSoftDelete: true,
      softDeleteRetentionInDays: 90,
    },
  }, null, 2),

  'Microsoft.Authorization/roleAssignments': 'SPECIAL',
};

// ─── AKS Automatic Domain Knowledge ───
const AKS_AUTOMATIC_KNOWLEDGE = `--- AKS AUTOMATIC DOMAIN KNOWLEDGE ---

CLUSTER CREATION (API 2025-03-01):
- Use sku.name="Automatic" and sku.tier="Standard"
- Managed system node pools: set "hostedSystemProfile": { "enabled": true }
- Do NOT specify agentPoolProfiles for system pools — they are fully managed
- OIDC issuer and Workload Identity are enabled by default

GATEWAY API (MANDATORY):
- GatewayClass: "approuting-istio" — ALWAYS use this, never Ingress/nginx
- Cluster ingressProfile must include:
  webAppRouting.enabled=true, nginx.defaultIngressControllerType="None",
  defaultDomain.enabled=true, gatewayAPIImplementations.appRoutingIstio.mode="Enabled",
  gatewayAPI.installation="Standard"
- Gateway resource example:
  apiVersion: gateway.networking.k8s.io/v1
  kind: Gateway
  metadata:
    name: app-gateway
  spec:
    gatewayClassName: approuting-istio
    listeners:
    - name: http
      port: 80
      protocol: HTTP
      allowedRoutes:
        namespaces:
          from: Same
- HTTPRoute resource example:
  apiVersion: gateway.networking.k8s.io/v1
  kind: HTTPRoute
  metadata:
    name: app-route
  spec:
    parentRefs:
    - name: app-gateway
    rules:
    - backendRefs:
      - name: app-service
        port: 80

WORKLOAD IDENTITY (MANDATORY):
- AKS Automatic has OIDC + Workload Identity enabled by default
- For ALL Azure service connections (Cosmos DB, Azure SQL, PostgreSQL, Key Vault, AI Foundry, ACR, AI Search, Redis, Storage):
  1. Create a User-Assigned Managed Identity
  2. Create a Federated Identity Credential linking K8s ServiceAccount to the Managed Identity (issuer = AKS OIDC issuer URL)
  3. K8s ServiceAccount annotation: azure.workload.identity/client-id: "<client-id>"
  4. Pod label: azure.workload.identity/use: "true"
  5. Assign RBAC roles to the Managed Identity on target resources
- NEVER use connection strings with secrets — always Workload Identity
- App code uses DefaultAzureCredential (Azure SDK) which automatically works with Workload Identity

DEPLOYMENT SAFEGUARDS (AKS enforces via Azure Policy):
All pods MUST have:
- resources.requests AND resources.limits (CPU + memory) on every container
- livenessProbe and readinessProbe
- runAsNonRoot: true in pod securityContext
- No hostNetwork, hostPID, hostIPC
- No privileged containers
- allowPrivilegeEscalation: false
- No :latest image tags — use specific versions or SHA digests
- readOnlyRootFilesystem: true where possible
Non-compliant manifests are REJECTED by the cluster.

ACR INTEGRATION:
- Default: create new ACR, attach to AKS via AcrPull role assignment on kubelet identity
- Offer option to use existing ACR via azurePicker
- NEVER use imagePullSecrets with passwords`;

