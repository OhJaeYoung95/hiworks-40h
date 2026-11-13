// 어느 사이트에서 켤지 정한다. 하이웍스 근무 페이지는 처음부터 켜져 있고,
// 다른 근무 페이지는 사용자가 Tampermonkey 메뉴의 "이 사이트에서 켜기"로 등록한다.
// 등록하지 않은 사이트에서는 메뉴만 만들고 아무것도 하지 않는다 (빌드된 스크립트는 여기서 바로 멈춘다).
// 사이트 목록과 사이트별 회사 설정은 Tampermonkey 저장소(GM_getValue)에 둔다. 모든 사이트에서 같이 보인다.
(function (root) {
  const BUILTIN = { 'hr-work.office.hiworks.com': '하이웍스' };
  const SITES_KEY = 'hw40-sites';
  const gm = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const load = () => {
    try {
      const v = gm ? GM_getValue(SITES_KEY, {}) : JSON.parse(localStorage.getItem(SITES_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  };
  const save = (sites) => {
    try {
      if (gm) GM_setValue(SITES_KEY, sites);
      else localStorage.setItem(SITES_KEY, JSON.stringify(sites));
      return true;
    } catch {
      return false;
    }
  };

  const host = location.host;
  // 확인용 모의 페이지는 하이웍스 화면 흉내라 하이웍스로 본다.
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const builtin = Boolean(BUILTIN[host]) || (local && typeof window !== 'undefined' && window.HW40_MOCK_HIWORKS === true);
  const entry = () => load()[host] || null;
  const site = {
    host,
    builtin,
    builtinName: BUILTIN[host] || (builtin ? '하이웍스' : null),
    enabled: builtin || Boolean(entry()),
    // 이 사이트의 회사 설정 { name, rules, fields?, includesToday? } (없으면 null: 하이웍스 기본 규칙)
    company: () => (entry() && entry().company) || null,
    saveCompany(company) {
      const sites = load();
      sites[host] = { ...(sites[host] || {}), on: (sites[host] && sites[host].on) || Date.now(), company };
      return save(sites);
    },
    // 회사 설정을 지운다 (하이웍스는 기본 규칙으로 돌아간다).
    clearCompany() {
      const sites = load();
      if (!sites[host]) return;
      delete sites[host].company;
      save(sites);
    },
    enable() {
      const sites = load();
      sites[host] = { ...(sites[host] || {}), on: Date.now() };
      return save(sites);
    },
    disable() {
      const sites = load();
      delete sites[host];
      return save(sites);
    },
  };
  root.HW40_SITE = site;

  if (typeof GM_registerMenuCommand === 'function') {
    if (!site.enabled) {
      GM_registerMenuCommand('⏱ 이 사이트에서 40시간 계산기 켜기', () => {
        if (site.enable()) location.reload();
      });
    } else if (!builtin) {
      GM_registerMenuCommand('이 사이트에서 40시간 계산기 끄기', () => {
        if (window.confirm(`${host}에서 40시간 계산기를 끌까요? 이 사이트의 회사 설정도 지워져요.`) && site.disable()) location.reload();
      });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
