// worker.js
// Cloudflare Worker — handles:
//   POST /create-payment-intent  → Stripe Connect payment intent
//   POST /webhook               → Stripe webhook (flip payment_status to paid)
//   POST /notify                → SMS via Twilio + email confirmation

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const corsHeaders = buildCorsHeaders(request)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      if (url.pathname === '/admin/session') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }
        const admin = await verifyAdminRequest(request, env)
        return json({ data: admin }, 200, corsHeaders)
      }

      if (url.pathname === '/admin/query') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }
        await verifyAdminRequest(request, env)
        const payload = await request.json()
        const data = await runAdminQuery(payload, env)
        return json({ data }, 200, corsHeaders)
      }

      if (url.pathname === '/admin/restaurant-users') {
        await verifyAdminRequest(request, env)

        if (request.method === 'GET') {
          const restaurantId = url.searchParams.get('restaurant_id')
          if (!restaurantId) {
            return json({ error: 'Missing restaurant_id' }, 400, corsHeaders)
          }
          const data = await listRestaurantUsers(env, restaurantId)
          return json({ data }, 200, corsHeaders)
        }

        if (request.method === 'POST') {
          const payload = await request.json()
          const data = await createRestaurantUser(env, payload)
          return json({ data }, 200, corsHeaders)
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      if (url.pathname === '/admin/restaurant-users/password') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }
        await verifyAdminRequest(request, env)
        const payload = await request.json()
        const data = await resetRestaurantUserPassword(env, payload)
        return json({ data }, 200, corsHeaders)
      }

      if (url.pathname === '/admin/restaurant-users/welcome') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }
        await verifyAdminRequest(request, env)
        const payload = await request.json()
        const data = await sendRestaurantWelcomeGuide(env, payload)
        return json({ data }, 200, corsHeaders)
      }

      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      // ── Create Stripe payment intent ─────────────────────────
      if (url.pathname === '/create-payment-intent') {
        const { amount, currency, restaurant_id } = await request.json()

        if (!restaurant_id) {
          return json({ error: 'Missing restaurant' }, 400, corsHeaders)
        }

        if (!amount || amount < 30) {
          return json({ error: 'Invalid amount' }, 400, corsHeaders)
        }

        const restaurant = await getRestaurant(env, restaurant_id)
        if (!restaurant) {
          return json({ error: 'Restaurant not found' }, 404, corsHeaders)
        }
        if (restaurant.status !== 'active') {
          return json({ error: 'Restaurant is not currently active' }, 400, corsHeaders)
        }
        if (restaurant.is_busy) {
          return json({ error: 'Restaurant is currently not taking new orders' }, 400, corsHeaders)
        }

        const commissionRate = Number(restaurant.commission_rate || 0)
        const stripeAccountId = restaurant.stripe_account_id
        const commissionAmount = Math.round(amount * (commissionRate / 100))
        const transferAmount = amount - commissionAmount

        const body = new URLSearchParams({
          amount: amount.toString(),
          currency: currency || 'gbp',
          'payment_method_types[]': 'card',
          'metadata[restaurant_id]': restaurant_id,
          'metadata[commission_rate]': commissionRate.toString()
        })

        if (stripeAccountId) {
          body.append('transfer_data[destination]', stripeAccountId)
          body.append('transfer_data[amount]', transferAmount.toString())
        }

        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body
        })

        const intent = await res.json()
        if (!res.ok) return json({ error: intent.error?.message || 'Stripe error' }, 400, corsHeaders)

        return json({ clientSecret: intent.client_secret }, 200, corsHeaders)
      }

      // ── Stripe webhook ────────────────────────────────────────
      if (url.pathname === '/webhook') {
        const rawBody = await request.text()
        const sig = request.headers.get('stripe-signature')

        // Verify signature
        if (env.STRIPE_WEBHOOK_SECRET) {
          const verified = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)
          if (!verified) return new Response('Invalid signature', { status: 400 })
        }

        const event = JSON.parse(rawBody)

        if (event.type === 'payment_intent.succeeded') {
          const intentId = event.data.object.id
          // Update order payment_status in Supabase via REST
          await fetch(`${env.SUPABASE_URL}/rest/v1/orders?stripe_payment_intent_id=eq.${intentId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ payment_status: 'paid' })
          })
        }

        return new Response('ok', { status: 200 })
      }

      // ── Notifications (email + SMS) ──────────────────────────
      if (url.pathname === '/notify') {
        const { type, order, restaurant, customer } = await request.json()

        const tasks = []

        // Email confirmation to customer
        if (type === 'order_confirmation' && customer?.email) {
          tasks.push(sendEmail(env, {
            to: customer.email,
            from: 'orders@dhwebsiteservices.co.uk',
            subject: `Order confirmed — ${restaurant.name} #${order.order_number}`,
            html: orderConfirmationEmail(order, restaurant, customer)
          }))
        }

        // SMS to customer
        if (customer?.phone && env.TWILIO_SID && env.TWILIO_TOKEN) {
          const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
          const itemList = items.map(i => `${i.quantity}x ${i.name}`).join(', ')
          tasks.push(sendSMS(env, {
            to: customer.phone,
            body: `✅ Order confirmed at ${restaurant.name}!\n${itemList}\nCollect at: ${order.collection_time}\nRef: #${order.order_number}`
          }))
        }

        // Notify restaurant (email)
        if (restaurant?.email) {
          const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
          tasks.push(sendEmail(env, {
            to: restaurant.email,
            from: 'orders@dhwebsiteservices.co.uk',
            subject: `New order #${order.order_number} — Collect at ${order.collection_time}`,
            html: newOrderEmail(order, restaurant)
          }))
        }

        if (type === 'order_status_update') {
          if (customer?.email) {
            tasks.push(sendEmail(env, {
              to: customer.email,
              from: 'orders@dhwebsiteservices.co.uk',
              subject: orderStatusEmailSubject(order, restaurant),
              html: orderStatusEmail(order, restaurant, customer)
            }))
          }

          if (customer?.phone && env.TWILIO_SID && env.TWILIO_TOKEN) {
            tasks.push(sendSMS(env, {
              to: customer.phone,
              body: orderStatusSms(order, restaurant)
            }))
          }
        }

        await Promise.allSettled(tasks)
        return json({ ok: true }, 200, corsHeaders)
      }

      return new Response('Not found', { status: 404, headers: corsHeaders })
    } catch (err) {
      console.error(err)
      return json({ error: err.message }, 500, corsHeaders)
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  })
}

function buildCorsHeaders(request) {
  const origin = request.headers.get('origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
}

async function sendSMS(env, { to, body }) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: env.TWILIO_PHONE, Body: body })
  })
  if (!res.ok) {
    const err = await res.json()
    console.error('Twilio error:', err)
  }
}

async function sendEmail(env, { to, from, subject, html }) {
  // Uses Cloudflare Email Workers or MailChannels (free with CF Workers)
  // Switch env.EMAIL_PROVIDER to 'mailchannels' or 'resend' as needed
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html })
    })
    if (!res.ok) console.error('Resend error:', await res.text())
    return
  }

  // MailChannels fallback (no API key needed on Cloudflare)
  await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: 'DH Click & Collect' },
      subject,
      content: [{ type: 'text/html', value: html }]
    })
  })
}

async function sendRestaurantLoginEmail(env, { restaurant, email, fullName, role, password, mode = 'welcome' }) {
  if (!email) return false

  await sendEmail(env, {
    to: email,
    from: getPortalFromEmail(env),
    subject: restaurantLoginEmailSubject(restaurant, mode),
    html: restaurantLoginEmail({
      portalUrl: getRestaurantPortalUrl(env),
      restaurant,
      fullName,
      email,
      role,
      password,
      mode,
    }),
  })

  return true
}

function getRestaurantPortalUrl(env) {
  return env.RESTAURANT_PORTAL_URL || 'https://ordermgr.dhwebsiteservices.co.uk'
}

function getPortalFromEmail(env) {
  return env.PORTAL_FROM_EMAIL || 'noreply@dhwebsiteservices.co.uk'
}

async function verifyStripeSignature(payload, header, secret) {
  if (!header) return false
  const parts = header.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=')
    acc[k.trim()] = v
    return acc
  }, {})
  const timestamp = parts.t
  const signatures = Object.entries(parts).filter(([k]) => k.startsWith('v1')).map(([, v]) => v)
  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return signatures.some(s => s === expected)
}

async function getRestaurant(env, restaurantId) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/restaurants`)
  url.searchParams.set('select', 'id,name,slug,email,address,status,is_busy,stripe_account_id,commission_rate,primary_color')
  url.searchParams.set('id', `eq.${restaurantId}`)
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  })

  if (!res.ok) {
    throw new Error(`Failed to load restaurant: ${res.status}`)
  }

  const rows = await res.json()
  return rows[0] || null
}

async function listRestaurantUsers(env, restaurantId) {
  const memberships = await supabaseFetch(`${env.SUPABASE_URL}/rest/v1/restaurant_users?restaurant_id=eq.${restaurantId}&select=id,restaurant_id,user_id,role,created_at&order=created_at.asc`, {
    method: 'GET'
  }, env)

  const rows = await Promise.all((memberships || []).map(async (membership) => {
    const authUser = await getAuthUserById(env, membership.user_id).catch(() => null)
    return {
      ...membership,
      email: authUser?.email || '',
      full_name: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '',
      last_sign_in_at: authUser?.last_sign_in_at || null,
    }
  }))

  return rows
}

async function createRestaurantUser(env, payload = {}) {
  const restaurantId = String(payload.restaurantId || '').trim()
  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '')
  const role = ['manager', 'staff', 'kitchen'].includes(payload.role) ? payload.role : 'manager'
  const fullName = String(payload.fullName || '').trim()
  const sendWelcomeEmail = payload.sendWelcomeEmail !== false

  if (!restaurantId) throw new Error('Missing restaurant ID')
  if (!email) throw new Error('Missing email')
  if (password.length < 10) throw new Error('Password must be at least 10 characters')

  const restaurant = await getRestaurant(env, restaurantId)
  if (!restaurant) throw new Error('Restaurant not found')

  const authUser = await createAuthUser(env, {
    email,
    password,
    fullName,
    role,
    restaurantId,
  })

  const membershipRows = await supabaseFetch(`${env.SUPABASE_URL}/rest/v1/restaurant_users`, {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: restaurantId,
      user_id: authUser.id,
      role,
    })
  }, env)

  const membership = Array.isArray(membershipRows) ? membershipRows[0] : membershipRows
  let emailed = false
  if (sendWelcomeEmail) {
    emailed = await sendRestaurantLoginEmail(env, {
      restaurant,
      email,
      fullName,
      role,
      password,
      mode: 'welcome',
    })
  }
  return {
    ...membership,
    email,
    full_name: fullName,
    generated: true,
    emailed,
  }
}

async function resetRestaurantUserPassword(env, payload = {}) {
  const userId = String(payload.userId || '').trim()
  const password = String(payload.password || '')
  const sendEmail = payload.sendEmail === true
  const restaurantId = String(payload.restaurantId || '').trim()

  if (!userId) throw new Error('Missing user ID')
  if (password.length < 10) throw new Error('Password must be at least 10 characters')

  const authUser = await updateAuthUserPassword(env, userId, password)
  let emailed = false
  if (sendEmail) {
    if (!restaurantId) throw new Error('Missing restaurant ID')
    const restaurant = await getRestaurant(env, restaurantId)
    if (!restaurant) throw new Error('Restaurant not found')
    emailed = await sendRestaurantLoginEmail(env, {
      restaurant,
      email: authUser?.email || '',
      fullName: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '',
      role: authUser?.user_metadata?.role || 'staff',
      password,
      mode: 'reset',
    })
  }
  return {
    user_id: userId,
    email: authUser?.email || '',
    ok: true,
    emailed,
  }
}

async function sendRestaurantWelcomeGuide(env, payload = {}) {
  const restaurantId = String(payload.restaurantId || '').trim()
  const userId = String(payload.userId || '').trim()
  const password = String(payload.password || '')

  if (!restaurantId) throw new Error('Missing restaurant ID')
  if (!userId) throw new Error('Missing user ID')

  const [restaurant, authUser] = await Promise.all([
    getRestaurant(env, restaurantId),
    getAuthUserById(env, userId),
  ])

  if (!restaurant) throw new Error('Restaurant not found')
  if (!authUser?.email) throw new Error('Restaurant user email not found')

  const emailed = await sendRestaurantLoginEmail(env, {
    restaurant,
    email: authUser.email,
    fullName: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '',
    role: authUser?.user_metadata?.role || 'staff',
    password,
    mode: password ? 'reset' : 'guide',
  })

  return {
    user_id: userId,
    email: authUser.email,
    emailed,
  }
}

async function createAuthUser(env, { email, password, fullName, role, restaurantId }) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
        restaurant_id: restaurantId,
      }
    })
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.msg || body.message || body.error_description || 'Could not create restaurant login')
  }

  return body.user || body
}

async function updateAuthUserPassword(env, userId, password) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      password,
    })
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.msg || body.message || body.error_description || 'Could not reset password')
  }

  return body.user || body
}

async function getAuthUserById(env, userId) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    }
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.msg || body.message || body.error_description || 'Could not load auth user')
  }

  return body.user || body
}

async function runAdminQuery(payload, env) {
  const {
    operation,
    table,
    params = {},
    data,
    eq = {},
    fn,
    scope = 'platform',
    impersonationRestaurantId
  } = payload

  if (operation === 'rpc') {
    return runAdminRpc(fn, params, env, scope, impersonationRestaurantId)
  }

  const scoped = applyRestaurantScope({ table, params, data, eq }, scope, impersonationRestaurantId)
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`)

  if (operation === 'select') {
    url.searchParams.set('select', scoped.params.select || '*')
    if (scoped.params.eq) {
      Object.entries(scoped.params.eq).forEach(([k, v]) => {
        url.searchParams.set(k, `eq.${v}`)
      })
    }
    if (scoped.params.filter) {
      Object.entries(scoped.params.filter).forEach(([k, v]) => {
        url.searchParams.set(k, v)
      })
    }
    if (scoped.params.order) url.searchParams.set('order', scoped.params.order)
    if (scoped.params.limit) url.searchParams.set('limit', scoped.params.limit)
    return supabaseFetch(url.toString(), { method: 'GET' }, env)
  }

  if (operation === 'insert') {
    return supabaseFetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      body: JSON.stringify(scoped.data)
    }, env)
  }

  if (operation === 'update') {
    Object.entries(scoped.eq).forEach(([k, v]) => {
      url.searchParams.set(k, `eq.${v}`)
    })
    return supabaseFetch(url.toString(), {
      method: 'PATCH',
      body: JSON.stringify(scoped.data)
    }, env)
  }

  if (operation === 'delete') {
    Object.entries(scoped.eq).forEach(([k, v]) => {
      url.searchParams.set(k, `eq.${v}`)
    })
    return supabaseFetch(url.toString(), { method: 'DELETE' }, env)
  }

  throw new Error(`Unsupported admin operation: ${operation}`)
}

async function runAdminRpc(fn, params, env, scope, impersonationRestaurantId) {
  if (scope === 'restaurant' && impersonationRestaurantId) {
    if (fn === 'generate_order_number') {
      params = { ...params, p_restaurant_id: impersonationRestaurantId }
    }
    if (fn === 'check_slot_capacity') {
      params = { ...params, p_restaurant_id: impersonationRestaurantId }
    }
  }

  return supabaseFetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    body: JSON.stringify(params || {})
  }, env)
}

function applyRestaurantScope(input, scope, impersonationRestaurantId) {
  if (scope !== 'restaurant' || !impersonationRestaurantId) {
    return {
      table: input.table,
      params: input.params || {},
      data: input.data,
      eq: input.eq || {}
    }
  }

  const params = { ...(input.params || {}), eq: { ...((input.params || {}).eq || {}) } }
  const eq = { ...(input.eq || {}) }
  const data = input.data && typeof input.data === 'object' ? { ...input.data } : input.data

  const restaurantTables = new Set([
    'restaurants',
    'restaurant_users',
    'opening_hours',
    'collection_slots',
    'menu_categories',
    'menu_items',
    'orders'
  ])

  if (restaurantTables.has(input.table)) {
    if (input.table === 'restaurants') {
      params.eq.id = impersonationRestaurantId
      if (!eq.id) eq.id = impersonationRestaurantId
      if (data && !data.id) data.id = impersonationRestaurantId
    } else {
      params.eq.restaurant_id = impersonationRestaurantId
      if (!eq.restaurant_id) eq.restaurant_id = impersonationRestaurantId
      if (data && !data.restaurant_id) data.restaurant_id = impersonationRestaurantId
    }
  }

  return { table: input.table, params, data, eq }
}

async function supabaseFetch(url, init, env) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
      ...(init.headers || {})
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Supabase request failed: ${res.status}`)
  }

  if (res.status === 204) return true
  const body = await res.text()
  return body ? JSON.parse(body) : true
}

async function verifyAdminRequest(request, env) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  if (!token) {
    throw new Error('Missing admin token')
  }

  const claims = await verifyMicrosoftJwt(token, env)
  const email = (claims.preferred_username || claims.upn || '').toLowerCase()
  const allowedDomain = (env.ENTRA_ALLOWED_DOMAIN || 'dhwebsiteservices.co.uk').toLowerCase()

  if (!email || !email.endsWith(`@${allowedDomain}`)) {
    throw new Error('Unauthorized admin account')
  }

  return {
    email,
    name: claims.name || email
  }
}

async function verifyMicrosoftJwt(token, env) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Invalid token')
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader))
  const payload = JSON.parse(base64UrlDecode(encodedPayload))
  const issuerPrefix = `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/v2.0`

  if (payload.aud !== env.ENTRA_CLIENT_ID) {
    throw new Error('Invalid token audience')
  }
  if (!payload.iss || !payload.iss.startsWith(issuerPrefix)) {
    throw new Error('Invalid token issuer')
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error('Token expired')
  }

  const keys = await getMicrosoftSigningKeys(env)
  const jwk = keys.find((item) => item.kid === header.kid)
  if (!jwk) {
    throw new Error('Signing key not found')
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg || 'RS256',
      ext: true
    },
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  )

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlToUint8Array(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  )

  if (!verified) {
    throw new Error('Invalid token signature')
  }

  return payload
}

let microsoftKeyCache = null
let microsoftKeyCacheExpiry = 0

async function getMicrosoftSigningKeys(env) {
  if (microsoftKeyCache && Date.now() < microsoftKeyCacheExpiry) {
    return microsoftKeyCache
  }

  const res = await fetch(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/discovery/v2.0/keys`)
  if (!res.ok) {
    throw new Error('Failed to fetch Microsoft signing keys')
  }

  const body = await res.json()
  microsoftKeyCache = body.keys || []
  microsoftKeyCacheExpiry = Date.now() + 60 * 60 * 1000
  return microsoftKeyCache
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return atob(padded)
}

function base64UrlToUint8Array(value) {
  return Uint8Array.from(base64UrlDecode(value), (char) => char.charCodeAt(0))
}

// ── Email templates ───────────────────────────────────────────

function orderConfirmationEmail(order, restaurant, customer) {
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
  const itemRows = items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ece6d8;color:#1f1f1f;font-size:14px;">
        <div style="font-weight:600;">${escapeHtml(item.name)}</div>
        ${item.options && Object.values(item.options).length > 0
          ? `<div style="color:#6f6a5f;font-size:12px;margin-top:4px;">${escapeHtml(Object.values(item.options).join(', '))}</div>`
          : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #ece6d8;color:#6f6a5f;font-size:14px;text-align:center;width:64px;">×${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #ece6d8;color:#1f1f1f;font-size:14px;text-align:right;width:96px;">£${(item.price * item.quantity).toFixed(2)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f5f1e8;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f1f1f;">
    <div style="max-width:640px;margin:32px auto;padding:0 18px;">
      <div style="background:#111111;border-radius:18px 18px 0 0;padding:28px 30px;color:#f7f2e8;">
        <div style="color:${restaurant.primary_color || '#C9A84C'};font-size:13px;font-weight:700;letter-spacing:0.04em;margin-bottom:10px;">DH CLICK & COLLECT</div>
        <div style="font-size:30px;line-height:1.1;font-weight:700;margin-bottom:10px;">Order confirmed</div>
        <div style="color:#d0c8b7;font-size:15px;line-height:1.6;">
          Hi ${escapeHtml(customer.name || 'there')}, your order with ${escapeHtml(restaurant.name)} has been received and confirmed.
        </div>
      </div>

      <div style="background:#ffffff;border:1px solid #e8e1d2;border-top:none;border-radius:0 0 18px 18px;padding:28px 30px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:0 0 16px 0;">
              <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Order number</div>
              <div style="font-size:24px;font-weight:700;color:#1f1f1f;">#${escapeHtml(order.order_number)}</div>
            </td>
            <td style="padding:0 0 16px 0;text-align:right;">
              <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Collect at</div>
              <div style="font-size:24px;font-weight:700;color:#1f1f1f;">${escapeHtml(order.collection_time)}</div>
            </td>
          </tr>
        </table>

        <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Order items</div>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          ${itemRows}
          <tr>
            <td colspan="2" style="padding:14px 0 0 0;color:#1f1f1f;font-size:15px;font-weight:700;">Total paid</td>
            <td style="padding:14px 0 0 0;color:${restaurant.primary_color || '#C9A84C'};font-size:22px;font-weight:700;text-align:right;">£${Number(order.total).toFixed(2)}</td>
          </tr>
        </table>

        ${restaurant.address ? `
          <div style="background:#faf7f0;border:1px solid #ece6d8;border-radius:12px;padding:16px 18px;">
            <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Collection location</div>
            <div style="color:#3a3833;font-size:14px;line-height:1.7;">${escapeHtml(restaurant.address)}</div>
          </div>
        ` : ''}
      </div>
    </div>
  </body>
</html>`
}

function newOrderEmail(order, restaurant) {
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
  const itemRows = items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ece6d8;color:#1f1f1f;font-size:14px;">
        <div style="font-weight:600;">${escapeHtml(item.name)}</div>
        ${item.options && Object.values(item.options).length > 0
          ? `<div style="color:#6f6a5f;font-size:12px;margin-top:4px;">${escapeHtml(Object.values(item.options).join(', '))}</div>`
          : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #ece6d8;color:#6f6a5f;font-size:14px;text-align:center;width:64px;">×${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #ece6d8;color:#1f1f1f;font-size:14px;text-align:right;width:96px;">£${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f5f1e8;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f1f1f;">
    <div style="max-width:640px;margin:32px auto;padding:0 18px;">
      <div style="background:#111111;border-radius:18px 18px 0 0;padding:28px 30px;color:#f7f2e8;">
        <div style="color:${restaurant.primary_color || '#C9A84C'};font-size:13px;font-weight:700;letter-spacing:0.04em;margin-bottom:10px;">DH CLICK & COLLECT</div>
        <div style="font-size:30px;line-height:1.1;font-weight:700;margin-bottom:10px;">New order received</div>
        <div style="color:#d0c8b7;font-size:15px;line-height:1.6;">
          ${escapeHtml(restaurant.name)} has a new click and collect order that needs action.
        </div>
      </div>

      <div style="background:#ffffff;border:1px solid #e8e1d2;border-top:none;border-radius:0 0 18px 18px;padding:28px 30px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:0 0 16px 0;">
              <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Order number</div>
              <div style="font-size:24px;font-weight:700;color:#1f1f1f;">#${escapeHtml(order.order_number)}</div>
            </td>
            <td style="padding:0 0 16px 0;text-align:right;">
              <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Collect at</div>
              <div style="font-size:24px;font-weight:700;color:#1f1f1f;">${escapeHtml(order.collection_time)}</div>
            </td>
          </tr>
        </table>

        <div style="display:block;background:#faf7f0;border:1px solid #ece6d8;border-radius:12px;padding:16px 18px;margin-bottom:18px;">
          <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Customer</div>
          <div style="font-size:16px;font-weight:700;color:#1f1f1f;margin-bottom:4px;">${escapeHtml(order.customer_name)}</div>
          <div style="color:#5f5a50;font-size:14px;line-height:1.6;">
            ${order.customer_phone ? `Phone: ${escapeHtml(order.customer_phone)}<br>` : ''}
            ${order.customer_email ? `Email: ${escapeHtml(order.customer_email)}` : ''}
          </div>
        </div>

        <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Order items</div>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          ${itemRows}
          <tr>
            <td colspan="2" style="padding:14px 0 0 0;color:#1f1f1f;font-size:15px;font-weight:700;">Total</td>
            <td style="padding:14px 0 0 0;color:${restaurant.primary_color || '#C9A84C'};font-size:22px;font-weight:700;text-align:right;">£${Number(order.total).toFixed(2)}</td>
          </tr>
        </table>

        ${order.notes ? `
          <div style="background:#faf7f0;border:1px solid #ece6d8;border-radius:12px;padding:16px 18px;margin-bottom:18px;">
            <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Order notes</div>
            <div style="color:#3a3833;font-size:14px;line-height:1.7;">${escapeHtml(order.notes)}</div>
          </div>
        ` : ''}

        ${restaurant.address ? `
          <div style="background:#faf7f0;border:1px solid #ece6d8;border-radius:12px;padding:16px 18px;">
            <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Collection location</div>
            <div style="color:#3a3833;font-size:14px;line-height:1.7;">${escapeHtml(restaurant.address)}</div>
          </div>
        ` : ''}
      </div>
    </div>
  </body>
</html>`
}

function orderStatusEmailSubject(order, restaurant) {
  if (order.status === 'accepted') return `${restaurant.name} accepted your order #${order.order_number}`
  if (order.status === 'ready') return `${restaurant.name} order #${order.order_number} is ready for collection`
  if (order.status === 'rejected') return `${restaurant.name} could not accept order #${order.order_number}`
  if (order.status === 'collected') return `${restaurant.name} marked order #${order.order_number} as collected`
  return `${restaurant.name} order #${order.order_number} update`
}

function orderStatusSms(order, restaurant) {
  if (order.status === 'accepted') {
    return `Your order #${order.order_number} at ${restaurant.name} has been accepted. Collection time: ${order.collection_time}.`
  }
  if (order.status === 'ready') {
    return `Your order #${order.order_number} at ${restaurant.name} is ready for collection now.`
  }
  if (order.status === 'rejected') {
    return `Your order #${order.order_number} at ${restaurant.name} could not be accepted. Please contact the restaurant.`
  }
  if (order.status === 'collected') {
    return `Order #${order.order_number} at ${restaurant.name} has been marked as collected.`
  }
  return `Your order #${order.order_number} at ${restaurant.name} has been updated.`
}

function orderStatusEmail(order, restaurant, customer) {
  const statusCopy = {
    accepted: {
      title: 'Order accepted',
      message: 'The restaurant has accepted your order and it is now being prepared.',
      accent: '#3b82f6',
    },
    ready: {
      title: 'Ready for collection',
      message: 'Your order is ready. You can now head over and collect it.',
      accent: '#22c55e',
    },
    rejected: {
      title: 'Order update',
      message: 'The restaurant could not accept your order. Please contact them directly if payment or replacement is needed.',
      accent: '#ef4444',
    },
    collected: {
      title: 'Order collected',
      message: 'This order has been marked as collected.',
      accent: '#666666',
    },
  }[order.status] || {
    title: 'Order update',
    message: 'There has been an update to your order.',
    accent: '#C9A84C',
  }

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f5f1e8;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f1f1f;">
    <div style="max-width:640px;margin:32px auto;padding:0 18px;">
      <div style="background:#111111;border-radius:18px 18px 0 0;padding:28px 30px;color:#f7f2e8;">
        <div style="color:${statusCopy.accent};font-size:13px;font-weight:700;letter-spacing:0.04em;margin-bottom:10px;">ORDER STATUS UPDATE</div>
        <div style="font-size:30px;line-height:1.1;font-weight:700;margin-bottom:10px;">${escapeHtml(statusCopy.title)}</div>
        <div style="color:#d0c8b7;font-size:15px;line-height:1.6;">
          Hi ${escapeHtml(customer.name || 'there')}, ${escapeHtml(statusCopy.message)}
        </div>
      </div>

      <div style="background:#ffffff;border:1px solid #e8e1d2;border-top:none;border-radius:0 0 18px 18px;padding:28px 30px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:0 0 16px 0;">
              <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Order number</div>
              <div style="font-size:24px;font-weight:700;color:#1f1f1f;">#${escapeHtml(order.order_number)}</div>
            </td>
            <td style="padding:0 0 16px 0;text-align:right;">
              <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Collection time</div>
              <div style="font-size:24px;font-weight:700;color:#1f1f1f;">${escapeHtml(order.collection_time || 'TBC')}</div>
            </td>
          </tr>
        </table>

        <div style="background:#faf7f0;border:1px solid #ece6d8;border-radius:12px;padding:16px 18px;margin-bottom:18px;">
          <div style="color:#7a7367;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Restaurant</div>
          <div style="font-size:16px;font-weight:700;color:#1f1f1f;margin-bottom:4px;">${escapeHtml(restaurant.name)}</div>
          <div style="color:#5f5a50;font-size:14px;line-height:1.7;">
            ${restaurant.address ? escapeHtml(restaurant.address) : 'Collection location available in the portal.'}
          </div>
        </div>

        <div style="border-left:4px solid ${statusCopy.accent};padding:4px 0 4px 14px;color:#3a3833;font-size:14px;line-height:1.7;">
          Status: <strong>${escapeHtml(statusCopy.title)}</strong>
        </div>
      </div>
    </div>
  </body>
</html>`
}

function restaurantLoginEmailSubject(restaurant, mode) {
  const restaurantName = restaurant?.name || 'Your restaurant'
  if (mode === 'reset') return `${restaurantName}: your DH Click & Collect login has been updated`
  if (mode === 'guide') return `${restaurantName}: DH Click & Collect portal guide`
  return `${restaurantName}: your DH Click & Collect portal access`
}

function restaurantLoginEmail({ portalUrl, restaurant, fullName, email, role, password, mode }) {
  const roleLabel = {
    manager: 'Manager access',
    staff: 'Staff access',
    kitchen: 'Kitchen access',
  }[role] || 'Portal access'

  const intro = mode === 'reset'
    ? 'Your restaurant portal password has been updated.'
    : mode === 'guide'
      ? 'Here is your restaurant portal guide and login reference.'
      : 'Your restaurant portal account is ready.'

  const passwordBlock = password
    ? `<div style="margin-top:16px;padding:14px 16px;background:#0f0f0f;border:1px solid #262626;border-radius:10px;">
         <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Temporary password</div>
         <div style="color:#fff;font-size:18px;font-weight:600;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(password)}</div>
       </div>`
    : ''

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background:#f4f1e8;font-family:Inter,Arial,sans-serif;color:#1d1d1d;">
    <div style="max-width:640px;margin:32px auto;padding:0 18px;">
      <div style="background:#111111;color:#f5efe0;border-radius:18px;padding:28px 30px;">
        <div style="color:#d7b24e;font-size:14px;font-weight:600;margin-bottom:12px;">DH Click & Collect</div>
        <div style="font-size:30px;line-height:1.1;font-weight:700;margin-bottom:10px;">${escapeHtml(restaurant.name)} portal access</div>
        <div style="color:#c6c0b1;font-size:15px;line-height:1.6;">${intro}</div>
      </div>

      <div style="background:#ffffff;border:1px solid #e6dfcf;border-radius:18px;padding:28px 30px;margin-top:16px;">
        <div style="font-size:16px;font-weight:600;margin-bottom:10px;">Hello ${escapeHtml(fullName || restaurant.name)},</div>
        <div style="color:#4b4b4b;font-size:15px;line-height:1.7;margin-bottom:18px;">
          You can use the restaurant portal to view orders, manage day-to-day operations, and access the screens available to your role.
        </div>

        <div style="display:grid;gap:14px;">
          <div style="padding:14px 16px;background:#faf7f0;border:1px solid #ece5d6;border-radius:10px;">
            <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Portal URL</div>
            <div style="font-size:15px;font-weight:600;"><a href="${portalUrl}" style="color:#1d1d1d;text-decoration:none;">${portalUrl}</a></div>
          </div>
          <div style="padding:14px 16px;background:#faf7f0;border:1px solid #ece5d6;border-radius:10px;">
            <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Username</div>
            <div style="font-size:15px;font-weight:600;">${escapeHtml(email)}</div>
          </div>
          <div style="padding:14px 16px;background:#faf7f0;border:1px solid #ece5d6;border-radius:10px;">
            <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Access level</div>
            <div style="font-size:15px;font-weight:600;">${escapeHtml(roleLabel)}</div>
          </div>
        </div>

        ${passwordBlock}

        <div style="margin-top:22px;padding:18px;background:#faf7f0;border:1px solid #ece5d6;border-radius:12px;">
          <div style="font-size:14px;font-weight:700;margin-bottom:8px;">First setup</div>
          <ol style="margin:0;padding-left:18px;color:#4b4b4b;font-size:14px;line-height:1.7;">
            <li>Open the portal using the link above.</li>
            <li>Sign in with your username${password ? ' and temporary password' : ''}.</li>
            <li>${mode === 'guide' ? 'Confirm you can access the correct workspace for your role.' : 'Change your password after your first successful login if your manager requires it.'}</li>
            <li>Managers can review orders and reporting. Kitchen users should stay in the kitchen screen.</li>
          </ol>
        </div>

        <div style="margin-top:20px;">
          <a href="${portalUrl}" style="display:inline-block;background:#d7b24e;color:#111111;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px;">Open portal</a>
        </div>

        <div style="margin-top:22px;color:#6a6a6a;font-size:13px;line-height:1.6;">
          If you have any issue signing in, contact DH Website Services and we can reset your access.
        </div>
      </div>
    </div>
  </body>
</html>`
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
