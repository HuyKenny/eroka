// XML item (Google Merchant <item> or Heureka <SHOPITEM>, namespaces already stripped) → normalised offer.
import type { XmlNode } from './xml/stream';
import { affiliateUrl, type FeedDef } from './feeds';

export interface Item {
  uid: string; title: string; url: string; orig: string; price: number; priceOld: number; stock: number; ean: string; img: string;
}

const child = (n: XmlNode, ...names: string[]) => {
  for (const name of names) {
    const c = n.children.find((x) => x.name === name);
    if (c && c.text.trim() !== '') return c.text.trim();
  }
  return '';
};
export const num = (v: string) => {
  const m = /-?\d[\d\s ]*(?:[.,]\d+)?/.exec(v);
  return m ? Number(m[0].replace(/[\s ]/g, '').replace(',', '.')) || 0 : 0;
};
export const normEan = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length >= 8 && d.length <= 14 ? d.replace(/^0+(?=\d{12,13}$)/, '') : '';
};

export function parseItem(f: FeedDef, n: XmlNode): Item | null {
  let uid: string, title: string, link: string, img: string, ean: string, price: number, priceOld = 0, stock = 0;
  if (f.format === 'google') {
    uid = child(n, 'id');
    title = child(n, 'title');
    link = child(n, 'link');
    img = child(n, 'image_link');
    ean = normEan(child(n, 'gtin', 'ean'));
    const p = num(child(n, 'price'));
    const s = num(child(n, 'sale_price'));
    price = s > 0 && s < p ? s : p;
    if (s > 0 && s < p) priceOld = p;
    const a = child(n, 'availability').toLowerCase().replace(/_/g, ' ');
    stock = a === 'in stock' ? 1 : a === 'out of stock' ? -1 : 0;
  } else {
    uid = child(n, 'ITEM_ID');
    title = child(n, 'PRODUCTNAME', 'PRODUCT');
    link = child(n, 'URL');
    img = child(n, 'IMGURL');
    ean = normEan(child(n, 'EAN'));
    price = num(child(n, 'PRICE_VAT'));
    const d = child(n, 'DELIVERY_DATE');
    stock = d === '0' ? 1 : d === '' ? 0 : /^\d+$/.test(d) ? 0 : -1;
  }
  if (!uid || !link || !(price > 0)) return null;
  if (!/^https?:\/\//i.test(link)) return null;
  return { uid, title, url: affiliateUrl(f, link), orig: link.replace(/&amp;/g, '&'), price, priceOld, stock, ean, img: /^https?:\/\//i.test(img) ? img : '' };
}

/** FNV-1a over the fields that are shown/used (price, stock, link, title, image). */
export function itemHash(i: Item): string {
  const s = `${i.price}|${i.priceOld}|${i.stock}|${i.url}|${i.title}|${i.img}`;
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
