import { getCollection } from '../../lib/mongodb.js';
import { authMiddleware, handleCors } from '../../lib/auth.js';

async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { merchantId } = req.merchant;
  const stores = await getCollection('stores');

  // ===== GET: Merchant's store =====
  if (req.method === 'GET') {
    try {
      const store = await stores.findOne({ merchantId });
      
      if (!store) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }

      return res.status(200).json({ success: true, data: store });

    } catch (error) {
      console.error('GET store error:', error);
      return res.status(500).json({ error: 'خطأ في جلب بيانات المتجر' });
    }
  }

  // ===== PUT: Update store =====
  if (req.method === 'PUT') {
    try {
      const { 
        name, description, logo, primaryColor, secondaryColor, 
        settings, socialLinks, seoTitle, seoDescription
      } = req.body;

      // Check subdomain uniqueness if changed
      const currentStore = await stores.findOne({ merchantId });
      
      const updateData = {
        updatedAt: new Date()
      };

      if (name) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;
      if (logo !== undefined) updateData.logo = logo;
      if (primaryColor) updateData.primaryColor = primaryColor;
      if (secondaryColor) updateData.secondaryColor = secondaryColor;
      if (seoTitle) updateData.seoTitle = seoTitle;
      if (seoDescription) updateData.seoDescription = seoDescription;
      if (socialLinks) updateData.socialLinks = socialLinks;
      
      // Merge settings (don't overwrite all)
      if (settings && typeof settings === 'object') {
        const currentSettings = currentStore?.settings || {};
        updateData.settings = { ...currentSettings, ...settings };
      }

      const result = await stores.findOneAndUpdate(
        { merchantId },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (!result) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }

      return res.status(200).json({
        success: true,
        message: 'تم تحديث إعدادات المتجر بنجاح',
        data: result
      });

    } catch (error) {
      console.error('PUT store error:', error);
      return res.status(500).json({ error: 'خطأ في تحديث المتجر' });
    }
  }

  return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
}

export default authMiddleware(handler);
