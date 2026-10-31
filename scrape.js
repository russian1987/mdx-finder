const {chromium}=require('playwright');const fs=require('fs');
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const num=s=>s==null?null:Number(String(s).replace(/[^0-9.]/g,''))||null;
const direct={ 'Cars.com':"https://www.cars.com/shopping/results/?makes[]=acura&models[]=acura-mdx&stock_type=used&zip=34286&maximum_distance=500&list_price_max=35000&mileage_max=50000",
 'Autotrader':"https://www.autotrader.com/cars-for-sale/used-cars/acura/mdx/north-port-fl?zip=34286&searchRadius=500&maxPrice=35000&maxMileage=50000",
 'CarGurus':"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip=34286&distance=400&entitySelectingHelper.selectedEntity=d14",
 'TrueCar':"https://www.truecar.com/used-cars-for-sale/listings/acura/mdx/location-north-port-fl/?searchRadius=500",
 'CarMax':"https://www.carmax.com/cars/acura/mdx",'Carvana':"https://www.carvana.com/cars/acura-mdx",
 'Edmunds':"https://www.edmunds.com/used-acura-mdx/?radius=500&zip=34286",'CarFax':"https://www.carfax.com/Used-Acura-MDX_z12",
 'KBB':"https://www.kbb.com/cars-for-sale/used/acura/mdx/north-port-fl-34286?searchRadius=500"};
const CL=['fortmyers','sarasota','tampa','orlando','miami','jacksonville','gainesville','tallahassee'];
async function run(){
 const b=await chromium.launch(fs.existsSync('/usr/bin/google-chrome')&&!process.env.CI?{executablePath:'/usr/bin/google-chrome'}:{});const ctx=await b.newContext({userAgent:UA});
 const status={};const all=[];
 // direct sites: check reachability only (record blocks)
 for(const [n,u] of Object.entries(direct)){const p=await ctx.newPage();try{const r=await p.goto(u,{timeout:30000,waitUntil:'domcontentloaded'});await p.waitForTimeout(3000);const t=await p.title();
  status[n]={direct:r.status()>=400||/denied|attention|moment|unavailable/i.test(t)?`blocked (HTTP ${r.status()}: ${t.slice(0,50)})`:`reachable but no parser (HTTP ${r.status()})`};}catch(e){status[n]={direct:'error: '+e.message.slice(0,60)}}await p.close()}
 // AutoTempest aggregator
 try{const p=await ctx.newPage();const res=[];p.on('response',async r=>{if(r.url().includes('queue-results')){try{const j=await r.json();(j.results||[]).forEach(x=>res.push(x))}catch{}}});
  await p.goto("https://www.autotempest.com/results?make=acura&model=mdx&zip=34286&radius=500&maxprice=35000&maxmiles=50000&minmiles=20000",{timeout:60000,waitUntil:'domcontentloaded'});await p.waitForTimeout(12000);
  for(let i=0;i<15;i++){const btn=p.locator('.more-results:not(.hide) button, button.more-results:not(.hide), .more-results:not(.hide) a').first();if(!(await btn.count()))break;try{await btn.click({timeout:5000});await p.waitForTimeout(4000)}catch{break}}
  await p.close();
  for(const x of res)all.push({id:x.vin||x.url,vin:x.vin,year:num(x.year),make:x.make,model:x.model,trim:x.trim||'',title:x.title,mileage:num(x.mileage),price:num(x.price),distance:x.distance,location:x.location,img:x.img||x.imgFallback,url:x.url,source:x.sourceName||x.sitecode,via:'AutoTempest',seller:x.sellerType});
  status.AutoTempest={ok:true,raw:res.length};}catch(e){status.AutoTempest={error:e.message.slice(0,80)}}
 // Craigslist (FL regions)
 let cl=0;for(const reg of CL){const p=await ctx.newPage();try{await p.goto(`https://${reg}.craigslist.org/search/cta?query=acura%20mdx&max_price=35000&min_auto_miles=20000&max_auto_miles=50000`,{timeout:30000});await p.waitForTimeout(4000);
  const items=await p.$$eval('li.cl-search-result',ls=>ls.map(l=>({title:l.getAttribute('title')||l.querySelector('.label,.posting-title')?.textContent,url:l.querySelector('a')?.href,price:l.querySelector('.priceinfo,.price')?.textContent,meta:l.querySelector('.meta')?.textContent,img:l.querySelector('img')?.src})));
  for(const it of items){if(!/mdx/i.test(it.title||''))continue;const y=(it.title.match(/\b(19|20)\d{2}\b/)||[])[0];const mm=(it.meta||'').match(/(\d+)k mi/);
   all.push({id:it.url,year:num(y),make:'Acura',model:'MDX',trim:'',title:it.title.trim(),mileage:mm?Number(mm[1])*1000:null,price:num(it.price),distance:null,location:reg+' (craigslist)',img:it.img||null,url:it.url,source:'Craigslist',via:'Craigslist'});cl++}}catch(e){status['Craigslist '+reg]={error:e.message.slice(0,60)}}await p.close()}
 status.Craigslist={ok:true,raw:cl};
 await b.close();
 // filter + dedupe
 const seen=new Map();for(const l of all){if(!/mdx/i.test(l.model||l.title))continue;if(!(l.price>0&&l.price<35000))continue;if(l.mileage!=null&&(l.mileage<20000||l.mileage>50000))continue;if(l.mileage==null&&l.via!=='Craigslist')continue;if(l.distance!=null&&l.distance>400)continue;const k=(l.vin||l.url).toUpperCase();if(!seen.has(k))seen.set(k,l)}
 const listings=[...seen.values()];const counts={};listings.forEach(l=>counts[l.source]=(counts[l.source]||0)+1);
 const out={syncedAt:new Date().toISOString(),criteria:'Acura MDX, ≤400 mi of 34286, 20k–50k mi, <$35k',counts,status,listings};
 const OUT=process.env.OUT||__dirname+'/site/listings.json';if(listings.length===0){console.error('0 listings; keeping previous file');process.exitCode=2;return out}fs.writeFileSync(OUT,JSON.stringify(out,null,1));return out}
module.exports=run;if(require.main===module)run().then(o=>console.log(o.listings.length,o.counts,JSON.stringify(o.status,null,1)));
