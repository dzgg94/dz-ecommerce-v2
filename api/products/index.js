import { getCollection } from '../../lib/mongodb.js';
import { authMiddleware, handleCors } from '../../lib/auth.js';
import { ObjectId } from 'mongodb';

async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { merchantId } = req.merchant;

  // ===== GET: List products =====
  if (req.method === 'GET') {
    try {
      const { page = 1, limit = 20, search, status, sort = 'createdAt' } = req.query;
      
      const query = { merchantId };
      
      if (status && status !== 'all') {
        query.status = status;
      }
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const products = await getCollection('products');
      const total = await products.countDocuments(query);
      
      const items = await products
        .find(query)
        .sort({ [sort]: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .toArray();

      return res.status(200).json({
        success: true,
        data: items,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      });

    } catch (error) {
      console.error('GET products error:', error);
      return res.status(500).json({ error: 'خطأ في جلب المنتجات' });
    }
  }

  // ===== POST: Create product =====
  if (req.method === 'POST') {
    try {
      const { name, price, images, description, variants, status } = req.body;

      if (!name || price === undefined) {
        return res.status(400).json({ 
          error: 'اسم المنتج والسعر مطلوبان' 
        });
      }

      if (isNaN(price) || price < 0) {
        return res.status(400).json({ 
          error: 'السعر يجب أن يكون رقماً موجباً' 
        });
      }

      // Get store ID
      const stores = await getCollection('stores');
      const store = await stores.findOne({ merchantId });

      const now = new Date();
      const product = {
        merchantId,
        storeId: store?._id.toString(),
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
        ordersCount: 0,
        views: 0,
        createdAt: now,
        updatedAt: now
      };

      const products = await getCollection('products');
      const result = await products.insertOne(product);

      return res.status(201).json({
        success: true,
        message: 'تم إضافة المنتج بنجاح',
        data: { ...product, _id: result.insertedId }
      });

    } catch (error) {
      console.error('POST product error:', error);
      return res.status(500).json({ error: 'خطأ في إضافة المنتج' });
    }
  }

  // ===== DELETE: Bulk delete =====
  if (req.method === 'DELETE') {
    try {
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'يرجى تحديد المنتجات للحذف' });
      }

      const objectIds = ids.map(id => new ObjectId(id));
      const products = await getCollection('products');
      
      const result = await products.deleteMany({
        _id: { $in: objectIds },
        merchantId
      });

      return res.status(200).json({
        success: true,
        message: `تم حذف ${result.deletedCount} منتج`,
        deletedCount: result.deletedCount
      });

    } catch (error) {
      console.error('DELETE products error:', error);
      return res.status(500).json({ error: 'خطأ في حذف المنتجات' });
    }
  }

  return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
}

export default authMiddleware(handler);
