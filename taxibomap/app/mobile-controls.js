// Move the original controls, retaining their existing navigation handlers.
const mobileBar = document.createElement('nav');
mobileBar.className = 'mobile-drive-bar';
mobileBar.setAttribute('aria-label', 'Driving controls');
mobileBar.innerHTML = '<button type="button" id="mobileDrive">Start Drive</button><button type="button" id="mobileRecenter" aria-label="Recenter on vehicle" title="Recenter on vehicle">◎</button><button type="button" id="mobileToolsToggle" aria-label="Open navigation tools" aria-expanded="false" aria-controls="mobileTools">⋯</button>';
const mobileTools = document.createElement('section');
mobileTools.id = 'mobileTools';
mobileTools.className = 'mobile-tools';
mobileTools.setAttribute('aria-label', 'Navigation tools');
mobileTools.hidden = true;
const toolsHeading = document.createElement('strong');
toolsHeading.textContent = 'Navigation tools';
mobileTools.append(toolsHeading);
document.body.append(mobileTools, mobileBar);
const drive = mobileBar.querySelector('#mobileDrive');
const toggle = mobileBar.querySelector('#mobileToolsToggle');
const phone = window.matchMedia('(max-width: 780px)');
const moved = ['toggleJourney', 'startNav', 'briefNav', 'simulateGps', 'pauseNav', 'saveDrive', 'reportTraffic', 'overviewButton', 'cameraButton', 'basemapButton', 'nightMode'].map(id => {
  const element = document.getElementById(id);
  const placeholder = document.createComment(`Original position of ${id}`);
  element.before(placeholder);
  return { element, placeholder };
});
function setTools(open, restoreFocus = false) {
  mobileTools.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close navigation tools' : 'Open navigation tools');
  if (open) moved[0].element.focus();
  else if (restoreFocus) toggle.focus();
}
function syncDrive() {
  // The classic navigation script exposes its state to subsequent page scripts.
  const running = typeof liveWatchId !== 'undefined' &&
    (liveWatchId !== null || simulationTimer !== null || animationId !== null);
  drive.textContent = running ? 'Stop' : 'Start Drive';
  drive.classList.toggle('is-running', running);
}
function arrangeControls() {
  setTools(false);
  moved.forEach(({ element, placeholder }) => phone.matches ? mobileTools.append(element) : placeholder.after(element));
  syncDrive();
}
drive.addEventListener('click', () => {
  if (typeof pauseNavigation !== 'function') return;
  if (liveWatchId !== null || simulationTimer !== null || animationId !== null) {
    pauseNavigation();
    stopLiveDrive();
    document.querySelector('#driveMode').textContent = 'Stopped';
  } else document.querySelector('#liveDrive').click();
  syncDrive();
});
mobileBar.querySelector('#mobileRecenter').addEventListener('click', () => document.querySelector('#recenterButton').click());
toggle.addEventListener('click', () => setTools(mobileTools.hidden));
mobileTools.addEventListener('click', event => {
  if (!event.target.closest('button')) return;
  setTools(false);
  queueMicrotask(syncDrive);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !mobileTools.hidden) setTools(false, true);
});
document.addEventListener('click', event => {
  if (!mobileTools.hidden && !mobileTools.contains(event.target) && !mobileBar.contains(event.target)) setTools(false);
});
new MutationObserver(syncDrive).observe(document.querySelector('#driveMode'), { childList: true, characterData: true, subtree: true });
new MutationObserver(syncDrive).observe(document.querySelector('#liveDrive'), { childList: true, attributes: true });
phone.addEventListener('change', arrangeControls);
arrangeControls();
