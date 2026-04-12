-- =============================================================
-- DH Click & Collect — Full Database Schema
-- Run this in Supabase SQL Editor (Project > SQL Editor)
-- =============================================================

-- ── Restaurants ──────────────────────────────────────────────
CREATE TABLE restaurants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  logo_url          TEXT,
  primary_color     TEXT DEFAULT '#C9A84C',
  phone             TEXT,
  address           TEXT,
  email             TEXT,
  status            TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','pending')),
  stripe_account_id TEXT,
  commission_rate   NUMERIC DEFAULT 0.5,
  plan              TEXT DEFAULT 'basic' CHECK (plan IN ('basic','pro','premium')),
  is_busy           BOOLEAN DEFAULT false,
  busy_until        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Platform Admins ───────────────────────────────────────────
CREATE TABLE platform_admins (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  can_impersonate BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Restaurant Users (staff) ──────────────────────────────────
CREATE TABLE restaurant_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT DEFAULT 'manager' CHECK (role IN ('manager','staff','kitchen')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, user_id)
);

-- ── Opening Hours ─────────────────────────────────────────────
CREATE TABLE opening_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  day           INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6), -- 0=Sun
  open_time     TIME,
  close_time    TIME,
  is_closed     BOOLEAN DEFAULT false
);

-- ── Collection Slots ──────────────────────────────────────────
CREATE TABLE collection_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  slot_time     TEXT NOT NULL,
  max_orders    INTEGER DEFAULT 5,
  is_active     BOOLEAN DEFAULT true
);

-- ── Menu Categories ───────────────────────────────────────────
CREATE TABLE menu_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true
);

-- ── Menu Items ────────────────────────────────────────────────
CREATE TABLE menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL,
  image_url     TEXT,
  is_available  BOOLEAN DEFAULT true,
  allergens     TEXT[] DEFAULT '{}',
  sort_order    INTEGER DEFAULT 0
);

-- ── Item Options ──────────────────────────────────────────────
CREATE TABLE item_options (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id  UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  choices  JSONB NOT NULL, -- [{ label: "Regular", price_modifier: 0 }, ...]
  required BOOLEAN DEFAULT false
);

-- ── Orders ────────────────────────────────────────────────────
CREATE TABLE orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id            UUID REFERENCES restaurants(id),
  order_number             TEXT NOT NULL,
  customer_name            TEXT NOT NULL,
  customer_email           TEXT,
  customer_phone           TEXT,
  items                    JSONB NOT NULL,
  subtotal                 NUMERIC(10,2) NOT NULL,
  commission_amount        NUMERIC(10,2),
  total                    NUMERIC(10,2) NOT NULL,
  collection_time          TEXT NOT NULL,
  collection_date          DATE NOT NULL,
  status                   TEXT DEFAULT 'pending'
                             CHECK (status IN ('pending','accepted','rejected','ready','collected')),
  payment_method           TEXT DEFAULT 'online' CHECK (payment_method IN ('online','pay_on_collection')),
  payment_status           TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  stripe_payment_intent_id TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_orders_payment_intent_unique
ON orders(stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

-- ── Slot capacity check function ──────────────────────────────
-- Prevents overbooking — call from frontend before creating order
CREATE OR REPLACE FUNCTION check_slot_capacity(
  p_restaurant_id UUID,
  p_collection_date DATE,
  p_collection_time TEXT
) RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM orders
  WHERE restaurant_id = p_restaurant_id
    AND collection_date = p_collection_date
    AND collection_time = p_collection_time
    AND status NOT IN ('rejected');
$$ LANGUAGE sql STABLE;

-- ── Order number sequence function ───────────────────────────
CREATE OR REPLACE FUNCTION generate_order_number(p_restaurant_id UUID)
RETURNS TEXT AS $$
DECLARE
  today_count INTEGER;
  prefix TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO today_count
  FROM orders
  WHERE restaurant_id = p_restaurant_id
    AND DATE(created_at) = CURRENT_DATE;

  SELECT UPPER(SUBSTRING(slug, 1, 3)) INTO prefix
  FROM restaurants WHERE id = p_restaurant_id;

  RETURN prefix || '-' || TO_CHAR(CURRENT_DATE, 'DDMM') || '-' || LPAD(today_count::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE restaurants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins   ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_hours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_options      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a platform admin?
CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    EXISTS(
      SELECT 1
      FROM platform_admins
      WHERE user_id = auth.uid()
    ),
    false
  );
$$ LANGUAGE sql STABLE;

-- Helper: get restaurant_ids for current user
CREATE OR REPLACE FUNCTION my_restaurant_ids() RETURNS SETOF UUID AS $$
  SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── restaurants ───────────────────────────────────────────────
CREATE POLICY "admin_all_restaurants_select" ON restaurants
  FOR SELECT USING (is_platform_admin());

CREATE POLICY "admin_all_restaurants_insert" ON restaurants
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY "admin_all_restaurants_update" ON restaurants
  FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "admin_all_restaurants_delete" ON restaurants
  FOR DELETE USING (is_platform_admin());

CREATE POLICY "staff_own_restaurant" ON restaurants
  FOR SELECT USING (id IN (SELECT my_restaurant_ids()));

CREATE POLICY "staff_update_own_restaurant" ON restaurants
  FOR UPDATE USING (id IN (SELECT my_restaurant_ids()))
  WITH CHECK (id IN (SELECT my_restaurant_ids()));

-- Public read for ordering page (slug-based lookup)
CREATE POLICY "public_active_restaurants" ON restaurants
  FOR SELECT USING (status = 'active');

-- ── restaurant_users ──────────────────────────────────────────
CREATE POLICY "admin_all_platform_admins" ON platform_admins
  FOR SELECT USING (is_platform_admin() OR user_id = auth.uid());

CREATE POLICY "admin_insert_platform_admins" ON platform_admins
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY "admin_update_platform_admins" ON platform_admins
  FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "admin_delete_platform_admins" ON platform_admins
  FOR DELETE USING (is_platform_admin());

CREATE POLICY "admin_all_users" ON restaurant_users
  FOR SELECT USING (is_platform_admin());

CREATE POLICY "admin_insert_users" ON restaurant_users
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY "admin_update_users" ON restaurant_users
  FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "admin_delete_users" ON restaurant_users
  FOR DELETE USING (is_platform_admin());

CREATE POLICY "staff_own_membership" ON restaurant_users
  FOR SELECT USING (user_id = auth.uid());

-- ── opening_hours, collection_slots ──────────────────────────
CREATE POLICY "admin_all_hours" ON opening_hours FOR SELECT USING (is_platform_admin());
CREATE POLICY "admin_insert_hours" ON opening_hours FOR INSERT WITH CHECK (is_platform_admin());
CREATE POLICY "admin_update_hours" ON opening_hours FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "admin_delete_hours" ON opening_hours FOR DELETE USING (is_platform_admin());
CREATE POLICY "staff_own_hours" ON opening_hours
  FOR SELECT USING (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "staff_manage_hours" ON opening_hours
  FOR ALL USING (restaurant_id IN (SELECT my_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "public_hours" ON opening_hours FOR SELECT USING (
  restaurant_id IN (SELECT id FROM restaurants WHERE status = 'active')
);

CREATE POLICY "admin_all_slots" ON collection_slots FOR SELECT USING (is_platform_admin());
CREATE POLICY "admin_insert_slots" ON collection_slots FOR INSERT WITH CHECK (is_platform_admin());
CREATE POLICY "admin_update_slots" ON collection_slots FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "admin_delete_slots" ON collection_slots FOR DELETE USING (is_platform_admin());
CREATE POLICY "staff_own_slots" ON collection_slots
  FOR SELECT USING (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "staff_manage_slots" ON collection_slots
  FOR ALL USING (restaurant_id IN (SELECT my_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "public_slots" ON collection_slots FOR SELECT USING (
  restaurant_id IN (SELECT id FROM restaurants WHERE status = 'active')
);

-- ── menu_categories ───────────────────────────────────────────
CREATE POLICY "admin_all_categories" ON menu_categories FOR SELECT USING (is_platform_admin());
CREATE POLICY "admin_insert_categories" ON menu_categories FOR INSERT WITH CHECK (is_platform_admin());
CREATE POLICY "admin_update_categories" ON menu_categories FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "admin_delete_categories" ON menu_categories FOR DELETE USING (is_platform_admin());
CREATE POLICY "staff_own_categories" ON menu_categories
  FOR SELECT USING (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "staff_manage_categories" ON menu_categories
  FOR ALL USING (restaurant_id IN (SELECT my_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "public_categories" ON menu_categories FOR SELECT USING (is_active = true);

-- ── menu_items ────────────────────────────────────────────────
CREATE POLICY "admin_all_items" ON menu_items FOR SELECT USING (is_platform_admin());
CREATE POLICY "admin_insert_items" ON menu_items FOR INSERT WITH CHECK (is_platform_admin());
CREATE POLICY "admin_update_items" ON menu_items FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "admin_delete_items" ON menu_items FOR DELETE USING (is_platform_admin());
CREATE POLICY "staff_own_items" ON menu_items
  FOR SELECT USING (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "staff_manage_items" ON menu_items
  FOR ALL USING (restaurant_id IN (SELECT my_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT my_restaurant_ids()));
CREATE POLICY "public_items" ON menu_items FOR SELECT USING (is_available = true);

-- ── item_options ──────────────────────────────────────────────
CREATE POLICY "admin_all_options" ON item_options FOR SELECT USING (is_platform_admin());
CREATE POLICY "admin_insert_options" ON item_options FOR INSERT WITH CHECK (is_platform_admin());
CREATE POLICY "admin_update_options" ON item_options FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "admin_delete_options" ON item_options FOR DELETE USING (is_platform_admin());
CREATE POLICY "staff_own_options" ON item_options
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM menu_items WHERE restaurant_id IN (SELECT my_restaurant_ids())
    )
  );
CREATE POLICY "staff_manage_options" ON item_options
  FOR ALL USING (
    item_id IN (
      SELECT id FROM menu_items WHERE restaurant_id IN (SELECT my_restaurant_ids())
    )
  )
  WITH CHECK (
    item_id IN (
      SELECT id FROM menu_items WHERE restaurant_id IN (SELECT my_restaurant_ids())
    )
  );
CREATE POLICY "public_options" ON item_options FOR SELECT USING (
  item_id IN (
    SELECT id FROM menu_items WHERE restaurant_id IN (
      SELECT id FROM restaurants WHERE status = 'active'
    )
  )
);

-- ── orders ────────────────────────────────────────────────────
CREATE POLICY "admin_all_orders" ON orders FOR SELECT USING (is_platform_admin());
CREATE POLICY "admin_insert_orders" ON orders FOR INSERT WITH CHECK (is_platform_admin());
CREATE POLICY "admin_update_orders" ON orders FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "admin_delete_orders" ON orders FOR DELETE USING (is_platform_admin());
CREATE POLICY "staff_own_orders" ON orders
  FOR SELECT USING (restaurant_id IN (SELECT my_restaurant_ids()));

CREATE POLICY "staff_update_orders" ON orders
  FOR UPDATE USING (restaurant_id IN (SELECT my_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT my_restaurant_ids()));

-- Customers can insert their own orders (anon or authenticated)
CREATE POLICY "customer_insert_order" ON orders
  FOR INSERT WITH CHECK (
    restaurant_id IN (SELECT id FROM restaurants WHERE status = 'active')
  );

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX idx_orders_restaurant_date ON orders(restaurant_id, collection_date);
CREATE INDEX idx_orders_status ON orders(restaurant_id, status);
CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id, category_id);
CREATE INDEX idx_restaurant_users_user ON restaurant_users(user_id);
