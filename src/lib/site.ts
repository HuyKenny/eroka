// Site-wide constants and the Rank Math JSON-LD base graph (Organization/WebSite/Place), copied 1:1 from the
// WordPress output so the structured data Google knows does not change with the platform.
export const BASE = 'https://eroka.cz';
export const SITE_NAME = 'Eroka';
export const GA4_ID = 'G-MMYYZLD63Y';
export const ASSETS = '/wp-content/themes/eroka-child/assets/';
export const LOGO_URL = BASE + '/wp-content/uploads/2026/02/Eroka_logo-e1770493799374.png';
/** Rank Math default OG image (used where the page has no own image). */
export const OG_DEFAULT = BASE + '/wp-content/uploads/2026/02/pexels-foundertips-5219021-1024x683.jpg';
export const OG_HOME = BASE + ASSETS + 'obrazky/og-eroka.jpg';
export const PER_PAGE = 24;
export const POSTS_PER_PAGE = 10;

const ADDRESS = { '@type': 'PostalAddress', streetAddress: 'Bartáková 36', addressLocality: 'Krč', addressRegion: 'Praha', postalCode: '140000' };

export function orgGraph(adultOnly = false, searchAction = false): unknown[] {
  return [
    { '@type': 'Place', '@id': BASE + '/#place', address: ADDRESS },
    {
      '@type': adultOnly ? 'AdultEntertainment' : ['AdultEntertainment', 'Organization'],
      '@id': BASE + '/#organization',
      name: SITE_NAME,
      url: BASE,
      email: 'info@eroka.cz',
      address: ADDRESS,
      logo: { '@type': 'ImageObject', '@id': BASE + '/#logo', url: LOGO_URL, contentUrl: LOGO_URL, caption: SITE_NAME, inLanguage: 'cs', width: '574', height: '176' },
      priceRange: '$',
      openingHours: ['Mo,Tu,We,Th,Fr,Sa,Su 09:00-17:00'],
      description: 'Hledání potěšení by měla být radost, ne starost. Eroka.cz pro vás denně srovnává tisíce hraček z ověřených českých e-shopů. Hlídáme pro vás nejlepší ceny, slevy a novinky na jednom místě. Nakupujte chytře, diskrétně a s úsměvem.',
      vatID: '07876823',
      location: { '@id': BASE + '/#place' },
      image: { '@id': BASE + '/#logo' },
      telephone: '+420608454771',
    },
    {
      '@type': 'WebSite', '@id': BASE + '/#website', url: BASE, name: SITE_NAME, publisher: { '@id': BASE + '/#organization' }, inLanguage: 'cs',
      ...(searchAction ? { potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: BASE + '/?s={search_term_string}' }, 'query-input': 'required name=search_term_string' } } : {}),
    },
  ];
}

/** Rank Math dates are local (Europe/Prague) with offset; D1 keeps WordPress' local "Y-m-dTH:i:s". */
export function isoPrague(local: string): string {
  const s = String(local || '').replace(' ', 'T').slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return '';
  const d = new Date(s + 'Z');
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', timeZoneName: 'shortOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = /GMT([+-])(\d{1,2})/.exec(name);
  const off = m ? `${m[1]}${m[2]!.padStart(2, '0')}:00` : '+01:00';
  return s + off;
}
