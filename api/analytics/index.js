import { getCollection } from '../../lib/mongodb.js';
import { authMiddleware, handleCors } from '../../lib/auth.js';

async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
  }

  const { merchantId } = req.merchant;
  const { period = '30' } = req.query;

  try {
    const orders = await getCollection('orders');
    const products = await getCollection('products');

    const daysBack = parseInt(period);
    const now = new Date();
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ===== Orders by status =====
    const statusCounts = await orders.aggregate([
      { $match: { merchantId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    const statusMap = {};
    statusCounts.forEach(s => { statusMap[s._id] = s.count; });

    // ===== Revenue stats =====
    const revenueStats = await orders.aggregate([
      { $match: { merchantId, status: { $in: ['delivered', 'confirmed', 'shipped'] } } },
      { $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        avgOrderValue: { $avg: '$totalAmount' },
        totalOrders: { $sum: 1 }
      }}
    ]).toArray();

    // ===== Today's stats =====
    const todayStats = await orders.aggregate([
      { $match: { merchantId, createdAt: { $gte: startOfToday } } },
      { $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }}
    ]).toArray();

    // ===== Weekly stats =====
    const weekStats = await orders.aggregate([
      { $match: { merchantId, createdAt: { $gte: startOfWeek } } },
      { $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }}
    ]).toArray();

    // ===== Monthly orders (last 30 days) =====
    const monthlyOrders = await orders.aggregate([
      { $match: { merchantId, createdAt: { $gte: startDate } } },
      { $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        count: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]).toArray();

    // Fill missing days
    const dailyData = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      const found = monthlyOrders.find(d => 
        d._id.year === year && d._id.month === month && d._id.day === day
      );
      
      dailyData.push({
        date: date.toISOString().split('T')[0],
        label: `${day}/${month}`,
        orders: found?.count || 0,
        revenue: found?.revenue || 0
      });
    }

    // ===== Top wilayas =====
    const topWilayas = await orders.aggregate([
      { $match: { merchantId } },
      { $group: {
        _id: '$customer.wilaya',
        count: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();

    // ===== Top products =====
    const topProducts = await orders.aggregate([
      { $match: { merchantId } },
      { $group: {
        _id: '$product.id',
        name: { $first: '$product.name' },
        count: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }},
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray();

    // ===== Pending orders =====
    const pendingCount = statusMap['pending'] || 0;

    // ===== Total products =====
    const productsCount = await products.countDocuments({ merchantId });

    // ===== Fraud stats =====
    const fraudStats = await orders.aggregate([
      { $match: { merchantId, isFraud: true } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]).toArray();

    const totalOrdersCount = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const deliveredCount = statusMap['delivered'] || 0;
    const conversionRate = totalOrdersCount > 0 
      ? ((deliveredCount / totalOrdersCount) * 100).toFixed(1) 
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalOrders: totalOrdersCount,
          pendingOrders: pendingCount,
          totalRevenue: revenueStats[0]?.totalRevenue || 0,
          avgOrderValue: Math.round(revenueStats[0]?.avgOrderValue || 0),
          conversionRate: parseFloat(conversionRate),
          productsCount,
          fraudOrders: fraudStats[0]?.count || 0,
          today: {
            orders: todayStats[0]?.orders || 0,
            revenue: todayStats[0]?.revenue || 0
          },
          week: {
            orders: weekStats[0]?.orders || 0,
            revenue: weekStats[0]?.revenue || 0
          }
        },
        statusCounts: statusMap,
        dailyData,
        topWilayas: topWilayas.map(w => ({
          wilaya: w._id || 'غير محدد',
          count: w.count,
          revenue: w.revenue
        })),
        topProducts: topProducts.map(p => ({
          id: p._id,
          name: p.name,
          count: p.count,
          revenue: p.revenue
        }))
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
  }
}

export default authMiddleware(handler);
