// Tudorana Clark — platform resources (phase 1).
// Everything here is either free or pay-per-use, except ACR Basic (~$5/month).
// Container Apps themselves are created by infra/deploy.sh once images exist.

targetScope = 'resourceGroup'

@description('Short name used to derive resource names.')
param appName string = 'tudoranaclark'

@description('Primary region. UK South keeps latency low for a UK audience.')
param location string = resourceGroup().location

@description('Object ID of the developer who runs the app locally (gets the same data-plane roles as the app).')
param developerPrincipalId string

@description('Azure OpenAI model deployment.')
param openAiModel string = 'gpt-4.1-mini'
param openAiModelVersion string = '2025-04-14'

@description('Thousands of tokens per minute. Pay-per-token; capacity only caps throughput, it does not cost anything idle.')
param openAiCapacity int = 30

@description('GitHub repository (owner/name) allowed to deploy via OIDC, and the GitHub environment it must run in.')
param githubRepo string = 'Tudorana-Clark/tudorana-clark'
param githubEnvironment string = 'production'

@description('Cosmos DB free tier: only one account per subscription may use it.')
param cosmosFreeTier bool = true

var suffix = uniqueString(resourceGroup().id)
var tags = { app: appName, managedBy: 'bicep' }

// ---------- Observability ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${appName}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.16') } // hard cap keeps logging inside the 5 GB/month free grant
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${appName}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ---------- Identity (keyless access to every data service) ----------
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${appName}'
  location: location
  tags: tags
}

// ---------- Container registry ----------
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'cr${appName}${take(suffix, 6)}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

// ---------- Media storage ----------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${appName}${take(suffix, 6)}'
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: true // media container is public-read so images can be shared and crawled
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'media'
  properties: { publicAccess: 'Blob' }
}

// ---------- Cosmos DB (free tier: 1000 RU/s + 25 GB) ----------
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: 'cosmos-${appName}-${take(suffix, 6)}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: cosmosFreeTier
    disableLocalAuth: true
    minimalTlsVersion: 'Tls12'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [ { locationName: location, failoverPriority: 0, isZoneRedundant: false } ]
    capacity: { totalThroughputLimit: 1000 } // can never bill beyond the free allowance
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: 'site'
  properties: {
    resource: { id: 'site' }
    options: { throughput: 1000 } // shared across containers, fully covered by free tier
  }
}

var cosmosContainers = [
  { name: 'content', pk: '/kind' }
  { name: 'subscribers', pk: '/id' }
  { name: 'messages', pk: '/id' }
]

resource containers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = [for c in cosmosContainers: {
  parent: cosmosDb
  name: c.name
  properties: {
    resource: {
      id: c.name
      partitionKey: { paths: [ c.pk ], kind: 'Hash' }
      uniqueKeyPolicy: c.name == 'content' ? { uniqueKeys: [ { paths: [ '/slug' ] } ] } : null
    }
  }
}]

// ---------- Azure OpenAI ----------
resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-${appName}-${take(suffix, 6)}'
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'oai-${appName}-${take(suffix, 6)}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource openaiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openai
  name: openAiModel
  sku: { name: 'GlobalStandard', capacity: openAiCapacity }
  properties: {
    model: { format: 'OpenAI', name: openAiModel, version: openAiModelVersion }
  }
}

// ---------- Container Apps environment (consumption, scale-to-zero) ----------
resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${appName}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [ { name: 'Consumption', workloadProfileType: 'Consumption' } ]
  }
}

// ---------- Role assignments ----------
var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  blobContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  openAiUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, identity.id, roles.acrPull)
  properties: { roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull), principalId: identity.properties.principalId, principalType: 'ServicePrincipal' }
}

// Each data role goes to the app identity and to the developer (for local runs).
var principalKeys = [ 'app', 'dev' ]

resource blobRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for k in principalKeys: {
  scope: storage
  name: guid(storage.id, k == 'app' ? identity.id : developerPrincipalId, roles.blobContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobContributor)
    principalId: k == 'app' ? identity.properties.principalId : developerPrincipalId
    principalType: k == 'app' ? 'ServicePrincipal' : 'User'
  }
}]

resource openAiRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for k in principalKeys: {
  scope: openai
  name: guid(openai.id, k == 'app' ? identity.id : developerPrincipalId, roles.openAiUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.openAiUser)
    principalId: k == 'app' ? identity.properties.principalId : developerPrincipalId
    principalType: k == 'app' ? 'ServicePrincipal' : 'User'
  }
}]

// Cosmos DB Built-in Data Contributor (data-plane RBAC)
resource cosmosRoles 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = [for k in principalKeys: {
  parent: cosmos
  name: guid(cosmos.id, k == 'app' ? identity.id : developerPrincipalId, 'data-contributor')
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: k == 'app' ? identity.properties.principalId : developerPrincipalId
    scope: cosmos.id
  }
}]

// ---------- GitHub Actions deploy identity (keyless OIDC; no secrets stored in GitHub) ----------
resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${appName}-deploy'
  location: location
  tags: tags
}

resource deployFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-${githubEnvironment}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:environment:${githubEnvironment}'
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}

// Contributor on this resource group only: build images, update the apps. Cannot grant roles.
resource deployContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployIdentity.id, 'contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
    principalId: deployIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output deployClientId string = deployIdentity.properties.clientId
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output envName string = env.name
output identityId string = identity.id
output identityClientId string = identity.properties.clientId
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output storageAccount string = storage.name
output mediaBaseUrl string = '${storage.properties.primaryEndpoints.blob}media'
output openAiEndpoint string = openai.properties.endpoint
output openAiDeployment string = openaiDeployment.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
