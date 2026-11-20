const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const touch = matchMedia('(hover: none)');
let library;
function playerLibrary() {
  return library ||= new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='vendor/lottie.js';
    script.onload=()=>resolve(window.lottie);
    script.onerror=()=>{library=null;reject(Error('Player unavailable'))};
    document.head.append(script);
  });
}

class GiftMotion extends HTMLElement {
  connectedCallback(){
    this.card=this.closest('.card');
    this.events=new AbortController();
    const options={signal:this.events.signal};
    this.card?.addEventListener('pointerenter',()=>{this.hover=true;this.sync()},options);
    this.card?.addEventListener('pointerleave',()=>{this.hover=false;this.sync()},options);
    this.card?.addEventListener('focusin',()=>{this.focused=true;this.sync()},options);
    this.card?.addEventListener('focusout',()=>{this.focused=false;this.sync()},options);
    reduced.addEventListener('change',()=>this.sync(),options);
    document.addEventListener('visibilitychange',()=>this.sync(),options);
    this.observer=new IntersectionObserver(([entry])=>{this.visible=entry.isIntersecting;this.sync()},{threshold:0.25});
    this.observer.observe(this);
  }
  get playing(){
    return this.visible&&!document.hidden&&!reduced.matches&&(!this.card||this.hover||this.focused||touch.matches);
  }
  async sync(){
    if(!this.playing){
      this.player?.pause();
      if(!this.visible||reduced.matches||this.card)this.classList.remove('running');
      return;
    }
    if(this.player){this.classList.add('running');this.player.play();return}
    if(this.loading||this.failed)return;
    this.loading=true;
    try {
      const [lib,res]=await Promise.all([playerLibrary(),fetch(this.dataset.file,{signal:this.events.signal})]);
      if(!res.ok)throw Error('No animation');
      const stream=res.body.pipeThrough(new DecompressionStream('gzip'));
      const data=await new Response(stream).json();
      if(!this.isConnected)return;
      this.player=lib.loadAnimation({container:this,renderer:'canvas',loop:!this.card,autoplay:false,animationData:data,
        rendererSettings:{dpr:Math.min(devicePixelRatio||1,2),preserveAspectRatio:'xMidYMid meet'}});
      this.player.addEventListener('complete',()=>{if(this.card)this.player.goToAndStop(0,true)});
      this.sync();
    }catch{this.failed=true;this.classList.remove('running')}
    finally{this.loading=false}
  }
  disconnectedCallback(){
    this.events.abort();this.observer.disconnect();this.player?.destroy();this.player=null;
  }
}
customElements.define('gift-motion',GiftMotion);
