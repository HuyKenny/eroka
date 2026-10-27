-- Catalogue growth from the feeds (27. 10. 2026, scripts/katalog-novinky.py). New products are created by the Pi script;
-- the importer attaches offers to them through these keys: every variant of a product group in every shop
-- ("uid:Feed__<n>:<item id>") and every EAN of the group ("ean:<ean>"), so sizes/colours never become new products.
CREATE TABLE product_keys (
  key TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_product_keys_product ON product_keys(product_id);

-- where a product came from: '' = WordPress catalogue, 'feed:<n>' = created from that feed (overview, rollback)
ALTER TABLE products ADD COLUMN source TEXT NOT NULL DEFAULT '';
