/**
 * DZ Store - Enhanced Auth Helper
 * Client-side authentication management with dynamic features
 */

const Auth = {
  TOKEN_KEY: 'dz_token',
  MERCHANT_KEY: 'dz_merchant',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getMerchant() {
    try {
      const data = localStorage.getItem(this.MERCHANT_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setSession(token, merchant) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.MERCHANT_KEY, JSON.stringify(merchant));
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.MERCHANT_KEY);
  },

  isLoggedIn() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        this.clearSession();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  // Get token remaining time
  getTokenExpiry() {
    const token = this.getToken();
    if (!token) return 0;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, (payload.exp || 0) - now);
    } catch {
      return 0;
    }
  },

  requireAuth(redirectTo = '/login.html') {
    if (!this.isLoggedIn()) {
      // Save intended destination
      sessionStorage.setItem('dz_redirect', window.location.pathname);
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  redirectIfLoggedIn(redirectTo = '/dashboard.html') {
    if (this.isLoggedIn()) {
      // Check if there's a saved redirect
      const saved = sessionStorage.getItem('dz_redirect');
      if (saved) {
        sessionStorage.removeItem('dz_redirect');
        window.location.href = saved;
      } else {
        window.location.href = redirectTo;
      }
      return true;
    }
    return false;
  },

  logout() {
    this.clearSession();
    api.stopAllPolling();
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = '/login.html'; }, 250);
  },

  // Fill user info in the DOM with animation
  fillUserInfo() {
    const merchant = this.getMerchant();
    if (!merchant) return;

    const elements = {
      '[data-user-name]': merchant.name,
      '[data-user-email]': merchant.email,
      '[data-business-name]': merchant.businessName,
      '[data-user-plan]': getPlanLabel(merchant.plan || 'basic'),
      '[data-user-subdomain]': merchant.subdomain,
      '[data-user-avatar]': merchant.name?.[0]?.toUpperCase() || 'م'
    };

    Object.entries(elements).forEach(([selector, value]) => {
      document.querySelectorAll(selector).forEach(el => {
        if (el.tagName === 'IMG') {
          el.src = value;
        } else {
          el.textContent = value;
          el.classList.add('fade-in');
        }
      });
    });

    // Show plan expiry warning
    if (merchant.planExpiry) {
      const daysLeft = Math.ceil((new Date(merchant.planExpiry) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft > 0) {
        setTimeout(() => {
          Toast.warning('تنبيه الاشتراك', `باقي ${daysLeft} أيام على انتهاء اشتراكك`);
        }, 2000);
      } else if (daysLeft <= 0) {
        setTimeout(() => {
          Toast.error('انتهى الاشتراك', 'يرجى تجديد اشتراكك لمتابعة استخدام المنصة');
        }, 2000);
      }
    }
  }
};

// ===== Enhanced Dashboard Sidebar =====
const Sidebar = {
  init() {
    this.sidebar = document.getElementById('sidebar');
    this.overlay = document.getElementById('sidebarOverlay');
    this.toggleBtn = document.getElementById('sidebarToggle');

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
    if (this.overlay) {
      this.overlay.addEventListener('click', () => this.close());
    }

    // Set active nav item with animation
    this.setActiveItem();

    // Handle keyboard shortcut (Ctrl+B to toggle sidebar)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Handle swipe gesture on mobile
    this.initSwipeGesture();
  },

  toggle() {
    this.sidebar?.classList.toggle('open');
    this.overlay?.classList.toggle('show');
  },

  open() {
    this.sidebar?.classList.add('open');
    this.overlay?.classList.add('show');
  },

  close() {
    this.sidebar?.classList.remove('open');
    this.overlay?.classList.remove('show');
  },

  setActiveItem() {
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = item.getAttribute('href') || item.dataset.href;
      if (href && currentPath.includes(href.replace('.html', ''))) {
        item.classList.add('active');
        // Add sliding indicator
        const indicator = document.createElement('div');
        indicator.className = 'nav-active-indicator';
        item.appendChild(indicator);
      }
    });
  },

  initSwipeGesture() {
    let startX = 0;
    let startY = 0;
    
    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = Math.abs(endY - startY);

      // RTL: swipe left to open, swipe right to close
      if (Math.abs(diffX) > 80 && diffY < 100) {
        if (diffX < 0 && startX > window.innerWidth - 40) {
          this.open();
        } else if (diffX > 0) {
          this.close();
        }
      }
    }, { passive: true });
  }
};

// ===== Initialize dashboard commons =====
function initDashboard() {
  if (!Auth.requireAuth()) return false;
  Auth.fillUserInfo();
  Sidebar.init();

  // Logout button
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirmDialog(
        'تسجيل الخروج',
        'هل تريد تسجيل الخروج من حسابك؟',
        () => Auth.logout(),
        'warning'
      );
    });
  });

  // Initialize online indicator
  window.addEventListener('online', () => {
    Toast.success('متصل', 'تم استعادة الاتصال بالإنترنت');
    document.body.classList.remove('offline');
  });

  window.addEventListener('offline', () => {
    Toast.error('غير متصل', 'فقد الاتصال بالإنترنت');
    document.body.classList.add('offline');
  });

  return true;
}
