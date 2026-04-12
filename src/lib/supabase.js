// src/lib/supabase.js
// Raw REST API helpers for public and restaurant-staff access.
// Admin + impersonation traffic is bridged through the Cloudflare Worker.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const WORKER_URL = import.meta.env.VITE_WORKER_URL

function headers(token = null) {
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${token || ANON_KEY}`,
    'Prefer': 'return=representation'
  }
}

let _sessionToken = null
let _adminBridge = null

export function setSessionToken(token) { _sessionToken = token }
export function getSessionToken() { return _sessionToken }

export function setAdminBridgeSession(session) { _adminBridge = session }
export function getAdminBridgeSession() { return _adminBridge }

function useAdminBridge() {
  if (!(_adminBridge?.token && WORKER_URL) || typeof window === 'undefined') return false
  const path = window.location.pathname || ''
  return !!(_adminBridge.impersonationRestaurantId || path.startsWith('/admin'))
}

function authHeaders() {
  return headers(_sessionToken)
}

async function adminBridgeRequest(operation, payload = {}) {
  const res = await fetch(`${WORKER_URL}/admin/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_adminBridge.token}`
    },
    body: JSON.stringify({
      operation,
      scope: _adminBridge.impersonationRestaurantId ? 'restaurant' : 'platform',
      impersonationRestaurantId: _adminBridge.impersonationRestaurantId || null,
      ...payload
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || `Admin ${operation} failed: ${res.status}`)
  }

  const data = await res.json()
  return data.data
}

export async function sbGet(table, params = {}) {
  if (useAdminBridge()) {
    return adminBridgeRequest('select', { table, params })
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  url.searchParams.set('select', params.select || '*')
  if (params.eq) {
    Object.entries(params.eq).forEach(([k, v]) => {
      url.searchParams.set(k, `eq.${v}`)
    })
  }
  if (params.filter) {
    Object.entries(params.filter).forEach(([k, v]) => {
      url.searchParams.set(k, v)
    })
  }
  if (params.order) url.searchParams.set('order', params.order)
  if (params.limit) url.searchParams.set('limit', params.limit)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: authHeaders()
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `GET ${table} failed: ${res.status}`)
  }
  return res.json()
}

export async function sbGetOne(table, params = {}) {
  const rows = await sbGet(table, { ...params, limit: 1 })
  return rows[0] || null
}

export async function sbInsert(table, data) {
  if (useAdminBridge()) {
    const result = await adminBridgeRequest('insert', { table, data })
    return Array.isArray(result) ? result[0] : result
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `INSERT ${table} failed: ${res.status}`)
  }
  const result = await res.json()
  return Array.isArray(result) ? result[0] : result
}

export async function sbUpdate(table, eq, data) {
  if (useAdminBridge()) {
    const result = await adminBridgeRequest('update', { table, eq, data })
    return Array.isArray(result) ? result[0] : result
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  Object.entries(eq).forEach(([k, v]) => {
    url.searchParams.set(k, `eq.${v}`)
  })

  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `UPDATE ${table} failed: ${res.status}`)
  }
  const result = await res.json()
  return Array.isArray(result) ? result[0] : result
}

export async function sbDelete(table, eq) {
  if (useAdminBridge()) {
    await adminBridgeRequest('delete', { table, eq })
    return true
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  Object.entries(eq).forEach(([k, v]) => {
    url.searchParams.set(k, `eq.${v}`)
  })

  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: authHeaders()
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `DELETE ${table} failed: ${res.status}`)
  }
  return true
}

export async function sbRpc(fn, params = {}) {
  if (useAdminBridge()) {
    return adminBridgeRequest('rpc', { fn, params })
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `RPC ${fn} failed: ${res.status}`)
  }
  return res.json()
}

export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

export const supabaseRealtime = supabaseAuth
