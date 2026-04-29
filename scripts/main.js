// Fahman Oil & Gas — interactions

document.addEventListener('DOMContentLoaded', () => {
  // ----- Header scroll state -----
  const header = document.querySelector('.header');
  const onScroll = () => {
    if (window.scrollY > 16) header?.classList.add('scrolled');
    else header?.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ----- Mobile menu -----
  const toggle = document.querySelector('.menu-toggle');
  const links = document.querySelector('.nav-links');
  toggle?.addEventListener('click', () => {
    links?.classList.toggle('open');
  });

  // ----- Reveal on scroll -----
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  // ----- Counter animation -----
  const counters = document.querySelectorAll('[data-count]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseFloat(el.dataset.count);
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const duration = 1600;
      const start = performance.now();
      const startVal = 0;
      const easeOut = (t) => 1 - Math.pow(1 - t, 3);
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const v = startVal + (target - startVal) * easeOut(p);
        el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = decimals ? target.toFixed(decimals) : target.toLocaleString();
      };
      requestAnimationFrame(tick);
      counterObserver.unobserve(el);
    });
  }, { threshold: 0.4 });
  counters.forEach((c) => counterObserver.observe(c));

  // ----- Smooth anchor scroll -----
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (href.length <= 1) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
      links?.classList.remove('open');
    });
  });

  // ----- Form mock submit -----
  const form = document.querySelector('.form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = 'Sent — we\'ll be in touch';
    btn.style.background = 'var(--mint-700)';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.innerHTML = original;
      btn.style.background = '';
      btn.style.color = '';
      form.reset();
    }, 2400);
  });

  // ----- Newsletter mock -----
  const news = document.querySelector('.newsletter');
  news?.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = news.querySelector('button');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Subscribed';
    setTimeout(() => { btn.textContent = original; news.reset(); }, 1800);
  });

  // ----- Subtle parallax for hero visual -----
  const heroVisual = document.querySelector('.hero-visual');
  if (heroVisual && window.matchMedia('(min-width: 880px)').matches) {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 8;
      const y = (e.clientY / window.innerHeight - 0.5) * 8;
      heroVisual.style.transform = `translate(${x}px, ${y}px)`;
    });
  }
});
