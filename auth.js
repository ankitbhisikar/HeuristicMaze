// ── auth.js ────────────────────────────────────────────────────────
// Firebase Authentication — real Google Sign-In + Firestore user save.
// Falls back to demo mode if firebase-config.js is not yet configured.

const IS_CONFIGURED = typeof FIREBASE_CONFIG !== 'undefined'
  && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';

const DEMO_ACCOUNTS = [
  { id:'admin_1',   name:'Ankit Dev',    email:'ankit@example.com', role:'admin',  is_admin:1, given_name:'Ankit', initials:'A', color:'#4285F4', picture:null },
  { id:'admin_2',   name:'Beacon Admin', email:'admin@beacon.app',  role:'admin',  is_admin:1, given_name:'Admin', initials:'B', color:'#7C9CFF', picture:null },
  { id:'usr_seed_2',name:'Priya Mehta',  email:'priya@beacon.app',  role:'member', is_admin:0, given_name:'Priya', initials:'P', color:'#34A853', picture:null },
];

// ── DOM refs ───────────────────────────────────────────────────────
const modalOverlay    = document.getElementById('authModal');
const modalClose      = document.getElementById('modalClose');
const navSignInBtn    = document.getElementById('navSignInBtn');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const userAvatar      = document.getElementById('userAvatar');
const userMenu        = document.getElementById('userMenu');
const menuUserName    = document.getElementById('menuUserName');
const menuUserEmail   = document.getElementById('menuUserEmail');
const logoutBtn       = document.getElementById('logoutBtn');

// ── Toast notifications on landing page ─────────────────────────────
function showLandingToast(msg, type = 'success') {
  let container = document.getElementById('landingToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'landingToastContainer';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const isSuccess = type === 'success';
  const icon = isSuccess
    ? `<svg width="18" height="18" fill="none" stroke="#6FCF97" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`
    : `<svg width="18" height="18" fill="none" stroke="#7C9CFF" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  const borderColor = isSuccess ? 'rgba(111,207,151,0.45)' : 'rgba(124,156,255,0.45)';

  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    background: #14171c;
    border: 1px solid ${borderColor};
    border-radius: 12px;
    padding: 14px 20px;
    color: #F0F4F8;
    font-size: 13.5px;
    font-weight: 500;
    box-shadow: 0 12px 36px rgba(0,0,0,0.55);
    opacity: 0;
    transform: translateY(16px);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: all;
  `;
  toast.innerHTML = `${icon}<span>${msg}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(16px)';
    setTimeout(() => toast.remove(), 320);
  }, 4500);
}

// ── Modal ──────────────────────────────────────────────────────────
function openModal()  { if (modalOverlay) { modalOverlay.classList.add('open');    document.body.style.overflow = 'hidden'; } }
function closeModal() { if (modalOverlay) { modalOverlay.classList.remove('open'); document.body.style.overflow = '';       } }

function showAuthError(msg) {
  const el = document.getElementById('authStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

// ── Session (localStorage for demo / Firebase for real) ────────────
function saveUser(u) { localStorage.setItem('beacon_user', JSON.stringify(u)); }
function loadUser()  { try { return JSON.parse(localStorage.getItem('beacon_user')); } catch { return null; } }
function clearUser() { localStorage.removeItem('beacon_user'); }

// ── Render nav ──────────────────────────────────────────────────────
function renderSignedIn(user) {
  if (navSignInBtn) navSignInBtn.style.display = 'none';
  if (userAvatar) {
    userAvatar.style.display = 'flex';
    const ph = user.picture || user.photoURL || null;
    userAvatar.innerHTML = ph
      ? `<img src="${ph}" alt="${user.name||user.displayName}" referrerpolicy="no-referrer"/>`
      : `<span style="font-size:13px;font-weight:700;color:${user.color||'var(--violet)'};">${(user.initials||user.name||'?')[0].toUpperCase()}</span>`;
  }
  if (menuUserName)  menuUserName.textContent  = user.name  || user.displayName || '—';
  if (menuUserEmail) menuUserEmail.textContent = user.email || '—';

  const heroTrialBtn = document.getElementById('heroTrialBtn');
  if (heroTrialBtn) {
    heroTrialBtn.textContent = 'Go to Dashboard →';
    heroTrialBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'dashboard.html';
    };
  }
}

function renderSignedOut() {
  if (navSignInBtn) navSignInBtn.style.display = '';
  if (userAvatar)   { userAvatar.style.display = 'none'; userAvatar.innerHTML = ''; }
  const heroTrialBtn = document.getElementById('heroTrialBtn');
  if (heroTrialBtn) {
    heroTrialBtn.textContent = 'Start free trial';
    heroTrialBtn.onclick = null;
  }
}

// ── Google Picker (demo only) ───────────────────────────────────────
function buildGooglePicker() {
  if (document.getElementById('googlePicker')) return;
  const overlay = document.createElement('div');
  overlay.id = 'googlePicker';
  overlay.style.cssText = `position:fixed;inset:0;z-index:600;display:flex;align-items:center;
    justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
    opacity:0;pointer-events:none;transition:opacity .2s;`;

  const accounts = DEMO_ACCOUNTS.map((acc, i) => `
    <div onclick="selectDemoAccount(${i})" style="display:flex;align-items:center;gap:16px;
      padding:14px 28px;cursor:pointer;transition:background .12s;"
      onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">
      <div style="width:40px;height:40px;border-radius:50%;background:${acc.color};color:#fff;
        display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;">
        ${acc.initials}
      </div>
      <div>
        <div style="font-size:14px;font-weight:500;color:#202124;display:flex;align-items:center;gap:8px;">
          ${acc.name}
          <span style="font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:4px;background:${acc.role==='admin'?'rgba(240,163,69,0.15)':'rgba(124,156,255,0.15)'};color:${acc.role==='admin'?'#D97706':'#4F46E5'};">
            ${acc.role === 'admin' ? '👑 Admin' : '👤 Member'}
          </span>
        </div>
        <div style="font-size:13px;color:#5f6368;">${acc.email}</div>
      </div>
    </div>`).join('');

  overlay.innerHTML = `
    <div id="googlePickerCard" style="background:#fff;border-radius:28px;overflow:hidden;
      width:100%;max-width:400px;margin:16px;position:relative;
      box-shadow:0 24px 64px rgba(0,0,0,0.35);
      transform:translateY(10px) scale(.97);transition:transform .22s,opacity .22s;opacity:0;">
      <div style="padding:36px 36px 24px;text-align:center;">
        <svg height="26" viewBox="0 0 75 24" style="margin-bottom:20px;">
          <path fill="#4285F4" d="M-3.264 51.509c0 1.333-.268 2.605-.836 3.817h-20.03v-7.201h11.467c-.529-2.701-1.985-4.5-4.129-5.612v-4.669h6.685c3.912 3.61 6.143 8.949 6.143 13.665z" transform="translate(55.853 -33.534)"/>
          <path fill="#34A853" d="M-35.043 48.08c2.694 0 4.955-.893 6.604-2.42l-6.604-5.128c-.893.6-2.035.956-3.421.956-2.629 0-4.859-1.775-5.657-4.167h-6.826v5.287c1.641 3.258 5.014 5.472 9.117 5.472h2.787z" transform="translate(62.48 -24.08)"/>
          <path fill="#FBBC05" d="M-47.154 29.876c-.2-.6-.314-1.242-.314-1.901s.113-1.3.314-1.9V20.788h-6.826c-1.383 2.759-2.175 5.867-2.175 9.187s.792 6.428 2.175 9.187l6.826-5.286z" transform="translate(56.168 -14.762)"/>
          <path fill="#EA4335" d="M-35.043 17.536c3.044 0 5.773 1.046 7.926 3.101l5.939-5.942C-24.098 11.14-29.228 9-35.043 9c-4.103 0-7.476 2.214-9.117 5.472l6.826 5.286c.798-2.393 3.028-4.222 5.657-4.222h2.634z" transform="translate(62.48 -9)"/>
        </svg>
        <div style="font-family:Roboto,Arial,sans-serif;font-size:23px;color:#202124;margin-bottom:8px;">Sign in</div>
        <div style="font-family:Roboto,Arial,sans-serif;font-size:14px;color:#5f6368;">
          to continue to <strong style="color:#202124;">beacon</strong>
          <span style="font-size:11px;display:block;margin-top:4px;color:#999;">(demo mode — configure firebase-config.js for real auth)</span>
        </div>
      </div>
      <div style="border-top:1px solid #e8eaed;border-bottom:1px solid #e8eaed;">
        ${accounts}
      </div>
      <div style="padding:16px 24px;display:flex;justify-content:flex-end;gap:16px;
        font-family:Roboto,Arial,sans-serif;font-size:12px;color:#5f6368;">
        <a href="#" style="color:#5f6368;text-decoration:none;">Privacy</a>
        <a href="#" style="color:#5f6368;text-decoration:none;">Terms</a>
      </div>
      <div id="pickerLoader" style="display:none;position:absolute;inset:0;background:rgba(255,255,255,.9);
        border-radius:28px;align-items:center;justify-content:center;flex-direction:column;gap:14px;">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2"
             style="animation:spin .9s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-opacity=".15"/><path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        <div style="font-family:Roboto,Arial,sans-serif;font-size:14px;color:#5f6368;">Signing you in…</div>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeGooglePicker(); });
  document.body.appendChild(overlay);
}

function openGooglePicker() {
  buildGooglePicker();
  const ov = document.getElementById('googlePicker');
  const c  = document.getElementById('googlePickerCard');
  ov.style.opacity = '1'; ov.style.pointerEvents = 'all';
  c.style.opacity = '1';  c.style.transform = 'translateY(0) scale(1)';
}

function closeGooglePicker() {
  const ov = document.getElementById('googlePicker');
  if (!ov) return;
  ov.style.opacity = '0'; ov.style.pointerEvents = 'none';
}

window.selectDemoAccount = async function(i) {
  const acc    = DEMO_ACCOUNTS[i];
  const loader = document.getElementById('pickerLoader');
  if (loader) loader.style.display = 'flex';
  try {
    await fetch('/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(acc)
    });
  } catch (_) {}
  saveUser(acc);
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
};

// ── Real Firebase sign-in ──────────────────────────────────────────
function startFirebaseSignIn() {
  if (!googleSignInBtn) return;
  googleSignInBtn.disabled = true;
  googleSignInBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4285F4"
    stroke-width="2" style="animation:spin .8s linear infinite;flex-shrink:0;">
    <circle cx="12" cy="12" r="10" stroke-opacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/>
    </svg> Signing in with Google…`;

  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  const auth     = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email'); provider.addScope('profile');

  auth.signInWithPopup(provider).then(result => {
    // Auth success — dashboard.html auth guard will redirect
    window.location.href = 'dashboard.html';
  }).catch(err => {
    googleSignInBtn.disabled = false;
    googleSignInBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg> Continue with Google`;
    const msgs = {
      'auth/popup-closed-by-user':  'Sign-in popup was closed.',
      'auth/popup-blocked':         'Popup blocked — allow popups for this site.',
      'auth/network-request-failed':'Network error. Check your connection.',
      'auth/unauthorized-domain':   'Domain not authorized. Add localhost in Firebase Console → Authentication → Authorized domains.',
    };
    showAuthError(msgs[err.code] || err.message);
  });
}

// ── Main sign-in entry point ────────────────────────────────────────
function startGoogleSignIn() {
  if (!IS_CONFIGURED) {
    closeModal();
    openGooglePicker();
  } else {
    startFirebaseSignIn();
  }
}

async function signOutUser() {
  clearUser();
  sessionStorage.clear();
  if (IS_CONFIGURED && typeof firebase !== 'undefined' && firebase.apps.length) {
    try { await firebase.auth().signOut(); } catch (_) {}
  }
  try {
    await fetch('/auth/logout', { method: 'GET', credentials: 'include' });
  } catch (_) {}
  window.location.href = 'index.html?logged_out=true&signin=true';
}

// ── Avatar dropdown ─────────────────────────────────────────────────
if (userAvatar) {
  userAvatar.addEventListener('click', e => { e.stopPropagation(); userMenu?.classList.toggle('visible'); });
}
document.addEventListener('click', () => userMenu?.classList.remove('visible'));
userMenu?.addEventListener('click', e => e.stopPropagation());

// ── Wire up ─────────────────────────────────────────────────────────
navSignInBtn?.addEventListener('click', openModal);
modalClose?.addEventListener('click', closeModal);
googleSignInBtn?.addEventListener('click', startGoogleSignIn);
logoutBtn?.addEventListener('click', signOutUser);
modalOverlay?.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeGooglePicker(); } });

// ── Auth state on page load ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const isLanding = !!document.getElementById('authModal');
  if (!isLanding) return;

  const urlParams = new URLSearchParams(window.location.search);
  const isLoggedOut = urlParams.get('logged_out') === 'true';
  const isAuthRequired = urlParams.get('auth_required') === 'true';
  const isSignInRequested = urlParams.get('signin') === 'true';

  if (isLoggedOut || isAuthRequired || isSignInRequested) {
    clearUser();
    sessionStorage.clear();
    renderSignedOut();

    if (isLoggedOut) {
      showLandingToast('You have been signed out successfully. ✓', 'success');
    } else if (isAuthRequired) {
      showLandingToast('Please sign in to access your dashboard.', 'info');
    }

    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Automatically open the sign-in modal so the user returns to the sign-in page
    setTimeout(() => {
      openModal();
    }, 250);
    return;
  }

  // Check server session first
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const serverUser = await res.json();
      if (serverUser && serverUser.id) {
        saveUser(serverUser);
        renderSignedIn(serverUser);
        return;
      }
    }
  } catch (_) {}

  // Check demo session in localStorage
  const demoUser = loadUser();
  if (demoUser && demoUser.id) {
    renderSignedIn(demoUser);
    return;
  }

  // Check Firebase session
  if (IS_CONFIGURED) {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(user => {
      if (user) renderSignedIn(user);
      else      renderSignedOut();
    });
  } else {
    renderSignedOut();
  }
});
