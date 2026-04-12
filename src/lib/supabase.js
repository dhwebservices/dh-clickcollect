// src/lib/supabase.js
// Raw REST API helpers — avoids Supabase JS v2.43 columns= bug
// All calls use the anon key; RLS enforces access control

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function headers(token = null) {
  const h = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${token || ANON_KEY}`,
    'Prefer': 'return=representation'
  }
  return h
}

// Get the current session token from Supabase Auth
let _sessionToken = null
export function setSessionToken(token) { _sessionToken = token }
export function getSessionToken() { return _sessionToken }

function authHeaders() {
  return headers(_sessionToken)
}

// ── SELECT ───────────────────────────────────────────────────

export async function sbGet(table, params = {}) {
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

// ── INSERT ───────────────────────────────────────────────────

export async function sbInsert(table, data) {
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

// ── UPDATE ───────────────────────────────────────────────────

export async function sbUpdate(table, eq, data) {
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

// ── DELETE ───────────────────────────────────────────────────

export async function sbDelete(table, eq) {
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

// ── RPC (Postgres functions) ─────────────────────────────────

export async function sbRpc(fn, params = {}) {
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

// ── Supabase Auth (uses JS SDK for auth only) ────────────────
import { createClient } from '@supabase/supabase-js'

export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

// ── Realtime (uses JS SDK for websocket subscriptions) ───────
export const supabaseRealtime = supabaseAuth
