class SpeedAwareCamera {
  constructor(view, now) {
    this.view = { ...view };
    this.speed = 0;
    this.acceptedSpeed = null;
    this.sampleTime = null;
    this.frameTime = now;
    this.junctionDistance = Infinity;
  }
  update(speedMetersPerSecond, accuracy, junctionDistance, now) {
    // Missing/poor GPS holds the previous view instead of pretending we stopped.
    if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond < 0 || accuracy > 60) return;
    const kmh = Math.min(160, speedMetersPerSecond * 3.6);
    if (this.acceptedSpeed === null || Math.abs(kmh - this.acceptedSpeed) >= 3 || kmh === 0) this.acceptedSpeed = kmh;
    const elapsed = this.sampleTime === null ? Infinity : Math.max(0, now - this.sampleTime);
    this.speed += (this.acceptedSpeed - this.speed) * (1 - Math.exp(-elapsed / 1200));
    this.sampleTime = now;
    this.junctionDistance = junctionDistance;
  }
  target() {
    if (this.acceptedSpeed === null) return { ...this.view };
    const stops = [[0,10,19.3,.52],[10,15,19.3,.54],[40,45,18.7,.60],[70,60,18.2,.65],[100,70,17.8,.68]];
    const index = Math.max(1, stops.findIndex(stop => stop[0] >= this.speed));
    const high = this.speed >= 100 ? stops.at(-1) : stops[index];
    const low = this.speed >= 100 ? high : stops[index - 1];
    const fraction = high[0] === low[0] ? 0 : (this.speed - low[0]) / (high[0] - low[0]);
    const value = key => low[key] + (high[key] - low[key]) * fraction;
    const proximity = Math.max(0, Math.min(1, (180 - this.junctionDistance) / 150));
    return {
      pitch: value(1) + (Math.min(45, value(1)) - value(1)) * proximity,
      zoom: value(2) + (Math.max(19, value(2)) - value(2)) * proximity,
      anchor: value(3)
    };
  }
  frame(now) {
    const weight = 1 - Math.exp(-Math.max(0, Math.min(100, now - this.frameTime)) / 850);
    this.frameTime = now;
    const target = this.target();
    for (const key of ['pitch','zoom','anchor']) this.view[key] += (target[key] - this.view[key]) * weight;
    return this.view;
  }
  isSettling() {
    const target = this.target();
    return Math.abs(this.view.pitch - target.pitch) > .05 || Math.abs(this.view.zoom - target.zoom) > .005 || Math.abs(this.view.anchor - target.anchor) > .001;
  }
}
