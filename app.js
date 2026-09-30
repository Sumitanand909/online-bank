(() => {
  'use strict';

  const KEY = 'kaveri-bank-demo-v2';
  const DEMO_OTP = '123456';
  const IMPS_LIMIT = 200000;
  const IDLE_MS = 5 * 60 * 1000;
  const MAX_TOPUP = 100000;
  const MAX_OPENING = 1000000;

  const BRANCHES = [
    { name: 'Karol Bagh, New Delhi', ifsc: 'KVRB0000012' },
    { name: 'Connaught Place, New Delhi', ifsc: 'KVRB0000021' },
    { name: 'Lajpat Nagar, New Delhi', ifsc: 'KVRB0000034' },
    { name: 'Dwarka Sector 10, New Delhi', ifsc: 'KVRB0000047' },
    { name: 'Sector 18, Noida', ifsc: 'KVRB0000058' }
  ];
  const ACCOUNT_TYPES = {
    Savings: { label: 'Savings Account', min: 1000 },
    Current: { label: 'Current Account', min: 10000 },
    Salary:  { label: 'Salary Account', min: 500 }
  };

  /* ---------------- helpers ---------------- */

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);
  const round2 = n => Math.round(n * 100) / 100;
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); };
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = s => parseISO(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const last4 = s => s.slice(-4);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const maskMobile = m => `+91 ${m.slice(0, 2)}XXX XX${m.slice(-3)}`;

  // sessionStorage can be blocked inside some embedded previews, so fall back to memory
  const mem = {};
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return mem[k] || null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { delete mem[k]; } }
  };

  function randomDigits(len, prefix, exists) {
    let s;
    do {
      s = prefix;
      while (s.length < len) s += Math.floor(Math.random() * 10);
    } while (exists(s));
    return s;
  }

  /* passwords are salted and hashed with SHA-256 where the browser allows it */
  const toHex = buf => Array.from(new Uint8Array(buf)).map(b => pad(b.toString(16))).join('');
  async function hashPw(pw, salt, kind) {
    if (kind !== 'p0' && window.crypto && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pw));
        return 'h1:' + toHex(buf);
      } catch (e) { /* fall through */ }
    }
    return 'p0:' + btoa(unescape(encodeURIComponent(salt + pw)));
  }
  async function verifyPw(pw, user) {
    const kind = user.pwHash.slice(0, 2);
    return (await hashPw(pw, user.salt, kind)) === user.pwHash;
  }
  const newSalt = () => Math.random().toString(36).slice(2, 10);

  /* ---------------- data ---------------- */

  async function seedDemoUser() {
    const accounts = [
      { id: 'sav', name: 'Savings Account', type: 'Savings', no: '50100234417471', ifsc: 'KVRB0000012', branch: BRANCHES[0].name, opened: '2019-06-18', balance: 184250.75, canSend: true },
      { id: 'sal', name: 'Salary Account', type: 'Salary', no: '50100234419028', ifsc: 'KVRB0000012', branch: BRANCHES[0].name, opened: '2021-02-03', balance: 58240.00, canSend: true },
      { id: 'fd',  name: 'Fixed Deposit', type: 'Term deposit', no: '50100234420615', ifsc: 'KVRB0000012', branch: BRANCHES[0].name, opened: '2024-08-14', balance: 500000.00, canSend: false, note: '7.10% p.a., matures 14 Aug 2027' }
    ];
    // newest first: [days ago, details, amount, category]
    const raw = {
      sav: [
        [1, 'UPI/Swiggy/Order 8841', -642, 'Dining'],
        [2, 'ACH D- BSES Rajdhani Power', -2184, 'Bills'],
        [3, 'UPI/BigBasket/Groceries', -3890.5, 'Groceries'],
        [4, 'Transfer from Salary A/c XXXX9028', 40000, 'Transfer'],
        [6, 'ATM WDL Karol Bagh Branch', -5000, 'Cash'],
        [7, 'UPI/Uber India', -418, 'Transport'],
        [9, 'NEFT-Rent-Mr S Khanna', -22000, 'Rent'],
        [11, 'UPI/Amazon Pay', -1799, 'Shopping'],
        [13, 'IMPS/Rahul Verma/Dinner split', 3500, 'Transfer'],
        [15, 'Airtel Postpaid 98101XXXXX', -899, 'Bills'],
        [17, 'UPI/Zomato', -756, 'Dining'],
        [20, 'Interest credit for the quarter', 1120.45, 'Interest']
      ],
      sal: [
        [4, 'Transfer to Savings A/c XXXX7471', -40000, 'Transfer'],
        [5, 'Salary - NEXORA SYSTEMS PVT LTD', 96500, 'Salary'],
        [8, 'UPI/Reliance Smart Bazaar', -2310, 'Groceries'],
        [26, 'Transfer to Savings A/c XXXX7471', -40000, 'Transfer'],
        [33, 'Salary - NEXORA SYSTEMS PVT LTD', 96500, 'Salary']
      ],
      fd: [[40, 'Interest credit - quarterly payout', 8875, 'Interest']]
    };
    const all = [];
    accounts.forEach(a => {
      let running = a.balance;
      raw[a.id].forEach(([d, desc, amt, cat]) => {
        all.push({ acc: a.id, date: daysAgo(d), desc, amt, cat, bal: round2(running), ref: '' });
        running = round2(running - amt);
      });
    });
    all.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    all.forEach((t, i) => { t.id = i + 1; t.ref = 'KB' + (700000 + i * 37); });

    const prev = new Date(); prev.setDate(prev.getDate() - 1); prev.setHours(21, 14, 0, 0);
    const salt = newSalt();
    return {
      id: 'u1', customerId: '40218836', email: 'ananya.sharma@example.com',
      salt, pwHash: await hashPw('Demo@123', salt),
      profile: { name: 'Ananya Sharma', mobile: '9810004127', dob: '1994-03-21', branch: BRANCHES[0].name, address: 'B-42, Lajpat Nagar II, New Delhi 110024' },
      accounts, txns: all, nextId: all.length + 1,
      payees: [
        { id: 1, name: 'Rahul Verma', acc: '604122378890', ifsc: 'UNIB0001234' },
        { id: 2, name: 'Sunil Khanna', acc: '31420077115', ifsc: 'KVRB0000045' },
        { id: 3, name: 'Meera Sharma', acc: '9182736450019', ifsc: 'UNIB0004410' }
      ],
      lastLogin: prev.toISOString()
    };
  }

  let db = null;      // { v, users: [] }
  let me = null;      // the logged-in customer
  let prevLogin = null;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage may be blocked */ }
  }
  async function loadDb() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 2 && Array.isArray(s.users)) return s;
    } catch (e) { /* reseed */ }
    const fresh = { v: 2, users: [await seedDemoUser()] };
    db = fresh; save();
    return fresh;
  }

  const acct = id => me.accounts.find(a => a.id === id);
  const sortedTxns = () => me.txns.slice().sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  const findAccountByNumber = (no, ifsc) => {
    for (const u of db.users) for (const a of u.accounts) if (a.no === no && a.ifsc === ifsc) return { user: u, account: a };
    return null;
  };
  const numberTaken = no => db.users.some(u => u.accounts.some(a => a.no === no));

  function addTxn(user, accId, fields) {
    user.txns.push({ id: user.nextId++, acc: accId, ...fields });
  }

  /* ---------------- forms: shared bits ---------------- */

  function setErr(id, msg) {
    const el = $('#' + id);
    el.textContent = msg || '';
    const prev = el.previousElementSibling;
    const input = prev && prev.matches('input,select') ? prev : el.parentElement.querySelector('input,select');
    if (input) input.classList.toggle('invalid', !!msg);
  }
  function clearErrors(form) {
    $$('.err', form).forEach(e => { e.textContent = ''; });
    $$('.invalid', form).forEach(i => i.classList.remove('invalid'));
  }
  const strongPw = p => p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
  const PW_MSG = 'Use at least 8 characters with a capital letter, a number and a symbol.';

  /* ---------------- login screen ---------------- */

  const loginScreen = $('#login-screen');
  const appEl = $('#app');
  let attempts = 0, lockTimer = null, idleTimer = null;

  function showPane(which) {
    ['login', 'signup', 'done'].forEach(p => { $('#' + p + '-pane').hidden = p !== which; });
    $('#login-main').classList.toggle('wide', which !== 'login');
    window.scrollTo(0, 0);
  }

  function showLoginMsg(text, type) {
    const box = $('#login-msg');
    if (!text) { box.hidden = true; return; }
    box.textContent = text;
    box.className = 'alert' + (type ? ' ' + type : '');
    box.hidden = false;
  }

  $('#pw-toggle').addEventListener('click', e => {
    const input = $('#cust-pw');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.target.textContent = show ? 'Hide' : 'Show';
  });

  $('#go-signup').addEventListener('click', e => { e.preventDefault(); showPane('signup'); $('#su-name').focus(); });
  $('#go-login').addEventListener('click', e => { e.preventDefault(); showPane('login'); $('#cust-id').focus(); });

  function lockLogin(seconds) {
    const btn = $('#login-btn');
    btn.disabled = true;
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        clearInterval(lockTimer);
        attempts = 0; btn.disabled = false;
        showLoginMsg('You can try logging in again now.', 'info');
        return;
      }
      showLoginMsg(`Too many incorrect attempts. Please wait ${left} seconds before trying again.`);
      left--;
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#cust-id').value.trim().toLowerCase();
    const pw = $('#cust-pw').value;
    if (!id || !pw) { showLoginMsg('Enter your Customer ID (or email) and password.'); return; }

    await ready;
    const user = db.users.find(u => u.customerId === id || u.email === id);
    const ok = user ? await verifyPw(pw, user) : false;

    if (!ok) {
      attempts++;
      if (attempts >= 3) { lockLogin(30); return; }
      const left = 3 - attempts;
      showLoginMsg(`The Customer ID or password is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`);
      return;
    }

    attempts = 0;
    prevLogin = user.lastLogin || null;
    user.lastLogin = new Date().toISOString();
    save();
    ss.set('kb-user', user.id);
    ss.set('kb-prev', prevLogin || '');
    $('#cust-pw').value = '';
    showLoginMsg('');
    enterApp(user);
  });

  /* ---------------- sign-up ---------------- */

  $('#su-branch').innerHTML = BRANCHES.map((b, i) => `<option value="${i}">${esc(b.name)}</option>`).join('');
  (() => {
    const max = new Date(); max.setFullYear(max.getFullYear() - 18);
    $('#su-dob').max = toISO(max);
  })();

  function updateDepositHint() {
    const t = ACCOUNT_TYPES[$('#su-type').value];
    $('#su-deposit-hint').textContent = `Minimum ${money(t.min).replace('.00', '')} for a ${t.label}.`;
  }
  $('#su-type').addEventListener('change', updateDepositHint);
  updateDepositHint();

  $('#signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    clearErrors(form);
    await ready;

    const name = $('#su-name').value.trim().replace(/\s+/g, ' ');
    const email = $('#su-email').value.trim().toLowerCase();
    const mobile = $('#su-mobile').value.replace(/\s+/g, '');
    const dob = $('#su-dob').value;
    const typeKey = $('#su-type').value;
    const type = ACCOUNT_TYPES[typeKey];
    const branch = BRANCHES[Number($('#su-branch').value)];
    const depRaw = $('#su-deposit').value.replace(/,/g, '').trim();
    const deposit = round2(parseFloat(depRaw));
    const pw = $('#su-pw').value, pw2 = $('#su-pw2').value;
    let ok = true;
    const bad = (id, msg) => { setErr(id, msg); ok = false; };

    if (name.length < 3 || !/^[A-Za-z][A-Za-z.' ]*$/.test(name)) bad('su-name-err', 'Enter your full name as it appears on your ID, using letters only.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad('su-email-err', 'Enter a valid email address, for example name@example.com.');
    else if (db.users.some(u => u.email === email)) bad('su-email-err', 'An account with this email already exists. Try logging in instead.');
    if (!/^[6-9]\d{9}$/.test(mobile)) bad('su-mobile-err', 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.');
    if (!dob) bad('su-dob-err', 'Enter your date of birth.');
    else if (dob > $('#su-dob').max) bad('su-dob-err', 'You must be at least 18 years old to open an account.');
    if (!/^\d+(\.\d{1,2})?$/.test(depRaw) || !(deposit > 0)) bad('su-deposit-err', 'Enter the amount you want to deposit, for example 5000.');
    else if (deposit < type.min) bad('su-deposit-err', `The minimum opening deposit for a ${type.label} is ${money(type.min).replace('.00', '')}.`);
    else if (deposit > MAX_OPENING) bad('su-deposit-err', 'For this demo, the opening deposit can be at most ₹10,00,000.');
    if (!strongPw(pw)) bad('su-pw-err', PW_MSG);
    if (pw2 !== pw) bad('su-pw2-err', 'The two passwords do not match.');
    if (!$('#su-terms').checked) bad('su-terms-err', 'Please accept the terms to continue.');
    if (!ok) { const first = $('.invalid', form); if (first) first.focus(); return; }

    $('#su-btn').disabled = true;
    const salt = newSalt();
    const user = {
      id: 'u' + Date.now(),
      customerId: randomDigits(8, '4', s => db.users.some(u => u.customerId === s)),
      email, salt, pwHash: await hashPw(pw, salt),
      profile: { name, mobile, dob, branch: branch.name, address: '' },
      accounts: [], txns: [], payees: [], nextId: 1, lastLogin: null
    };
    const account = {
      id: 'a1', name: type.label, type: typeKey,
      no: randomDigits(14, '5010', numberTaken), ifsc: branch.ifsc, branch: branch.name,
      opened: toISO(new Date()), balance: deposit, canSend: true
    };
    user.accounts.push(account);
    addTxn(user, account.id, { date: account.opened, desc: 'Opening deposit - cash at branch', amt: deposit, cat: 'Deposit', bal: deposit, ref: 'KB' + String(Date.now()).slice(-7) });
    db.users.push(user);
    save();

    $('#done-dl').innerHTML = [
      ['Name', name],
      ['Customer ID', user.customerId],
      ['Account type', type.label],
      ['Account number', account.no],
      ['IFSC', `${account.ifsc} (${branch.name})`],
      ['Opening balance', money(deposit)]
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${k === 'Customer ID' || k === 'Account number' ? '<strong>' + esc(v) + '</strong>' : esc(v)}</dd></div>`).join('');
    $('#done-login').dataset.cid = user.customerId;
    form.reset(); updateDepositHint();
    $('#su-btn').disabled = false;
    showPane('done');
  });

  $('#done-login').addEventListener('click', e => {
    showPane('login');
    $('#cust-id').value = e.target.dataset.cid || '';
    showLoginMsg('Your account has been created. Log in with the password you just set.', 'ok');
    $('#cust-pw').focus();
  });

  /* ---------------- session ---------------- */

  function enterApp(user) {
    me = user;
    loginScreen.hidden = true;
    appEl.hidden = false;
    prevLogin = prevLogin !== null ? prevLogin : (ss.get('kb-prev') || null);
    $('#last-login').textContent = prevLogin
      ? 'Last login: ' + new Date(prevLogin).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Welcome to Online Bank';
    $('#who-name').textContent = me.profile.name;
    resetStmt();
    resetIdle();
    if (!location.hash) location.hash = '#overview';
    firstRender = true;
    route();
  }

  function logout(message, type) {
    ss.del('kb-user'); ss.del('kb-prev');
    clearTimeout(idleTimer);
    me = null; prevLogin = null;
    appEl.hidden = true;
    loginScreen.hidden = false;
    try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
    $('#cust-id').value = ''; $('#cust-pw').value = '';
    $('#receipt').hidden = true;
    showPane('login');
    showLoginMsg(message || 'You have been logged out safely.', type || 'ok');
    $('#cust-id').focus();
  }
  $('#logout-btn').addEventListener('click', () => logout());

  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if ($('#confirm-dlg').open) $('#confirm-dlg').close();
      logout('You were logged out because there was no activity for 5 minutes.', 'info');
    }, IDLE_MS);
  }
  let lastMove = 0;
  ['click', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (!appEl.hidden) resetIdle(); }, true));
  document.addEventListener('mousemove', () => {
    const now = Date.now();
    if (!appEl.hidden && now - lastMove > 5000) { lastMove = now; resetIdle(); }
  });

  /* ---------------- routing ---------------- */

  const routes = ['overview', 'statements', 'transfer', 'payees', 'profile'];
  const titles = { overview: 'Account overview', statements: 'Statements', transfer: 'Transfer funds', payees: 'Payees', profile: 'My profile' };
  let firstRender = true;

  function route() {
    if (appEl.hidden || !me) return;
    let r = location.hash.replace('#', '');
    if (!routes.includes(r)) r = 'overview';

    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + r; });
    $$('.side a').forEach(a => {
      const on = a.dataset.route === r;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    if (r === 'overview') renderOverview();
    if (r === 'statements') renderStatements(true);
    if (r === 'transfer') renderTransferForm();
    if (r === 'payees') renderPayees();
    if (r === 'profile') renderProfile();

    document.title = 'Online Bank | ' + titles[r];
    if (!firstRender) {
      const h = $('#view-' + r + ' h1');
      if (h) h.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    firstRender = false;
  }
  window.addEventListener('hashchange', route);

  /* ---------------- overview ---------------- */

  let hideBalances = false;
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  function renderOverview() {
    $('#greeting').textContent = `${greeting()}, ${me.profile.name.split(' ')[0]}`;
    $('#ov-sub').textContent = `Customer ID ${me.customerId} \u00b7 ` + new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#welcome-note').hidden = me.txns.length > 1;

    const show = v => (hideBalances ? '₹ ••••••' : money(v));
    $('#toggle-bal').textContent = hideBalances ? 'Show balances' : 'Hide balances';

    $('#acct-rows').innerHTML = me.accounts.map(a => `
      <tr>
        <td>
          <strong>${esc(a.name)}</strong>
          <span class="sub-line">A/c no. ${esc(a.no)}${a.note ? ' &middot; ' + esc(a.note) : ''}</span>
        </td>
        <td>${esc(a.type)}</td>
        <td class="num"><strong>${show(a.balance)}</strong></td>
        <td class="actions-cell">
          <a href="#statements" data-stmt="${a.id}">Statement</a>
          ${a.canSend ? `<a href="#transfer" data-send="${a.id}">Transfer</a>` : ''}
        </td>
      </tr>`).join('');
    $('#total-bal').textContent = show(me.accounts.reduce((s, a) => s + a.balance, 0));

    const recent = sortedTxns().slice(0, 6);
    $('#recent-rows').innerHTML = recent.length ? recent.map(t => `
      <tr>
        <td class="date">${fmtDate(t.date)}</td>
        <td>${esc(t.desc)}<span class="sub-line">${esc(acct(t.acc).name)}</span></td>
        <td class="num ${t.amt > 0 ? 'cr' : ''}">${t.amt > 0 ? '+' : '&minus;'} ${money(Math.abs(t.amt)).replace('₹', '₹ ')}</td>
      </tr>`).join('') : '<tr><td colspan="3" class="empty">No transactions yet.</td></tr>';

    renderSpending();
  }

  function renderSpending() {
    const from = daysAgo(30);
    const totals = {};
    me.txns.forEach(t => {
      if (t.amt < 0 && t.date >= from && t.cat !== 'Transfer') totals[t.cat] = (totals[t.cat] || 0) - t.amt;
    });
    const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const box = $('#spend');
    if (!rows.length) { box.innerHTML = '<p class="hint" style="margin:0">Nothing spent in the last 30 days. Card, UPI and cash spending will be grouped here.</p>'; return; }
    const max = rows[0][1];
    box.innerHTML = rows.map(([cat, amt]) => `
      <div class="spend-row">
        <div class="spend-top"><span>${esc(cat)}</span><span>${money(amt).replace('.00', '')}</span></div>
        <div class="bar"><i style="width:${Math.max(4, (amt / max) * 100)}%"></i></div>
      </div>`).join('');
  }

  $('#toggle-bal').addEventListener('click', () => { hideBalances = !hideBalances; renderOverview(); });
  $('#acct-rows').addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.stmt) stmt.acc = a.dataset.stmt;
    if (a.dataset.send) preselectFrom = a.dataset.send;
  });

  /* ---------------- statements ---------------- */

  const stmt = { acc: 'all', type: 'all', q: '', from: '', to: '', limit: 15 };
  const resetStmt = () => Object.assign(stmt, { acc: 'all', type: 'all', q: '', from: '', to: '', limit: 15 });

  function filteredTxns() {
    const q = stmt.q.trim().toLowerCase();
    return sortedTxns().filter(t =>
      (stmt.acc === 'all' || t.acc === stmt.acc) &&
      (stmt.type === 'all' || (stmt.type === 'cr' ? t.amt > 0 : t.amt < 0)) &&
      (!stmt.from || t.date >= stmt.from) &&
      (!stmt.to || t.date <= stmt.to) &&
      (!q || t.desc.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q))
    );
  }

  function renderStatements(syncInputs) {
    if (syncInputs) {
      $('#f-acc').innerHTML = '<option value="all">All accounts</option>' +
        me.accounts.map(a => `<option value="${a.id}">${esc(a.name)} (XXXX${last4(a.no)})</option>`).join('');
      $('#f-acc').value = stmt.acc;
      $('#f-type').value = stmt.type;
      $('#f-from').value = stmt.from;
      $('#f-to').value = stmt.to;
      $('#f-q').value = stmt.q;
    }
    const list = filteredTxns();
    const shown = list.slice(0, stmt.limit);
    const single = stmt.acc !== 'all';

    $$('#stmt-table .col-bal').forEach(el => { el.hidden = !single; });
    $$('#stmt-table .col-acc').forEach(el => { el.hidden = single; });
    $('#stmt-count').textContent = list.length ? `Showing ${shown.length} of ${list.length} transactions` : '';

    $('#stmt-rows').innerHTML = shown.length ? shown.map(t => `
      <tr>
        <td class="date">${fmtDate(t.date)}</td>
        <td>${esc(t.desc)}<span class="sub-line">Ref ${esc(t.ref)}</span></td>
        <td class="col-acc" ${single ? 'hidden' : ''}>${esc(acct(t.acc).name)}</td>
        <td class="num">${t.amt < 0 ? money(-t.amt) : ''}</td>
        <td class="num cr">${t.amt > 0 ? money(t.amt) : ''}</td>
        <td class="num col-bal" ${single ? '' : 'hidden'}>${money(t.bal)}</td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="empty">No transactions match these filters. Try widening the dates or clearing the search.</td></tr>`;

    $('#more-wrap').hidden = list.length <= stmt.limit;
    $('#csv-btn').disabled = !list.length;
  }

  const bindFilter = (sel, key, ev = 'input') => $(sel).addEventListener(ev, e => {
    stmt[key] = e.target.value; stmt.limit = 15; renderStatements(false);
  });
  bindFilter('#f-acc', 'acc', 'change');
  bindFilter('#f-type', 'type', 'change');
  bindFilter('#f-from', 'from', 'change');
  bindFilter('#f-to', 'to', 'change');
  bindFilter('#f-q', 'q');
  $('#f-reset').addEventListener('click', () => { resetStmt(); renderStatements(true); });
  $('#more-btn').addEventListener('click', () => { stmt.limit += 15; renderStatements(false); });

  $('#csv-btn').addEventListener('click', () => {
    const rows = [['Date', 'Account', 'Details', 'Reference', 'Debit', 'Credit', 'Balance']];
    filteredTxns().forEach(t => rows.push([
      t.date, acct(t.acc).name, t.desc, t.ref,
      t.amt < 0 ? (-t.amt).toFixed(2) : '', t.amt > 0 ? t.amt.toFixed(2) : '', t.bal.toFixed(2)
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `online-bank-statement-${toISO(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  /* ---------------- transfer ---------------- */

  let preselectFrom = null, preselectTo = null, pendingTransfer = null;

  function renderTransferForm() {
    const senders = me.accounts.filter(a => a.canSend);
    const from = $('#t-from');
    from.innerHTML = senders.map(a => `<option value="${a.id}">${esc(a.name)} (XXXX${last4(a.no)})</option>`).join('');
    if (preselectFrom && senders.some(a => a.id === preselectFrom)) from.value = preselectFrom;
    preselectFrom = null;

    const to = $('#t-to');
    const prevTo = preselectTo || to.value;
    to.innerHTML = '<option value="">Select an account or payee</option>' +
      (senders.length > 1 ? '<optgroup label="My accounts">' + senders.map(a => `<option value="own:${a.id}">${esc(a.name)} (XXXX${last4(a.no)})</option>`).join('') + '</optgroup>' : '') +
      (me.payees.length ? '<optgroup label="Saved payees">' + me.payees.map(p => `<option value="pay:${p.id}">${esc(p.name)} (XXXX${last4(p.acc)})</option>`).join('') + '</optgroup>' : '');
    if (prevTo) to.value = prevTo;
    preselectTo = null;
    updateTransferHints();

    $('#am-acc').innerHTML = senders.map(a => `<option value="${a.id}">${esc(a.name)} (XXXX${last4(a.no)})</option>`).join('');
  }

  function updateTransferHints() {
    const a = acct($('#t-from').value);
    $('#t-from-bal').textContent = a ? `Available balance: ${money(a.balance)}` : '';
    $('#t-mode-wrap').hidden = !$('#t-to').value.startsWith('pay:');
  }
  $('#t-from').addEventListener('change', updateTransferHints);
  $('#t-to').addEventListener('change', updateTransferHints);
  $('#t-reset').addEventListener('click', () => setTimeout(() => { clearErrors($('#transfer-form')); updateTransferHints(); }, 0));

  $('#transfer-form').addEventListener('submit', e => {
    e.preventDefault();
    $('#receipt').hidden = true;
    const fromId = $('#t-from').value;
    const toVal = $('#t-to').value;
    const amtRaw = $('#t-amt').value.replace(/,/g, '').trim();
    const amount = round2(parseFloat(amtRaw));
    const isPayee = toVal.startsWith('pay:');
    let ok = true;
    setErr('t-to-err', ''); setErr('t-amt-err', '');

    if (!toVal) { setErr('t-to-err', 'Choose where the money should go.'); ok = false; }
    else if (toVal === 'own:' + fromId) { setErr('t-to-err', 'The two accounts are the same. Pick a different account.'); ok = false; }

    const from = acct(fromId);
    if (!amtRaw || !/^\d+(\.\d{1,2})?$/.test(amtRaw) || !(amount > 0)) {
      setErr('t-amt-err', 'Enter an amount greater than zero, for example 2500 or 2500.50.'); ok = false;
    } else if (amount > from.balance) {
      setErr('t-amt-err', `This is more than the available balance of ${money(from.balance)}.`); ok = false;
    } else if (isPayee && $('input[name="t-mode"]:checked').value === 'IMPS' && amount > IMPS_LIMIT) {
      setErr('t-amt-err', 'IMPS is limited to ₹2,00,000 per transaction. Use NEFT for larger amounts.'); ok = false;
    }
    if (!ok) return;

    const [kind, id] = toVal.split(':');
    const target = kind === 'own' ? acct(id) : me.payees.find(p => p.id === Number(id));
    pendingTransfer = {
      from: fromId, kind, targetId: kind === 'own' ? id : Number(id), amount,
      remarks: $('#t-rem').value.trim(),
      mode: kind === 'own' ? 'Own account' : $('input[name="t-mode"]:checked').value
    };
    const rows = [
      ['From', `${from.name} (XXXX${last4(from.no)})`],
      ['To', kind === 'own' ? `${target.name} (XXXX${last4(target.no)})` : `${target.name} (XXXX${last4(target.acc)})`],
      ['Amount', money(amount)],
      ['Mode', pendingTransfer.mode]
    ];
    if (pendingTransfer.remarks) rows.push(['Remarks', pendingTransfer.remarks]);
    $('#confirm-details').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('#otp-hint').textContent = `We sent a 6-digit OTP to your mobile ending ${last4(me.profile.mobile)}. For this demo, use ${DEMO_OTP}.`;
    $('#otp').value = ''; setErr('otp-err', '');
    $('#confirm-dlg').showModal();
    $('#otp').focus();
  });

  $('#otp-cancel').addEventListener('click', () => { $('#confirm-dlg').close(); pendingTransfer = null; });

  $('#confirm-form').addEventListener('submit', e => {
    e.preventDefault();
    if ($('#otp').value.trim() !== DEMO_OTP) { setErr('otp-err', 'That OTP is not correct. Check the code and try again.'); return; }
    const t = pendingTransfer;
    if (!t) { $('#confirm-dlg').close(); return; }
    const from = acct(t.from);
    if (t.amount > from.balance) { setErr('otp-err', 'Your balance changed and is now too low for this transfer.'); return; }

    const today = toISO(new Date());
    const ref = (t.mode === 'Own account' ? 'KBX' : t.mode) + String(Date.now()).slice(-9);
    let toLabel;

    from.balance = round2(from.balance - t.amount);
    if (t.kind === 'own') {
      const dest = acct(t.targetId);
      dest.balance = round2(dest.balance + t.amount);
      toLabel = `${dest.name} (XXXX${last4(dest.no)})`;
      addTxn(me, from.id, { date: today, desc: `Transfer to ${dest.name} A/c XXXX${last4(dest.no)}`, amt: -t.amount, cat: 'Transfer', bal: from.balance, ref });
      addTxn(me, dest.id, { date: today, desc: `Transfer from ${from.name} A/c XXXX${last4(from.no)}`, amt: t.amount, cat: 'Transfer', bal: dest.balance, ref });
    } else {
      const p = me.payees.find(x => x.id === t.targetId);
      toLabel = `${p.name} (XXXX${last4(p.acc)})`;
      const note = t.remarks ? '/' + t.remarks : '';
      addTxn(me, from.id, { date: today, desc: `${t.mode}/${p.name}${note}`, amt: -t.amount, cat: 'Transfer', bal: from.balance, ref });

      // if the payee is another Online Bank customer in this browser, credit them too
      const hit = findAccountByNumber(p.acc, p.ifsc);
      if (hit && hit.user.id !== me.id) {
        hit.account.balance = round2(hit.account.balance + t.amount);
        addTxn(hit.user, hit.account.id, { date: today, desc: `${t.mode}/${me.profile.name}${note}`, amt: t.amount, cat: 'Transfer', bal: hit.account.balance, ref });
      }
    }
    save();
    $('#confirm-dlg').close();

    const r = $('#receipt');
    r.className = 'panel narrow receipt';
    r.innerHTML = `
      <div class="receipt-head">
        <h2>Transfer successful</h2>
        <p>${money(t.amount)} has been sent. Keep the reference number for your records.</p>
      </div>
      <dl class="dl">
        <div><dt>Reference no.</dt><dd>${esc(ref)}</dd></div>
        <div><dt>From</dt><dd>${esc(from.name)} (XXXX${last4(from.no)})</dd></div>
        <div><dt>To</dt><dd>${esc(toLabel)}</dd></div>
        <div><dt>Amount</dt><dd>${money(t.amount)}</dd></div>
        <div><dt>Date</dt><dd>${fmtDate(today)}</dd></div>
        <div><dt>Balance now</dt><dd>${money(from.balance)}</dd></div>
      </dl>
      <div class="actions">
        <a class="btn" href="#statements" id="receipt-stmt" data-acc="${from.id}">View statement</a>
        <button class="btn primary" type="button" id="receipt-new">Make another transfer</button>
      </div>`;
    r.hidden = false;
    $('#transfer-form').reset();
    renderTransferForm();
    pendingTransfer = null;
    r.scrollIntoView({ block: 'nearest' });
  });

  $('#receipt').addEventListener('click', e => {
    if (e.target.id === 'receipt-stmt') { e.preventDefault(); stmt.acc = e.target.dataset.acc; location.hash = '#statements'; }
    if (e.target.id === 'receipt-new') { $('#receipt').hidden = true; $('#t-to').focus(); }
  });

  // demo cash deposit
  $('#addmoney-form').addEventListener('submit', e => {
    e.preventDefault();
    $('#am-ok').hidden = true; setErr('am-err', '');
    const raw = $('#am-amt').value.replace(/,/g, '').trim();
    const amt = round2(parseFloat(raw));
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(amt > 0)) { setErr('am-err', 'Enter an amount greater than zero.'); return; }
    if (amt > MAX_TOPUP) { setErr('am-err', 'For this demo you can add up to ₹1,00,000 at a time.'); return; }
    const a = acct($('#am-acc').value);
    a.balance = round2(a.balance + amt);
    addTxn(me, a.id, { date: toISO(new Date()), desc: 'Cash deposit at branch', amt, cat: 'Deposit', bal: a.balance, ref: 'KBD' + String(Date.now()).slice(-8) });
    save();
    $('#am-amt').value = '';
    $('#am-ok').textContent = `${money(amt)} added to ${a.name}. New balance ${money(a.balance)}.`;
    $('#am-ok').hidden = false;
    updateTransferHints();
  });

  /* ---------------- payees ---------------- */

  function renderPayees() {
    const body = $('#payee-rows');
    if (!me.payees.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">You have not added any payees yet. Use the form below to add one.</td></tr>';
      return;
    }
    body.innerHTML = me.payees.map(p => `
      <tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${'X'.repeat(Math.max(0, p.acc.length - 4))}${last4(p.acc)}</td>
        <td>${esc(p.ifsc)}</td>
        <td class="actions-cell">
          <a href="#transfer" data-pay="${p.id}">Send money</a>
          <button class="link" data-del="${p.id}">Remove</button>
        </td>
      </tr>`).join('');
  }

  $('#payee-rows').addEventListener('click', e => {
    const send = e.target.closest('[data-pay]');
    if (send) { preselectTo = 'pay:' + send.dataset.pay; return; }
    const del = e.target.closest('[data-del]');
    if (!del) return;
    if (del.dataset.armed !== '1') {
      del.dataset.armed = '1';
      del.textContent = 'Click again to remove';
      setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = 'Remove'; } }, 3500);
      return;
    }
    me.payees = me.payees.filter(x => x.id !== Number(del.dataset.del));
    save(); renderPayees();
  });

  $('#payee-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#p-name').value.trim().replace(/\s+/g, ' ');
    const acc = $('#p-acc').value.trim();
    const ifsc = $('#p-ifsc').value.trim().toUpperCase();
    let ok = true;
    ['p-name-err', 'p-acc-err', 'p-ifsc-err'].forEach(id => setErr(id, ''));

    if (name.length < 3 || !/^[A-Za-z][A-Za-z.' ]*$/.test(name)) { setErr('p-name-err', 'Enter the payee\'s full name using letters only.'); ok = false; }
    if (!/^\d{9,18}$/.test(acc)) { setErr('p-acc-err', 'Account numbers have 9 to 18 digits.'); ok = false; }
    else if (me.accounts.some(a => a.no === acc)) { setErr('p-acc-err', 'That is one of your own accounts. Use "My accounts" on the transfer page instead.'); ok = false; }
    else if (me.payees.some(p => p.acc === acc && p.ifsc === ifsc)) { setErr('p-acc-err', 'This payee is already in your list.'); ok = false; }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { setErr('p-ifsc-err', 'That IFSC code does not look right. It has 4 letters, a zero, then 6 letters or digits.'); ok = false; }
    if (!ok) return;

    const id = me.payees.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    me.payees.push({ id, name, acc, ifsc });
    save();
    $('#payee-form').reset();
    renderPayees();
  });

  /* ---------------- profile ---------------- */

  function renderProfile() {
    const p = me.profile;
    const rows = [
      ['Name', p.name], ['Customer ID', me.customerId], ['Email', me.email],
      ['Mobile', maskMobile(p.mobile)], ['Date of birth', fmtDate(p.dob)], ['Home branch', p.branch]
    ];
    if (p.address) rows.push(['Address', p.address]);
    $('#profile-dl').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

    $('#profile-accts').innerHTML = me.accounts.map(a => `
      <tr>
        <td><strong>${esc(a.name)}</strong></td>
        <td>${esc(a.no)}</td>
        <td>${esc(a.ifsc)}</td>
        <td>${esc(a.branch)}</td>
        <td class="date">${fmtDate(a.opened)}</td>
      </tr>`).join('');
  }

  $('#pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const oldPw = $('#pw-old').value, n1 = $('#pw-new').value, n2 = $('#pw-new2').value;
    let ok = true;
    $('#pw-ok').hidden = true;
    ['pw-old-err', 'pw-new-err', 'pw-new2-err'].forEach(id => setErr(id, ''));

    if (!(await verifyPw(oldPw, me))) { setErr('pw-old-err', 'Your current password is not correct.'); ok = false; }
    if (!strongPw(n1)) { setErr('pw-new-err', PW_MSG); ok = false; }
    else if (n1 === oldPw) { setErr('pw-new-err', 'The new password must be different from the current one.'); ok = false; }
    if (n1 !== n2) { setErr('pw-new2-err', 'The two passwords do not match.'); ok = false; }
    if (!ok) return;

    me.salt = newSalt();
    me.pwHash = await hashPw(n1, me.salt);
    save();
    $('#pw-form').reset();
    $('#pw-ok').hidden = false;
  });

  /* ---------------- start ---------------- */

  const ready = loadDb().then(d => {
    db = d;
    const uid = ss.get('kb-user');
    const user = uid && db.users.find(u => u.id === uid);
    if (user) { prevLogin = ss.get('kb-prev') || null; enterApp(user); }
  });
})();