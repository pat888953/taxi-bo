class NaviBasemap {
  constructor() {
    this.mode = 'vector';
    try { this.mode = localStorage.getItem('navidrive-basemap') === 'classic' ? 'classic' : 'vector'; } catch {}
    this.layers = [];
    this.errors = 0;
  }
  async load() {
    const raster = { type:'raster', tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256,
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' };
    let style = {version:8,sources:{},layers:[]};
    try {
      const response = await fetch('https://tiles.openfreemap.org/styles/liberty', {signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('Vector style unavailable');
      style = await response.json();
      if (style.version !== 8 || !style.sources || !Array.isArray(style.layers)) throw new Error('Invalid vector style');
      this.layers = style.layers;
    } catch { this.mode='classic'; }
    return {...style, sources:{...style.sources,osmRaster:raster}, layers:[
      {id:'osmRaster',type:'raster',source:'osmRaster'}, ...this.layers
    ]};
  }
  apply(map, night) {
    map.setLayoutProperty('osmRaster','visibility',this.mode==='classic'?'visible':'none');
    map.setPaintProperty('osmRaster','raster-brightness-max',night ? 0.25 : 1);
    map.setPaintProperty('osmRaster','raster-saturation',night?-.65:0);
    for (const layer of this.layers) {
      map.setLayoutProperty(layer.id,'visibility',this.mode==='vector' ? layer.layout?.visibility || 'visible' : 'none');
      // Keep the source style's detailed daytime colours; night overrides only base colours.
      const water = /water|ocean/i.test(layer.id);
      const road = /road|transport|bridge|tunnel/i.test(layer.id);
      const changes = layer.type==='background' ? {'background-color':'#171f26'}
        : layer.type==='fill' ? {'fill-color':water?'#132e40':/park|wood|landcover/i.test(layer.id)?'#20382d':'#29333b'}
        : layer.type==='line' ? {'line-color':road?'#65717c':water?'#25465a':'#3c4852'}
        : layer.type==='symbol' && layer.layout?.['text-field'] ? {'text-color':'#dbe5eb','text-halo-color':'#1b252e'} : {};
      for (const [property,value] of Object.entries(changes)) map.setPaintProperty(layer.id,property,night?value:layer.paint?.[property] ?? null);
    }
    const button=document.querySelector('#basemapButton');
    if (button) {
      button.textContent=this.mode==='vector'?'Map: Vector':'Map: Classic';
      button.disabled=!this.layers.length;
      button.setAttribute('aria-label',this.mode==='vector'?'Switch to classic map':'Switch to vector map');
    }
  }
  toggle(map,night) {
    if (!this.layers.length) return;
    this.mode=this.mode==='vector'?'classic':'vector';
    this.errors=0;
    try {localStorage.setItem('navidrive-basemap',this.mode);} catch {}
    this.apply(map,night);
  }
  handleError(event,map,night) {
    if(this.mode!=='vector' || !this.layers.some(layer=>layer.source===event.sourceId)) return false;
    const now=Date.now();
    if (!this.errorTime || now-this.errorTime>10000) this.errors=0;
    this.errorTime=now;
    if(++this.errors<3) return false;
    this.mode='classic';
    this.apply(map,night);
    return true;
  }
}
