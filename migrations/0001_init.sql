-- Eroka.cz on Cloudflare D1 (26. 10. 2026). Data come from the WordPress export (scripts/migrate-from-wp.py),
-- offers are refreshed daily by the import Worker (workers/import). IDs and slugs are kept from WordPress.

-- Root slug resolver: every /<slug>/ in the site root (products, categories, posts, pages, blog categories) in one lookup.
-- Precedence on a collision is decided by the migration (WordPress let the product win, e.g. /pouta-na-ruce/).
CREATE TABLE slugs (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('product','category','post','page','postcat')),
  ref_id INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'publish',
  short_html TEXT NOT NULL DEFAULT '',
  desc_html TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  ean TEXT NOT NULL DEFAULT '',
  primary_cat INTEGER NOT NULL DEFAULT 0,
  brand_id INTEGER NOT NULL DEFAULT 0,          -- first non-"ostatní" brand (display, schema)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  total_sales INTEGER NOT NULL DEFAULT 0,       -- WooCommerce popularity (homepage bestsellers)
  noindex INTEGER NOT NULL DEFAULT 0,           -- eroka-prune-data.php (thin products)
  seo_title TEXT NOT NULL DEFAULT '',           -- Rank Math per-object override (empty = template)
  seo_desc TEXT NOT NULL DEFAULT '',
  -- denormalised from active offers (recomputed by the importer)
  min_price REAL NOT NULL DEFAULT 0,
  max_price REAL NOT NULL DEFAULT 0,
  offer_count INTEGER NOT NULL DEFAULT 0,
  shop_count INTEGER NOT NULL DEFAULT 0,
  best_offer_id INTEGER NOT NULL DEFAULT 0,
  best_domain TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX idx_products_ean ON products(ean) WHERE ean <> '';
CREATE INDEX idx_products_sales ON products(status, total_sales DESC);
CREATE INDEX idx_products_created ON products(status, created_at DESC);

-- Category membership flattened to every ancestor (WooCommerce archives include child categories),
-- with the default sort key inside, so a listing page is one index range scan.
CREATE TABLE cat_products (
  cat_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  direct INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cat_id, created_at, product_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_cat_products_product ON cat_products(product_id);

CREATE TABLE brand_products (
  brand_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  PRIMARY KEY (brand_id, created_at, product_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_brand_products_product ON brand_products(product_id);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent INTEGER NOT NULL DEFAULT 0,
  description_html TEXT NOT NULL DEFAULT '',
  second_html TEXT NOT NULL DEFAULT '',          -- Rehub "brand_second_description" (SEO text under the grid)
  menu_order INTEGER NOT NULL DEFAULT 0,
  count_direct INTEGER NOT NULL DEFAULT 0,
  count_total INTEGER NOT NULL DEFAULT 0,
  noindex INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_desc TEXT NOT NULL DEFAULT '',
  seo_robots TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX idx_categories_parent ON categories(parent);

CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description_html TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  noindex INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE offers (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  feed TEXT NOT NULL,                  -- Content Egg module id: Feed__6, CjProducts …
  unique_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  price_old REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CZK',
  target_url TEXT NOT NULL,            -- final affiliate URL (tracking already applied), returned byte for byte by /go/
  orig_url TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,    -- 1 in stock, 0 unknown, -1 out of stock
  ean TEXT NOT NULL DEFAULT '',
  img TEXT NOT NULL DEFAULT '',
  go_slug TEXT,                        -- legacy /go/<slug>/ of Content Egg (kept so old links work)
  updated_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX idx_offers_product ON offers(product_id, active, price);
CREATE UNIQUE INDEX idx_offers_key ON offers(feed, unique_id, product_id);
CREATE UNIQUE INDEX idx_offers_go ON offers(go_slug) WHERE go_slug IS NOT NULL;

-- legacy /go/ slugs whose offer no longer exists → product page
CREATE TABLE go_legacy (
  slug TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE price_history (
  product_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  min_price REAL NOT NULL,
  PRIMARY KEY (product_id, day)
) STRICT, WITHOUT ROWID;

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('post','page')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  cat_id INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  image_card TEXT NOT NULL DEFAULT '',          -- WordPress medium_large (≈768 px) variant for cards
  image_alt TEXT NOT NULL DEFAULT '',
  image_w INTEGER NOT NULL DEFAULT 0,
  image_h INTEGER NOT NULL DEFAULT 0,
  author TEXT NOT NULL DEFAULT '',
  noindex INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_desc TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'publish',
  UNIQUE (type, slug)
) STRICT;
CREATE INDEX idx_posts_type_date ON posts(type, status, published_at DESC);

CREATE TABLE post_categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_html TEXT NOT NULL
) STRICT;
CREATE INDEX idx_comments_post ON comments(post_id);

CREATE TABLE redirects (
  from_path TEXT PRIMARY KEY,
  to_path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 301
) STRICT, WITHOUT ROWID;

CREATE TABLE clicks (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'go',
  ip_hash TEXT NOT NULL DEFAULT '',
  clicked_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_clicks_time ON clicks(clicked_at);

-- precomputed blocks (menu, homepage, sitemaps, facets) and data_version (part of every edge-cache key)
CREATE TABLE site_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- product search (name + brand)
CREATE VIRTUAL TABLE product_fts USING fts5(name, brand, content='', tokenize = 'unicode61 remove_diacritics 2');
