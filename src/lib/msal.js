// src/lib/msal.js
// Microsoft Entra ID config for DH admin authentication
// Only @dhwebsiteservices.co.uk accounts are permitted

import { PublicClientApplication, LogLevel } from '@azure/msal-browser'

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID,
    authority: import.meta.env.VITE_MSAL_AUTHORITY,
    redirectUri: window.location.origin + '/admin',
    postLogoutRedirectUri: window.location.origin + '/admin/login'
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        if (import.meta.env.DEV) console.log('[MSAL]', message)
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Warning
    }
  }
}

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
  prompt: 'select_account'
}

export const ALLOWED_DOMAIN = 'dhwebsiteservices.co.uk'

export function isAllowedAccount(account) {
  if (!account) return false
  const username = account.username || ''
  return username.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)
}

export const msalInstance = new PublicClientApplication(msalConfig)
