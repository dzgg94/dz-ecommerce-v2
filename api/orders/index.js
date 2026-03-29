import { getCollection } from '../../lib/mongodb.js';
import { verifyToken, handleCors } from '../../lib/auth.js';
import { analyzeOrder, validateAlgerianPhone } from '../../lib/antifraud.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // ===== GET: Protected - list orders =====
  if (req.method === 'GET') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'غير مصرح' });
      
      const merchant = verifyToken(token);
      const { merchantId } = merchant;

      const { 
        page = 1, limit = 20, status, wilaya, 
        search, dateFrom, dateTo, sort = 'createdAt' 
      } = req.query;
      
      const query = { merchantId };
      
      if (status && status !== 'all') query.status = status;
      if (wilaya && wilaya !== 'all') query['customer.wilaya'] = wilaya;
      
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }
      
      if (search) {
        query.$or = [
          { 'customer.name': { $regex: search, $options: 'i' } },
          { 'customer.phone': { $regex: search, $options: 'i' } },
          { orderNumber: { $regex: search, $options: 'i' } }
        ];
      }

      const orders = await getCollection('orders');
      const total = await orders.countDocuments(query);
      
      const items = await orders
        .find(query)
        .sort({ [sort]: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .toArray();

      // Get status counts
      const statusCounts = await orders.aggregate([
        { $match: { merchantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).toArray();

      const counts = {};
      statusCounts.forEach(s => { counts[s._id] = s.count; });

      return res.status(200).json({
        success: true,
        data: items,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
        statusCounts: counts
      });

    } catch (error) {
      console.error('GET orders error:', error);
      return res.status(500).json({ error: 'خطأ في جلب الطلبات' });
    }
  }

  // ===== POST: Create order (public - from store) =====
  if (req.method === 'POST') {
    try {
      const { 
        merchantId, storeId, customer, product, 
        quantity = 1, notes 
      } = req.body;

      // Validate required fields
      if (!merchantId || !customer?.name || !customer?.phone || !customer?.wilaya) {
        return res.status(400).json({ 
          error: 'البيانات المطلوبة: معرف التاجر، الاسم، الهاتف، الولاية' 
        });
      }

      if (!product?.id && !product?.name) {
        return res.status(400).json({ error: 'بيانات المنتج مطلوبة' });
      }

      // Phone validation
      const phoneCheck = validateAlgerianPhone(customer.phone);
      if (!phoneCheck.valid) {
        return res.status(400).json({ error: phoneCheck.reason });
      }

      // Get existing orders for fraud analysis
      const orders = await getCollection('orders');
      const existingOrders = await orders
        .find({ merchantId, 'customer.phone': { $regex: customer.phone } })
        .limit(50)
        .toArray();

      // Anti-fraud analysis
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
      const fraudAnalysis = await analyzeOrder(
        { ...customer, ip },
        existingOrders
      );

      if (fraudAnalysis.action === 'block') {
        return res.status(400).json({
          error: 'تعذر إتمام الطلب - يرجى التواصل مع المتجر مباشرة',
          code: 'FRAUD_DETECTED'
        });
      }

      // Get product details if ID provided
      let productData = product;
      if (product.id) {
        try {
          const products = await getCollection('products');
          const dbProduct = await products.findOne({ 
            _id: new ObjectId(product.id), 
            merchantId 
          });
          if (dbProduct) {
            productData = {
              id: product.id,
              name: dbProduct.name,
              price: dbProduct.price,
              variant: product.variant,
              quantity: parseInt(quantity) || 1
            };
            // Increment product order count
            await products.updateOne(
              { _id: new ObjectId(product.id) },
              { $inc: { ordersCount: 1 } }
            );
          }
        } catch (e) {
          // Use provided product data if ID lookup fails
        }
      }

      // Generate order number
      const orderCount = await orders.countDocuments({ merchantId });
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${orderCount + 1}`;

      const now = new Date();
      const order = {
        merchantId,
        storeId: storeId || '',
        orderNumber,
        customer: {
          name: customer.name.trim(),
          phone: phoneCheck.cleaned || customer.phone.replace(/[\s\-\.]/g, ''),
          wilaya: customer.wilaya,
          commune: customer.commune || '',
          address: customer.address || ''
        },
        product: {
          id: productData.id || '',
          name: productData.name || '',
          price: parseFloat(productData.price) || 0,
          variant: productData.variant || null,
          quantity: parseInt(quantity) || 1
        },
        totalAmount: (parseFloat(productData.price) || 0) * (parseInt(quantity) || 1),
        status: 'pending',
        notes: notes || '',
        trackingNumber: '',
        shippingProvider: '',
        ip: ip || '',
        isFraud: fraudAnalysis.isFraud,
        fraudScore: fraudAnalysis.fraudScore,
        fraudReasons: fraudAnalysis.reasons,
        riskLevel: fraudAnalysis.riskLevel,
        createdAt: now,
        updatedAt: now
      };

      const result = await orders.insertOne(order);

      return res.status(201).json({
        success: true,
        message: 'تم تقديم طلبك بنجاح! سنتواصل معك قريباً',
        data: {
          orderNumber,
          orderId: result.insertedId.toString(),
          status: 'pending'
        }
      });

    } catch (error) {
      console.error('POST order error:', error);
      return res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
    }
  }

  return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
}
