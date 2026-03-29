import bcrypt from 'bcryptjs';
import { getCollection } from '../../lib/mongodb.js';
import { signToken, handleCors } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'البريد الإلكتروني وكلمة المرور مطلوبان' 
      });
    }

    const merchants = await getCollection('merchants');
    const merchant = await merchants.findOne({ 
      email: email.toLowerCase(),
      isActive: true
    });

    if (!merchant) {
      return res.status(401).json({ 
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' 
      });
    }

    const passwordMatch = await bcrypt.compare(password, merchant.password);
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' 
      });
    }

    // Get store info
    const stores = await getCollection('stores');
    const store = await stores.findOne({ merchantId: merchant._id.toString() });

    // Update last login
    await merchants.updateOne(
      { _id: merchant._id },
      { $set: { lastLogin: new Date() } }
    );

    const token = signToken({
      merchantId: merchant._id.toString(),
      email: merchant.email,
      name: merchant.name,
      businessName: merchant.businessName,
      plan: merchant.plan,
      storeId: store?._id.toString(),
      subdomain: store?.subdomain
    });

    return res.status(200).json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      merchant: {
        id: merchant._id.toString(),
        name: merchant.name,
        email: merchant.email,
        businessName: merchant.businessName,
        plan: merchant.plan,
        subdomain: store?.subdomain,
        planExpiry: merchant.planExpiry
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      error: 'حدث خطأ في الخادم - يرجى المحاولة مرة أخرى' 
    });
  }
}
