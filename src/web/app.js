const $ = (sel) => document.querySelector(sel);
const state = { tab: (location.hash.slice(1) || 'overview'), agentFilter: 'all', metrics: null, logFilter: '', system: null, install: null, files: [], catalog: { skills: [], plugins: [] }, logs: [], zaloLoginOpen: false, zaloLoginLines: [], zaloQrDataUrl: '', lang: localStorage.getItem('aivio-lang') || 'vi', theme: localStorage.getItem('aivio-theme') || 'light', tz: localStorage.getItem('aivio-tz') || 'Asia/Ho_Chi_Minh', navCollapsed: localStorage.getItem('aivio-nav')==='1', os: null, mode: null, botModalOpen: false, botEditId: '', installModalOpen: false, fbPluginModalOpen: false, installTab: 'native', installDraft: null, pathModal: null, confirmModal: null, botChannel: 'telegram', botPane: 'list', activeBotId: '', selectedFile: '', botMessage: '', projectConnectMessage: '', pendingProjectDir: '', selectedProjectDir: '', featureFlags: {}, featureInstalled: {}, featureLoading: {}, featureLocked: {}, zaloBackend: '', zaloHealth: null, openDirs: {} };
const SVG_CDN = 'https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons';
const OS_OPTIONS = [
  { id: 'win', title: 'Windows', subtitle: 'Auto-detected desktop', icon: `${SVG_CDN}/windows/default.svg`, badge: 'Desktop' },
  { id: 'macos', title: 'macOS', subtitle: 'Apple Silicon / Intel', icon: `${SVG_CDN}/apple/default.svg`, badge: 'Desktop' },
  { id: 'linux-desktop', title: 'Linux Desktop', subtitle: 'Ubuntu / Debian / Fedora', icon: `${SVG_CDN}/linux/default.svg`, badge: 'Desktop' },
  { id: 'vps', title: 'Linux VPS', subtitle: 'Server install with public bind', icon: `${SVG_CDN}/ubuntu/default.svg`, badge: 'Server' },
];
// One deploy mode is left. Native runs openclaw + 9router straight on this machine as a managed
// service (launchd/systemd/schtasks): no Docker install, the host filesystem in plain sight, and
// the only mode where the bot can drive apps on the desktop.
// Docker is kept on screen but retired, and it has to say so HERE too, not only inside the create
// dialog: this tile was still the pre-ticked "Recommended" one, so the dialog then opened on its
// own locked tab and the operator was left holding a disabled button with no explanation.
const MODE_OPTIONS = [
  { id: 'native', title: 'Native', subtitle: 'Runs on this machine, controls apps', icon: `${SVG_CDN}/nodedotjs/default.svg`, badge: 'Recommended' },
  { id: 'docker', title: 'Docker', subtitle: 'Retired, existing projects keep running', icon: `${SVG_CDN}/docker/default.svg`, badge: 'Retired', retired: true },
];
const BOT_CHANNELS = [
  { id: 'telegram', title: 'Telegram', subtitle: 'Bot API', icon: `${SVG_CDN}/telegram/default.svg`, badge: 'Tele' },
  { id: 'zalo-personal', title: 'Zalo cá nhân', subtitle: 'OpenClaw Zalo Connect', icon: `${SVG_CDN}/zalo/default.svg`, badge: 'User' },
  { id: 'zalo-bot', title: 'Zalo Bot API', subtitle: 'Bot chính chủ (bot.zaloplatforms.com)', icon: `${SVG_CDN}/zalo/default.svg`, badge: 'Bot' },
  { id: 'fb-messenger', title: 'Facebook', subtitle: 'Messenger', icon: `${SVG_CDN}/messenger/default.svg`, badge: 'FB' },
  { id: 'discord', title: 'Discord', subtitle: 'Bot', icon: `${SVG_CDN}/discord/default.svg`, badge: 'Discord', comingSoon: true },
  { id: 'lark', title: 'Lark', subtitle: 'Lark / Feishu', icon: '/lark.svg', badge: 'Lark', comingSoon: true },
];

function choiceCard(group, item, current) {
  const coming = !!item.comingSoon;
  const retired = !!item.retired;
  const retiredWhy = t('Đã ngừng cho project mới - OpenClaw 2026.9 không ghi được cấu hình qua Docker trên Windows',
                       'Retired for new projects - OpenClaw 2026.9 cannot write config through Docker on Windows');
  const badge = coming ? t('Sắp ra mắt', 'Coming soon') : retired ? t('Đã ngừng', 'Retired') : item.badge;
  const locked = coming || retired;
  return `<label class="choice-card logo-card ${item.id === current ? 'is-selected' : ''} ${coming ? 'is-coming-soon' : ''} ${retired ? 'is-retired' : ''}" ${coming ? `title="${t('Sắp ra mắt','Coming soon')}"` : retired ? `title="${escapeHtml(retiredWhy)}"` : ''}>
    <input name="${group}" type="radio" value="${item.id}" ${item.id===current?'checked':''} ${locked?'disabled':''}/>
    ${coming ? `<span class="coming-badge">${t('Sắp ra mắt','Coming soon')}</span>` : ''}
    ${retired ? `<span class="coming-badge">${t('Đã ngừng','Retired')}</span>` : ''}
    <span class="choice-card__icon"><img src="${item.icon}" alt="${item.title} icon" loading="lazy" onerror="this.style.display='none'"/></span>
    <span class="choice-card__body"><strong>${item.title}</strong><small>${badge}</small></span>
  </label>`;
}
function staticChoiceCard(item) {
  const badge = item.comingSoon ? t('Sắp ra mắt', 'Coming soon') : item.badge;
  return `<div class="choice-card logo-card is-selected bot-channel-static ${item.comingSoon ? 'is-coming-soon' : ''}" aria-label="${escapeHtml(item.title)}">
    <span class="choice-card__icon"><img src="${item.icon}" alt="${escapeHtml(item.title)} icon" loading="lazy" onerror="this.style.display='none'"/></span>
    <span class="choice-card__body"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(badge)}</small></span>
  </div>`;
}

async function api(path, opts) {
  const res = await fetch(path, opts && opts.body ? { ...opts, headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body) } : opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // Session expired (or password changed on another device): back to the login page, keeping
    // the page the operator was on.
    if (res.status === 401 && data.auth === 'login') {
      location.replace(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`);
    }
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}
/** Where a new project goes by default: the server's home, never a placeholder path. */
function defaultProjectDir(os) {
  const home = String(state.system?.home || '').replace(/[\\/]+$/, '');
  if (os === 'win') return home ? `${home}\\aivio-bot` : 'C:\\aivio-bot';
  return `${home || (os === 'macos' ? '/Users/you' : '/home/you')}/aivio-bot`;
}
function openInstallModal() {
  const os = document.querySelector('input[name=os]:checked')?.value || state.os || state.system?.os || 'linux';
  state.installTab = 'native';
  refreshInstallDraft({ os, mode: 'native', projectDir: state.installDraft?.projectDir || defaultProjectDir(os) });
  state.installModalOpen = true;
  render();
}
function activeProjectDir() {
  return state.selectedProjectDir || state.install?.projectDir || '';
}
function projectQuery(extra = {}) {
  const params = new URLSearchParams();
  const projectDir = activeProjectDir();
  if (projectDir) params.set('projectDir', projectDir);
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}
function runtimeBadge(label, kind='') { return `<span class="mini-pill ${kind?`mini-pill--${kind}`:''}">${escapeHtml(label)}</span>`; }
async function withButtonLoading(btn, task) {
  if (!btn || btn.classList.contains('is-loading')) return;
  const prevDisabled = btn.disabled;
  btn.classList.add('is-loading');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try { return await task(); }
  finally {
    if (btn.isConnected) {
      btn.classList.remove('is-loading');
      btn.disabled = prevDisabled;
      btn.removeAttribute('aria-busy');
    }
  }
}
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn || btn.disabled || btn.classList.contains('is-loading') || btn.classList.contains('nav-collapse-btn')) return;
  btn.classList.add('is-press-loading');
  setTimeout(() => btn.classList.remove('is-press-loading'), 450);
}, true);



function copyIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
}
function actionIcon(name) {
  const d = {
    refresh: '<path d="M20 11a8 8 0 1 0 2 5.3"/><path d="M20 4v7h-7"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    link: '<path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13"/><path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    spark: '<path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8Z"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    native: '<path d="M12 3v11"/><polyline points="8 7 12 3 16 7"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'
  }[name];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
function socialIcon(name) {
  const d = {
    facebook:'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
    telegram:'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
    zalo:'M4 6h16v10H8l-4 4V6z M9 10h6 M9 13h4',
    github:'M9 19c-5 1-5-2-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.7A5.2 5.2 0 0 0 20 5.2 4.8 4.8 0 0 0 19.9 2S18.7 1.7 16 3.5a13.4 13.4 0 0 0-7 0C6.3 1.7 5.1 2 5.1 2A4.8 4.8 0 0 0 5 5.2a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.1 6.4 6.1 6.7a3 3 0 0 0-.9 2.1V22'
  }[name];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
function fbPluginModal() {
  if (!state.fbPluginModalOpen) return '';
  const socials = [
    ['facebook','https://www.facebook.com/hocvienai'],
    ['telegram','https://t.me/hocvienai'],
    ['zalo','https://zalo.me/hocvienai'],
    ['github','https://github.com/theanh828726/']
  ];
  return `<div class="modal-backdrop confirm-backdrop" data-fbplugin="close">
    <section class="donate-modal confirm-modal" role="dialog" aria-modal="true" aria-label="fb-messenger plugin" onclick="event.stopPropagation()">
      <button class="modal-x" data-fbplugin="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="donate-head"><span aria-hidden="true">🔌</span><div><p>${t('Cần plugin','Plugin required')}</p><h2>fb-messenger</h2><small>${t('Bot <b>Facebook Messenger</b> cần plugin <b>fb-messenger</b> (đã public trên ClawHub). Bấm <b>Tạo bot</b>, rồi mở <b>Bot → Plugins</b> và bấm <b>Cài</b> ở thẻ <b>openclaw-fb-messenger</b>.','A <b>Facebook Messenger</b> bot needs the <b>fb-messenger</b> plugin (now public on ClawHub). Click <b>Create bot</b>, then open <b>Bot → Plugins</b> and hit <b>Install</b> on the <b>openclaw-fb-messenger</b> card.')}</small></div></div>
      <div class="socials" style="justify-content:center;display:flex;gap:10px;width:100%;margin:8px 0 4px;">
        ${socials.map(([n,u])=>`<a href="${u}" target="_blank" rel="noopener" aria-label="${n}">${socialIcon(n)}</a>`).join('')}
      </div>
      <div class="confirm-actions"><button class="primary" data-fbplugin="close" type="button">${t('Đã hiểu','Got it')}</button></div>
    </section>
  </div>`;
}
function confirmModal() {
  const m = state.confirmModal;
  if (!m) return '';
  return `<div class="modal-backdrop confirm-backdrop" data-confirm-action="cancel">
    <section class="donate-modal confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(m.title)}" onclick="event.stopPropagation()">
      <button class="modal-x" data-confirm-action="cancel" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="donate-head"><span aria-hidden="true">${escapeHtml(m.icon || '⚠')}</span><div><p>${escapeHtml(m.eyebrow || t('Xác nhận','Confirm'))}</p><h2>${escapeHtml(m.title)}</h2><small>${escapeHtml(m.message || '')}</small></div></div>
      ${m.bodyHtml ? `<div class="confirm-body">${m.bodyHtml}</div>` : ''}
      <div class="confirm-actions">${m.hideCancel ? '' : `<button class="secondary" data-confirm-action="cancel">${escapeHtml(m.cancelText || t('Hủy','Cancel'))}</button>`}<button class="primary ${m.okDanger === false ? '' : 'danger'}" data-confirm-action="ok">${escapeHtml(m.okText || t('Xóa','Delete'))}</button></div>
    </section>
  </div>`;
}
function pathModal() {
  const m = state.pathModal;
  if (!m) return '';
  return `<div class="modal-backdrop confirm-backdrop" data-path-action="cancel">
    <section class="donate-modal confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(m.title || '')}" onclick="event.stopPropagation()">
      <button class="modal-x" data-path-action="cancel" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="donate-head"><span aria-hidden="true">${escapeHtml(m.icon || '📁')}</span><div><p>${escapeHtml(m.eyebrow || t('Nhập đường dẫn','Enter path'))}</p><h2>${escapeHtml(m.title || t('Đường dẫn project','Project path'))}</h2><small>${escapeHtml(m.message || '')}</small></div></div>
      <label class="field wide"><input id="path-modal-input" type="${m.inputType === 'password' ? 'password' : 'text'}" autocomplete="off" value="${escapeHtml(m.value || '')}" placeholder="${escapeHtml(m.placeholder || '')}" /></label>
      ${m.field2 ? `<label class="field wide" style="margin-top:8px;"><span style="display:block;font-size:12px;opacity:.8;margin-bottom:4px;">${escapeHtml(m.field2.label || '')}</span><input id="path-modal-input2" value="${escapeHtml(m.field2.value || '')}" placeholder="${escapeHtml(m.field2.placeholder || '')}" /></label>` : ''}
      <div class="confirm-actions"><button class="secondary" data-path-action="cancel">${t('Hủy','Cancel')}</button><button class="primary" data-path-action="ok">${t('Xác nhận','Confirm')}</button></div>
    </section>
  </div>`;
}
function zaloLoginModal() {
  if (!state.zaloLoginOpen) return '';
  const lines = state.zaloLoginLines.slice(-120).join('\n') || t('Đang khởi động login Zalo...', 'Starting Zalo login...');
  return `<div class="modal-backdrop zalo-login-backdrop" data-zalo-login="close">
    <section class="donate-modal zalo-login-modal" role="dialog" aria-modal="true" aria-label="Zalo login" onclick="event.stopPropagation()">
      <button class="modal-x" data-zalo-login="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="donate-head"><span aria-hidden="true">Z</span><div><p>${t('Zalo cá nhân','Zalo personal')}</p><h2>${t('Quét mã QR đăng nhập','Scan login QR')}</h2><small>${t('Mở Zalo trên điện thoại → quét QR trong khung dưới. Nếu QR chưa hiện, đợi vài giây.', 'Open Zalo on your phone → scan the QR below. If it is not visible yet, wait a few seconds.')}</small></div></div>
      ${state.zaloQrDataUrl ? `<div class="zalo-qr-image-wrap"><img class="zalo-qr-image" src="${state.zaloQrDataUrl}" alt="Zalo login QR"/></div>` : ''}
      <pre class="zalo-qr-log" data-zalo-qr-log>${escapeHtml(lines)}</pre>
      <div class="zalo-login-actions"><button class="secondary" data-zalo-login="close" type="button">${t('\u0110óng','Close')}</button></div>
    </section>
  </div>`;
}
function installModal() {
  if (!state.installModalOpen) return '';
  const sys = state.system || {};
  const draft = refreshInstallDraft();
  const os = draft.os || state.os || sys?.os || 'win';
  const mode = draft.mode || state.installTab || 'native';
  const pathExample = defaultProjectDir(os);
  const osChoices = OS_OPTIONS.map(o => [o.id, t(o.title, o.title), trChoice(o).subtitle]);
  // Docker is closed for NEW projects: openclaw >=2026.9 writes config through fs-safe, which
  // fstat()s the file after an atomic rename - a check that cannot pass through a Docker Desktop
  // bind mount on Windows, so the first image rebuild after that takes the gateway down for good
  // (measured on win_kha, 09/09/2026). Existing docker projects keep running and move to native on
  // their next update; the tile stays visible but disabled so the reason is on screen.
  const modeChoices = [
    ['native', 'Native', t('Ch\u1ea1y th\u1eb3ng tr\u00ean m\u00e1y n\u00e0y - kh\u00f4ng c\u1ea7n Docker, \u0111i\u1ec1u khi\u1ec3n \u0111\u01b0\u1ee3c app', 'Runs on this machine - no Docker, can drive desktop apps'), false],
    ['docker', 'Docker', t('\u0110\u00e3 ng\u1eebng - OpenClaw 2026.9 kh\u00f4ng ghi \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh qua Docker tr\u00ean Windows', 'Retired - OpenClaw 2026.9 cannot write config through Docker on Windows'), true],
  ];
  return `<div class="modal-backdrop install-backdrop" data-install-modal="close">
    <section class="donate-modal install-modal" role="dialog" aria-modal="true" aria-label="${t('T\u1ea1o Project','Create Project')}" onclick="event.stopPropagation()">
      <button class="modal-x" data-install-modal="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="donate-head"><span aria-hidden="true">+</span><div><p>${t('T\u1ea1o Project','Create Project')}</p><h2>${t('T\u1ea1o Project','Create Project')}</h2><small>${t('Ch\u1ecdn s\u1eb5n ch\u1ebf \u0111\u1ed9 \u1edf tab tr\u00ean. B\u00ean d\u01b0\u1edbi ch\u1ec9 c\u1ea7n ch\u1ecdn OS v\u00e0 nh\u1eadp ho\u1eb7c ch\u1ecdn \u0111\u01b0\u1eddng d\u1eabn project.','Mode stays in the tabs above. Below, choose OS and enter or pick the project path.')}</small></div></div>
      <form id="install-form" class="install-form">
        <div class="install-tabs">${modeChoices.map(([id,label,desc,locked]) => `<button type="button" class="install-tab ${mode===id?'is-active':''}${locked?' is-locked':''}" data-install-set="mode" data-value="${id}"${locked?' disabled aria-disabled="true"':''}><strong>${escapeHtml(label)}${locked?' 🔒':''}</strong><small>${escapeHtml(desc)}</small></button>`).join('')}</div>
        <div class="install-grid install-grid--compact">
          <div class="field wide"><span>${t('H\u1ec7 \u0111i\u1ec1u h\u00e0nh','Operating system')}</span>${pillGroup('os', os, osChoices)}<small>${t('\u0110\u00e3 ch\u1ecdn s\u1eb5n theo m\u00e1y \u0111ang ch\u1ea1y','Preselected from the current machine')}</small></div>
          <label class="field wide"><span>${t('Đường dẫn project','Project path')}</span><input name="projectDir" placeholder="${escapeHtml(pathExample)}" value="${escapeHtml(draft.projectDir || pathExample)}" /><small>${t('Thư mục sẽ chứa cấu hình, workspace và dữ liệu của bot. Đổi tên thư mục cuối thành tên bất kỳ.','This folder will hold the bots’ config, workspaces and data. Rename the last folder to anything you like.')}</small></label>
        </div>
        <div class="install-preview">${t('S\u1ebd t\u1ea1o t\u1ea1i','Will create at')} <code data-install-preview>${escapeHtml(draft.projectDir || pathExample)}</code></div>
        <input type="hidden" name="os" value="${escapeHtml(os)}" />
        <input type="hidden" name="mode" value="${escapeHtml(mode)}" />
        <div class="install-actions"><button type="button" class="secondary" data-install-modal="close">${t('H\u1ee7y','Cancel')}</button><button type="submit" class="primary">${t('C\u00e0i \u0111\u1eb7t','Install')}</button></div>
        ${state.projectConnectMessage ? `<p class="bot-inline-msg">${escapeHtml(state.projectConnectMessage)}</p>` : ''}
      </form>
    </section>
  </div>`;
}

function t(vi, en) { return state.lang === 'vi' ? vi : en; }

function ui(key) {
  const m = {
    setup:['C\u00e0i \u0111\u1eb7t','Setup'], bot:['Bot','Bot'], files:['T\u1ec7p','Files'], skills:['K\u1ef9 n\u0103ng','Skills'], logs:['Nh\u1eadt k\u00fd','Logs'],
    localSetup:['C\u00e0i \u0111\u1eb7t c\u1ee5c b\u1ed9','Local Setup'], ready:['S\u1eb5n s\u00e0ng','Ready'], installed:['\u0110\u00e3 c\u00e0i','Installed'],
    light:['S\u00e1ng','Light'], dark:['T\u1ed1i','Dark'], installer:['TR\u00ccNH C\u00c0I \u0110\u1eb6T WEB C\u1ee4C B\u1ed8','LOCAL WEB INSTALLER'],
    osTitle:['Ch\u1ecdn h\u1ec7 \u0111i\u1ec1u h\u00e0nh','Choose operating system'], osDesc:['M\u1eb7c \u0111\u1ecbnh theo m\u00e1y \u0111\u00e3 nh\u1eadn di\u1ec7n','Default follows detected machine'],
    modeTitle:['Ch\u1ecdn ch\u1ebf \u0111\u1ed9 ch\u1ea1y','Choose runtime mode'], modeDesc:['Ch\u1ea1y th\u1eb3ng tr\u00ean m\u00e1y (native). Docker \u0111\u00e3 ng\u1eebng cho project m\u1edbi.','Runs directly on this machine (native). Docker is retired for new projects.'],
    install:['T\u1ea1o Bot','Create Bot'], installSub:['T\u1ea1o project \u2192 c\u00e0i runtime m\u1edbi nh\u1ea5t \u2192 kh\u1edfi \u0111\u1ed9ng bot','Generate project \u2192 install latest runtime \u2192 start bot'],
    system:['H\u1ec7 th\u1ed1ng','System'], notReady:['Ch\u01b0a s\u1eb5n s\u00e0ng','Not ready'], missing:['Thi\u1ebfu','Missing'],
    liveLogs:['Nh\u1eadt k\u00fd tr\u1ef1c ti\u1ebfp','Live Logs'], status:['Tr\u1ea1ng th\u00e1i','Status'], yes:['C\u00f3','Yes'], no:['Kh\u00f4ng','No'], mode:['Ch\u1ebf \u0111\u1ed9','Mode'], project:['Project','Project'], gateway:['Gateway','Gateway'],
    next:['Ti\u1ebfp theo','Next'], nextDesc:['S\u1eeda file nh\u1eadn di\u1ec7n, sau \u0111\u00f3 c\u00e0i k\u1ef9 n\u0103ng/plugin.','Edit identity files, then install skills/plugins.'], openFiles:['M\u1edf t\u1ec7p','Open files'],
    save:['L\u01b0u','Save'], saved:['\u0110\u00e3 l\u01b0u','Saved'], noFiles:['Ch\u01b0a c\u00f3 file markdown. H\u00e3y ch\u1ea1y c\u00e0i \u0111\u1eb7t tr\u01b0\u1edbc.','No markdown files yet. Run install first.'],
    nativeCap:['N\u0103ng l\u1ef1c native','native capability'], plugins:['Plugins','Plugins'], installVerb:['C\u00e0i \u0111\u1eb7t','Install'],
    desktop:['M\u00e1y b\u00e0n','Desktop'], server:['M\u00e1y ch\u1ee7','Server'], recommended:['Khuy\u00ean d\u00f9ng','Recommended'], advanced:['N\u00e2ng cao','Advanced'],
    settings:['T\u00f9y ch\u1ec9nh','Settings'], appearance:['Giao di\u1ec7n','Appearance'], darkMode:['Ch\u1ebf \u0111\u1ed9 t\u1ed1i','Dark mode'], language:['Ng\u00f4n ng\u1eef','Language'], timezone:['M\u00fai gi\u1edd','Timezone'],
    settingsDesc:['T\u00f9y ch\u1ec9nh giao di\u1ec7n, ng\u00f4n ng\u1eef v\u00e0 m\u00fai gi\u1edd. M\u00fai gi\u1edd \u0111\u01b0\u1ee3c d\u00f9ng cho bot t\u1ea1o m\u1edbi (l\u1ecbch/cron ch\u1ea1y \u0111\u00fang gi\u1edd \u0111\u1ecba ph\u01b0\u01a1ng).','Customize appearance, language and timezone. The timezone is applied to newly created bots (so schedules/cron run in local time).'],
    tzHint:['\u00c1p d\u1ee5ng cho bot t\u1ea1o m\u1edbi','Applied to newly created bots']
  }[key] || [key,key];
  return t(m[0], m[1]);
}
function trChoice(item) {
  const vi = {
    'Auto-detected desktop':'M\u00e1y b\u00e0n t\u1ef1 nh\u1eadn di\u1ec7n', 'Apple Silicon / Intel':'Apple Silicon / Intel', 'Ubuntu / Debian / Fedora':'Ubuntu / Debian / Fedora', 'Server install with public bind':'C\u00e0i server v\u1edbi public bind',
    'Isolated containers, safest default':'Container c\u00f4 l\u1eadp, an to\u00e0n nh\u1ea5t', 'Direct host install, lighter runtime':'C\u00e0i tr\u1ef1c ti\u1ebfp, runtime nh\u1eb9 h\u01a1n'
  };
  const badge = { Desktop: ui('desktop'), Server: ui('server'), Recommended: ui('recommended'), Advanced: ui('advanced') }[item.badge] || item.badge;
  return { ...item, subtitle: t(vi[item.subtitle] || item.subtitle, item.subtitle), badge };
}
function applyPrefs() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.nav = state.navCollapsed ? 'collapsed' : 'open';
}
function toggleGroup(kind, current, items) {
  return `<div class="seg" role="group" aria-label="${kind}">${items.map(([id,label]) => `<button class="seg__btn ${current===id?'is-active':''}" data-pref="${kind}" data-value="${id}">${label}</button>`).join('')}</div>`;
}
function pillGroup(kind, current, items) {
  return `<div class="pill-group" role="group" aria-label="${kind}">${items.map(([id,label,desc]) => `<button type="button" class="pill-choice ${current===id?'is-active':''}" data-install-set="${kind}" data-value="${id}"><strong>${escapeHtml(label)}</strong>${desc ? `<small>${escapeHtml(desc)}</small>` : ''}</button>`).join('')}</div>`;
}
function joinPath(base, name) {
  const b = String(base || '').trim().replace(/[\\/]+$/, '');
  const n = String(name || '').trim().replace(/^[\\/]+/, '');
  if (!b) return n;
  if (!n) return b;
  return b + (b.includes('\\') ? '\\' : '/') + n;
}
function refreshInstallDraft(next = {}) {
  const prev = state.installDraft || {};
  const sys = state.system || {};
  const os = next.os || prev.os || state.os || sys.os || 'win';
  const mode = next.mode || prev.mode || state.mode || sys.recommendedMode || 'docker';
  const defaultDir = defaultProjectDir(os);
  
  const projectName = String(next.projectName ?? prev.projectName ?? '').trim();
  const projectRoot = String(next.projectRoot ?? prev.projectRoot ?? '').trim();
  
  let projectDir = String(next.projectDir ?? prev.projectDir ?? '').trim();
  if (!projectDir) {
    if (projectRoot) {
      projectDir = joinPath(projectRoot, projectName || 'aivio-bot');
    } else {
      projectDir = defaultDir;
    }
  }
  
  state.installDraft = { projectName, projectRoot, projectDir, os, mode };
  return state.installDraft;
}
function openPathModal({ title, message, value = '', placeholder = '', field2 = null, onConfirm = null, eyebrow = '', icon = '', inputType = 'text' }) {
  state.pathModal = { title, message, value, placeholder, field2, onConfirm, eyebrow, icon, inputType };
  render();
  setTimeout(() => document.getElementById('path-modal-input')?.focus(), 0);
}
/**
 * Shown right after PC control is granted on a native install: what the bot can now do, and the
 * one thing only the operator can do - grant the OS screen permissions from the system settings.
 */
function openComputerUseModal(r = {}) {
  const cu = r.computerUse || {};
  const isMac = /mac/i.test(state.system?.os || state.os || '');
  const line = (icon, text) => `<li><span aria-hidden="true">${icon}</span><div>${text}</div></li>`;

  // OpenClaw's own `computer` tool is the real thing here: screenshot, move, click, type, drag.
  // Codex is only a fallback for machines that have the ChatGPT app, so it must not lead - the
  // old copy said "mouse/keyboard control is macOS-only", which stopped being true once the
  // cua-computer plugin shipped for Windows.
  const statusItems = [
    cu.ok && cu.enabled
      ? line('✅', t('Bot <b>nhìn và điều khiển được máy này</b>: chụp màn hình, rê chuột, bấm chuột, gõ phím, kéo thả.', 'Your bot <b>can see and drive this machine</b>: screenshot, move, click, type, drag.'))
      : line('⚠️', t(`Chưa bật được điều khiển máy: ${escapeHtml(cu.error || 'không rõ lý do')}`, `Could not enable computer control: ${escapeHtml(cu.error || 'unknown reason')}`)),
    // No app list any more: the bot opens things the way a person does - Start menu, type the
    // name, Enter - so it is not limited to whatever we managed to enumerate.
    cu.ok && cu.enabled
      ? line('✅', t('Mở được <b>mọi ứng dụng đang cài</b> trên máy, kể cả app mới cài hôm qua.', 'Can open <b>any installed app</b>, including one installed yesterday.'))
      : '',
  ].filter(Boolean).join('');

  // Windows needs no privacy prompts; macOS does, and only from System Settings.
  const permBlock = isMac ? `
      <h4>${t('Cấp quyền màn hình cho máy','Grant the OS screen permissions')}</h4>
      <p>${t('macOS chỉ cấp <b>Screen Recording</b> và <b>Accessibility</b> từ System Settings. Bấm nút dưới rồi bật cho <code>node</code>.','macOS only grants <b>Screen Recording</b> and <b>Accessibility</b> from System Settings. Click below, then tick <code>node</code>.')}</p>
      <p class="cu-perm-row">
        <button class="secondary cu-btn" type="button" data-host-perm="screen">${t('Chụp/quay màn hình','Screen recording')}</button>
        <button class="secondary cu-btn" type="button" data-host-perm="accessibility">${t('Accessibility (chuột/bàn phím)','Accessibility (mouse/keys)')}</button>
      </p>` : '';

  state.confirmModal = {
    icon: '🖥️',
    eyebrow: t('Điều khiển máy','PC control'),
    title: cu.ok && cu.enabled ? t('Đã bật điều khiển máy','Computer control is on') : t('Bật chưa xong','Not fully enabled'),
    message: t('Model chính của bot vẫn là smart-route, không đổi.','Your bot keeps smart-route as its primary model.'),
    bodyHtml: `
      <ul class="cu-status">${statusItems}</ul>
      ${permBlock}
      <p class="cu-note">${t('Cách dùng: nhắn bot bình thường, ví dụ “chụp màn hình cho anh xem” hoặc “mở TeamViewer rồi đọc mật khẩu trên màn hình”.','How to use it: just ask your bot normally, e.g. "take a screenshot" or "open TeamViewer and read the password on screen".')}</p>
      <p class="cu-note">${t('Chỉ dùng được trên máy có màn hình. Máy chủ VPS không màn hình thì không áp dụng. Tắt nút này là thu hồi lại toàn bộ quyền trên.','Only works on a machine with a screen. A headless VPS cannot use this. Turning the switch off revokes all of it.')}</p>
      <p class="cu-note">${t('Sau khi khởi động lại máy, bấm <b>"1 - KHOI DONG BOT"</b> là phần điều khiển máy cũng tự bật lại cùng bot.','After restarting the machine, pressing <b>"1 - KHOI DONG BOT"</b> brings computer control back up along with the bot.')}</p>
    `,
    okText: t('Đã hiểu','Got it'),
    okDanger: false,
    hideCancel: true,
    onConfirm: () => { state.confirmModal = null; render(); },
  };
}

// "Later" is a snooze, not a refusal. The first cut stored the dismissal forever, so one stray
// click on "Để sau" - by the owner, by whoever was at the keyboard - retired the prompt on that
// machine for good and the project stayed on Docker with nothing left to say so. Come back after
// this long instead.
const NATIVE_OFFER_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function nativeOfferSnoozed(dir) {
  try {
    const at = Number(localStorage.getItem('openclaw-native-offer:' + dir) || 0);
    return at > 0 && (Date.now() - at) < NATIVE_OFFER_SNOOZE_MS;
  } catch (_) { return false; }  // private window: just ask
}

/**
 * Offer the move off Docker when we can see a project is still on it.
 *
 * Relying on the operator to press "Update" does not work: nothing on screen says that Update is
 * ALSO the migration, so a machine sits on Docker indefinitely. And it cannot sit there safely -
 * OpenClaw 2026.9 cannot write its own settings through a Docker shared folder on Windows, so the
 * next image rebuild takes the bot down for good. Say that plainly, show what is gained, and make
 * the move one button.
 *
 * The automatic offer is snoozed once dismissed - a prompt that returns on every page load is a
 * prompt people learn to dismiss without reading. `force` is the button in Settings: an operator
 * who went looking for the move is never told to come back in three days.
 */
function openNativeMigrationModal(dir, { force = false } = {}) {
  if (!dir) return false;
  const key = 'openclaw-native-offer:' + dir;
  if (!force && nativeOfferSnoozed(dir)) return false;
  if (state.confirmModal) return false;    // never stack on top of another dialog
  const rows = [
    ['🖥️', t('Bot điều khiển được máy này', 'Your bot can drive this machine'),
      t('Chụp màn hình, rê chuột, bấm, gõ phím. Bản Docker không làm được vì bot nằm trong container, không thấy màn hình.',
        'Screenshots, mouse, clicks, typing. Docker cannot do this: the bot sits in a container and never sees your screen.')],
    ['🛡️', t('Tránh được lỗi làm chết bot', 'Avoids the fault that kills bots'),
      t('OpenClaw bản mới không ghi được cấu hình qua thư mục chia sẻ của Docker trên Windows. Cứ dựng lại image một lần là bot chết hẳn.',
        'Recent OpenClaw cannot write its settings through a Docker shared folder on Windows. One image rebuild and the bot is gone.')],
    ['⚡', t('Nhẹ và nhanh hơn', 'Lighter and faster'),
      t('Không cần Docker Desktop chạy nền, bot khởi động nhanh hơn và ăn ít RAM hơn.',
        'No Docker Desktop running in the background, faster start-up and less RAM.')],
    ['🔒', t('An toàn như cũ', 'Just as safe'),
      t('Bot vẫn chỉ nghe trên máy này, không mở ra ngoài internet. Quyền điều khiển máy vẫn mặc định TẮT.',
        'The bot still listens on this machine only, never the open internet. Computer control stays OFF by default.')],
  ];
  state.confirmModal = {
    icon: '📦',
    eyebrow: t('Chuyển sang chạy thẳng trên máy', 'Move off Docker'),
    title: t('Bot đang chạy trong Docker', 'This bot still runs in Docker'),
    message: t('Chuyển sang chạy thẳng trên máy được không? Toàn bộ bot, tệp trong thư mục làm việc và phiên đăng nhập Zalo giữ nguyên.',
               'Move it to run directly on this machine? Every bot, every workspace file and every Zalo login comes with it.'),
    bodyHtml: `
      <ul class="cu-status grant-list">${rows.map(([i, ttl, d]) =>
        `<li><span aria-hidden="true">${i}</span><div><b>${ttl}</b><br>${d}</div></li>`).join('')}</ul>
      <p class="cu-note">${t('Mất khoảng <b>5-15 phút</b> tuỳ số plugin đã cài (đo trên máy thật: 350MB plugin mất ~8 phút chỉ riêng bước chép). Bot ngừng trả lời trong lúc đó, và đừng tắt cửa sổ này giữa chừng. Container cũ chỉ được <b>dừng</b> chứ không xoá, nên vẫn có đường quay lui.',
                             'Takes <b>5-15 minutes</b> depending on how many plugins are installed (measured: 350MB of plugins took ~8 minutes to copy alone). The bot stops replying meanwhile, and this window must stay open. The old containers are <b>stopped</b>, not deleted, so there is a way back.')}</p>`,
    okText: t('Chuyển ngay', 'Move now'),
    cancelText: t('Để sau', 'Later'),
    onCancel: () => {
      // "Later" means later, not never - but stop asking on this machine.
      try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
      state.confirmModal = null;
      render();
    },
    onConfirm: async () => {
      try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
      state.confirmModal = null;
      render();
      showToast(t('Đang chuyển sang chạy thẳng trên máy', 'Moving off Docker'),
                t('Giữ cửa sổ này mở. Xem tiến trình ở tab Nhật ký.', 'Keep this window open. Watch the Log tab for progress.'));
      // The move can be started from any project's card, not only the connected one - follow the
      // project being moved, or the status we refresh below describes a different machine corner.
      state.selectedProjectDir = dir;
      state.tab = 'logs';
      render();
      try {
        await api('/api/runtime/update', { method: 'POST', body: { projectDir: dir, target: 'openclaw' } });
        await loadSystem(true);
        await loadStatus(true);
        showToast(t('Đã chuyển xong', 'Moved'), t('Bot giờ chạy thẳng trên máy này.', 'The bot now runs directly on this machine.'));
      } catch (err) {
        showToast(t('Chuyển không xong', 'Move failed'), err.message, 'error');
      }
      render();
    },
  };
  render();
  return true;
}

/**
 * The automatic half of the offer: fires off the status refresh, for the project the UI is
 * currently pointed at. Every other docker project on the machine is reachable through the
 * "Chuyển sang Native" button on its card in Settings.
 */
function maybeOfferNativeMigration() {
  const s = state.install || {};
  if (s.deployMode !== 'docker') return;
  openNativeMigrationModal(s.projectDir || '');
}

async function pickFolderPathShared() {
  try {
    const picked = await api('/api/project/pick-folder', { method: 'POST', body: {} });
    const projectDir = String(picked.projectDir || '').trim();
    if (projectDir) return { projectDir };
  } catch (err) {
    return new Promise((resolve) => {
      openPathModal({
        title: t('Nhập đường dẫn project', 'Enter project path'),
        message: t('Vui lòng nhập đường dẫn tuyệt đối đến thư mục project (ví dụ: /Users/mac/my-bot)', 'Please enter the absolute path to your project directory (e.g. /Users/mac/my-bot)'),
        value: state.install?.projectDir || '',
        placeholder: state.os === 'macos' ? '/Users/your-name/my-bot' : '/home/your-name/my-bot',
        onConfirm: (val) => resolve({ projectDir: val }),
        onCancel: () => resolve(null)
      });
    });
  }
  return null;
}

// true when `a` is a strictly newer semver than `b` (numeric dot parts)
function isVersionNewer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

// Build a URL on the SAME host the dashboard is currently viewed from, so "Open" works
// whether you reached it via a localhost tunnel, the server's IP, or a domain - and never
// points at the viewer's own localhost when browsing from another machine. Port comes from
// the backend-provided URL (which carries the right port) or the fallback.
// The router card links to the hosted router as-is; a local 9Router is rewritten onto the host the
// UI was opened from (same as the other local services, so SSH tunnels keep working).
function routerHref(s = {}) {
  return s.routerRemote && s.routerUrl ? s.routerUrl : sameHostUrl(s.routerUrl, 20128);
}

function sameHostUrl(rawUrl, fallbackPort) {
  let port = fallbackPort;
  try { const u = new URL(rawUrl); if (u.port) port = u.port; } catch {}
  const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'https:' : 'http:';
  const host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '127.0.0.1';
  return `${proto}//${host}:${port}`;
}

// "Open from another machine" helper - builds a ready SSH-tunnel command (auto-filled
// with the server's public IP + the dashboard/gateway/9router/zalo-mod ports) so any user
// on a VPS can reach the web UIs from their own computer without knowing how to set it up.


// ── Admin console shell ─────────────────────────────────────────────────
// Pages of the console. Old tab ids (dashboard/bot/setup/settings) still arrive from deep links
// and older handlers, so they are folded into the new ones here.
const TAB_ALIASES = { dashboard: 'overview', bot: 'agents', setup: 'config', settings: 'config', skills: 'tools', files: 'agents' };
const PAGES = {
  overview: { group: '', icon: 'overview', vi: 'Tổng quan', en: 'Overview', descVi: 'Tin nhắn có đi trọn đường không, máy chủ còn khoẻ không, vừa xảy ra gì.', descEn: 'Whether messages get through, how the server is doing, and what just happened.' },
  agents: { group: 'ops', icon: 'agent', vi: 'Agent', en: 'Agents', descVi: 'Tạo, sửa và theo dõi từng bot. Chọn một bot để sửa tính cách và quy tắc của nó.', descEn: 'Create, edit and watch each bot. Pick a bot to edit its personality and rules.' },
  zalo: { group: 'ops', icon: 'zalo', vi: 'Tài khoản Zalo', en: 'Zalo accounts', descVi: 'Đăng nhập Zalo cá nhân bằng QR và theo dõi kết nối của từng bot Zalo.', descEn: 'Sign personal Zalo in with a QR code and watch each Zalo bot’s connection.' },
  tools: { group: 'ops', icon: 'tools', vi: 'Công cụ', en: 'Tools', descVi: 'Bật kỹ năng và plugin cho từng bot.', descEn: 'Turn skills and plugins on for each bot.' },
  logs: { group: 'sys', icon: 'logs', vi: 'Nhật ký', en: 'Logs', descVi: 'Hoạt động của Setup và bot theo thời gian thực.', descEn: 'Setup and bot activity as it happens.' },
  config: { group: 'sys', icon: 'config', vi: 'Cấu hình', en: 'Settings', descVi: 'Project, router AI, bảo mật, giao diện và phiên bản.', descEn: 'Project, AI router, security, appearance and versions.' },
};
const NAV_GROUPS = [['', ''], ['ops', ['Vận hành', 'Operations']], ['sys', ['Hệ thống', 'System']]];
const CHANNEL_LABELS = { telegram: 'Telegram', 'zalo-personal': 'Zalo cá nhân', 'zalo-bot': 'Zalo Bot API', 'fb-messenger': 'Messenger' };

function normTab(tab) {
  const id = TAB_ALIASES[tab] || tab;
  return PAGES[id] ? id : 'overview';
}
function pageTitle(id = state.tab) { const p = PAGES[normTab(id)]; return t(p.vi, p.en); }
function isLocalBrowser() { return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname); }
function channelLabel(id) { return CHANNEL_LABELS[id] || id || '-'; }
function channelIcon(id) { return (BOT_CHANNELS.find((c) => c.id === id) || {}).icon || ''; }
function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '-';
  const gb = n / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(gb >= 100 ? 0 : 1)} GB` : `${Math.round(n / (1024 ** 2))} MB`;
}
function fmtUptime(sec) {
  if (!Number.isFinite(sec)) return '-';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return t(`${d} ngày ${h} giờ`, `${d}d ${h}h`);
  if (h) return t(`${h} giờ ${m} phút`, `${h}h ${m}m`);
  return t(`${m} phút`, `${m}m`);
}
function badge(tone, text) { return `<span class="badge ${tone}">${escapeHtml(text)}</span>`; }
function statusBadge(v) {
  if (v === 'online') return badge('ok', t('Đang chạy', 'Running'));
  if (v === 'unknown' || !v) return badge('warn', t('Chưa rõ', 'Unknown'));
  return badge('bad', t('Không chạy', 'Down'));
}
function botAvatar(bot) {
  if (bot?.emoji) return `<span class="avatar" aria-hidden="true">${escapeHtml(bot.emoji)}</span>`;
  const icon = channelIcon(bot?.channel);
  return `<span class="avatar" aria-hidden="true">${icon ? `<img src="${icon}" alt="" onerror="this.remove()"/>` : '🤖'}</span>`;
}

function navIcon(name) {
  const d = {
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    agent: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3" r="1"/><path d="M9 13h.01M15 13h.01"/><path d="M9.5 17h5"/>',
    zalo: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 9h7l-7 4h7"/>',
    tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18v3h3l6.4-6.3a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.8-.4-.4-2.8z"/>',
    logs: '<path d="M8 6h13M8 12h13M8 18h9"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    restart: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  }[name] || '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

function sidebarHtml() {
  const s = state.install || {};
  const sys = state.system || {};
  const bots = s.bots || [];
  const zaloCount = bots.filter((b) => b.channel === 'zalo-personal' || b.channel === 'zalo-bot').length;
  const gwTone = s.gatewayStatus === 'online' ? 'is-ok' : s.projectDir ? 'is-bad' : '';
  const projectName = s.projectDir ? fileBaseName(s.projectDir) : t('Chưa có project', 'No project yet');
  const projectSub = s.projectDir
    ? t(`${bots.length} bot, gateway ${s.gatewayStatus === 'online' ? 'đang chạy' : 'đang tắt'}`, `${bots.length} bots, gateway ${s.gatewayStatus === 'online' ? 'running' : 'stopped'}`)
    : t('Tạo hoặc kết nối project', 'Create or connect one');
  const counts = { agents: bots.length, zalo: zaloCount };
  const nav = NAV_GROUPS.map(([gid, label]) => {
    const items = Object.entries(PAGES).filter(([, p]) => p.group === gid).map(([id, p]) => `
      <button class="ax-nav__item ${state.tab === id ? 'is-active' : ''}" type="button" data-nav-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}>
        ${navIcon(p.icon)}<span>${t(p.vi, p.en)}</span>${counts[id] ? `<span class="ax-nav__count">${counts[id]}</span>` : ''}
      </button>`).join('');
    return `${label ? `<p class="ax-nav__group">${t(label[0], label[1])}</p>` : ''}${items}`;
  }).join('');
  const canLogout = !!(sys.auth && sys.auth.configured && sys.auth.required);
  return `
    <div class="ax-brand"><img src="/aivio-logo.svg" alt=""/><div><b>Học Viện Đào Tạo AI</b><span>${t('Quản lý bot', 'Bot console')}</span></div></div>
    <button class="ax-project" type="button" data-nav-tab="config" title="${escapeHtml(s.projectDir || '')}">
      <span class="ax-project__dot ${gwTone}"></span>
      <span class="ax-project__text"><b>${escapeHtml(projectName)}</b><small>${escapeHtml(projectSub)}</small></span>
    </button>
    <nav class="ax-nav" aria-label="${t('Điều hướng', 'Navigation')}">${nav}</nav>
    <div class="ax-side__foot">
      <div class="ax-side__meta"><span>v${escapeHtml(sys.versions?.setup || '…')}</span><span>${escapeHtml(sys.hostname || '')}</span></div>
      ${canLogout ? `<button class="ax-nav__item" type="button" data-logout>${navIcon('logout')}<span>${t('Đăng xuất', 'Sign out')}</span></button>` : ''}
    </div>`;
}

function headToolsHtml() {
  const setupVer = state.system?.versions?.setup;
  const latest = state.system?.versions?.latestSetup;
  const hasNew = !!(setupVer && latest && isVersionNewer(latest, setupVer));
  return `
    ${hasNew ? `<button class="btn btn-sm" type="button" data-update-setup title="${escapeHtml(t(`Đang dùng ${setupVer}`, `Currently ${setupVer}`))}">${actionIcon('refresh')}<span>${t('Cập nhật', 'Update to')} ${escapeHtml(latest)}</span></button>` : ''}
    <div class="seg" role="group" aria-label="${t('Giao diện', 'Theme')}">
      <button class="seg__btn ${state.theme === 'light' ? 'is-active' : ''}" type="button" data-pref="theme" data-value="light">${t('Sáng', 'Light')}</button>
      <button class="seg__btn ${state.theme === 'dark' ? 'is-active' : ''}" type="button" data-pref="theme" data-value="dark">${t('Tối', 'Dark')}</button>
    </div>
    <div class="seg" role="group" aria-label="${t('Ngôn ngữ', 'Language')}">
      <button class="seg__btn ${state.lang === 'vi' ? 'is-active' : ''}" type="button" data-pref="lang" data-value="vi">VI</button>
      <button class="seg__btn ${state.lang === 'en' ? 'is-active' : ''}" type="button" data-pref="lang" data-value="en">EN</button>
    </div>`;
}

function pageHeadHtml() {
  const p = PAGES[state.tab];
  const crumb = p.group ? `${t(...NAV_GROUPS.find(([g]) => g === p.group)[1])} / ${t(p.vi, p.en)}` : t('Bảng điều khiển', 'Console');
  return `<header class="ax-head">
    <div><p class="ax-crumb">${escapeHtml(crumb)}</p><h1>${escapeHtml(t(p.vi, p.en))}</h1><p class="ax-desc">${escapeHtml(t(p.descVi, p.descEn))}</p></div>
    <div class="ax-head__tools">${headToolsHtml()}</div>
  </header>`;
}

function render() {
  state.tab = normTab(state.tab);
  applyPrefs();
  document.body.dataset.activeTab = state.tab;
  document.title = `${pageTitle()} — Học Viện Đào Tạo AI`;
  if (location.hash.slice(1) !== state.tab) history.replaceState(null, '', `#${state.tab}`);

  let main = $('#app-main-content');
  if (!main) {
    $('#app').innerHTML = `
      <div class="ax-app">
        <aside class="ax-side" id="ax-side"></aside>
        <div class="ax-scrim" data-nav-close></div>
        <div class="ax-body">
          <div class="ax-topbar">
            <button class="icon-btn" type="button" data-nav-open aria-label="${t('Mở menu', 'Open menu')}" aria-controls="ax-side">${navIcon('menu')}</button>
            <b id="ax-topbar-title"></b>
            <button class="icon-btn" type="button" data-pref="theme" data-value="${state.theme === 'dark' ? 'light' : 'dark'}" aria-label="${t('Đổi giao diện sáng/tối', 'Toggle theme')}">${navIcon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
          </div>
          <main class="ax-main" id="app-main-content"></main>
        </div>
      </div>
      <div id="modal-container"></div>`;
    main = $('#app-main-content');
  }
  $('#ax-side').innerHTML = sidebarHtml();
  const topTitle = $('#ax-topbar-title');
  if (topTitle) topTitle.textContent = pageTitle();
  main.innerHTML = `${pageHeadHtml()}<div class="ax-content">${content()}</div>`;

  const modalContainer = $('#modal-container');
  if (modalContainer) {
    const modalSig = JSON.stringify({ bm: state.botModalOpen, be: state.botEditId, msg: state.botMessage, bc: state.botChannel, cm: state.confirmModal, pm: state.pathModal, zl: state.zaloLoginOpen, zq: state.zaloQrDataUrl, zll: state.zaloLoginLines, im: state.installModalOpen, fp: state.fbPluginModalOpen, it: state.installTab, idr: state.installDraft, lang: state.lang });
    if (modalContainer.dataset.sig !== modalSig) {
      modalContainer.innerHTML = `${botCreateModal()}${confirmModal()}${pathModal()}${zaloLoginModal()}${installModal()}${fbPluginModal()}`;
      modalContainer.dataset.sig = modalSig;
    }
  }
  wireShell();
  wireTab();
}

function content() {
  if (state.tab === 'overview') return overviewView();
  if (state.tab === 'agents') return agentsView();
  if (state.tab === 'zalo') return zaloView();
  if (state.tab === 'tools') return toolsView();
  if (state.tab === 'logs') return logsView();
  return configView();
}

async function setTab(id) {
  state.tab = normTab(id);
  document.body.classList.remove('nav-open');
  render();
  window.scrollTo({ top: 0 });
  const loaders = {
    overview: () => Promise.allSettled([loadStatus(true), loadMetrics()]),
    agents: () => loadStatus(true).then(() => loadFiles(true)),
    zalo: () => Promise.allSettled([loadStatus(true), loadZaloHealth(true)]),
    tools: () => Promise.allSettled([loadCatalog(true), loadFeatureFlags(true)]),
    config: () => Promise.allSettled([loadSystem(true), loadStatus(true)]),
  }[state.tab];
  if (loaders) { await loaders(); if (state.tab === id || state.tab === normTab(id)) render(); }
}

function wireShell() {
  document.querySelectorAll('[data-nav-tab]').forEach((btn) => { btn.onclick = () => setTab(btn.dataset.navTab); });
  document.querySelectorAll('[data-nav-open]').forEach((btn) => { btn.onclick = () => document.body.classList.add('nav-open'); });
  document.querySelectorAll('[data-nav-close]').forEach((el) => { el.onclick = () => document.body.classList.remove('nav-open'); });
  document.querySelectorAll('[data-logout]').forEach((btn) => btn.onclick = () => withButtonLoading(btn, async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    location.replace('/login');
  }));
  document.querySelectorAll('[data-create-bot]').forEach((btn) => btn.onclick = () => {
    state.botChannel = btn.dataset.createBot || state.botChannel || 'telegram';
    state.botEditId = ''; state.botMessage = ''; state.botModalOpen = true;
    render();
  });
  document.querySelectorAll('[data-open-install]').forEach((btn) => { btn.onclick = openInstallModal; });
  document.querySelectorAll('[data-agent-filter]').forEach((btn) => btn.onclick = () => { state.agentFilter = btn.dataset.agentFilter; render(); });
  const toolsBot = $('#tools-bot');
  if (toolsBot) toolsBot.onchange = async () => {
    const bot = (state.install?.bots || []).find((b) => b.id === toolsBot.value);
    if (!bot) return;
    state.activeBotId = bot.id; state.botChannel = bot.channel;
    await loadFeatureFlags(true);
    render();
  };
  const logFilter = $('#log-filter');
  if (logFilter) {
    logFilter.oninput = () => { state.logFilter = logFilter.value; applyLogFilter(); };
    applyLogFilter();
  }
  const pwForm = $('#password-form');
  if (pwForm) pwForm.onsubmit = (ev) => {
    ev.preventDefault();
    const submitBtn = pwForm.querySelector('button[type="submit"]');
    const msg = pwForm.querySelector('[data-pw-msg]');
    const setMsg = (text, ok) => { msg.textContent = text; msg.className = `form-msg ${ok ? 'is-ok' : 'is-bad'}`; };
    const next = pwForm.newPassword.value;
    if (next !== pwForm.confirmPassword.value) return setMsg(t('Hai lần nhập mật khẩu mới không khớp.', 'The new passwords do not match.'), false);
    withButtonLoading(submitBtn, async () => {
      try {
        await api('/api/auth/password', { method: 'POST', body: { currentPassword: pwForm.currentPassword?.value || '', newPassword: next } });
        pwForm.reset();
        setMsg(t('Đã lưu mật khẩu. Các thiết bị khác cần đăng nhập lại.', 'Password saved. Other devices must sign in again.'), true);
        await loadSystem(true);
      } catch (err) {
        setMsg(err.message, false);
      }
    });
  };
  if (state.tab === 'overview') scheduleMetrics();
}

// Escape closes the menu drawer, then the topmost dialog.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); return; }
  if (state.confirmModal) state.confirmModal = null;
  else if (state.pathModal) state.pathModal = null;
  else if (state.fbPluginModalOpen) state.fbPluginModalOpen = false;
  else if (state.zaloLoginOpen) { api('/api/zalo/login/cancel', { method: 'POST' }).catch(() => {}); state.zaloLoginOpen = false; }
  else if (state.botModalOpen) state.botModalOpen = false;
  else if (state.installModalOpen) state.installModalOpen = false;
  else return;
  render();
});
window.addEventListener('hashchange', () => { const id = normTab(location.hash.slice(1)); if (id !== state.tab) setTab(id); });

// ── Overview ────────────────────────────────────────────────────────────
let metricsTimer = null;
async function loadMetrics() {
  try { state.metrics = await api('/api/host/metrics'); } catch { state.metrics = state.metrics || null; }
}
function scheduleMetrics() {
  clearTimeout(metricsTimer);
  metricsTimer = setTimeout(async () => {
    if (state.tab !== 'overview') return;
    if (!document.hidden) {
      await loadMetrics();
      const el = $('#metrics-panel');
      if (el) el.outerHTML = metricsPanel();
    }
    scheduleMetrics();
  }, 15000);
}

function messagePath(s) {
  const bots = s.bots || [];
  const key = !!(s.credentials || {}).nineRouterApiKey;
  const gwOk = s.gatewayStatus === 'online';
  const routerOk = s.routerStatus === 'online';
  const zaloDown = bots.filter((b) => b.channel === 'zalo-personal').filter((b) => zaloHealthBadges(b).connectionTone === 'bad').length;
  const byChannel = Object.keys(CHANNEL_LABELS).map((id) => [id, bots.filter((b) => b.channel === id).length]).filter(([, n]) => n);
  const channels = {
    tone: !bots.length ? 'is-warn' : zaloDown ? 'is-warn' : 'is-ok',
    value: t(`${bots.length} bot`, `${bots.length} ${bots.length === 1 ? 'bot' : 'bots'}`),
    note: !bots.length ? t('Chưa có bot nào nhận tin.', 'No bot is receiving messages yet.')
      : zaloDown ? t(`${zaloDown} bot Zalo cá nhân đang mất kết nối.`, `${zaloDown} personal Zalo bot(s) disconnected.`)
      : byChannel.map(([id, n]) => `${channelLabel(id)} ${n}`).join(', '),
    action: !bots.length ? `<button class="btn btn-sm btn-primary" type="button" data-create-bot="telegram">${navIcon('plus')}<span>${t('Tạo bot', 'Create bot')}</span></button>`
      : zaloDown ? `<button class="btn btn-sm" type="button" data-nav-tab="zalo">${t('Xem tài khoản Zalo', 'Open Zalo accounts')}</button>`
      : `<button class="btn btn-sm" type="button" data-nav-tab="agents">${t('Xem bot', 'View bots')}</button>`,
  };
  const gateway = {
    tone: gwOk ? 'is-ok' : s.gatewayStatus === 'unknown' ? 'is-warn' : 'is-bad',
    value: gwOk ? t('Đang chạy', 'Running') : t('Không chạy', 'Down'),
    note: gwOk ? t(`Nhận tin từ các kênh và gọi AI. Cổng ${portFromUrl(s.gatewayUrl, 18789)}.`, `Receives messages and calls the AI. Port ${portFromUrl(s.gatewayUrl, 18789)}.`)
      : t('Bot không trả lời được khi gateway tắt.', 'Bots cannot reply while the gateway is down.'),
    action: `<button class="btn btn-sm ${gwOk ? '' : 'btn-primary'}" type="button" data-bot-restart>${navIcon('restart')}<span>${t('Khởi động lại', 'Restart')}</span></button>`,
  };
  const routerName = s.routerRemote ? 'HVDTAI Router' : '9Router';
  const router = {
    tone: routerOk && key ? 'is-ok' : routerOk ? 'is-warn' : 'is-bad',
    value: routerOk ? t('Đang chạy', 'Running') : t('Không kết nối được', 'Unreachable'),
    note: !key ? t('Chưa có API key, bot sẽ không gọi được AI.', 'No API key yet, bots cannot call the AI.')
      : t(`Model ${s.activeModel || 'smart-route'} qua ${routerName}.`, `Model ${s.activeModel || 'smart-route'} via ${routerName}.`),
    action: `<button class="btn btn-sm ${key ? '' : 'btn-primary'}" type="button" data-router-key>${actionIcon('key')}<span>${key ? t('Đổi key', 'Change key') : t('Nhập key', 'Set key')}</span></button>`,
  };
  const link1 = !bots.length ? 'is-unknown' : gwOk ? '' : 'is-broken';
  const link2 = routerOk && key ? '' : 'is-broken';
  let caption;
  if (!s.projectDir) caption = t('Chưa có project. Tạo project ở mục Cấu hình để bắt đầu.', 'No project yet. Create one in Settings to get started.');
  else if (!gwOk) caption = t('Tin nhắn đang dừng ở OpenClaw: gateway không chạy. Bấm Khởi động lại rồi xem Nhật ký nếu vẫn lỗi.', 'Messages stop at OpenClaw: the gateway is down. Restart it, then check Logs if it stays down.');
  else if (!key) caption = t('Tin nhắn tới được OpenClaw nhưng dừng trước router vì chưa có API key.', 'Messages reach OpenClaw but stop before the router: no API key.');
  else if (!routerOk) caption = t(`Tin nhắn dừng ở ${routerName}: máy chủ không kết nối được tới router.`, `Messages stop at ${routerName}: this server cannot reach the router.`);
  else if (!bots.length) caption = t('Đường đi đã sẵn sàng. Tạo bot đầu tiên để bắt đầu nhận tin.', 'The path is ready. Create your first bot to start receiving messages.');
  else caption = t('Tin nhắn đi trọn đường: kênh chat, OpenClaw, rồi tới router AI.', 'Messages go all the way: chat channel, OpenClaw, then the AI router.');
  const node = (label, n) => `<div class="rail__node ${n.tone}"><div class="rail__label">${label}</div><div class="rail__value">${escapeHtml(n.value)}</div><p class="rail__note">${escapeHtml(n.note)}</p>${n.action}</div>`;
  return `<section aria-label="${t('Đường đi của tin nhắn', 'Message path')}">
    <div class="rail">
      ${node(t('Kênh chat', 'Chat channels'), channels)}
      <div class="rail__link ${link1}" aria-hidden="true"><span>${t('tin nhắn', 'message')}</span></div>
      ${node('OpenClaw Gateway', gateway)}
      <div class="rail__link ${link2}" aria-hidden="true"><span>HTTPS</span></div>
      ${node(routerName, router)}
    </div>
    <p class="rail__caption">${escapeHtml(caption)}</p>
  </section>`;
}

function portFromUrl(raw, def) { try { return new URL(raw).port || def; } catch { return def; } }

function metricsPanel() {
  const m = state.metrics;
  const bar = (pct) => `<div class="meter__bar"><i class="${pct >= 90 ? 'is-critical' : pct >= 75 ? 'is-high' : ''}" style="width:${Math.max(2, Math.min(100, pct || 0))}%"></i></div>`;
  const body = !m ? `<p class="muted">${t('Đang đo…', 'Measuring…')}</p>` : `
    <div class="meter"><div class="meter__top"><b>CPU</b><span>${m.cpu.percent}% ${t('trên', 'of')} ${m.cpu.cores} ${t('lõi', 'cores')}</span></div>${bar(m.cpu.percent)}</div>
    <div class="meter"><div class="meter__top"><b>RAM</b><span>${fmtBytes(m.memory.used)} / ${fmtBytes(m.memory.total)}</span></div>${bar(m.memory.percent)}</div>
    ${m.disk ? `<div class="meter"><div class="meter__top"><b>${t('Ổ đĩa', 'Disk')}</b><span>${fmtBytes(m.disk.used)} / ${fmtBytes(m.disk.total)}</span></div>${bar(m.disk.percent)}</div>` : ''}
    <p class="hint">${t('Máy', 'Host')} ${escapeHtml(m.hostname)}, ${t('chạy liên tục', 'up for')} ${fmtUptime(m.uptimeSec)}. ${t('Cập nhật mỗi 15 giây.', 'Refreshes every 15 seconds.')}</p>`;
  return `<section class="panel" id="metrics-panel"><div class="panel__head"><div><h2>${t('Máy chủ', 'Server')}</h2></div></div>${body}</section>`;
}

function overviewView() {
  const s = state.install || {};
  const sys = state.system || {};
  if (!s.projectDir) {
    return `${messagePath(s)}
      <div class="empty"><b>${t('Chưa có project nào', 'No project yet')}</b>${t('Tạo project để cài OpenClaw, hoặc kết nối một project có sẵn trên máy này.', 'Create a project to install OpenClaw, or connect one that already exists on this machine.')}<div class="row" style="justify-content:center"><button class="btn btn-primary" type="button" data-open-install>${navIcon('plus')}<span>${t('Tạo project', 'Create project')}</span></button><button class="btn" type="button" data-nav-tab="config">${t('Kết nối project có sẵn', 'Connect existing project')}</button></div></div>
      ${metricsPanel()}`;
  }
  const openclawVer = String(s.runtimeVersions?.openclaw || sys.versions?.currentOpenclaw || sys.versions?.openclaw || '-').replace(/^openclaw@/, '');
  const nodeVer = String(s.runtimeVersions?.node || sys.versions?.currentNode || '-').replace(/^v/, '');
  const osLabel = { win: 'Windows', macos: 'macOS', linux: 'Linux', vps: 'Linux VPS' }[sys.os] || sys.platform || '-';
  const facts = [
    [t('Project', 'Project'), fileBaseName(s.projectDir), s.projectDir],
    [t('Model AI', 'AI model'), s.activeModel || 'smart-route', s.activeProvider || ''],
    ['OpenClaw', openclawVer, `Node ${nodeVer}`],
    [t('Máy chủ', 'Server'), sys.hostname || '-', `${osLabel} ${sys.arch || ''}`.trim()],
  ];
  const tail = state.logs.slice(-40);
  return `${messagePath(s)}
    <section class="panel panel--flush"><div class="facts">${facts.map(([k, v, sub]) => `<div class="fact"><span>${escapeHtml(k)}</span><b title="${escapeHtml(v)}">${escapeHtml(v)}</b><small title="${escapeHtml(sub)}">${escapeHtml(sub)}</small></div>`).join('')}</div></section>
    <div class="grid-2">
      ${metricsPanel()}
      <section class="panel"><div class="panel__head"><div><h2>${t('Hoạt động gần đây', 'Recent activity')}</h2></div><button class="btn btn-sm btn-ghost" type="button" data-nav-tab="logs">${t('Xem toàn bộ', 'View all')}</button></div>
        <div class="terminal terminal--short live-log-terminal">${tail.length ? tail.map((l) => logLineHtml(l)).join('') : `<p class="is-placeholder">${t('Chưa có hoạt động nào.', 'No activity yet.')}</p>`}</div>
      </section>
    </div>`;
}

// ── Agents ──────────────────────────────────────────────────────────────
function agentRow(b, { selectable = true } = {}) {
  const role = (b.role || b.desc || b.description || '').trim() || t('Trợ lý OpenClaw', 'OpenClaw assistant');
  const isZalo = b.channel === 'zalo-personal';
  const h = zaloHealthBadges(b);
  const health = isZalo ? `<span class="zalo-bot-health row" style="margin-top:6px"><em class="badge ${h.connectionTone}">${escapeHtml(h.connection)}</em><em class="badge ${h.loginTone}">${escapeHtml(h.login)}</em></span>` : '';
  return `<button class="list__row bot-item ${selectable && state.activeBotId === b.id ? 'is-active' : ''}" type="button" data-bot-id="${escapeHtml(b.id)}">
    ${botAvatar(b)}
    <span class="list__main"><b>${escapeHtml(b.name || b.id)}</b><small title="${escapeHtml(role)}">${escapeHtml(role)}</small>${health}</span>
    <span class="list__side"><span class="badge plain">${escapeHtml(channelLabel(b.channel))}</span></span>
  </button>`;
}

function agentsView() {
  const s = state.install || {};
  const bots = s.bots || [];
  if (!s.projectDir) return `<div class="empty"><b>${t('Chưa có project', 'No project yet')}</b>${t('Bot sống trong một project. Tạo hoặc kết nối project trước.', 'Bots live inside a project. Create or connect one first.')}<div><button class="btn btn-primary" type="button" data-open-install>${t('Tạo project', 'Create project')}</button></div></div>`;
  if (!bots.length) return `<div class="empty"><b>${t('Chưa có bot nào', 'No bots yet')}</b>${t('Tạo bot đầu tiên, chọn kênh Telegram, Zalo hoặc Messenger.', 'Create your first bot and pick Telegram, Zalo or Messenger.')}<div><button class="btn btn-primary" type="button" data-bot-modal="open">${navIcon('plus')}<span>${t('Tạo bot', 'Create bot')}</span></button></div></div>`;
  const filter = state.agentFilter || 'all';
  const channels = Object.keys(CHANNEL_LABELS).filter((id) => bots.some((b) => b.channel === id));
  const shown = filter === 'all' ? bots : bots.filter((b) => b.channel === filter);
  const bot = currentBot() || shown[0] || bots[0];
  if (bot && state.activeBotId !== bot.id) { state.activeBotId = bot.id; state.botChannel = bot.channel; }
  const role = (bot.role || '').trim() || t('Trợ lý OpenClaw', 'OpenClaw assistant');
  return `<div class="agent-layout">
    <section class="panel panel--flush">
      <div style="padding:16px 16px 12px">
        <div class="panel__head" style="margin-bottom:10px"><h2>${t('Danh sách bot', 'Bots')}</h2><button class="btn btn-sm btn-primary" type="button" data-bot-modal="open">${navIcon('plus')}<span>${t('Tạo bot', 'Create bot')}</span></button></div>
        <div class="chips" role="group" aria-label="${t('Lọc theo kênh', 'Filter by channel')}">
          <button class="chip ${filter === 'all' ? 'is-active' : ''}" type="button" data-agent-filter="all">${t('Tất cả', 'All')} <b>${bots.length}</b></button>
          ${channels.map((id) => `<button class="chip ${filter === id ? 'is-active' : ''}" type="button" data-agent-filter="${id}">${escapeHtml(channelLabel(id))} <b>${bots.filter((b) => b.channel === id).length}</b></button>`).join('')}
        </div>
      </div>
      <div class="list">${shown.map((b) => agentRow(b)).join('')}</div>
    </section>
    <section class="panel">
      <div class="agent-detail__head">
        ${botAvatar(bot)}
        <div class="agent-detail__title"><h2>${escapeHtml(bot.name || bot.id)}</h2><p>${escapeHtml(role)}</p></div>
        <div class="row">
          <button class="btn btn-sm" type="button" data-edit-bot="${escapeHtml(bot.id)}">${actionIcon('edit')}<span>${t('Sửa', 'Edit')}</span></button>
          <button class="btn btn-sm" type="button" data-bot-restart>${navIcon('restart')}<span>${t('Khởi động lại', 'Restart')}</span></button>
          <button class="btn btn-sm btn-ghost" type="button" data-delete-bot="${escapeHtml(bot.id)}" aria-label="${t('Xoá bot', 'Delete bot')}">${actionIcon('trash')}<span>${t('Xoá', 'Delete')}</span></button>
        </div>
      </div>
      <dl class="kv" style="margin:16px 0 18px">
        <dt>${t('Kênh', 'Channel')}</dt><dd>${escapeHtml(channelLabel(bot.channel))}</dd>
        <dt>ID</dt><dd><code>${escapeHtml(bot.id)}</code></dd>
        ${bot.userName ? `<dt>${t('Chủ sở hữu', 'Owner')}</dt><dd>${escapeHtml(bot.userName)}</dd>` : ''}
      </dl>
      <hr class="divider"/>
      <div class="bot-files-panel">${botFilesPanel()}</div>
    </section>
  </div>`;
}

// ── Zalo accounts ───────────────────────────────────────────────────────
function zaloView() {
  const s = state.install || {};
  const bots = s.bots || [];
  const personal = bots.filter((b) => b.channel === 'zalo-personal');
  const official = bots.filter((b) => b.channel === 'zalo-bot');
  const zh = state.zaloHealth || {};
  const gwPort = Number(portFromUrl(s.gatewayUrl, 18789));
  const personalActive = personal.find((b) => b.id === state.activeBotId) || personal[0];
  const loginLabel = zaloAccountHealth(personalActive)?.sessionSaved ? t('Đăng nhập lại', 'Sign in again') : t('Đăng nhập bằng QR', 'Sign in with QR');
  return `<div class="grid-2">
    <section class="panel panel--flush">
      <div style="padding:16px 16px 12px">
        <div class="panel__head" style="margin-bottom:6px"><div><h2>${t('Zalo cá nhân', 'Personal Zalo')}</h2><p>${t('Chạy qua OpenClaw Zalo Connect. Dùng tài khoản phụ.', 'Runs on OpenClaw Zalo Connect. Use a secondary account.')}</p></div>
          ${personal.length ? `<div class="row"><button class="btn btn-sm" type="button" data-zalo-health-refresh>${actionIcon('refresh')}<span>${t('Làm mới', 'Refresh')}</span></button><button class="btn btn-sm btn-primary" type="button" data-zalo-login-trigger>${actionIcon('key')}<span>${loginLabel}</span></button></div>` : ''}
        </div>
      </div>
      ${personal.length ? `<div class="list">${personal.map((b) => agentRow(b)).join('')}</div>` : `<div style="padding:0 16px 16px"><div class="empty"><b>${t('Chưa có bot Zalo cá nhân', 'No personal Zalo bot')}</b>${t('Tạo bot kênh Zalo cá nhân, sau đó quét QR để đăng nhập.', 'Create a personal Zalo bot, then scan the QR to sign in.')}<div><button class="btn btn-primary" type="button" data-create-bot="zalo-personal">${navIcon('plus')}<span>${t('Tạo bot Zalo cá nhân', 'Create personal Zalo bot')}</span></button></div></div></div>`}
      <div style="padding:14px 16px 16px;border-top:1px solid var(--line)">
        <dl class="kv">
          <dt>Zalo Connect</dt><dd>${escapeHtml(zh.installedVersion || t('Chưa cài', 'Not installed'))}</dd>
          <dt>Zalo Mod</dt><dd>${escapeHtml(zh.zaloModVersion || (zh.zaloModInstalled ? '-' : t('Chưa cài', 'Not installed')))}</dd>
          ${isLocalBrowser() && zh.zaloModInstalled ? `<dt>${t('Quản lý nhóm', 'Group admin')}</dt><dd><a href="${sameHostUrl('', gwPort + 1)}/dashboard" target="_blank" rel="noopener">${t('Mở Zalo Mod dashboard', 'Open Zalo Mod dashboard')}</a></dd>` : ''}
        </dl>
        <p class="hint">${t('Tự động hoá tài khoản cá nhân có thể bị Zalo hạn chế. Khi chạy trên VPS, Zalo dễ yêu cầu xác minh thêm vì đăng nhập từ IP máy chủ.', 'Automating a personal account can get it restricted by Zalo. On a VPS, Zalo is more likely to ask for extra verification because the sign-in comes from a datacenter IP.')}</p>
      </div>
    </section>
    <section class="panel panel--flush">
      <div style="padding:16px 16px 12px">
        <div class="panel__head" style="margin-bottom:6px"><div><h2>Zalo Bot API</h2><p>${t('Bot chính chủ của Zalo, chạy bằng token, không cần webhook.', 'Zalo’s own bot platform, token based, no webhook needed.')}</p></div>
          <button class="btn btn-sm" type="button" data-create-bot="zalo-bot">${navIcon('plus')}<span>${t('Tạo bot', 'Create bot')}</span></button>
        </div>
      </div>
      ${official.length ? `<div class="list">${official.map((b) => agentRow(b)).join('')}</div>` : `<div style="padding:0 16px 4px"><div class="empty"><b>${t('Chưa có bot Zalo Bot API', 'No Zalo Bot API bot')}</b>${t('Lấy token ở bot.zaloplatforms.com rồi tạo bot.', 'Get a token at bot.zaloplatforms.com, then create the bot.')}</div></div>`}
      <div style="padding:14px 16px 16px;border-top:1px solid var(--line)" class="small">
        <p style="margin:0 0 6px"><b>${t('Đưa bot vào nhóm', 'Add the bot to a group')}</b></p>
        <ol style="margin:0;padding-left:18px" class="muted">
          <li>${t('Mở mini app Zalo Bot Creator, chọn bot.', 'Open the Zalo Bot Creator mini app and pick the bot.')}</li>
          <li>${t('Chọn "Mời Bot vào nhóm", gửi link vào nhóm.', 'Choose "Invite Bot to group" and send the link to the group.')}</li>
          <li>${t('Trưởng nhóm bấm link và xác nhận.', 'The group owner opens the link and confirms.')}</li>
        </ol>
        <p class="hint">${t('Trong nhóm, bot chỉ trả lời khi được @nhắc tên hoặc khi có người trả lời tin của bot.', 'In groups the bot only answers an @mention or a reply to its own message.')}</p>
      </div>
    </section>
  </div>`;
}

// ── Tools ───────────────────────────────────────────────────────────────
function toolsView() {
  const bots = state.install?.bots || [];
  if (!bots.length) return `<div class="empty"><b>${t('Chưa có bot nào', 'No bots yet')}</b>${t('Kỹ năng và plugin được bật theo từng bot. Tạo bot trước.', 'Skills and plugins are enabled per bot. Create a bot first.')}<div><button class="btn btn-primary" type="button" data-bot-modal="open">${t('Tạo bot', 'Create bot')}</button></div></div>`;
  const bot = currentBot() || bots[0];
  if (state.activeBotId !== bot.id) { state.activeBotId = bot.id; state.botChannel = bot.channel; }
  return `<section class="panel">
      <div class="panel__head">
        <div><h2>${t('Áp dụng cho bot', 'Applies to bot')}</h2><p>${t('Kỹ năng và plugin chỉ hiện những thứ dùng được với kênh của bot này.', 'Only items that work with this bot’s channel are listed.')}</p></div>
        <label class="field" style="min-width:260px">
          <select id="tools-bot" aria-label="${t('Chọn bot', 'Pick a bot')}">${bots.map((b) => `<option value="${escapeHtml(b.id)}" ${b.id === bot.id ? 'selected' : ''}>${escapeHtml(b.name || b.id)} (${escapeHtml(channelLabel(b.channel))})</option>`).join('')}</select>
        </label>
      </div>
    </section>
    <section class="panel bot-skills-panel">${botSkillsPanel()}</section>`;
}

// ── Logs ────────────────────────────────────────────────────────────────
function logLineHtml(line) {
  const text = String(line ?? '');
  const tone = /❌|error|lỗi|failed|thất bại/i.test(text) ? 'is-err' : /✅|success|thành công|đã lưu/i.test(text) ? 'is-ok' : '';
  const hidden = state.logFilter && !text.toLowerCase().includes(state.logFilter.toLowerCase()) ? 'is-hidden' : '';
  return `<p class="${tone} ${hidden}">${escapeHtml(text)}</p>`;
}
function applyLogFilter() {
  const q = String(state.logFilter || '').toLowerCase();
  document.querySelectorAll('.terminal.big p').forEach((p) => p.classList.toggle('is-hidden', !!q && !p.textContent.toLowerCase().includes(q)));
}
function logsView() {
  return `<section class="panel">
    <div class="log-toolbar">
      <input id="log-filter" type="search" placeholder="${t('Lọc theo chữ, ví dụ: zalo, error', 'Filter, e.g. zalo, error')}" value="${escapeHtml(state.logFilter || '')}" aria-label="${t('Lọc nhật ký', 'Filter logs')}"/>
      <button class="btn btn-sm copy-log" type="button" data-copy-log>${copyIcon()}<span>${t('Sao chép', 'Copy')}</span></button>
      <span class="muted small">${t('Giữ 400 dòng gần nhất của máy chủ.', 'Keeps the server’s last 400 lines.')}</span>
    </div>
    <div class="terminal big">${state.logs.map((l) => logLineHtml(l)).join('') || `<p class="is-placeholder">${t('Chưa có dòng nhật ký nào.', 'No log lines yet.')}</p>`}</div>
  </section>`;
}

// ── Settings ────────────────────────────────────────────────────────────
function configView() {
  const s = state.install || {};
  const sys = state.system || {};
  const auth = sys.auth || {};
  const projects = sys.projects || [];
  const key = !!(s.credentials || {}).nineRouterApiKey;
  const local = isLocalBrowser();
  const tzKnown = TZ_OPTIONS.some(([id]) => id === state.tz);
  const tzOpts = (tzKnown ? TZ_OPTIONS : [[state.tz, state.tz], ...TZ_OPTIONS]).map(([id, label]) => `<option value="${id}" ${state.tz === id ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  const setupVer = sys.versions?.setup || '-';
  const latest = sys.versions?.latestSetup;
  const hasNew = !!(sys.versions?.setup && latest && isVersionNewer(latest, sys.versions.setup));
  const openclawVer = String(s.runtimeVersions?.openclaw || sys.versions?.currentOpenclaw || sys.versions?.openclaw || '-').replace(/^openclaw@/, '');
  const remote = sys.remote;
  const tunnelPorts = remote ? Array.from(new Set([remote.uiPort || 51789, Number(portFromUrl(s.gatewayUrl, 18789)), Number(portFromUrl(s.gatewayUrl, 18789)) + 1])) : [];
  const tunnelCmd = remote ? `ssh ${tunnelPorts.map((p) => `-L ${p}:127.0.0.1:${p}`).join(' ')} ${remote.user || 'root'}@${remote.host || '<server>'}` : '';

  const projectRows = projects.map((p) => {
    const active = s.projectDir === p.projectDir;
    return `<div class="list__row is-static ${active ? 'is-active' : ''}">
      <span class="avatar" aria-hidden="true">${actionIcon('folder')}</span>
      <span class="list__main"><b>${escapeHtml(fileBaseName(p.projectDir))}</b><small title="${escapeHtml(p.projectDir)}">${escapeHtml(p.projectDir)}</small></span>
      <span class="list__side">
        ${active ? badge('ok', t('Đang dùng', 'In use')) : `<button class="btn btn-sm" type="button" data-project-connect="${escapeHtml(p.projectDir)}">${t('Dùng project này', 'Use this project')}</button>`}
        ${p.mode === 'docker' ? `<button class="btn btn-sm" type="button" data-project-to-native="${escapeHtml(p.projectDir)}">${t('Chuyển sang Native', 'Move to Native')}</button>` : ''}
        <button class="icon-btn" type="button" data-project-remove="${escapeHtml(p.projectDir)}" aria-label="${t('Xoá project', 'Delete project')}" title="${t('Xoá project', 'Delete project')}">${actionIcon('trash')}</button>
      </span>
    </div>`;
  }).join('');

  return `<div class="config-grid">
    <div class="stack" style="gap:20px">
      <section class="panel panel--flush">
        <div style="padding:16px 16px 12px"><div class="panel__head" style="margin-bottom:0"><div><h2>Project</h2><p>${t('Mỗi project là một bộ OpenClaw riêng với bot, cấu hình và cổng riêng.', 'Each project is its own OpenClaw setup with its own bots, config and ports.')}</p></div>
          <div class="row"><button class="btn btn-sm btn-primary" type="button" id="install">${navIcon('plus')}<span>${t('Tạo project', 'Create project')}</span></button></div></div></div>
        ${projectRows ? `<div class="list">${projectRows}</div>` : `<div style="padding:0 16px 16px"><div class="empty">${t('Chưa tìm thấy project nào trên máy này.', 'No project found on this machine.')}</div></div>`}
        <div class="row" style="padding:12px 16px;border-top:1px solid var(--line)">
          <button class="btn btn-sm" type="button" data-project-refresh>${actionIcon('refresh')}<span>${t('Quét lại', 'Rescan')}</span></button>
          ${local ? `<button class="btn btn-sm" type="button" data-project-pick-folder>${actionIcon('folder')}<span>${t('Chọn thư mục', 'Pick a folder')}</span></button>` : ''}
          ${state.projectConnectMessage ? `<span class="muted small">${escapeHtml(state.projectConnectMessage)}</span>` : ''}
        </div>
      </section>
      <section class="panel">
        <div class="panel__head"><div><h2>${t('Router AI', 'AI router')}</h2><p>${t('Nơi bot gửi câu hỏi để lấy câu trả lời từ Gemini, Claude, OpenAI.', 'Where bots send prompts to get answers from Gemini, Claude, OpenAI.')}</p></div>${statusBadge(s.routerStatus)}</div>
        <dl class="kv">
          <dt>${t('Router', 'Router')}</dt><dd>${s.routerRemote ? 'HVDTAI Router' : t('9Router trên máy này', '9Router on this machine')}</dd>
          <dt>${t('Địa chỉ', 'Address')}</dt><dd><code>${escapeHtml(s.routerUrl || '-')}</code></dd>
          <dt>Model</dt><dd>${escapeHtml(s.activeModel || 'smart-route')}</dd>
          <dt>API key</dt><dd>${key ? badge('ok', t('Đã lưu', 'Saved')) : badge('bad', t('Chưa có', 'Missing'))}</dd>
        </dl>
        <div class="row" style="margin-top:14px">
          <button class="btn btn-sm ${key ? '' : 'btn-primary'}" type="button" data-router-key>${actionIcon('key')}<span>${key ? t('Đổi key', 'Change key') : t('Nhập key', 'Set key')}</span></button>
          ${s.routerRemote || local ? `<a class="btn btn-sm" href="${routerHref(s)}" target="_blank" rel="noopener">${navIcon('external')}<span>${t('Mở trang router', 'Open router')}</span></a>` : ''}
        </div>
      </section>
      <section class="panel">
        <div class="panel__head"><div><h2>${t('Phiên bản', 'Versions')}</h2></div></div>
        <div class="setting"><div class="setting__text"><b>Aivio Bot Setup ${escapeHtml(setupVer)}</b><span>${hasNew ? t(`Có bản mới ${latest}.`, `Version ${latest} is available.`) : t('Đang dùng bản mới nhất.', 'Up to date.')}</span></div>${hasNew ? `<button class="btn btn-sm btn-primary" type="button" data-update-setup>${t('Cập nhật', 'Update')}</button>` : ''}</div>
        <div class="setting"><div class="setting__text"><b>OpenClaw ${escapeHtml(openclawVer)}</b><span>${t('Runtime chạy bot.', 'The runtime that runs the bots.')}</span></div><button class="btn btn-sm" type="button" data-update-app>${t('Cập nhật OpenClaw', 'Update OpenClaw')}</button></div>
      </section>
    </div>
    <div class="stack" style="gap:20px">
      <section class="panel">
        <div class="panel__head"><div><h2>${t('Bảo mật', 'Security')}</h2><p>${auth.configured ? t('Đăng nhập bằng mật khẩu đang bật. Đổi mật khẩu sẽ đăng xuất mọi thiết bị khác.', 'Password sign-in is on. Changing it signs out every other device.') : t('Chưa đặt mật khẩu. Giao diện chỉ mở được từ chính máy này, không mở được qua internet.', 'No password yet. The console only opens on this machine, not over the internet.')}</p></div>${auth.configured ? badge('ok', t('Đã bật', 'On')) : badge('warn', t('Chưa đặt', 'Not set'))}</div>
        <form id="password-form" class="stack" autocomplete="off">
          <input type="text" name="username" value="admin" autocomplete="username" hidden aria-hidden="true"/>
          ${auth.configured ? `<label class="field"><span>${t('Mật khẩu hiện tại', 'Current password')}</span><input name="currentPassword" type="password" autocomplete="current-password" required/></label>` : ''}
          <label class="field"><span>${t('Mật khẩu mới', 'New password')}</span><input name="newPassword" type="password" autocomplete="new-password" minlength="10" required/><small>${t('Ít nhất 10 ký tự.', 'At least 10 characters.')}</small></label>
          <label class="field"><span>${t('Nhập lại mật khẩu mới', 'Repeat new password')}</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required/></label>
          <div class="row"><button class="btn btn-primary" type="submit">${auth.configured ? t('Đổi mật khẩu', 'Change password') : t('Đặt mật khẩu', 'Set password')}</button>${auth.configured && auth.required ? `<button class="btn" type="button" data-logout>${t('Đăng xuất', 'Sign out')}</button>` : ''}</div>
          <p class="form-msg" data-pw-msg role="status"></p>
        </form>
      </section>
      <section class="panel">
        <div class="panel__head"><div><h2>${t('Giao diện', 'Appearance')}</h2></div></div>
        <div class="setting"><div class="setting__text"><b>${t('Chế độ màu', 'Color mode')}</b></div><div class="seg" role="group"><button class="seg__btn ${state.theme === 'light' ? 'is-active' : ''}" type="button" data-pref="theme" data-value="light">${t('Sáng', 'Light')}</button><button class="seg__btn ${state.theme === 'dark' ? 'is-active' : ''}" type="button" data-pref="theme" data-value="dark">${t('Tối', 'Dark')}</button></div></div>
        <div class="setting"><div class="setting__text"><b>${t('Ngôn ngữ', 'Language')}</b></div><div class="seg" role="group"><button class="seg__btn ${state.lang === 'vi' ? 'is-active' : ''}" type="button" data-pref="lang" data-value="vi">Tiếng Việt</button><button class="seg__btn ${state.lang === 'en' ? 'is-active' : ''}" type="button" data-pref="lang" data-value="en">English</button></div></div>
        <div class="setting"><div class="setting__text"><b>${t('Múi giờ', 'Time zone')}</b><span>${t('Dùng cho lịch hẹn của bot tạo mới.', 'Used for schedules of newly created bots.')}</span></div><select id="tz-select" style="max-width:220px" aria-label="${t('Múi giờ', 'Time zone')}">${tzOpts}</select></div>
      </section>
      ${remote && local ? `<section class="panel">
        <div class="panel__head"><div><h2>${t('Mở từ máy khác', 'Open from another machine')}</h2><p>${t('Chạy lệnh này trên máy của anh/chị rồi mở', 'Run this on your own computer, then open')} <code>http://localhost:${remote.uiPort || 51789}</code>.</p></div></div>
        <div class="cmd-box"><input readonly value="${escapeHtml(tunnelCmd)}" onclick="this.select()" aria-label="SSH tunnel"/><button class="btn btn-sm" type="button" data-copy="${escapeHtml(tunnelCmd)}">${copyIcon()}<span>${t('Sao chép', 'Copy')}</span></button></div>
      </section>` : ''}
    </div>
  </div>`;
}

function renderFilesPanel() {
  const panel = document.querySelector('.bot-files-panel');
  if (!panel) return render();
  const bot = currentBot();
  if (!bot) return;
  // Save scroll positions before re-render
  const tree = panel.querySelector('.file-tree');
  const treeScroll = tree ? tree.scrollTop : 0;
  const panelScroll = panel.scrollTop;
  const mainScroll = panel.closest('main')?.scrollTop || 0;
  panel.innerHTML = botFilesPanel();
  // Restore scroll positions
  const newTree = panel.querySelector('.file-tree');
  if (newTree) newTree.scrollTop = treeScroll;
  panel.scrollTop = panelScroll;
  const main = panel.closest('main');
  if (main) main.scrollTop = mainScroll;
  // Re-wire only file-panel-specific handlers
  panel.querySelectorAll('[data-select-file]').forEach(btn => btn.onclick = () => { state.selectedFile = btn.dataset.selectFile; renderFilesPanel(); });
  panel.querySelectorAll('[data-toggle-dir]').forEach(btn => btn.onclick = () => { const p = btn.dataset.toggleDir; state.openDirs[p] = !(state.openDirs[p] ?? true); renderFilesPanel(); });
  panel.querySelectorAll('.save').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => { const name = btn.dataset.file; try { await api('/api/bot/files/'+encodeURIComponent(name), { method: 'PUT', body: { projectDir: activeProjectDir(), content: document.querySelector(`[data-editor="${CSS.escape(name)}"]`).value } }); showToast(t('Đã lưu', 'Saved'), t('Đã lưu tệp tin: ', 'Saved file: ') + fileBaseName(name), 'success'); btn.innerHTML=`${actionIcon('save')} ${ui('saved')}`; setTimeout(()=>btn.innerHTML=`${actionIcon('save')} ${ui('save')}`,1200); } catch (err) { showToast(t('Lưu thất bại', 'Save failed'), err.message, 'error'); } }));
}

function renderSkillsPanel() {
  const panel = document.querySelector('.bot-skills-panel');
  if (!panel) return render();
  panel.innerHTML = botSkillsPanel();
  wireSkillsHandlers(panel);
}

function wireSkillsHandlers(scope = document) {
  scope.querySelectorAll('[data-feature-toggle]').forEach(el => el.onchange = async () => {
    const [kind, id] = String(el.dataset.featureToggle||'').split(':');
    const key = `${kind}:${id}`;
    const enabled = !!el.checked;
    state.featureLoading[key] = true;
    renderSkillsPanel();
    try {
      await api('/api/features/toggle', { method:'POST', body:{ projectDir: activeProjectDir(), kind, id, enabled, agentId: currentBotId() } });
      await loadFeatureFlags(true);
      if (kind === 'skill') await loadFiles(true);
    } finally {
      delete state.featureLoading[key];
    }
    renderSkillsPanel();
  });
  scope.querySelectorAll('[data-feature-install]').forEach(btn => btn.onclick = async () => {
    const [kind, id] = String(btn.dataset.featureInstall||'').split(':');
    const key = `${kind}:${id}`;
    state.featureLoading[key] = true;
    renderSkillsPanel();
    try {
      await api('/api/features/install', { method:'POST', body:{ projectDir: activeProjectDir(), kind, id, agentId: currentBotId() } });
      await loadFeatureFlags(true);
      await loadFiles(true);
      const label = kind === 'skill' ? t('kỹ năng: ', 'skill: ') : t('plugin: ', 'plugin: ');
      showToast(t('Thành công', 'Success'), t('Cài đặt/Cập nhật thành công ', 'Successfully installed/updated ') + label + id, 'success');
    } catch (err) {
      showToast(t('Thất bại', 'Failed'), err.message, 'error');
    } finally {
      delete state.featureLoading[key];
    }
    renderSkillsPanel();
  });
  scope.querySelectorAll('[data-chrome-debug]').forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await api('/api/browser/start-chrome', { method: 'POST', body: {} });
      if (r.headless) {
        // VPS has no display - guide the user to run Chrome on THEIR machine + a reverse tunnel.
        state.confirmModal = {
          icon: '🌐',
          eyebrow: t('Chrome debug', 'Chrome debug'),
          title: t('Dùng Chrome trên máy của bạn', 'Use Chrome on your computer'),
          message: t('VPS không có màn hình nên không mở Chrome tại đây. Chạy 2 lệnh dưới trên máy của bạn và GIỮ chúng chạy - bot sẽ tự dùng Chrome đó (cổng 9222). Không làm cũng không sao: bot vẫn có trình duyệt ẩn (headless) sẵn trong container.', 'This VPS has no display. Run the two commands below on YOUR computer and keep them running - the bot will use that Chrome (port 9222). Optional: the bot already has a built-in headless browser.'),
          bodyHtml: `<p class="guide-step">1. ${t('Mở Chrome debug trên máy bạn - macOS:', 'Start Chrome debug on your machine - macOS:')}</p><code class="cmd">${escapeHtml(r.chromeCmdMac)}</code><p class="guide-step">${t('Hoặc Windows:', 'Or Windows:')}</p><code class="cmd">${escapeHtml(r.chromeCmdWin)}</code><p class="guide-step">2. ${t('Tạo tunnel về VPS (cửa sổ terminal khác):', 'Create the reverse tunnel (another terminal):')}</p><code class="cmd">${escapeHtml(r.tunnelCmd)}</code>`,
          okText: t('Đã hiểu', 'Got it'),
          okDanger: false,
          hideCancel: true,
          onConfirm: () => { state.confirmModal = null; render(); },
        };
        render();
      } else {
        // The profile is a copy of the operator's own, so their normal Chrome can stay open -
        // say so, because the old flow required closing every Chrome window first.
        showToast(t('Đã mở Chrome cho bot', 'Chrome opened for the bot'),
          `${t('Cổng', 'Port')} ${r.port} - ${t('cửa sổ Chrome mới này dùng bản sao profile của bạn (đã đăng nhập sẵn); Chrome thường của bạn cứ để nguyên.', 'the new window runs a copy of your profile (already signed in); your normal Chrome can stay open.')}`, 'success');
      }
    } catch (err) {
      showToast(t('Thất bại', 'Failed'), err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}



// Danh sách múi giờ phổ biến (IANA) cho dropdown pill. Gọn - đủ dùng cho khu vực chính.
const TZ_OPTIONS = [
  ['Asia/Ho_Chi_Minh', 'Việt Nam (UTC+7)'],
  ['Asia/Bangkok', 'Bangkok (UTC+7)'],
  ['Asia/Jakarta', 'Jakarta (UTC+7)'],
  ['Asia/Singapore', 'Singapore (UTC+8)'],
  ['Asia/Kuala_Lumpur', 'Kuala Lumpur (UTC+8)'],
  ['Asia/Manila', 'Manila (UTC+8)'],
  ['Asia/Shanghai', 'Trung Quốc (UTC+8)'],
  ['Asia/Tokyo', 'Tokyo (UTC+9)'],
  ['Asia/Seoul', 'Seoul (UTC+9)'],
  ['Asia/Kolkata', 'Ấn Độ (UTC+5:30)'],
  ['Asia/Dubai', 'Dubai (UTC+4)'],
  ['Australia/Sydney', 'Sydney (UTC+10/+11)'],
  ['Europe/London', 'London (UTC+0/+1)'],
  ['Europe/Paris', 'Paris (UTC+1/+2)'],
  ['America/New_York', 'New York (UTC-5/-4)'],
  ['America/Los_Angeles', 'Los Angeles (UTC-8/-7)'],
  ['UTC', 'UTC'],
];





function botCreateForm(ch, empty, data = {}) {
  const needsToken = ch === 'telegram' || ch === 'zalo-bot';
  const tokenRequired = needsToken && data.mode !== 'edit';
  const isFb = ch === 'fb-messenger';
  const fbRequired = isFb && data.mode !== 'edit';
  const selectedChannel = BOT_CHANNELS.find((x) => x.id === ch);
  return `<form class="bot-create" id="bot-create">
    ${empty ? `<div class="empty-create"><h3>${t('\u0043h\u01b0a c\u00f3 bot n\u00e0o','No bots yet')}</h3><p>${t('\u0054\u1ea1o bot \u0111\u1ea7u ti\u00ean \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.','Create the first bot to start.')}</p></div>` : ``}
    ${data.mode === 'edit'
      ? `<input name="channel" type="hidden" value="${escapeHtml(ch)}"/>`
      : `<div class="choice-grid bot-channel-grid">${BOT_CHANNELS.map(o => choiceCard('bot-channel', o, ch)).join('')}</div>`}
    <div class="bot-form-grid">
      <label><span>${t('\u0054\u00ean bot','Bot name')}</span><input name="botName" required placeholder="${t('Trợ lý tuyển sinh','Admissions assistant')}" value="${escapeHtml(data.botName || '')}"/></label>
      ${data.mode !== 'edit' ? `
        <label>
          <span>${t('ID bot (viết liền, ko dấu)', 'Bot ID (no accent, lowercase)')}</span>
          <input name="agentId" required pattern="^[a-z0-9-_]+$" title="${t('Chỉ dùng chữ cái viết thường không dấu, số, gạch ngang (-) và gạch dưới (_)', 'Only lowercase letters, numbers, hyphens (-) and underscores (_) are allowed')}" placeholder="tuyensinh" value=""/>
        </label>
      ` : ''}
      <label><span>${t('\u0056ai tr\u00f2','Role')}</span><input name="role" required placeholder="${t('\u0054r\u1ee3 l\u00fd AI c\u00e1 nh\u00e2n','Personal AI assistant')}" value="${escapeHtml(data.role || '')}"/></label>
      ${!isFb ? `<label><span>Emoji</span><input name="emoji" maxlength="8" placeholder="\uD83E\uDD16" value="${escapeHtml(data.emoji || '')}"/></label>` : ''}
      ${needsToken ? `<label><span>Token</span><input name="token" ${tokenRequired ? 'required' : ''} autocomplete="off" placeholder="${ch==='telegram'?'123456:ABC...':'Zalo OA token'}" value="${escapeHtml(data.token || '')}"/></label>` : `<input name="token" type="hidden" value="${escapeHtml(data.token || '')}"/>`}
      ${isFb ? `
        <div class="fb-fields">
          <div class="fb-row3">
            <label><span>Emoji</span><input name="emoji" maxlength="8" placeholder="🤖" value="${escapeHtml(data.emoji || '')}"/></label>
            <label><div class="fb-label-row"><span>Page ID</span><a class="fb-help-link" href="https://monkeytech.io.vn/tools" target="_blank" rel="noopener">🔎 ${t('Lấy Page ID','Get Page ID')}</a></div><input name="pageId" autocomplete="off" placeholder="601677496361008" value="${escapeHtml(data.pageId || '')}"/></label>
            <label><span>Verify Token</span><input name="verifyToken" ${fbRequired ? 'required' : ''} autocomplete="off" placeholder="my-verify-token" value="${escapeHtml(data.verifyToken || '')}"/></label>
          </div>
          <div class="fb-row2">
            <label><span>App ID</span><input name="appId" autocomplete="off" placeholder="App ID" value="${escapeHtml(data.appId || '')}"/></label>
            <label><span>App Secret</span><input name="appSecret" autocomplete="off" placeholder="App Secret" value="${escapeHtml(data.appSecret || '')}"/></label>
          </div>
          <label class="fb-wide"><span>Page Access Token</span><input name="pageAccessToken" ${fbRequired ? 'required' : ''} autocomplete="off" placeholder="EAAB..." value="${escapeHtml(data.pageAccessToken || '')}"/></label>
        </div>
      ` : ''}
      <label class="wide"><span>${t('\u0054\u00ednh c\u00e1ch','Personality')}</span><textarea name="personality" rows="3" placeholder="${t('\u0054h\u00e2n thi\u1ec7n, r\u00f5 r\u00e0ng, ch\u1ee7 \u0111\u1ed9ng.','Friendly, clear, proactive.')}">${escapeHtml(data.personality || '')}</textarea></label>
      <label><span>${t('\u0054\u00ean user','User name')}</span><input name="userName" placeholder="${t('\u0054\u00ean c\u1ee7a b\u1ea1n','Your name')}" value="${escapeHtml(data.userName || '')}"/></label>
      <label><span>${t('\u004d\u00f4 t\u1ea3 user','User description')}</span><input name="userDescription" placeholder="${t('\u0053\u1edf th\u00edch, ng\u1eef c\u1ea3nh, c\u00e1ch x\u01b0ng h\u00f4...','Preferences, context, address style...')}" value="${escapeHtml(data.userDescription || '')}"/></label>
    </div>
    <div class="bot-actions"><button class="primary btn-icon" type="submit">${data.mode === 'edit' ? `${actionIcon('save')} ${t('\u004c\u01b0u thay \u0111\u1ed5i','Save changes')}` : `${actionIcon('spark')} ${t('\u0054\u1ea1o bot','Create bot')}`}</button><span class="bot-message">${escapeHtml(state.botMessage || '')}</span></div>
  </form>`;
}

function botCreateModal() {
  if (!state.botModalOpen) return '';
  const current = (state.install?.bots || []).find((b) => b.id === state.botEditId) || null;
  const data = current ? { mode: 'edit', channel: current.channel || state.botChannel, botName: current.name, role: current.role || '', token: '', personality: current.persona || '', userName: current.userName || '', userDescription: current.userDescription || '', emoji: current.emoji || '', pageId: current.pageId || '', appId: current.appId || '', pageAccessToken: current.pageAccessToken || '', appSecret: current.appSecret || '', verifyToken: current.verifyToken || '' } : { mode: 'create' };
  const currentChannel = BOT_CHANNELS.find((x) => x.id === ((current && current.channel) || state.botChannel || 'telegram'));
  return `<div class="modal-backdrop bot-modal-backdrop" data-bot-modal="close">
    <section class="donate-modal bot-modal" role="dialog" aria-modal="true" aria-label="${t('\u0054\u1ea1o bot','Create bot')}" onclick="event.stopPropagation()">
      <button class="modal-x" data-bot-modal="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="donate-head"><span aria-hidden="true" class="bot-modal-chan">${currentChannel?.icon ? `<img src="${currentChannel.icon}" alt="" onerror="this.style.display='none'"/>` : (current ? actionIcon('edit') : actionIcon('spark'))}</span><div><p>${escapeHtml(currentChannel?.title || t('\u004b\u00eanh bot','Bot channel'))}</p><h2>${current ? t('\u0043h\u1ec9nh s\u1eeda bot','Edit bot') : t('\u0054\u1ea1o bot m\u1edbi','Create bot')}</h2><small>${t('\u0043h\u1ecdn k\u00eanh, nh\u1eadp persona; OpenClaw s\u1ebd c\u1eadp nh\u1eadt config + markdown.','Pick a channel and persona; OpenClaw will update config + markdown.')}</small></div></div>
      ${botCreateForm((current && current.channel) || state.botChannel || 'telegram', false, data)}
    </section>
  </div>`;
}



function currentBot() {
  const bots = state.install?.bots || [];
  return bots.find(b => b.id === state.activeBotId) || null;
}
function joinDisplayPath(root = '', child = '') {
  const r = String(root || '').replace(/[\\/]+$/, '');
  const c = String(child || '').replace(/^[\\/]+/, '');
  if (!r) return c || '-';
  if (!c) return r;
  // Match the separator style of the project root: Windows paths (C:\...) join with "\",
  // POSIX paths join with "/" (the old always-backslash join rendered Linux paths mangled).
  const win = /^[A-Za-z]:/.test(r) || r.includes('\\');
  return win ? `${r}\\${c.replace(/\//g, '\\')}` : `${r}/${c.replace(/\\/g, '/')}`;
}
function projectPathLine(bot = currentBot(), fileName = '') {
  const s = state.install || {};
  // Legacy configs stored the container-absolute workspace; show it relative to the project root
  // (new configs are already relative - see bot-config-gen).
  const workspace = String(bot?.workspace || '').replace(/^\/home\/node\/project\/?/, '');
  const relFile = fileName ? String(fileName).replace(/^\.openclaw[\\/][^\\/]+[\\/]?/, '') : '';
  // Native configs store the workspace as an absolute host path; only relative ones hang off the project.
  const absolute = /^([A-Za-z]:[\\/]|[\\/])/.test(workspace);
  const full = !workspace ? (s.projectDir || '-') : absolute ? joinDisplayPath(workspace, relFile) : joinDisplayPath(s.projectDir || '', relFile ? `${workspace}/${relFile}` : workspace);
  const label = workspace ? t('Workspace','Workspace') : ui('project');
  const title = workspace ? `${s.projectDir || ''} -> ${relFile ? `${workspace}/${relFile}` : workspace}` : (s.projectDir || '-');
  return `<p class="project-path-line">${label}: <code title="${escapeHtml(title)}">${escapeHtml(full)}</code></p>`;
}

function botFilesPanel() {
  const files = state.files || [];
  const editableFiles = files.filter(f => f.type !== 'dir' && f.editable !== false);
  // Open the bot's personality first: that is what operators come here to change.
  const preferred = ['SOUL.md', 'IDENTITY.md', 'AGENTS.md'];
  const byPreference = preferred.map((n) => editableFiles.find((f) => f.name.split('/').pop() === n)).find(Boolean);
  const selected = editableFiles.find(f => f.name === state.selectedFile) || byPreference || editableFiles[0];
  if (selected && state.selectedFile !== selected.name) state.selectedFile = selected.name;
  return `<div class="bot-files-head"><div><h3>${t('C\u00e2y th\u01b0 m\u1ee5c bot','Bot file tree')}</h3>${projectPathLine(currentBot(), selected?.name || '')}</div>${selected ? `<button class="save icon-btn2" data-file="${selected.name}">${actionIcon('save')} ${ui('save')}</button>` : ''}</div>
    ${files.length ? `<div class="file-workbench"><div class="file-tree file-tree--nested">${renderFileTree(files, selected?.name || '')}</div>${selected ? `<textarea class="tree-editor" data-editor="${escapeHtml(selected.name)}">${escapeHtml(selected.content)}</textarea>` : `<div class="tree-editor tree-editor--empty">${t('Ch\u1ecdn file text \u0111\u1ec3 xem/s\u1eeda','Choose a text file to view/edit')}</div>`}</div>` : `<p>${ui('noFiles')}</p>`}`;
}

function renderFileTree(items, selectedName) {
  const roots = [];
  const byPath = new Map();
  for (const item of items) {
    const parts = String(item.name || '').split('/').filter(Boolean);
    let prefix = '';
    let parentChildren = roots;
    parts.forEach((part, idx) => {
      prefix = prefix ? `${prefix}/${part}` : part;
      let node = byPath.get(prefix);
      if (!node) {
        node = { name: part, path: prefix, type: idx === parts.length - 1 ? (item.type || 'file') : 'dir', item: idx === parts.length - 1 ? item : null, children: [] };
        byPath.set(prefix, node);
        parentChildren.push(node);
      }
      parentChildren = node.children;
    });
  }
  const renderNode = (node, depth = 0) => {
    const isDir = node.type === 'dir';
    const open = state.openDirs[node.path] ?? depth < 2;
    const pad = 10 + depth * 14;
    if (isDir) return `<div class="tree-dir"><button class="tree-row tree-row--dir" data-toggle-dir="${escapeHtml(node.path)}" style="--pad:${pad}px"><span>${open ? '\u25BE' : '\u25B8'}</span><b>\uD83D\uDCC2 ${escapeHtml(node.name)}</b></button>${open ? `<div>${node.children.map(c=>renderNode(c, depth+1)).join('')}</div>` : ''}</div>`;
    const editable = node.item?.editable !== false;
    return `<button class="tree-row ${selectedName===node.path?'active':''} ${editable?'':'is-disabled'}" ${editable ? `data-select-file="${escapeHtml(node.path)}"` : ''} title="${escapeHtml(node.path)}" style="--pad:${pad}px"><span>\uD83D\uDCC4</span><b>${escapeHtml(node.name)}</b></button>`;
  };
  return roots.map(n => renderNode(n)).join('');
}


function botSkillsPanel() {
  const flags = state.featureFlags || {};
  const skills = [
    { id: 'cron', title: 'Cron', desc: 'Native scheduler (SQLite) - cron guide in TOOLS.md' },
    { id: 'image-gen', title: 'Tạo ảnh Infographic', desc: t('Tạo ảnh infographic, poster tự động qua router AI', 'Generates infographics and posters through the AI router') },
    { id: 'web-search', title: 'Web Search', desc: 'Tìm kiếm web thời gian thực (DuckDuckGo)' },
  ];
  const plugins = [
    { id: 'zalo-connect', title: 'OpenClaw Zalo Connect', desc: t('Kênh Zalo cá nhân (zca-js) - BẮT BUỘC cho bot Zalo. Tự cài khi tạo bot Zalo đầu tiên; bấm Cập nhật để lên bản mới nhất.', 'Personal Zalo channel (zca-js) - REQUIRED for Zalo bots. Auto-installed with your first Zalo bot; click Update for the latest version.'), channels: ['zalo-personal'] },
    { id: 'learning-memory', title: 'Siêu Trí Nhớ Dài Hạn (learning-memory)', desc: t('Bộ nhớ always-on: nạp MEMORY.md + USER.md đã chắt lọc vào MỌI lượt - kể cả trong nhóm - nên bot không quên ngữ cảnh/quy tắc. Tự cài khi tạo bot.', 'Always-on memory: injects a curated MEMORY.md + USER.md into every turn - including group chats - so the bot stops forgetting context and rules. Auto-installed on bot creation.') },
    { id: 'openclaw-browser-automation', title: 'openclaw-browser-automation', desc: 'Smart Search + Browser (headless & Chrome thật)' },
    { id: 'openclaw-zalo-mod', title: 'openclaw-zalo-mod', desc: 'Zalo group helpers', channels: ['zalo-personal', 'zalo-bot'], openWebPort: 18790, openWebPath: '/dashboard' },
    { id: 'openclaw-fb-messenger', title: 'openclaw-fb-messenger', desc: t('Kênh Facebook Messenger - webhook + Graph API (bắt buộc cho bot Messenger)', 'Facebook Messenger channel - webhook + Graph API (required for Messenger bots)'), channels: ['fb-messenger'] },
    { id: 'openclaw-facebook-crawler', title: 'openclaw-facebook-crawler', desc: 'Facebook crawler automation', channels: ['fb-messenger'] },
    { id: 'openclaw-n8n-facebook-poster', title: 'openclaw-n8n-facebook-poster', desc: 'Facebook post automation (n8n)', channels: ['fb-messenger'] },
  ];
  const bot = currentBot();
  // Channel-scoped features: items with a `channels` whitelist only show for those
  // channels (e.g. Zalo helpers won't appear on Telegram/FB bots). Items without a
  // `channels` field are universal.
  const activeChannel = bot?.channel || state.botChannel || 'telegram';
  const forChannel = (item) => {
    return !item.channels || item.channels.includes(activeChannel);
  };
  const scope = `${state.install?.projectDir || '-'} ? ${bot?.id || '-'}`;
  const row = (item, group) => {
    const key = `${group}:${item.id}`;
    const loading = !!state.featureLoading[key];
    const locked = !!state.featureLocked?.[key];
    const requiresInstall = group === 'plugin' || (group === 'skill' && item.id === 'image-gen');
    const isInstalled = !requiresInstall || !!state.featureInstalled?.[key] || locked;
    
    const version = requiresInstall && isInstalled ? (state.featureVersions?.[key] || '') : '';
    const versionBadge = version ? `<span class="plugin-version-badge" style="display:inline-block; font-size: 11px; background: rgba(66, 133, 244, 0.15); color: #4285F4; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 1px solid rgba(66,133,244,0.25); flex:0 0 auto;">v${escapeHtml(version)}</span>` : '';

    // The on/off toggle stays inline with the title (one line, name truncates with ellipsis if
    // long). The wider Open / Update / Install controls drop to their own row below the description.
    let toggleHtml = '';
    const secs = [];
    if (isInstalled) {
      toggleHtml = `<label class="feature-switch" title="${locked ? t('Bắt buộc cho bot Zalo - không thể tắt','Required for Zalo bots - cannot be disabled') : ''}"${locked ? ' style="opacity:.4;pointer-events:none;cursor:not-allowed;"' : ''}><input type="checkbox" data-feature-toggle="${key}" ${(flags[key] || locked) ? 'checked' : ''} ${(loading || locked) ? 'disabled' : ''}/><span></span></label>`;
      if (item.openWebPort) {
        // zalo-mod's dashboard is always gateway port + 1 (docker 18790, native 18890, or whatever
        // the SELECTED project's gateway runs on) - never the hardcoded default. Derive it from the
        // active project's gatewayUrl so every project opens its own dashboard.
        let gwPort = 0;
        try { gwPort = parseInt(new URL(state.install?.gatewayUrl).port, 10) || 0; } catch {}
        const openPort = (gwPort ? gwPort + 1 : item.openWebPort);
        secs.push(`<a class="secondary icon-btn2" href="${sameHostUrl('', openPort)}${item.openWebPath || ''}" target="_blank" rel="noopener" title="${t('Mở dashboard của plugin','Open the plugin dashboard')}" style="padding: 4px 8px; font-size: 11px; height: 28px; border-width: 1px;">${actionIcon('link')}<span>${t('Mở web','Open')}</span></a>`);
      }
      if (requiresInstall) {
        secs.push(`<button class="secondary icon-btn2 update-plugin-btn" type="button" data-feature-install="${key}" ${loading ? 'disabled' : ''} title="${t('Cập nhật lên bản mới nhất','Update to latest version')}" style="padding: 4px 8px; font-size: 11px; height: 28px; border-width: 1px; color:#ffb020; border-color: rgba(255,176,32,0.25); background: rgba(255,176,32,0.05);">${actionIcon('refresh')}<span>${t('Cập nhật','Update')}</span></button>`);
      }
      if (item.id === 'browser-automation' || item.id === 'openclaw-browser-automation') {
        secs.push(`<button class="secondary icon-btn2" type="button" data-chrome-debug title="${t('Mở Chrome trên máy này cho bot dùng. Chạy bản sao profile của bạn nên vẫn đăng nhập sẵn, và Chrome thường của bạn không bị đóng.','Open Chrome on this machine for the bot. It runs a copy of your profile, so it stays signed in, and your normal Chrome is left alone.')}" style="padding: 4px 8px; font-size: 11px; height: 28px; border-width: 1px; color:#4285F4; border-color: rgba(66,133,244,0.3); background: rgba(66,133,244,0.06);">${actionIcon('link')}<span>${t('Mở Chrome cho bot','Open Chrome for bot')}</span></button>`);
      }
    } else {
      secs.push(`<button class="secondary icon-btn2" type="button" data-feature-install="${key}" ${loading ? 'disabled' : ''}>${actionIcon('download')} ${ui('installVerb')}</button>`);
    }
    const secondaryHtml = secs.length ? `<div class="feature-actions">${secs.join('')}</div>` : '';

    return `<article class="card feature-card ${loading ? 'is-loading' : ''}">` +
      `<div class="feature-head"><div class="feature-title"><b class="feature-name">${escapeHtml(item.title)}</b>${versionBadge}</div>${toggleHtml}</div>` +
      `<p class="feature-desc">${escapeHtml(item.desc)}</p>` +
      secondaryHtml +
      `${loading ? '<div class="feature-progress"><i></i></div>' : ''}</article>`;
  };
  return `
    <h4 class="feature-group">⚡ ${t('Skills','Skills')}</h4>
    <div class="grid two">${skills.filter(forChannel).map(s=>row(s,'skill')).join('')}</div>

    <div class="feature-divider-wrap">
      <hr class="feature-divider" />
    </div>

    <h4 class="feature-group">🔌 ${t('Plugins','Plugins')}</h4>
    <div class="grid two">${plugins.filter(forChannel).map(p=>row(p,'plugin')).join('')}</div>
  `;
}

function wireTab() {
  document.querySelectorAll('[data-copy-log]').forEach(el => el.onclick = () => withButtonLoading(el, async () => {
    const text = state.logs.join('\n');
    try { 
      await navigator.clipboard.writeText(text); 
      el.classList.add('is-copied'); 
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; display: block; margin: 0 auto;"><polyline points="20 6 9 17 4 12"/></svg>`; 
      setTimeout(() => render(), 900); 
    }
    catch { state.confirmModal = { title: t('Không copy được','Copy failed'), message: text || t('Không có log','No logs'), okText: t('Đóng','Close'), onConfirm: () => {} }; render(); }
  }));
  document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = async () => {
    const text = btn.getAttribute('data-copy') || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API needs a secure context (https/localhost); fall back to selecting the field.
      const input = btn.parentElement && btn.parentElement.querySelector('input');
      if (input) { input.focus(); input.select(); try { document.execCommand('copy'); } catch {} }
    }
    showToast(t('Đã copy','Copied'), text, 'success');
  });
  document.querySelectorAll('[data-fbplugin]').forEach(el => el.onclick = () => { state.fbPluginModalOpen = false; render(); });
  document.querySelectorAll('[data-bot-modal]').forEach(el => el.onclick = () => { state.botModalOpen = el.dataset.botModal === 'open'; if (el.dataset.botModal === 'open') state.botEditId = ''; state.botMessage = ''; render(); });
  document.querySelectorAll('[data-edit-bot]').forEach(btn => btn.onclick = (ev) => { ev.stopPropagation(); state.botEditId = btn.dataset.editBot; state.botChannel = (state.install?.bots || []).find((b) => b.id === state.botEditId)?.channel || state.botChannel; state.botModalOpen = true; state.botMessage = ''; render(); });
  document.querySelectorAll('[data-zalo-login]').forEach(el => el.onclick = () => { const opening = el.dataset.zaloLogin === 'open'; if (!opening && state.zaloLoginOpen) api('/api/zalo/login/cancel', { method: 'POST' }).catch(() => {}); state.zaloLoginOpen = opening; render(); });
  document.querySelectorAll('[data-zalo-health-refresh]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => { await loadZaloHealth(); }));
  document.querySelectorAll('[data-zalo-login-trigger]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    state.zaloLoginOpen = true;
    state.zaloQrDataUrl = '';
    state.zaloLoginLines = [t('Đang chuẩn bị quét mã Zalo...', 'Preparing Zalo QR login...')];
    render();
    try {
      await api('/api/zalo/login', { method: 'POST', body: { projectDir: activeProjectDir(), agentId: state.activeBotId } });
    } catch (err) {
      state.zaloLoginOpen = false;
      state.confirmModal = { title: t('Lỗi đăng nhập','Login error'), message: err.message, okText: t('Đóng','Close'), onConfirm: () => {} };
      render();
    }
  }));
  document.querySelectorAll('[data-confirm-action]').forEach(el => el.onclick = () => withButtonLoading(el, async () => {
    const action = el.dataset.confirmAction;
    const m = state.confirmModal;
    if (action === 'cancel' || !m) {
      // Declining can be meaningful - "ask me later" has to remember that it was asked.
      if (m && typeof m.onCancel === 'function') { await m.onCancel(); return; }
      state.confirmModal = null; render(); return;
    }
    if (action === 'ok' && typeof m.onConfirm === 'function') await m.onConfirm();
  }));
  // Screen-recording / accessibility grants: only the OS can give these, so the button opens the
  // right settings pane (and on macOS pokes the capture API so the system prompt shows up).
  document.querySelectorAll('[data-host-perm]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    const kind = btn.dataset.hostPerm;
    try {
      const r = await api('/api/host/permissions', { method: 'POST', body: { kind, projectDir: activeProjectDir() } });
      if (!r.opened) return showToast(t('Không mở được','Could not open'), t('Hệ điều hành này không có bảng cài đặt đó - cấp quyền thủ công.','This OS has no such settings pane - grant it manually.'), 'error');
      const granted = r.screen && r.screen.supported ? r.screen.granted : null;
      showToast(t('Đã mở cài đặt quyền','Opened settings'),
        granted === true ? t('Quyền chụp/quay màn hình: đã có. Bật thêm Accessibility nếu cần gõ/click.','Screen recording: already granted. Also enable Accessibility for typing/clicking.')
          : granted === false ? t('Chưa có quyền. Bật cho "node" trong danh sách vừa mở, rồi khởi động lại bot.','Not granted yet. Tick "node" in the list that just opened, then restart the bot.')
            : t('Bật quyền cho "node" trong danh sách vừa mở.','Tick "node" in the list that just opened.'),
        granted === false ? 'error' : 'success', 8000);
    } catch (err) { showToast(t('Thất bại','Failed'), err.message, 'error'); }
  }));
  document.querySelectorAll('[data-pref]').forEach(btn => btn.onclick = () => { 
    state[btn.dataset.pref] = btn.dataset.value;
    try { localStorage.setItem('aivio-' + btn.dataset.pref, btn.dataset.value); } catch {}
    // The topbar theme toggle is built once with the shell; rebuild the shell so it flips too.
    if (btn.dataset.pref === 'theme') { const shell = document.querySelector('.ax-app'); if (shell) $('#app').innerHTML = ''; }
    render();
  });
  document.querySelectorAll('[data-pref-switch]').forEach(sw => sw.onchange = () => {
    const pref = sw.dataset.prefSwitch;
    const val = pref === 'theme' ? (sw.checked ? 'dark' : 'light') : (sw.checked ? 'on' : 'off');
    state[pref] = val;
    try { localStorage.setItem('aivio-' + pref, val); } catch {}
    applyPrefs();
  });
  { const tzSel = $('#tz-select'); if (tzSel) tzSel.onchange = () => { state.tz = tzSel.value; localStorage.setItem('aivio-tz', tzSel.value); }; }
  document.querySelectorAll('[data-tab-jump]').forEach(btn => btn.onclick = () => { state.tab = btn.dataset.tabJump; render(); });
  document.querySelectorAll('input[name=os]').forEach(i => i.onchange = () => { state.os = i.value; document.querySelectorAll('input[name=os]').forEach(x => x.closest('.choice-card')?.classList.toggle('is-selected', x.checked)); });
  document.querySelectorAll('input[name=mode]').forEach(i => i.onchange = () => { state.mode = i.value; document.querySelectorAll('input[name=mode]').forEach(x => x.closest('.choice-card')?.classList.toggle('is-selected', x.checked)); });
  document.querySelectorAll('[data-project-pick]').forEach(btn => btn.onclick = () => {
    state.selectedProjectDir = btn.dataset.projectPick;
    state.projectConnectMessage = '';
    document.querySelectorAll('[data-project-pick]').forEach(el => el.classList.toggle('active', el.dataset.projectPick === state.selectedProjectDir));
  });
  document.querySelectorAll('[data-project-connect]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    const projectDir = btn.dataset.projectConnect;
    if (state.install?.projectDir === projectDir) return;
    document.querySelectorAll('[data-project-connect]').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    try {
      const result = await api('/api/project/connect', { method: 'POST', body: { projectDir } });
      state.projectConnectMessage = `OK ${t('\u0110\u00e3 k\u1ebft n\u1ed1i','Connected')}: ${result.projectDir}`;
      showToast(t('Đã kết nối', 'Connected'), t('Kết nối thành công project: ', 'Successfully connected project: ') + fileBaseName(result.projectDir), 'success');
      state.selectedProjectDir = result.projectDir;
      state.botMessage = '';
      // Reset bot selection so it picks up the new project's bots
      state.activeBotId = '';
      state.selectedFile = '';
      state.files = [];
      // Optimistic render: the connect response already carries the project's bots, so switch the
      // active tab + show the bot list IMMEDIATELY instead of waiting for the slow background
      // refresh (runtime-version probing via docker exec in loadStatus can take a few seconds).
      state.install = { ...(state.install || {}), ...result };
      autoSwitchBotChannel();
      render();
      // Background: full refresh (versions, files, flags) - UI already shows the new project.
      await loadSystem(true);
      await loadStatus(true);
      autoSwitchBotChannel();
      await loadFiles(true);
      await loadFeatureFlags(true);
    } catch (err) {
      state.projectConnectMessage = `ERR ${err.message}`;
      showToast(t('Lỗi kết nối', 'Connection error'), err.message, 'error');
    } finally {
      render();
    }
  }));
  // Manual escape hatch for the Docker → native move. The automatic prompt only speaks for the
  // project the UI is connected to, and only until someone presses "Để sau" - neither is a reason
  // for a machine to be stuck on a runtime that breaks on its next rebuild.
  document.querySelectorAll('[data-project-to-native]').forEach(btn => btn.onclick = () => {
    const dir = btn.dataset.projectToNative;
    if (!openNativeMigrationModal(dir, { force: true })) {
      showToast(t('Đang có hộp thoại khác mở', 'Another dialog is open'),
                t('Đóng hộp thoại đang mở rồi bấm lại.', 'Close it, then press this again.'), 'info');
    }
  });
  document.querySelectorAll('[data-project-refresh]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    const result = await api('/api/projects/discover');
    state.system = { ...(state.system || {}), projects: result.projects || [] };
    state.projectConnectMessage = '';
    render();
  }));
document.querySelectorAll('[data-project-pick-folder]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    const result = await pickFolderPathShared();
    if (!result) throw new Error(t('Chưa chọn thư mục','No folder selected'));
    await api('/api/project/connect', { method: 'POST', body: { projectDir: result.projectDir } });
    state.projectConnectMessage = `OK ${t('Đã kết nối','Connected')}: ${result.projectDir}`;
    showToast(t('Đã kết nối', 'Connected'), t('Kết nối thành công project: ', 'Successfully connected project: ') + fileBaseName(result.projectDir), 'success');
    state.selectedProjectDir = result.projectDir;
    state.pendingProjectDir = '';
    state.activeBotId = '';
    state.selectedFile = '';
    state.files = [];
    await loadSystem(true);
    await loadStatus(true);
    autoSwitchBotChannel();
    await loadFiles(true);
    await loadFeatureFlags(true);
    state.tab = 'bot';
    render();
  }).catch((err) => {
    state.pendingProjectDir = '';
    state.projectConnectMessage = `ERR ${err.message}`;
    showToast(t('Lỗi kết nối', 'Connection error'), err.message, 'error');
    render();
  }));
  document.querySelectorAll('[data-update-setup]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    state.tab = 'logs';
    render();
    try {
      showToast(t('Đang cập nhật...', 'Updating...'), t('Đang tiến hành cập nhật Setup Wizard.', 'Updating Setup Wizard now.'), 'info');
      await api('/api/setup/update', { method: 'POST' });
      showToast(t('Khởi động cập nhật', 'Update started'), t('Đang kéo code mới và nâng cấp trong nền.', 'Pulling new code and upgrading in the background.'), 'success');
    } catch (err) {
      showToast(t('Cập nhật thất bại', 'Update failed'), err.message, 'error');
    }
  }));
  document.querySelectorAll('[data-update-app]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    await api('/api/runtime/update', { method: 'POST', body: { projectDir: activeProjectDir(), target: 'openclaw' } });
    await loadSystem();
    await loadStatus();
  }));
  document.querySelectorAll('[data-update-router]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    await api('/api/runtime/update', { method: 'POST', body: { projectDir: activeProjectDir(), target: '9router' } });
    await loadSystem();
    await loadStatus();
  }));
  document.querySelectorAll('[data-bot-restart]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    await api('/api/bot/restart', { method: 'POST', body: { projectDir: activeProjectDir() } });
    showToast(t('Đã khởi động lại bot','Bot restarted'), t('Gateway đang khởi động lại, bot sẽ trả lời lại sau vài giây.','The gateway is restarting; bots answer again in a few seconds.'), 'success');
    await loadStatus();
  }));
  document.querySelectorAll('[data-bot-rebuild]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    await api('/api/bot/rebuild', { method: 'POST', body: { projectDir: activeProjectDir() } });
    showToast(t('Thành công','Success'), t('Đã rebuild & recreate container','Rebuilt & recreated the container'), 'success');
    await loadStatus();
  }));
  document.querySelectorAll('[data-bot-add-mount]').forEach(btn => btn.onclick = () => openPathModal({
    title: t('Cấp quyền ổ đĩa/thư mục','Grant disk/folder access'),
    message: t('Nhập đường dẫn host (vd /Users/ban/Documents hoặc D:/data). Mount cho MỌI bot trong project rồi tự recreate container để áp dụng (mất ~10-20s).','Enter a host path (e.g. /Users/you/Documents or D:/data). Mounts for ALL bots in this project, then auto-recreates the container to apply (~10-20s).'),
    placeholder: '/Users/ban/Documents',
    field2: { label: t('Tên mount (tùy chọn) - sẽ thành /mnt/<tên>. Bỏ trống = tự lấy theo tên thư mục.','Mount name (optional) - becomes /mnt/<name>. Empty = derived from folder name.'), placeholder: 'baocao' },
    onConfirm: async (val, name) => {
      const hostPath = String(val || '').trim();
      if (!hostPath) return;
      showToast(t('Đang xử lý','Working'), t('Đang mount & recreate container...','Mounting & recreating container...'), 'success');
      try {
        const r = await api('/api/bot/add-mount', { method: 'POST', body: { projectDir: activeProjectDir(), hostPath, mountName: String(name || '').trim() } });
        showToast(r.alreadyMounted ? t('Đã có sẵn','Already mounted') : t('Đã thêm mount','Mount added'),
          `${hostPath} → ${r.target}` + (r.applied ? t(' · đã áp dụng (đã recreate)',' · applied (recreated)') : t(' · bấm Rebuild để áp dụng',' · click Rebuild to apply')), 'success');
        await loadStatus();
      } catch (err) { showToast(t('Thất bại','Failed'), err.message, 'error'); }
    },
  }));
  document.querySelectorAll('[data-bot-host-control]').forEach(btn => btn.onclick = async () => {
    let cur;
    try { cur = await api('/api/host/control' + projectQuery({})); }
    catch (err) { return showToast(t('Thất bại','Failed'), err.message, 'error'); }
    const on = !!cur.enabled;
    // One row per capability instead of a wall of prose - the operator is granting real access to
    // their machine and should be able to see, at a glance, exactly what each row means.
    // There is no app allow-list to show: the bot drives the screen, so it reaches anything the
    // person sitting at this machine could reach. Say that plainly rather than implying limits.
    const rows = cur.native ? [
      { icon: '📸', title: t('Nhìn màn hình','See the screen'), desc: t('bot chụp được màn hình khi bạn nhờ','the bot can screenshot your screen when you ask') },
      { icon: '🖱', title: t('Điều khiển chuột/bàn phím','Mouse & keyboard control'), desc: t('bot rê chuột, bấm, gõ phím và kéo thả trên máy này','the bot moves the mouse, clicks, types and drags on this machine') },
      { icon: '🗂', title: t('Mở ứng dụng','Open apps'), desc: t('mọi app đang cài, vì bot thao tác như người ngồi trước máy','any installed app, because it operates the machine like a person would') },
    ] : [];
    const bodyHtml = on ? '' : `
      <ul class="cu-status grant-list">${rows.map((r) => `<li><span aria-hidden="true">${r.icon}</span><div><b>${r.title}</b><br>${r.desc}</div></li>`).join('')}</ul>
      <p class="cu-note">${t('Chỉ dùng trên máy có màn hình (không áp dụng VPS headless).','Desktop only (not a headless VPS).')}</p>`;
    state.confirmModal = {
      icon: '🖥️',
      eyebrow: t('Điều khiển máy','PC control'),
      title: on ? t('Tắt điều khiển máy?','Turn off PC control?') : t('Bật điều khiển máy?','Turn on PC control?'),
      message: on
        ? t('Bot sẽ không còn mở được Chrome/ứng dụng trên máy này nữa.','The bot will no longer be able to open Chrome/apps on this machine.')
        : t('Bạn sắp cho bot những quyền sau trên MÁY NÀY:','You are about to grant the bot the following on THIS machine:'),
      bodyHtml,
      okText: on ? t('Tắt','Turn off') : t('Bật','Turn on'),
      okDanger: on,
      onConfirm: async () => {
        state.confirmModal = null; render();
        if (!on) showToast(t('Đang bật','Enabling'), t('Đang cấp quyền và khởi động node điều khiển (có thể mất ~30s)…','Granting access and starting the control node (may take ~30s)…'), 'success');
        try {
          const r = await api('/api/host/control', { method: 'POST', body: { enabled: !on, projectDir: activeProjectDir() } });
          if (!on && r.started && r.started.ok === false && r.started.reason) {
            showToast(t('Đã bật (lưu ý)','Enabled (note)'), t('Không khởi động được service: ','Service did not start: ') + r.started.reason, 'error');
          } else {
            showToast(r.enabled ? t('Đã bật điều khiển máy','PC control on') : t('Đã tắt','Turned off'),
              r.enabled ? t('Bot có thể mở Chrome/app trong danh sách.','The bot can open allow-listed Chrome/apps.') : t('Đã thu hồi quyền.','Access revoked.'), 'success');
          }
          if (r.enabled && r.native) openComputerUseModal(r);
        } catch (err) { showToast(t('Thất bại','Failed'), err.message, 'error'); }
      },
    };
    render();
  });
  document.querySelectorAll('[data-project-remove]').forEach(btn => btn.onclick = (ev) => {
    ev.stopPropagation();
    const projectDir = btn.dataset.projectRemove;
    state.confirmModal = {
      title: t(`Xóa project "${fileBaseName(projectDir)}"?`, `Delete project "${fileBaseName(projectDir)}"?`),
      message: t('Thao tác này sẽ xóa hẳn thư mục project trên ổ đĩa. Không thể hoàn tác.', 'This will permanently delete the project folder from disk. This cannot be undone.'),
      okText: t('Xóa project','Delete project'),
      onConfirm: async () => {
        try {
          await api('/api/project/delete', { method: 'POST', body: { projectDir } });
          state.confirmModal = null;
          state.projectConnectMessage = `✅ ${t('Đã xóa project','Project deleted')}: ${projectDir}`;
          showToast(t('Đã xóa project', 'Project deleted'), `${t('Đã xóa project','Project deleted')}: ${fileBaseName(projectDir)}`, 'success');
          if (state.selectedProjectDir === projectDir) state.selectedProjectDir = '';
          await loadSystem();
          await loadStatus();
          render();
        } catch (err) {
          showToast(t('Lỗi khi xóa', 'Delete error'), err.message, 'error');
          state.confirmModal = {
            title: t('L\u1ed7i khi x\u00f3a','Delete error'),
            message: err.message,
            okText: t('\u0110\u00f3ng','Close'),
            onConfirm: () => {
              state.confirmModal = null;
              render();
            }
          };
          render();
        }
      }
    };
    render();
  });
  document.querySelectorAll('input[name="bot-channel"]').forEach(i => i.onchange = () => { state.botChannel = i.value; state.botMessage = ''; if (i.value === 'fb-messenger' && !state.featureInstalled?.['plugin:openclaw-fb-messenger']) state.fbPluginModalOpen = true; render(); });
  document.querySelectorAll('[data-bot-channel]').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => {
    const sl = document.querySelector('.channel-tabs')?.scrollLeft || 0;
    const keepScroll = () => { const s = document.querySelector('.channel-tabs'); if (s) s.scrollLeft = sl; };
    state.botChannel = btn.dataset.botChannel; state.botPane = 'list'; state.activeBotId = ''; state.selectedFile = ''; state.botMessage = '';
    render(); keepScroll();                          // switch + keep scroll synchronously (no visible jump)
    await loadFiles(true); await loadFeatureFlags(true);  // SILENT: avoid mid-flight re-renders (the features call is slow)
    render(); keepScroll();                          // final reconcile with loaded data, scroll preserved
  }));
  document.querySelectorAll('[data-bot-id]').forEach(btn => btn.onclick = (ev) => withButtonLoading(btn, async () => { if (ev.target.closest('[data-delete-bot]')) return; state.activeBotId = btn.dataset.botId; state.botChannel = (state.install?.bots || []).find((b) => b.id === btn.dataset.botId)?.channel || state.botChannel; state.selectedFile = ''; render(); await loadFiles(); await loadFeatureFlags(); }));
  document.querySelectorAll('[data-delete-bot]').forEach(btn => btn.onclick = async (ev) => {
    ev.stopPropagation();
    const id = btn.dataset.deleteBot;
    state.confirmModal = {
      title: t(`Xóa bot "${id}"?`, `Delete bot "${id}"?`),
      message: t('Workspace + config của bot này sẽ bị xóa.', 'This bot workspace + config will be removed.'),
      okText: t('Xóa bot','Delete bot'),
      onConfirm: async () => {
        try {
          await api('/api/bot/'+encodeURIComponent(id) + projectQuery(), { method: 'DELETE' });
          state.confirmModal = null;
          showToast(t('Đã xóa bot', 'Bot deleted'), `${t('Đã xóa bot','Bot deleted')}: ${id}`, 'success');
          if (state.activeBotId === id) { state.activeBotId = ''; state.selectedFile = ''; state.files = []; }
          await loadStatus();
          await loadFiles();
        } catch (err) {
          showToast(t('Lỗi khi xóa', 'Delete error'), err.message, 'error');
          state.confirmModal = {
            title: t('L\u1ed7i khi x\u00f3a','Delete error'),
            message: err.message,
            okText: t('\u0110\u00f3ng','Close'),
            onConfirm: () => {
              state.confirmModal = null;
              render();
            }
          };
          render();
        }
      }
    };
    render();
  });
  document.querySelectorAll('[data-select-file]').forEach(btn => btn.onclick = () => { state.selectedFile = btn.dataset.selectFile; renderFilesPanel(); });
  document.querySelectorAll('[data-toggle-dir]').forEach(btn => btn.onclick = () => { const p = btn.dataset.toggleDir; state.openDirs[p] = !(state.openDirs[p] ?? true); renderFilesPanel(); });
  document.querySelectorAll('[data-toggle-secret]').forEach(btn => btn.onclick = () => {
    const input = document.getElementById(btn.dataset.toggleSecret);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? t('Hiện','Show') : t('Ẩn','Hide');
  });
  $('#credential-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const submitBtn = ev.currentTarget.querySelector('button[type="submit"]');
    withButtonLoading(submitBtn, async () => {
      const nineRouterApiKey = ev.currentTarget.querySelector('[name="nineRouterApiKey"]')?.value || '';
      await api('/api/bot/credentials', { method: 'PUT', body: { projectDir: activeProjectDir(), nineRouterApiKey } });
      const msg = ev.currentTarget.querySelector('[data-cred-msg]');
      if (msg) msg.textContent = t('Đã lưu','Saved');
      await loadStatus();
    });
  });
  // Never prefill the connected project's path: installing over it would overwrite a live bot.
  $('#install')?.addEventListener('click', openInstallModal);
  document.querySelectorAll('[data-install-modal]').forEach(el => el.onclick = () => { state.installModalOpen = false; render(); });
  document.getElementById('install-form')?.addEventListener('input', (ev) => {
    const form = ev.currentTarget;
    refreshInstallDraft({ projectDir: form.querySelector('[name="projectDir"]')?.value, os: form.querySelector('[name="os"]')?.value, mode: form.querySelector('[name="mode"]')?.value });
    const preview = form.querySelector('[data-install-preview]');
    if (preview) preview.textContent = state.installDraft.projectDir;
  });
  document.querySelectorAll('[data-install-set]').forEach(btn => btn.onclick = () => {
    const key = btn.dataset.installSet;
    const value = btn.dataset.value;
    if (!key || !value) return;
    if (key === 'mode') state.installTab = value;
    const form = document.getElementById('install-form');
    const hidden = form?.querySelector(`[name="${key}"]`);
    if (hidden) hidden.value = value;
    refreshInstallDraft({ projectDir: form?.querySelector('[name="projectDir"]')?.value, os: form?.querySelector('[name="os"]')?.value, mode: form?.querySelector('[name="mode"]')?.value });
    render();
  });
  document.getElementById('install-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const submitBtn = ev.currentTarget.querySelector('button[type="submit"]');
    withButtonLoading(submitBtn, async () => {
      const form = ev.currentTarget;
      const body = {
        os: form.querySelector('[name="os"]')?.value || state.installDraft?.os || state.os,
        mode: form.querySelector('[name="mode"]')?.value || state.installTab || state.installDraft?.mode || state.mode,
        projectDir: form.querySelector('[name=\"projectDir\"]')?.value || '',
        userTimezone: state.tz,
      };
      if (!body.projectDir) throw new Error(t('Chưa có đường dẫn project','Missing project path'));
      await api('/api/install', { method: 'POST', body });
      state.installModalOpen = false;
      await loadSystem(true);
      await loadStatus(true);
      state.tab = 'logs';
      render();
    });
  });
  document.querySelectorAll('[data-router-key]').forEach(btn => btn.onclick = () => {
    const remote = !!state.install?.routerRemote;
    openPathModal({
      title: remote ? 'HVDTAI Router API key' : '9Router API key',
      message: remote
        ? t('Tạo key tại router.aivio.vn → Endpoints rồi dán vào đây. Bot dùng key này để gọi combo smart-route; lưu xong bot dùng key mới ngay ở lượt sau.', 'Create a key at router.aivio.vn → Endpoints and paste it here. Bots use it to call the smart-route combo; after saving, the next turn uses the new key.')
        : t('Dán key lấy ở mục Endpoints của 9Router cục bộ.', 'Paste the key from the local 9Router Endpoints page.'),
      placeholder: 'sk-...',
      eyebrow: t('Kết nối router', 'Router connection'),
      icon: '🔑',
      inputType: 'password',
      onConfirm: async (value) => {
        try {
          await api('/api/bot/credentials', { method: 'PUT', body: { projectDir: activeProjectDir(), nineRouterApiKey: value } });
          appendLogLine(t('✅ Đã lưu API key cho router.', '✅ Router API key saved.'));
        } catch (err) {
          appendLogLine(`❌ ${t('Không lưu được API key', 'Could not save the API key')}: ${err.message || err}`);
        }
        await loadStatus();
      },
    });
  });
  document.querySelectorAll('[data-path-action]').forEach(btn => btn.onclick = () => {
    const action = btn.dataset.pathAction;
    const modal = state.pathModal;
    if (!modal) return;
    if (action === 'ok') {
      const value = document.getElementById('path-modal-input')?.value?.trim() || '';
      const value2 = document.getElementById('path-modal-input2')?.value?.trim() || '';
      if (value && typeof modal.onConfirm === 'function') modal.onConfirm(value, value2);
    } else {
      if (typeof modal.onCancel === 'function') modal.onCancel();
    }
    state.pathModal = null;
    render();
  });
  $('#bot-create')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // Facebook Messenger needs the fb-messenger plugin (public on ClawHub). We don't block
    // creation - the heads-up modal on channel-select tells the user to install it from the
    // bot's Plugins section afterwards (installable via the openclaw-fb-messenger card).
    const submitBtn = ev.currentTarget.querySelector('button[type="submit"]');
    if (submitBtn?.classList.contains('is-loading')) return;
    await withButtonLoading(submitBtn, async () => {
    const fd = new FormData(ev.currentTarget);
    const body = Object.fromEntries(fd.entries());
    body.projectDir = activeProjectDir();
    body.channel = state.botChannel || 'telegram';
    body.userTimezone = state.tz;
    // Only the CREATE flow starts a Zalo QR login (the server kicks it off and sets
    // loginStarted). Editing a bot (rename, persona...) must never pop the QR modal -
    // the session is already saved and the PUT endpoint starts no login.
    if (body.channel === 'zalo-personal' && !state.botEditId) {
      state.botModalOpen = false;
      state.zaloLoginOpen = true;
      state.zaloQrDataUrl = '';
      state.zaloLoginLines = [t('Đang tạo bot và khởi động QR Zalo...', 'Creating bot and starting Zalo QR...')];
      render();
    }
    try {
      const isEdit = !!state.botEditId;
      const url = isEdit ? `/api/bot/${encodeURIComponent(state.botEditId)}` : '/api/bot/create';
      const method = isEdit ? 'PUT' : 'POST';
      const result = await api(url, { method, body });
      state.botMessage = `✅ ${isEdit ? t('Đã cập nhật','Updated') : t('Đã tạo','Created')} ${result.agentId}${result.warning ? ' - ' + result.warning : ''}`;
      showToast(isEdit ? t('Đã cập nhật', 'Updated') : t('Đã tạo bot', 'Bot created'), `${isEdit ? t('Đã cập nhật','Updated') : t('Đã tạo','Created')} bot ${result.agentId} thành công!`, 'success');
      state.botChannel = body.channel;
      state.botEditId = '';
      state.activeBotId = result.agentId;
      state.selectedFile = '';
      if (result.loginStarted) {
        state.botModalOpen = false;
        state.zaloLoginOpen = true;
        state.zaloLoginLines = [result.loginHint || 'Starting Zalo login...'];
        state.zaloQrDataUrl = result.zaloQrDataUrl || '';
        render();
      } else {
        state.zaloLoginOpen = false;
      }
      await loadSystem(true);
      await loadStatus(true);
      await loadFiles(true);
      state.botPane = 'list';
      state.botModalOpen = false;
      state.botEditId = '';
      render();
    } catch (err) {
      state.botMessage = `❌ ${err.message}`;
      showToast(t('Lỗi thao tác', 'Action error'), err.message, 'error');
      state.zaloLoginOpen = false;
      state.botModalOpen = true; // reopen modal to show the error
      render();
    }
    });
  });
  document.querySelectorAll('.save').forEach(btn => btn.onclick = () => withButtonLoading(btn, async () => { const name = btn.dataset.file; try { await api('/api/bot/files/'+encodeURIComponent(name), { method: 'PUT', body: { projectDir: activeProjectDir(), content: document.querySelector(`[data-editor="${CSS.escape(name)}"]`).value } }); showToast(t('Đã lưu', 'Saved'), t('Đã lưu tệp tin: ', 'Saved file: ') + fileBaseName(name), 'success'); btn.innerHTML=`${actionIcon('save')} ${ui('saved')}`; setTimeout(()=>btn.innerHTML=`${actionIcon('save')} ${ui('save')}`,1200); } catch (err) { showToast(t('Lưu thất bại', 'Save failed'), err.message, 'error'); } }));
  wireSkillsHandlers(document);
}

function escapeHtml(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fileBaseName(s='') { const clean = String(s).replace(/[\\/]+$/, ''); return clean.split(/[\\/]/).pop() || s; }
async function loadSystem(silent=false){ state.system = await api('/api/system'); if (!silent) render(); }
async function loadStatus(silent=false){
  const requestedProjectDir = activeProjectDir();
  const install = await api('/api/bot/status' + projectQuery());
  if (requestedProjectDir && install?.projectDir && install.projectDir !== requestedProjectDir) return;
  state.install = install;
  if (!state.selectedProjectDir && state.install?.projectDir) state.selectedProjectDir = state.install.projectDir;
  if (!silent) render();
  // Status is the first place we can actually see which runtime this project uses, so this is
  // where the Docker project gets told there is a better place to be.
  maybeOfferNativeMigration();
}
function autoSwitchBotChannel() {
  const bots = state.install?.bots || [];
  const ch = state.botChannel || 'telegram';
  if (!bots.some(b => b.channel === ch) && bots.length) {
    const firstCh = BOT_CHANNELS.find(c => bots.some(b => b.channel === c.id));
    if (firstCh) state.botChannel = firstCh.id;
  }
}
function currentBotId() {
  const bots = state.install?.bots || [];
  if (!bots.length) { state.activeBotId = ''; state.selectedFile = ''; return ''; }
  if (bots.some((b) => b.id === state.activeBotId)) return state.activeBotId;
  const pick = bots.find((b) => b.channel === state.botChannel && b.id !== 'bot') || bots.find((b) => b.channel === state.botChannel) || bots[0];
  state.activeBotId = pick.id;
  state.botChannel = pick.channel;
  return pick.id;
}
async function loadFiles(silent=false){
  const botId = currentBotId();
  if (!botId) { state.files = []; if (!silent) render(); return; }
  try {
    state.files = (await api('/api/bot/files' + projectQuery({ agentId: botId }))).files;
  } catch (_) {
    state.files = [];
  }
  if (!silent) render();
}
async function loadCatalog(silent=false){ state.catalog = await api('/api/catalog'); if (!silent) render(); }
function zaloAccountHealth(bot) {
  const accounts = state.zaloHealth?.accounts || [];
  return accounts.find((account) => account.agentId === bot?.id)
    || accounts.find((account) => account.accountId === (bot?.accountId || 'default'))
    || null;
}
// Connection/login labels for one bot. lastError wins over running: the gateway keeps
// running=true while the Zalo listener is stuck in a retry loop (e.g. "Đăng nhập thất
// bại"), so a running-first check painted dead bots green.
function zaloHealthBadges(bot) {
  const health = bot?.channel === 'zalo-personal' ? zaloAccountHealth(bot) : null;
  const loginFailed = !!health?.lastError && /đăng nhập|log ?in|auth|credential|session/i.test(String(health.lastError));
  const connection = !health ? t('Chưa rõ','Unknown')
    : health.lastError ? t('Mất kết nối','Disconnected')
    : health.running ? t('Đã kết nối','Connected')
    : t('Đang kết nối','Connecting');
  const login = !health ? t('Chưa rõ','Unknown')
    : loginFailed ? t('Phiên hết hạn','Session expired')
    : health.sessionSaved ? t('Đã đăng nhập','Logged in')
    : t('Chưa đăng nhập','Not logged in');
  const connectionTone = !health ? 'warn' : health.lastError ? 'bad' : health.running ? 'ok' : 'warn';
  const loginTone = !health ? 'warn' : loginFailed ? 'bad' : health.sessionSaved ? 'ok' : 'bad';
  return { health, connection, login, connectionTone, loginTone };
}
function zaloToolbar(channelBots = []) {
  const active = channelBots.find((bot) => bot.id === state.activeBotId) || channelBots[0];
  const health = zaloAccountHealth(active);
  const loginLabel = health?.sessionSaved ? t('Đăng nhập lại','Log in again') : t('Đăng nhập Zalo','Zalo Login');
  return `<div class="zalo-toolbar"><button class="secondary btn-inline" data-zalo-health-refresh type="button">${actionIcon('refresh')}<span>${t('Làm mới','Refresh')}</span></button><button class="secondary btn-inline" data-zalo-login-trigger type="button">${actionIcon('key')}<span>${loginLabel}</span></button></div>`;
}
async function loadZaloHealth(silent=false){
  if (!activeProjectDir()) { state.zaloHealth = null; return; }
  try { state.zaloHealth = await api('/api/zalo/health' + projectQuery()); } catch (_) { state.zaloHealth = null; }
  if (!silent) render();
}
// Patch the connection/login badges of the rendered bot cards in place. render() rebuilds
// the whole panel (killing focus/scroll), so the auto-refresh below must never call it.
function updateZaloHealthDom() {
  const bots = state.install?.bots || [];
  document.querySelectorAll('.bot-item[data-bot-id] .zalo-bot-health').forEach((wrap) => {
    const id = wrap.closest('[data-bot-id]')?.dataset.botId;
    const bot = bots.find((b) => b.id === id);
    if (!bot) return;
    const badges = zaloHealthBadges(bot);
    const ems = wrap.querySelectorAll('em');
    if (ems[0]) { ems[0].className = `badge ${badges.connectionTone}`; ems[0].textContent = badges.connection; }
    if (ems[1]) { ems[1].className = `badge ${badges.loginTone}`; ems[1].textContent = badges.login; }
  });
}
// Live status: poll the health endpoint while Zalo bots are on screen (the server caches
// the ~3s CLI probe with a short TTL, so this stays cheap) and patch the badges in place -
// no more pressing "Làm mới" to see a bot drop or come back.
const ZALO_HEALTH_POLL_MS = 10000;
let zaloHealthPollBusy = false;
// Debounced instant refresh for log-visible state changes (login saved, container
// restarted...) so the badges flip within ~2s instead of waiting out a poll tick.
let zaloHealthRefreshTimer = null;
function scheduleZaloHealthRefresh() {
  if (zaloHealthRefreshTimer) return;
  zaloHealthRefreshTimer = setTimeout(async () => {
    zaloHealthRefreshTimer = null;
    try { await loadZaloHealth(true); updateZaloHealthDom(); } catch (_) {}
  }, 1500);
}
setInterval(async () => {
  if (document.hidden || zaloHealthPollBusy) return;
  if (!activeProjectDir()) return;
  if (!document.querySelector('.bot-item[data-bot-id] .zalo-bot-health')) return;
  zaloHealthPollBusy = true;
  try { await loadZaloHealth(true); updateZaloHealthDom(); } finally { zaloHealthPollBusy = false; }
}, ZALO_HEALTH_POLL_MS);
async function loadFeatureFlags(silent=false){
  const botId=currentBotId();
  if (!activeProjectDir()) { state.featureFlags = {}; state.featureInstalled = {}; state.featureVersions = {}; if (!silent) render(); return; }
  try {
    const data = (await api('/api/features' + projectQuery({ agentId: botId }))) || {};
    state.featureFlags = data.flags || {};
    state.featureInstalled = data.installed || {};
    state.featureVersions = data.versions || {};
    state.featureLocked = data.locked || {};
    state.zaloBackend = data.zaloBackend || '';
    if (state.zaloBackend === 'zalo-connect') await loadZaloHealth(true).catch(() => {});
  } catch (_) {
    state.featureFlags = {};
    state.featureInstalled = {};
    state.featureVersions = {};
  }
  if (!silent) render();
}
function appendLogLine(line) {
  if (line.includes('Setup Wizard updated successfully')) {
    showToast(t('Đang khởi động lại UI', 'Restarting Setup UI'), t('Hệ thống đang tự khởi động lại để áp dụng phiên bản mới...', 'The system is restarting to apply the new version...'), 'info', 12000);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/system');
        if (res.ok) {
          clearInterval(interval);
          showToast(t('Cập nhật thành công', 'Update Success'), t('Setup Wizard đã được cập nhật lên phiên bản mới!', 'Setup Wizard has been updated to the new version!'), 'success');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      } catch (e) {
        if (attempts > 75) {
          clearInterval(interval);
          showToast(t('Lỗi kết nối', 'Connection Error'), t('Không thể kết nối lại với Setup UI. Vui lòng tự chạy lại lệnh khởi động.', 'Cannot reconnect to Setup UI. Please run start command manually.'), 'error');
        }
      }
    }, 2000);
  }

  const qrMatch = String(line).match(/^\[zalo-connect:qr\]\s+(data:image\/[a-zA-Z0-9.+-]+;base64,\S+)/);
  if (qrMatch) {
    state.zaloQrDataUrl = qrMatch[1];
    state.zaloLoginOpen = true;
    state.zaloLoginLines.push(t('Đã nhận QR Zalo. Quét mã để đăng nhập.', 'Zalo QR received. Scan to login.'));
    render();
    requestAnimationFrame(() => {
      const wrap = document.querySelector('.zalo-qr-image-wrap');
      if (!wrap && state.zaloLoginOpen && state.zaloQrDataUrl) render();
      document.querySelector('.zalo-login-modal')?.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return;
  }
  if (/\[zalo-connect\].*(login saved|listener (connected|start failed)|restarted|login failed|logged out)/i.test(line)) scheduleZaloHealthRefresh();
  const html = logLineHtml(line);
  if (state.zaloLoginOpen || /\[zalo-connect\]|zalo|qr|login|scan/i.test(line)) {
    state.zaloLoginLines.push(cleanTerminalLine(line));
    const qr = document.querySelector('[data-zalo-qr-log]');
    if (qr) { qr.textContent = state.zaloLoginLines.slice(-120).join('\n'); qr.scrollTop = qr.scrollHeight; }
    if (/\[zalo-connect\].*scan.*qr/i.test(line) && state.zaloQrDataUrl) {
      render();
      requestAnimationFrame(() => document.querySelector('.zalo-login-modal')?.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }
  document.querySelectorAll('.terminal.big,.live-log-terminal').forEach((el) => {
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 32;
    el.insertAdjacentHTML('beforeend', html);
    while (el.children.length > 500) el.firstElementChild?.remove();
    if (nearBottom) el.scrollTop = el.scrollHeight;
  });
}
function connectLogs() {
  const es = new EventSource('/api/install/logs');
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    // First message of every (re)connection: the server's recent history. Replace, never append,
    // so a reconnect does not duplicate lines, and skip appendLogLine's side effects (QR modal,
    // update reload) - those belong to lines that happen now, not to replayed ones.
    if (Array.isArray(msg.history)) {
      state.logs = msg.history.map((h) => h.line);
      document.querySelectorAll('.terminal.big, .live-log-terminal').forEach((el) => {
        const lines = el.classList.contains('big') ? state.logs : state.logs.slice(-40);
        el.innerHTML = lines.length ? lines.map((l) => logLineHtml(l)).join('') : `<p class="is-placeholder">${t('Chưa có hoạt động nào.', 'No activity yet.')}</p>`;
        el.scrollTop = el.scrollHeight;
      });
      return;
    }
    state.logs.push(msg.line);
    if (state.logs.length > 2000) state.logs.splice(0, state.logs.length - 2000);
    document.querySelectorAll('.terminal .is-placeholder').forEach((p) => p.remove());
    appendLogLine(msg.line);
  };
}
function cleanTerminalLine(s='') { return String(s).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '').replace(/[┌┐└┘├┤─│╭╮╯╰]/g, (c)=>c); }

function showToast(title, desc, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-card toast-card--${type}`;
  
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  
  toast.innerHTML = `
    <span class="toast-card__icon">${icon}</span>
    <div class="toast-card__body">
      <span class="toast-card__title">${escapeHtml(title)}</span>
      <span class="toast-card__desc">${escapeHtml(desc)}</span>
    </div>
    <button class="toast-card__close" aria-label="Close">&times;</button>
  `;

  toast.querySelector('.toast-card__close').onclick = () => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 400);
  };

  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 400);
      }
    }, duration);
  }
}

render();
Promise.allSettled([loadSystem(true), loadStatus(true), loadCatalog(true), loadMetrics()])
  .then(() => loadFeatureFlags(true).catch(() => {}))
  .finally(() => { render(); connectLogs(); });


