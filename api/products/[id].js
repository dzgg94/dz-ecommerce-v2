import { getCollection } from '../../lib/mongodb.js';
import { authMiddleware, handleCors } from '../../lib/auth.js';
import { ObjectId } from 'mongodb';

async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { id } = req.query;
  const { merchantId } = req.merchant;

  let productId;
  try {
    productId = new ObjectId(id);
  } catch {
    return res.status(400).json({ error: 'معرف المنتج غير صالح' });
  }

  const products = await getCollection('products');

  // ===== GET: Single product =====
  if (req.method === 'GET') {
    try {
      const product = await products.findOne({ _id: productId, merchantId });
      
      if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }

      return res.status(200).json({ success: true, data: product });

    } catch (error) {
      console.error('GET product error:', error);
      return res.status(500).json({ error: 'خطأ في جلب المنتج' });
    }
  }

  // ===== PUT: Update product =====
  if (req.method === 'PUT') {
    try {
      const { name, price, images, description, variants, status } = req.body;

      if (!name || price === undefined) {
        return res.status(400).json({ error: 'اسم المنتج والسعر مطلوبان' });
      }

      const updateData = {
        name: name.trim(),
        price: parseFloat(price),
        images: Array.isArray(images) ? images : (images ? [images] : []),
        description: description || '',
        variants: {
          colors: Array.isArray(variants?.colors) ? variants.colors : [],
          sizes: Array.isArray(variants?.sizes) ? variants.sizes : []
        },
        status: ['available', 'unavailable', 'out_of_stock'].includes(status) 
          ? status : 'available',
        updatedAt: new Date()
      };

      const result = await products.findOneAndUpdate(
        { _id: productId, merchantId },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (!result) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }

      return res.status(200).json({
        success: true,
        message: 'تم تحديث المنتج بنجاح',
        data: result
      });

    } catch (error) {
      console.error('PUT product error:', error);
      return res.status(500).json({ error: 'خطأ في تحديث المنتج' });
    }
  }

  // ===== PATCH: Partial update (e.g., status only) =====
  if (req.method === 'PATCH') {
    try {
      const updates = { ...req.body, updatedAt: new Date() };
      
      // Don't allow changing merchantId
      delete updates.merchantId;

      const result = await products.findOneAndUpdate(
        { _id: productId, merchantId },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }

      return res.status(200).json({
        success: true,
        message: 'تم تحديث المنتج بنجاح',
        data: result
      });

    } catch (error) {
      console.error('PATCH product error:', error);
      return res.status(500).json({ error: 'خطأ في تحديث المنتج' });
    }
  }

  // ===== DELETE: Delete product =====
  if (req.method === 'DELETE') {
    try {
      const result = await products.deleteOne({ _id: productId, merchantId });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
      }

      return res.status(200).json({
        success: true,
        message: 'تم حذف المنتج بنجاح'
      });

    } catch (error) {
      console.error('DELETE product error:', error);
      return res.status(500).json({ error: 'خطأ في حذف المنتج' });
    }
  }

  return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
}

export default authMiddleware(handler);
