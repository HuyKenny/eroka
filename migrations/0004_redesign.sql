-- Redesign "price comparison" (27. 10. 2026): data for filters, offer table and the new homepage blocks.
-- Kept small on purpose (Kenny: save space) — no images are stored, only feed URLs.

-- per offer: shipping price from the feed (Heureka DELIVERY_PRICE / Google shipping), NULL = unknown;
-- extra = compact JSON {"p":{canonical param: [values]}, "i":[up to 3 extra image URLs]} from the feed
ALTER TABLE offers ADD COLUMN delivery_price REAL;
ALTER TABLE offers ADD COLUMN extra TEXT NOT NULL DEFAULT '';

-- per product, recomputed by the importer from active offers
ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '';        -- JSON list of up to 4 gallery URLs (besides image)
ALTER TABLE products ADD COLUMN disc_pct INTEGER NOT NULL DEFAULT 0;    -- discount of the best offer vs its old price
ALTER TABLE products ADD COLUMN in_stock INTEGER NOT NULL DEFAULT 0;    -- any active offer not out of stock
ALTER TABLE products ADD COLUMN pop INTEGER NOT NULL DEFAULT 0;         -- popularity: legacy sales + shops + clicks (nightly)

-- listing sort keys copied into the flattened membership, so every sort is an index range scan
ALTER TABLE cat_products ADD COLUMN min_price REAL NOT NULL DEFAULT 0;
ALTER TABLE cat_products ADD COLUMN pop INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cat_products ADD COLUMN disc INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_cp_price ON cat_products(cat_id, min_price);
CREATE INDEX idx_cp_pop ON cat_products(cat_id, pop DESC);
CREATE INDEX idx_cp_disc ON cat_products(cat_id, disc DESC);

-- canonical product parameters merged from all shops (filters + spec table); only ~8 keys, see workers/import/src/params.ts
CREATE TABLE product_params (
  product_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (product_id, key, value)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_pp_kv ON product_params(key, value, product_id);
