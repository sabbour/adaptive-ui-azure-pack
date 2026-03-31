import { PublicClientApplication, type AuthenticationResult, type INetworkModule, type NetworkRequestOptions, type NetworkResponse } from '@azure/msal-browser';

// ─── Azure Authentication ───
// Uses MSAL.js to authenticate via popup and get an ARM access token.
// Uses the well-known Azure CLI client ID. Token exchange requests
// are proxied through the Vite dev server to avoid browser CORS issues.

const DEFAULT_CLIENT_ID = '6c303fad-f9a9-42a1-b92f-3b615179086c';
const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47';
const ARM_SCOPE = 'https://management.azure.com/user_impersonation';
const GRAPH_SCOPE = 'https://graph.microsoft.com/User.Read';

// Custom network client that rewrites login.microsoftonline.com requests
// to go through the Vite dev-server proxy, bypassing CORS.
const proxyNetworkClient: INetworkModule = {
  sendGetRequestAsync: async <T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> => {
    const proxiedUrl = rewriteUrl(url);
    const response = await fetch(proxiedUrl, {
      method: 'GET',
      headers: options?.headers as Record<string, string>,
    });
    return { headers: Object.fromEntries(response.headers.entries()), body: await response.json() as T, status: response.status };
  },
  sendPostRequestAsync: async <T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> => {
    const proxiedUrl = rewriteUrl(url);
    const response = await fetch(proxiedUrl, {
      method: 'POST',
      headers: options?.headers as Record<string, string>,
      body: options?.body,
    });
    return { headers: Object.fromEntries(response.headers.entries()), body: await response.json() as T, status: response.status };
  },
};

function rewriteUrl(url: string): string {
  const AAD_HOST = 'https://login.microsoftonline.com';
  if (url.startsWith(AAD_HOST)) {
    return '/api/auth-proxy' + url.slice(AAD_HOST.length);
  }
  return url;
}

let msalInstance: PublicClientApplication | null = null;

function getMsal(clientId?: string, tenantId?: string): PublicClientApplication {
  if (msalInstance) return msalInstance;

  const authority = tenantId
    ? `https://login.microsoftonline.com/${tenantId}`
    : DEFAULT_AUTHORITY;

  msalInstance = new PublicClientApplication({
    auth: {
      clientId: clientId ?? DEFAULT_CLIENT_ID,
      authority,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
    system: {
      networkClient: proxyNetworkClient,
    },
  });

  return msalInstance;
}

export interface AzureAuthResult {
  accessToken: string;
  account: {
    name: string;
    username: string;
    tenantId: string;
  };
  expiresOn: Date;
}

/** Sign in via popup and get an ARM access token */
export async function azureLogin(
  clientId?: string,
  tenantId?: string
): Promise<AzureAuthResult> {
  const msal = getMsal(clientId, tenantId);
  await msal.initialize();

  let result: AuthenticationResult;

  // Try silent first (cached token)
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    try {
      result = await msal.acquireTokenSilent({
        scopes: [ARM_SCOPE],
        account: accounts[0],
      });
      return mapResult(result);
    } catch {
      // Silent failed, fall through to popup
    }
  }

  // Interactive popup
  result = await msal.acquireTokenPopup({
    scopes: [ARM_SCOPE],
  });

  return mapResult(result);
}

/** Sign out */
export async function azureLogout(): Promise<void> {
  if (!msalInstance) return;
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    await msalInstance.logoutPopup({ account: accounts[0] });
  }
  msalInstance = null;
}

/** Check if already signed in (has cached account) */
export async function getActiveAccount(): Promise<AzureAuthResult | null> {
  if (!msalInstance) {
    const msal = getMsal();
    await msal.initialize();
  }
  const accounts = msalInstance!.getAllAccounts();
  if (accounts.length === 0) return null;

  try {
    const result = await msalInstance!.acquireTokenSilent({
      scopes: [ARM_SCOPE],
      account: accounts[0],
    });
    return mapResult(result);
  } catch {
    return null;
  }
}

/** Acquire a Microsoft Graph token silently (requires an active session) */
export async function acquireGraphToken(): Promise<string> {
  if (!msalInstance) {
    const msal = getMsal();
    await msal.initialize();
  }
  const accounts = msalInstance!.getAllAccounts();
  if (accounts.length === 0) throw new Error('No active Azure session. Sign in first.');

  try {
    const result = await msalInstance!.acquireTokenSilent({
      scopes: [GRAPH_SCOPE],
      account: accounts[0],
    });
    return result.accessToken;
  } catch {
    // Silent failed, try popup for incremental consent
    const result = await msalInstance!.acquireTokenPopup({
      scopes: [GRAPH_SCOPE],
    });
    return result.accessToken;
  }
}

function mapResult(result: AuthenticationResult): AzureAuthResult {
  return {
    accessToken: result.accessToken,
    account: {
      name: result.account?.name ?? '',
      username: result.account?.username ?? '',
      tenantId: result.account?.tenantId ?? '',
    },
    expiresOn: result.expiresOn ?? new Date(),
  };
}
