# DZ Store - منصة التجارة الإلكترونية الجزائرية 🛍️

## 🚀 بدء التشغيل

### 1. إعداد المتغيرات البيئية
```bash
cp .env.example .env
# عدّل ملف .env وأضف بياناتك
```

### 2. تثبيت التبعيات
```bash
npm install
```

### 3. تشغيل المشروع محلياً
```bash
npm run dev
```

### 4. نشر على Vercel
```bash
vercel --prod
```

## 📁 هيكل المشروع
```
├── api/                    # Serverless API Functions
│   ├── auth/              # تسجيل الدخول / إنشاء حساب
│   ├── products/          # إدارة المنتجات
│   ├── orders/            # إدارة الطلبات
│   ├── stores/            # إعدادات المتجر
│   ├── customers/         # العملاء
│   ├── analytics/         # الإحصائيات
│   ├── shipping/          # الشحن
│   └── health.js          # فحص صحة الخدمة
├── lib/                   # مكتبات مشتركة
│   ├── mongodb.js         # اتصال MongoDB مع retry و health check
│   ├── auth.js            # JWT مع middleware
│   ├── antifraud.js       # نظام مكافحة الاحتيال
│   └── shipping.js        # تكامل Yalidine + EcoTrack
├── public/                # الواجهة الأمامية
│   ├── css/               # أنماط CSS محسّنة
│   ├── js/                # JavaScript ديناميكي
│   ├── index.html         # الصفحة الرئيسية
│   ├── dashboard.html     # لوحة التحكم
│   ├── products.html      # إدارة المنتجات
│   ├── orders.html        # إدارة الطلبات
│   └── store/             # المتجر العام
├── .env                   # متغيرات البيئة (لا تُرفع للـ git)
├── .env.example           # نموذج متغيرات البيئة
├── vercel.json            # إعدادات Vercel
└── package.json           # تبعيات المشروع
```

## ✨ المميزات الديناميكية المحسّنة

### واجهة المستخدم
- ⚡ انتقالات سلسة بين الصفحات (Page Transitions)
- 🎭 حركات تحميل ذكية (Skeleton Loading)
- 🔔 إشعارات ديناميكية مع شريط تقدم
- 📱 تحسينات للموبايل مع دعم Swipe
- 🎨 تأثيرات Glassmorphism و Ripple
- 🔄 عدادات متحركة (Animated Counters)
- 📊 مخططات بيانية محسّنة

### الخلفية (Backend)
- 🔗 اتصال MongoDB مع إعادة المحاولة التلقائية
- ❤️ نقطة فحص صحة الخدمة (Health Check)
- 🔐 حماية JWT محسّنة مع إدارة جلسات ذكية
- 📡 نظام أحداث للتحديثات الفورية
- ⏱️ مهلة زمنية (Timeout) للطلبات
- 🔄 Polling تلقائي لتحديث البيانات

### الأمان
- 🛡️ رؤوس أمان (Security Headers) في Vercel
- 🔒 تخزين مؤقت ذكي للملفات الثابتة
- 🚫 حماية CORS محسّنة
- 🕵️ نظام مكافحة احتيال متقدم

## 🔧 متغيرات البيئة المطلوبة

| المتغير | الوصف |
|---------|-------|
| `MONGODB_URI` | رابط اتصال MongoDB Atlas |
| `JWT_SECRET` | مفتاح سري لتوقيع JWT (32 حرف على الأقل) |
| `YALIDINE_API_ID` | معرف API لـ Yalidine |
| `YALIDINE_API_TOKEN` | رمز API لـ Yalidine |
| `ECOTRACK_API_KEY` | مفتاح API لـ EcoTrack |

## 📋 API Endpoints

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/health` | فحص صحة الخدمة |
| POST | `/api/auth/register` | إنشاء حساب جديد |
| POST | `/api/auth/login` | تسجيل الدخول |
| GET/POST | `/api/products` | جلب/إضافة المنتجات |
| GET/PUT/DELETE | `/api/products/:id` | تعديل/حذف منتج |
| GET/POST | `/api/orders` | جلب/إنشاء الطلبات |
| GET/PUT/PATCH | `/api/orders/:id` | تعديل طلب |
| GET/PUT | `/api/stores` | إعدادات المتجر |
| GET | `/api/customers` | قائمة العملاء |
| GET | `/api/analytics` | الإحصائيات |
