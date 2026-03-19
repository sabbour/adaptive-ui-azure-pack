// ─── Azure Icon Resolver ───
// Maps ARM resource types / service names to Azure service icon SVGs.
// Icons are from the official Azure architecture icons set.
// Uses explicit Vite ?url imports so icons are properly bundled.

// ─── Explicit icon imports ───
import iconKubernetes from './icons/Compute/Kubernetes Services.svg?url';
import iconVM from './icons/Compute/Virtual Machine.svg?url';
import iconAppServicePlan from './icons/App Services/App Service Plans.svg?url';
import iconAppServices from './icons/Web/App Services.svg?url';
import iconContainerInstances from './icons/Containers/Container Instances.svg?url';
import iconContainerRegistries from './icons/Containers/Container Registries.svg?url';
import iconSqlServer from './icons/Databases/SQL Server.svg?url';
import iconSqlDatabase from './icons/Databases/SQL Database.svg?url';
import iconAzureSql from './icons/Databases/Azure SQL.svg?url';
import iconCosmosDb from './icons/IoT/Azure Cosmos DB.svg?url';
import iconStorageAccounts from './icons/Storage/Storage Accounts.svg?url';
import iconKeyVaults from './icons/Security/Key Vaults.svg?url';
import iconVirtualNetworks from './icons/Networking/Virtual Networks.svg?url';
import iconLoadBalancers from './icons/Networking/Load Balancers.svg?url';
import iconAppGateways from './icons/Networking/Application Gateways.svg?url';
import iconCognitiveServices from './icons/AI + Machine Learning/Cognitive Services.svg?url';
import iconMachineLearning from './icons/AI + Machine Learning/Machine Learning.svg?url';
import iconAzureOpenAI from './icons/AI + Machine Learning/Azure OpenAI.svg?url';
import iconRedis from './icons/Databases/Cache Redis.svg?url';
import iconIotHub from './icons/IoT/IoT Hub.svg?url';
import iconFunctionApps from './icons/IoT/Function Apps.svg?url';

// Icon path key → resolved URL
const ICON_URLS: Record<string, string> = {
  'Compute/Kubernetes Services': iconKubernetes,
  'Compute/Virtual Machine': iconVM,
  'App Services/App Service Plans': iconAppServicePlan,
  'Web/App Services': iconAppServices,
  'Containers/Container Instances': iconContainerInstances,
  'Containers/Container Registries': iconContainerRegistries,
  'Databases/SQL Server': iconSqlServer,
  'Databases/SQL Database': iconSqlDatabase,
  'Databases/Azure SQL': iconAzureSql,
  'IoT/Azure Cosmos DB': iconCosmosDb,
  'Storage/Storage Accounts': iconStorageAccounts,
  'Security/Key Vaults': iconKeyVaults,
  'Networking/Virtual Networks': iconVirtualNetworks,
  'Networking/Load Balancers': iconLoadBalancers,
  'Networking/Application Gateways': iconAppGateways,
  'AI + Machine Learning/Cognitive Services': iconCognitiveServices,
  'AI + Machine Learning/Machine Learning': iconMachineLearning,
  'AI + Machine Learning/Azure OpenAI': iconAzureOpenAI,
  'Databases/Cache Redis': iconRedis,
  'IoT/IoT Hub': iconIotHub,
  'IoT/Function Apps': iconFunctionApps,
};

// ARM resource type → icon path key
const RESOURCE_TYPE_TO_ICON: Record<string, string> = {
  'Microsoft.ContainerService/managedClusters': 'Compute/Kubernetes Services',
  'Microsoft.Web/sites': 'Web/App Services',
  'Microsoft.Web/serverFarms': 'App Services/App Service Plans',
  'Microsoft.Compute/virtualMachines': 'Compute/Virtual Machine',
  'Microsoft.App/containerApps': 'Containers/Container Instances',
  'Microsoft.ContainerRegistry/registries': 'Containers/Container Registries',
  'Microsoft.Sql/servers': 'Databases/SQL Server',
  'Microsoft.Sql/servers/databases': 'Databases/SQL Database',
  'Microsoft.DocumentDB/databaseAccounts': 'IoT/Azure Cosmos DB',
  'Microsoft.Storage/storageAccounts': 'Storage/Storage Accounts',
  'Microsoft.KeyVault/vaults': 'Security/Key Vaults',
  'Microsoft.Network/virtualNetworks': 'Networking/Virtual Networks',
  'Microsoft.Network/loadBalancers': 'Networking/Load Balancers',
  'Microsoft.Network/applicationGateways': 'Networking/Application Gateways',
  'Microsoft.CognitiveServices/accounts': 'AI + Machine Learning/Cognitive Services',
  'Microsoft.MachineLearningServices/workspaces': 'AI + Machine Learning/Machine Learning',
  'Microsoft.Cache/redis': 'Databases/Cache Redis',
  'Microsoft.Devices/IotHubs': 'IoT/IoT Hub',
  'Microsoft.Web/sites/functions': 'IoT/Function Apps',
};

// Keyword → icon path key for general lookups
const KEYWORD_TO_ICON: Record<string, string> = {
  kubernetes: 'Compute/Kubernetes Services',
  aks: 'Compute/Kubernetes Services',
  'virtual machine': 'Compute/Virtual Machine',
  vm: 'Compute/Virtual Machine',
  'app service': 'Web/App Services',
  webapp: 'Web/App Services',
  function: 'IoT/Function Apps',
  serverless: 'IoT/Function Apps',
  sql: 'Databases/Azure SQL',
  cosmos: 'IoT/Azure Cosmos DB',
  storage: 'Storage/Storage Accounts',
  'key vault': 'Security/Key Vaults',
  container: 'Containers/Container Instances',
  registry: 'Containers/Container Registries',
  'load balancer': 'Networking/Load Balancers',
  vnet: 'Networking/Virtual Networks',
  cognitive: 'AI + Machine Learning/Cognitive Services',
  openai: 'AI + Machine Learning/Azure OpenAI',
  'machine learning': 'AI + Machine Learning/Machine Learning',
  redis: 'Databases/Cache Redis',
  iot: 'IoT/IoT Hub',
};

/** Get the icon URL for an ARM resource type */
export function getAzureIconUrl(resourceType: string): string | null {
  const iconKey = RESOURCE_TYPE_TO_ICON[resourceType];
  if (iconKey) {
    return ICON_URLS[iconKey] || null;
  }
  return null;
}

/** Get icon URL by keyword/service name */
export function getAzureIconByKeyword(keyword: string): string | null {
  const lower = keyword.toLowerCase();
  for (const [key, iconKey] of Object.entries(KEYWORD_TO_ICON)) {
    if (lower.includes(key)) {
      return ICON_URLS[iconKey] || null;
    }
  }
  return null;
}
