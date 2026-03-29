/**
 * DZ Store - Enhanced API Client
 * Dynamic API calls with loading states, retry, and real-time features
 */

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE;
    this.retryCount = 2;
    this.retryDelay = 1000;
    this._listeners = {};
    this._pollingIntervals = {};
  }

  getToken() {
    return localStorage.getItem('dz_token');
  }

  getHeaders(includeAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (includeAuth) {
      const token = this.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // Event system for real-time updates
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => cb(data));
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(options.auth !== false),
        ...options.headers
      }
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    // Show loading state
    this.emit('loading', { endpoint, loading: true });

    let lastError;
    const maxRetries = options.noRetry ? 0 : this.retryCount;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(url, { ...config, signal: controller.signal });
        clearTimeout(timeout);

        if (response.status === 204) {
          this.emit('loading', { endpoint, loading: false });
          return { success: true };
        }

        const data = await response.json();

        if (!response.ok) {
          // Handle auth errors
          if (response.status === 401) {
            this.emit('authError', { status: 401, message: data.error });
            if (window.Auth) Auth.clearSession();
          }
          throw new ApiError(data.error || 'حدث خطأ غير متوقع', response.status, data);
        }

        this.emit('loading', { endpoint, loading: false });
        return data;

      } catch (error) {
        lastError = error;
        
        if (error instanceof ApiError) {
          this.emit('loading', { endpoint, loading: false });
          throw error;
        }

        // Retry on network errors
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, this.retryDelay * (attempt + 1)));
          continue;
        }
      }
    }

    this.emit('loading', { endpoint, loading: false });

    if (lastError?.name === 'AbortError') {
      throw new ApiError('انتهت مهلة الطلب - يرجى المحاولة مرة أخرى', 408);
    }
    if (lastError?.name === 'TypeError' && lastError?.message?.includes('fetch')) {
      throw new ApiError('خطأ في الاتصال - يرجى التحقق من اتصالك بالإنترنت', 0);
    }
    throw new ApiError(lastError?.message || 'خطأ غير متوقع', 500);
  }

  get(endpoint, params = {}) {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined && v !== ''))
    ).toString();
    return this.request(`${endpoint}${query ? '?' + query : ''}`, { method: 'GET' });
  }

  post(endpoint, body, auth = true) {
    return this.request(endpoint, { method: 'POST', body, auth });
  }

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  }

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body });
  }

  delete(endpoint, body = null) {
    return this.request(endpoint, { method: 'DELETE', body });
  }

  // ===== Polling for real-time updates =====
  startPolling(key, fn, interval = 30000) {
    this.stopPolling(key);
    fn(); // Initial call
    this._pollingIntervals[key] = setInterval(fn, interval);
  }

  stopPolling(key) {
    if (this._pollingIntervals[key]) {
      clearInterval(this._pollingIntervals[key]);
      delete this._pollingIntervals[key];
    }
  }

  stopAllPolling() {
    Object.keys(this._pollingIntervals).forEach(k => this.stopPolling(k));
  }

  // ===== Auth =====
  register(data) { return this.post('/auth/register', data, false); }
  login(data) { return this.post('/auth/login', data, false); }

  // ===== Products =====
  getProducts(params) { return this.get('/products', params); }
  getProduct(id) { return this.get(`/products/${id}`); }
  createProduct(data) { return this.post('/products', data); }
  updateProduct(id, data) { return this.put(`/products/${id}`, data); }
  patchProduct(id, data) { return this.patch(`/products/${id}`, data); }
  deleteProduct(id) { return this.delete(`/products/${id}`); }
  deleteProducts(ids) { return this.delete('/products', { ids }); }

  // ===== Orders =====
  getOrders(params) { return this.get('/orders', params); }
  getOrder(id) { return this.get(`/orders/${id}`); }
  createOrder(data) { return this.post('/orders', data, false); }
  updateOrder(id, data) { return this.put(`/orders/${id}`, data); }
  patchOrder(id, data) { return this.patch(`/orders/${id}`, data); }
  cancelOrder(id) { return this.delete(`/orders/${id}`); }

  // ===== Store =====
  getStore() { return this.get('/stores'); }
  updateStore(data) { return this.put('/stores', data); }
  getPublicStore(subdomain) { return this.get(`/stores/${subdomain}`, undefined, false); }

  // ===== Customers =====
  getCustomers(params) { return this.get('/customers', params); }

  // ===== Analytics =====
  getAnalytics(params) { return this.get('/analytics', params); }

  // ===== Shipping =====
  createShipment(data) { return this.post('/shipping', data); }
}

class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Global instance
const api = new ApiClient();

// Handle auth errors globally
api.on('authError', () => {
  if (window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') {
    Toast.error('انتهت الجلسة', 'يرجى تسجيل الدخول مجدداً');
    setTimeout(() => { window.location.href = '/login.html'; }, 1500);
  }
});

// ===== Algeria Wilayas =====
const ALGERIA_WILAYAS = [
  'أدرار', 'الشلف', 'الأغواط', 'أم البواقي', 'باتنة', 'بجاية', 'بسكرة', 'بشار',
  'البليدة', 'البويرة', 'تمنراست', 'تبسة', 'تلمسان', 'تيارت', 'تيزي وزو', 'الجزائر',
  'الجلفة', 'جيجل', 'سطيف', 'سعيدة', 'سكيكدة', 'سيدي بلعباس', 'عنابة', 'قالمة',
  'قسنطينة', 'المدية', 'مستغانم', 'المسيلة', 'معسكر', 'ورقلة', 'وهران', 'البيض',
  'إليزي', 'برج بوعريريج', 'بومرداس', 'الطارف', 'تندوف', 'تيسمسيلت', 'الوادي', 'خنشلة',
  'سوق أهراس', 'تيبازة', 'ميلة', 'عين الدفلى', 'النعامة', 'عين تموشنت', 'غرداية', 'غليزان',
  'المغير', 'المنيعة', 'أولاد جلال', 'برج باجي مختار', 'بني عباس', 'تيميمون', 'تقرت',
  'جانت', 'عين صالح', 'عين قزام'
];

// ===== Enhanced Toast Notifications =====
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
    return this;
  },

  show(title, message, type = 'info', duration = 4000) {
    this.init();
    
    const icons = {
      success: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#00B894"/><path d="M6 10l2.5 2.5L14 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      danger: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#E17055"/><path d="M7 7l6 6M13 7l-6 6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#FDCB6E"/><path d="M10 6v5M10 13.5v.5" stroke="#2D3436" stroke-width="2" stroke-linecap="round"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#6C5CE7"/><path d="M10 9v5M10 6.5v.5" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-enter`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" onclick="Toast.dismiss(this)">×</button>
      <div class="toast-progress toast-progress-${type}"></div>
    `;

    this.container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-visible');
    });

    // Start progress bar
    const progress = toast.querySelector('.toast-progress');
    if (progress) {
      progress.style.transition = `width ${duration}ms linear`;
      requestAnimationFrame(() => { progress.style.width = '0%'; });
    }

    setTimeout(() => this.dismiss(toast.querySelector('.toast-close')), duration);
  },

  dismiss(el) {
    const toast = el?.closest?.('.toast') || el;
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  },

  success(title, message) { this.show(title, message, 'success'); },
  error(title, message) { this.show(title, message, 'danger'); },
  warning(title, message) { this.show(title, message, 'warning'); },
  info(title, message) { this.show(title, message, 'info'); }
};

// ===== Loading Skeleton Generator =====
const Skeleton = {
  card(count = 1) {
    return Array(count).fill('').map(() => `
      <div class="skeleton-card">
        <div class="skeleton-img skeleton-pulse"></div>
        <div class="skeleton-line skeleton-pulse" style="width:80%"></div>
        <div class="skeleton-line skeleton-pulse" style="width:60%"></div>
        <div class="skeleton-line-sm skeleton-pulse" style="width:40%"></div>
      </div>
    `).join('');
  },

  table(rows = 5) {
    return `<div class="skeleton-table">
      ${Array(rows).fill('').map(() => `
        <div class="skeleton-row">
          <div class="skeleton-cell skeleton-pulse" style="width:20%"></div>
          <div class="skeleton-cell skeleton-pulse" style="width:30%"></div>
          <div class="skeleton-cell skeleton-pulse" style="width:25%"></div>
          <div class="skeleton-cell skeleton-pulse" style="width:15%"></div>
        </div>
      `).join('')}
    </div>`;
  },

  stats(count = 4) {
    return Array(count).fill('').map(() => `
      <div class="stat-card">
        <div class="skeleton-circle skeleton-pulse"></div>
        <div class="skeleton-line skeleton-pulse" style="width:60%"></div>
        <div class="skeleton-line-lg skeleton-pulse" style="width:40%"></div>
      </div>
    `).join('');
  }
};

// ===== Dynamic Page Transition =====
const PageTransition = {
  init() {
    // Add fade-in on page load
    document.body.classList.add('page-enter');
    requestAnimationFrame(() => {
      document.body.classList.add('page-visible');
    });

    // Intercept navigation for smooth transitions
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.startsWith('//') && !link.target) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigateTo(href);
        });
      }
    });
  },

  navigateTo(url) {
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = url; }, 250);
  }
};

// ===== Utility Functions =====
function formatCurrency(amount) {
  return new Intl.NumberFormat('ar-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount) + ' دج';
}

function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    calendar: 'gregory'
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return date.toLocaleDateString('ar-DZ', options);
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ar-DZ', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return formatDateShort(dateStr);
}

function getStatusLabel(status) {
  const labels = {
    pending: 'معلق',
    confirmed: 'مؤكد',
    shipped: 'تم الشحن',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  return labels[status] || status;
}

function getStatusClass(status) {
  const classes = {
    pending: 'status-pending',
    confirmed: 'status-confirmed',
    shipped: 'status-shipped',
    delivered: 'status-delivered',
    cancelled: 'status-cancelled'
  };
  return classes[status] || 'badge-gray';
}

function getStatusIcon(status) {
  const icons = {
    pending: '🟡',
    confirmed: '🟢',
    shipped: '🚚',
    delivered: '✅',
    cancelled: '❌'
  };
  return icons[status] || '⚪';
}

function getProductStatusLabel(status) {
  const labels = {
    available: 'متوفر',
    unavailable: 'غير متوفر',
    out_of_stock: 'نفذت الكمية'
  };
  return labels[status] || status;
}

function getProductStatusClass(status) {
  const classes = {
    available: 'badge-success',
    unavailable: 'badge-gray',
    out_of_stock: 'badge-warning'
  };
  return classes[status] || 'badge-gray';
}

function getPlanLabel(plan) {
  const labels = {
    basic: 'أساسي',
    pro: 'احترافي',
    enterprise: 'مؤسسي'
  };
  return labels[plan] || plan;
}

function buildWilayaOptions(selectedWilaya = '') {
  return ALGERIA_WILAYAS.map((w, i) => 
    `<option value="${w}" ${w === selectedWilaya ? 'selected' : ''}>${(i+1).toString().padStart(2,'0')} - ${w}</option>`
  ).join('');
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ===== Animated Counter =====
function animateCounter(el, target, duration = 1500) {
  const start = parseInt(el.textContent) || 0;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (target - start) * eased);
    el.textContent = current.toLocaleString('ar-DZ');
    if (progress < 1) requestAnimationFrame(update);
  }
  
  requestAnimationFrame(update);
}

// ===== Intersection Observer for animations =====
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, index * 100);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.animate-on-scroll, .stagger-animate').forEach(el => {
    observer.observe(el);
  });
}

// ===== Phone Validation =====
function validateAlgerianPhone(phone) {
  const cleaned = phone.replace(/[\s\-\.]/g, '');
  const regex = /^(05|06|07)[0-9]{8}$/;
  return regex.test(cleaned);
}

// ===== Confirm Dialog =====
function showConfirmDialog(title, message, onConfirm, type = 'danger') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-overlay-enter';
  overlay.innerHTML = `
    <div class="confirm-dialog confirm-dialog-enter">
      <div class="confirm-icon confirm-icon-${type}">
        ${type === 'danger' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}
      </div>
      <h3 class="confirm-title">${title}</h3>
      <p class="confirm-message">${message}</p>
      <div class="confirm-actions">
        <button class="btn btn-outline-gray confirm-cancel">إلغاء</button>
        <button class="btn btn-${type} confirm-ok">تأكيد</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('modal-overlay-visible');
    overlay.querySelector('.confirm-dialog').classList.add('confirm-dialog-visible');
  });

  const close = () => {
    overlay.classList.add('modal-overlay-exit');
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelector('.confirm-cancel').onclick = close;
  overlay.querySelector('.confirm-ok').onclick = () => { close(); onConfirm(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// Initialize scroll animations on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  PageTransition.init();
});
