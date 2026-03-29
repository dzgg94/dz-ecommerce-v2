import bcrypt from 'bcryptjs';
import { getCollection } from '../../lib/mongodb.js';
import { signToken, handleCors } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
  }

  try {
    const { name, email, password, businessName, phone } = req.body;

    // Validation
    if (!name || !email || !password || !businessName) {
      return res.status(400).json({ 
        error: 'جميع الحقول مطلوبة: الاسم، البريد الإلكتروني، كلمة المرور، اسم النشاط التجاري' 
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' 
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صحيح' });
    }

    const merchants = await getCollection('merchants');

    // Check if email already exists
    const existingMerchant = await merchants.findOne({ email: email.toLowerCase() });
    if (existingMerchant) {
      return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate subdomain from business name
    const subdomain = businessName
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30) || `store-${Date.now()}`;

    // Check subdomain availability
    const stores = await getCollection('stores');
    const existingStore = await stores.findOne({ subdomain });
    const finalSubdomain = existingStore 
      ? `${subdomain}-${Date.now().toString().slice(-4)}` 
      : subdomain;

    // Create merchant
    const now = new Date();
    const merchant = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      businessName,
      plan: 'basic',
      planExpiry: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    const merchantResult = await merchants.insertOne(merchant);
    const merchantId = merchantResult.insertedId.toString();

    // Create default store
    const store = {
      merchantId,
      name: businessName,
      subdomain: finalSubdomain,
      description: '',
      logo: '',
      primaryColor: '#6C5CE7',
      secondaryColor: '#00CEC9',
      isActive: true,
      settings: {
        shippingProvider: 'yalidine',
        freeShipping: false,
        stopDesk: false,
        yalidineApiId: '',
        yalidineApiToken: '',
        ecotrackApiKey: '',
        whatsappNumber: ''
      },
      createdAt: now,
      updatedAt: now
    };

    const storeResult = await stores.insertOne(store);

    // Create JWT token
    const token = signToken({
      merchantId,
      email: merchant.email,
      name: merchant.name,
      businessName: merchant.businessName,
      plan: merchant.plan,
      storeId: storeResult.insertedId.toString(),
      subdomain: finalSubdomain
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      token,
      merchant: {
        id: merchantId,
        name: merchant.name,
        email: merchant.email,
        businessName: merchant.businessName,
        plan: merchant.plan,
        subdomain: finalSubdomain
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ 
      error: 'حدث خطأ في الخادم - يرجى المحاولة مرة أخرى' 
    });
  }
}
