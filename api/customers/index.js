import { getCollection } from '../../lib/mongodb.js';
import { authMiddleware, handleCors } from '../../lib/auth.js';

async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
  }

  const { merchantId } = req.merchant;
  const { page = 1, limit = 20, search, sort = 'totalOrders' } = req.query;

  try {
    const orders = await getCollection('orders');

    // Aggregate customer data from orders
    const matchStage = { merchantId };
    
    if (search) {
      matchStage.$or = [
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const pipeline = [
      { $match: matchStage },
      { $group: {
        _id: '$customer.phone',
        name: { $last: '$customer.name' },
        phone: { $first: '$customer.phone' },
        wilaya: { $last: '$customer.wilaya' },
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$totalAmount' },
        lastOrder: { $max: '$createdAt' },
        firstOrder: { $min: '$createdAt' },
        deliveredOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
        },
        cancelledOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
        }
      }},
      { $addFields: {
        deliveryRate: {
          $cond: [
            { $gt: ['$totalOrders', 0] },
            { $multiply: [{ $divide: ['$deliveredOrders', '$totalOrders'] }, 100] },
            0
          ]
        }
      }},
      { $sort: { [sort]: -1 } },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ];

    const customers = await orders.aggregate(pipeline).toArray();
    
    // Get total unique customers
    const totalPipeline = [
      { $match: matchStage },
      { $group: { _id: '$customer.phone' } },
      { $count: 'total' }
    ];
    
    const totalResult = await orders.aggregate(totalPipeline).toArray();
    const total = totalResult[0]?.total || 0;

    // Top stats
    const statsResult = await orders.aggregate([
      { $match: { merchantId } },
      { $group: {
        _id: null,
        totalCustomers: { $addToSet: '$customer.phone' },
        totalRevenue: { $sum: '$totalAmount' }
      }}
    ]).toArray();

    return res.status(200).json({
      success: true,
      data: customers,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
      stats: {
        totalCustomers: statsResult[0]?.totalCustomers?.length || 0,
        totalRevenue: statsResult[0]?.totalRevenue || 0
      }
    });

  } catch (error) {
    console.error('GET customers error:', error);
    return res.status(500).json({ error: 'خطأ في جلب بيانات العملاء' });
  }
}

export default authMiddleware(handler);
