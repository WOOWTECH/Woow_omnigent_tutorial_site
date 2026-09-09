// 側欄導覽：
//   1. 手機版把長長的章節清單收合成一顆「目錄」按鈕（漸進增強，沒 JS 就是全展開）
//   2. 捲動時高亮目前所在的章內段落
// 章內連結保留原生錨點行為，讓瀏覽器管理歷史與 reduced-motion。
(function () {
  /* ---------------------------------------------- 1. 手機版收合 --- */
  const sidebar = document.querySelector('.sidebar');
  const mq = window.matchMedia('(max-width: 960px)');

  if (sidebar) {
    const panels = sidebar.querySelectorAll('ol, .toc-in-chapter');
    const navigation = sidebar.querySelector('nav');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span class="nav-toggle-label">目錄</span><span class="nav-toggle-caret" aria-hidden="true"></span>';

    if (navigation) sidebar.insertBefore(toggle, navigation);

    const setCollapsed = (collapsed) => {
      sidebar.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };

    const applyMode = () => {
      sidebar.classList.toggle('is-collapsible', mq.matches);
      setCollapsed(mq.matches);
    };

    toggle.addEventListener('click', () => setCollapsed(!sidebar.classList.contains('is-collapsed')));

    // 手機上點任何導覽連結（含跳到本頁錨點）就把選單收起來
    panels.forEach((p) =>
      p.addEventListener('click', (e) => {
        if (mq.matches && e.target.closest('a')) setCollapsed(true);
      })
    );

    applyMode();
    mq.addEventListener('change', applyMode);
  }

  /* --------------------------------------------- 2. 章內高亮 --- */
  const sections = document.querySelectorAll('section[id]');
  const inLinks = document.querySelectorAll('.toc-in-chapter a[href^="#"]');
  if (!sections.length || !inLinks.length) return;

  const linkMap = new Map();
  inLinks.forEach((a) => {
    const id = a.getAttribute('href').slice(1);
    linkMap.set(id, a);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const link = linkMap.get(entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) {
          inLinks.forEach((inLink) => {
            inLink.classList.remove('active');
            inLink.removeAttribute('aria-current');
          });
          link.classList.add('active');
          link.setAttribute('aria-current', 'location');
        }
      });
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  );

  sections.forEach((s) => observer.observe(s));

})();
