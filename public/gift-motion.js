const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const touch = matchMedia('(hover: none)');
let library;

function playerLibrary() {
  if (!library) {
    library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/lottie.js';
      script.onload = () => resolve(window.lottie);
      script.onerror = () => {
        script.remove();
        library = null;
        reject(new Error('Player unavailable'));
      };
      document.head.append(script);
    });
  }
  return library;
}

class GiftMotion extends HTMLElement {
  connectedCallback() {
    this.card = this.closest('.card');
    this.events = new AbortController();
    this.hover = this.card?.matches(':hover');
    this.focused = this.card?.contains(document.activeElement);
    this.visible = false;
    const options = {signal: this.events.signal};
    this.card?.addEventListener('pointerenter', () => { this.hover = true; this.sync(); }, options);
    this.card?.addEventListener('pointerleave', () => { this.hover = false; this.sync(); }, options);
    this.card?.addEventListener('focusin', () => { this.focused = true; this.sync(); }, options);
    this.card?.addEventListener('focusout', event => {
      this.focused = this.card.contains(event.relatedTarget);
      this.sync();
    }, options);
    reduced.addEventListener('change', () => this.sync(), options);
    touch.addEventListener('change', () => this.sync(), options);
    document.addEventListener('visibilitychange', () => this.sync(), options);
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      this.sync();
    }, {threshold: 0.25});
    this.observer.observe(this);
  }

  get playing() {
    return this.isConnected && this.visible && !document.hidden && !reduced.matches &&
      (!this.card || this.hover || this.focused || touch.matches);
  }

  async sync() {
    if (!this.playing) {
      this.player?.pause();
      this.classList.remove('running');
      return;
    }
    if (this.player) {
      if (this.frameReady) {
        this.classList.add('running');
        this.player.play();
      }
      return;
    }
    if (this.loading) return;

    const {signal} = this.events;
    this.loading = true;
    try {
      const [lib, response] = await Promise.all([playerLibrary(), fetch(this.dataset.file, {signal})]);
      if (!response.ok) throw new Error('Animation unavailable');
      const data = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
      if (signal.aborted || !this.playing) return;

      const player = lib.loadAnimation({
        container: this, renderer: 'canvas', loop: !this.card, autoplay: false, animationData: data,
        rendererSettings: {dpr: Math.min(devicePixelRatio || 1, 2), preserveAspectRatio: 'xMidYMid meet'}
      });
      this.player = player;
      // The bundled canvas renderer emits DOMLoaded after drawing its initial frame.
      player.addEventListener('DOMLoaded', () => {
        this.frameReady = true;
        this.sync();
      });
      player.addEventListener('complete', () => {
        if (this.card) player.goToAndStop(0, true);
      });
      const onFailure = () => this.clearPlayer();
      player.addEventListener('data_failed', onFailure);
      player.addEventListener('error', onFailure);
    } catch {
      if (!signal.aborted) this.clearPlayer();
    } finally {
      if (!signal.aborted) this.loading = false;
    }
  }

  clearPlayer() {
    this.classList.remove('running');
    this.frameReady = false;
    this.player?.destroy();
    this.player = null;
  }

  disconnectedCallback() {
    this.events.abort();
    this.observer.disconnect();
    this.clearPlayer();
    this.loading = false;
  }
}
customElements.define('gift-motion', GiftMotion);
