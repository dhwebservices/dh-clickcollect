// worker.js
// Cloudflare Worker — handles:
//   POST /create-payment-intent  → Stripe Connect payment intent
//   POST /webhook               → Stripe webhook (flip payment_status to paid)
//   POST /notify                → SMS via Twilio + email confirmation

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    try {
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

        await Promise.allSettled(tasks)
        return json({ ok: true }, 200, corsHeaders)
      }

      return new Response('Not found', { status: 404 })
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
  url.searchParams.set('select', 'id,status,is_busy,stripe_account_id,commission_rate')
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

// ── Email templates ───────────────────────────────────────────

function orderConfirmationEmail(order, restaurant, customer) {
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
  const itemRows = items.map(i => `
    <tr>
      <td style="padding:8px 0;color:#ccc;font-size:14px;">×${i.quantity} ${i.name}</td>
      <td style="padding:8px 0;color:#888;font-size:14px;text-align:right;">£${(i.price * i.quantity).toFixed(2)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:0 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:24px;font-weight:600;color:${restaurant.primary_color || '#C9A84C'};margin-bottom:4px;">${restaurant.name}</div>
      <div style="color:#555;font-size:13px;">Order Confirmation</div>
    </div>
    <div style="background:#141414;border:1px solid #222;border-radius:12px;padding:28px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;background:${restaurant.primary_color || '#C9A84C'}20;border:2px solid ${restaurant.primary_color || '#C9A84C'}60;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
          <div style="font-size:24px;">✅</div>
        </div>
        <div style="color:#fff;font-size:20px;font-weight:600;margin-bottom:4px;">Order confirmed!</div>
        <div style="color:#666;font-size:14px;">Hi ${customer.name}, your order is in.</div>
      </div>
      <div style="background:#0f0f0f;border-radius:8px;padding:16px;margin-bottom:20px;display:flex;justify-content:space-between;">
        <div>
          <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Order number</div>
          <div style="color:${restaurant.primary_color || '#C9A84C'};font-size:20px;font-weight:700;font-family:monospace;">#${order.order_number}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Collection time</div>
          <div style="color:#fff;font-size:18px;font-weight:600;">${order.collection_time}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${itemRows}
        <tr style="border-top:1px solid #1e1e1e;">
          <td style="padding:12px 0;color:#fff;font-weight:600;">Total paid</td>
          <td style="padding:12px 0;color:${restaurant.primary_color || '#C9A84C'};font-size:18px;font-weight:600;text-align:right;">£${Number(order.total).toFixed(2)}</td>
        </tr>
      </table>
      ${restaurant.address ? `<div style="margin-top:20px;padding:12px;background:#0f0f0f;border-radius:8px;color:#888;font-size:13px;">📍 ${restaurant.address}</div>` : ''}
    </div>
    <div style="text-align:center;margin-top:24px;color:#444;font-size:12px;">
      Powered by <a href="https://dhwebsiteservices.co.uk" style="color:#555;">DH Website Services</a>
    </div>
  </div>
</body></html>`
}

function newOrderEmail(order, restaurant) {
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]')
  const itemList = items.map(i => `×${i.quantity} ${i.name}`).join('<br>')
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:0 20px;">
    <div style="background:#141414;border:1px solid #f59e0b40;border-radius:12px;padding:24px;">
      <div style="color:#f59e0b;font-size:18px;font-weight:600;margin-bottom:16px;">🔔 New order — #${order.order_number}</div>
      <div style="color:#ccc;font-size:15px;margin-bottom:8px;"><strong style="color:#fff">${order.customer_name}</strong> — collect at <strong style="color:#fff">${order.collection_time}</strong></div>
      <div style="color:#aaa;font-size:14px;margin-bottom:16px;line-height:1.8;">${itemList}</div>
      <div style="color:#C9A84C;font-size:18px;font-weight:600;">Total: £${Number(order.total).toFixed(2)}</div>
      ${order.notes ? `<div style="margin-top:12px;padding:10px;background:#1a1a1a;border-radius:6px;color:#888;font-size:13px;">Note: ${order.notes}</div>` : ''}
    </div>
  </div>
</body></html>`
}
