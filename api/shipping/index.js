import { getCollection } from '../../lib/mongodb.js';
import { authMiddleware, handleCors } from '../../lib/auth.js';
import { createShipment } from '../../lib/shipping.js';
import { ObjectId } from 'mongodb';

async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
  }

  const { merchantId } = req.merchant;
  const { orderId, provider } = req.body;

  if (!orderId || !provider) {
    return res.status(400).json({ 
      error: 'معرف الطلب وشركة التوصيل مطلوبان' 
    });
  }

  if (!['yalidine', 'ecotrack'].includes(provider)) {
    return res.status(400).json({ 
      error: 'شركة التوصيل غير صالحة - يرجى اختيار yalidine أو ecotrack' 
    });
  }

  try {
    let orderId_obj;
    try {
      orderId_obj = new ObjectId(orderId);
    } catch {
      return res.status(400).json({ error: 'معرف الطلب غير صالح' });
    }

    const orders = await getCollection('orders');
    const order = await orders.findOne({ _id: orderId_obj, merchantId });

    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    if (order.trackingNumber) {
      return res.status(400).json({ 
        error: 'هذا الطلب لديه رقم تتبع بالفعل: ' + order.trackingNumber 
      });
    }

    // Get store settings for API keys
    const stores = await getCollection('stores');
    const store = await stores.findOne({ merchantId });
    const storeSettings = store?.settings || {};

    // Create shipment
    const shipmentResult = await createShipment(order, provider, storeSettings);

    // Update order with tracking info
    await orders.updateOne(
      { _id: orderId_obj },
      { 
        $set: { 
          trackingNumber: shipmentResult.trackingNumber,
          shippingProvider: provider,
          shipmentId: shipmentResult.shipmentId,
          status: 'shipped',
          updatedAt: new Date()
        } 
      }
    );

    return res.status(200).json({
      success: true,
      message: 'تم إنشاء الشحنة بنجاح',
      trackingNumber: shipmentResult.trackingNumber,
      provider,
      data: shipmentResult.data
    });

  } catch (error) {
    console.error('Shipping error:', error);
    return res.status(500).json({ 
      error: error.message || 'خطأ في إنشاء الشحنة' 
    });
  }
}

export default authMiddleware(handler);
