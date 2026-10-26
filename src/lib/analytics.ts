// GA4 with Consent Mode v2 (default denied, granted from localStorage). Same event names as the WordPress site:
// affiliate_click (offers via /go/ or direct shop links), partner_click (Sbalit.cz module). Banner styles live in astro.css.
const KEY = 'eroka_consent';
export function ga4Head(id: string, pageType: string): string {
  if (!/^G-[A-Z0-9]{6,}$/i.test(id)) return '';
  const src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  return `<script id="eroka-ga4-consent">
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
(function(){var g='denied';try{if(localStorage.getItem('${KEY}')==='1'){g='granted';}}catch(e){}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:g,functionality_storage:'granted',security_storage:'granted',wait_for_update:500});})();
gtag('js',new Date());
gtag('config','${id}',{page_type:'${pageType}'});
</script>
<script id="eroka-ga4">
(function(){var d=0;function go(){if(d)return;d=1;var s=document.createElement('script');s.async=true;s.src=${JSON.stringify(src)};document.head.appendChild(s);}
['pointerdown','keydown','scroll','touchstart'].forEach(function(e){addEventListener(e,go,{once:true,passive:true});});
addEventListener('load',function(){if('requestIdleCallback' in window){requestIdleCallback(go,{timeout:3000});}else{setTimeout(go,2000);}});})();
</script>`;
}
export function ga4Footer(id: string, pageType: string): string {
  if (!/^G-[A-Z0-9]{6,}$/i.test(id)) return '';
  return `<div id="eroka-consent" class="eroka-consent" style="display:none" role="dialog" aria-live="polite" aria-label="Souhlas s měřením návštěvnosti">
	<p class="eroka-consent__t">Měříme návštěvnost, ať víme, které stránky lidem pomáhají. Bez souhlasu měříme jen anonymně, bez cookies.</p>
	<div class="eroka-consent__b">
		<button type="button" data-eroka-consent="1" class="eroka-consent__yes">Souhlasím</button>
		<button type="button" data-eroka-consent="0" class="eroka-consent__no">Jen nezbytné</button>
		<a href="/zasady-ochrany-osobnich-udaju-gdpr/" class="eroka-consent__l">Více</a>
	</div>
</div>
<script id="eroka-ga4-events">
(function(){
	var KEY='${KEY}';
	var PT='${pageType}';
	function store(k,v){try{localStorage.setItem(k,v);}catch(e){}}
	function read(k){try{return localStorage.getItem(k);}catch(e){return null;}}
	var box=document.getElementById('eroka-consent');
	if(box&&read(KEY)===null){box.style.display='';}
	if(box){
		box.addEventListener('click',function(e){
			var b=e.target.closest('[data-eroka-consent]');
			if(!b){return;}
			var yes=b.getAttribute('data-eroka-consent')==='1';
			store(KEY,yes?'1':'0');
			if(window.gtag){gtag('consent','update',{analytics_storage:yes?'granted':'denied'});}
			box.style.display='none';
		});
	}
	document.addEventListener('click',function(e){
		if(!e.target||!e.target.closest){return;}
		var a=e.target.closest('a[href]');
		if(!a){return;}
		var pl=a.getAttribute('data-partner-link');
		if(pl){if(window.gtag){gtag('event','partner_click',{partner:pl,link_url:a.href,page_path:location.pathname});}return;}
		var u;try{u=new URL(a.getAttribute('href'),location.href);}catch(err){return;}
		var same=u.host===location.host;
		var viaGo=same&&/^\\/go\\//.test(u.pathname);
		if(!viaGo&&same){return;}
		if(!window.gtag){return;}
		gtag('event','affiliate_click',{
			page_type:PT,
			link_kind:viaGo?'go':'direct',
			partner:a.getAttribute('data-partner')||(viaGo?'':u.host),
			destination:viaGo?u.pathname:u.host,
			context:u.searchParams.get('ctx')||'',
			value:parseInt(a.getAttribute('data-price')||'0',10)||0,
			currency:'CZK'
		});
	},true);
})();
</script>`;
}
