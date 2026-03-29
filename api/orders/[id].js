import { getCollection } from '../../lib/mongodb.js';
import { authMiddleware, handleCors } from '../../lib/auth.js';
import { createShipment } from '../../lib/shipping.js';
import { ObjectId } from 'mongodb';

async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { id } = req.query;
  const { merchantId } = req.merchant;

  let orderId;
  try {
    orderId = new ObjectId(id);
  } catch {
    return res.status(400).json({ error: 'معرف الطلب غير صالح' });
  }

  const orders = await getCollection('orders');

  // ===== GET: Single order =====
  if (req.method === 'GET') {
    try {
      const order = await orders.findOne({ _id: orderId, merchantId });
      
      if (!order) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }

      return res.status(200).json({ success: true, data: order });

    } catch (error) {
      console.error('GET order error:', error);
      return res.status(500).json({ error: 'خطأ في جلب الطلب' });
    }
  }

  // ===== PUT: Update order =====
  if (req.method === 'PUT') {
    try {
      const { status, notes, trackingNumber, shippingProvider } = req.body;

      const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'حالة الطلب غير صالحة' });
      }

      const updateData = { updatedAt: new Date() };
      
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (shippingProvider) updateData.shippingProvider = shippingProvider;

      const result = await orders.findOneAndUpdate(
        { _id: orderId, merchantId },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (!result) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }

      return res.status(200).json({
        success: true,
        message: 'تم تحديث الطلب بنجاح',
        data: result
      });

    } catch (error) {
      console.error('PUT order error:', error);
      return res.status(500).json({ error: 'خطأ في تحديث الطلب' });
    }
  }

  // ===== PATCH: Partial update =====
  if (req.method === 'PATCH') {
    try {
      const updates = req.body;
      
      // Handle shipping creation
      if (updates.createShipment && updates.shippingProvider) {
        const order = await orders.findOne({ _id: orderId, merchantId });
        if (!order) {
          return res.status(404).json({ error: 'الطلب غير موجود' });
        }

        const stores = await getCollection('stores');
        const store = await stores.findOne({ merchantId });

        try {
          const shipmentResult = await createShipment(
            order, 
            updates.shippingProvider,
            store?.settings || {}
          );

          const updateData = {
            trackingNumber: shipmentResult.trackingNumber,
            shippingProvider: updates.shippingProvider,
            status: 'shipped',
            shipmentData: shipmentResult.data,
            updatedAt: new Date()
          };

          const result = await orders.findOneAndUpdate(
            { _id: orderId, merchantId },
            { $set: updateData },
            { returnDocument: 'after' }
          );

          return res.status(200).json({
            success: true,
            message: 'تم إنشاء الشحنة وتحديث الطلب',
            trackingNumber: shipmentResult.trackingNumber,
            data: result
          });

        } catch (shipError) {
          return res.status(400).json({ 
            error: `خطأ في إنشاء الشحنة: ${shipError.message}` 
          });
        }
      }

      // Regular partial update
      delete updates.merchantId;
      delete updates.createShipment;
      updates.updatedAt = new Date();

      const result = await orders.findOneAndUpdate(
        { _id: orderId, merchantId },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }

      return res.status(200).json({
        success: true,
        message: 'تم تحديث الطلب بنجاح',
        data: result
      });

    } catch (error) {
      console.error('PATCH order error:', error);
      return res.status(500).json({ error: 'خطأ في تحديث الطلب' });
    }
  }

  // ===== DELETE: Cancel/Delete order =====
  if (req.method === 'DELETE') {
    try {
      // Soft delete - just mark as cancelled
      const result = await orders.findOneAndUpdate(
        { _id: orderId, merchantId },
        { $set: { status: 'cancelled', updatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      if (!result) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }

      return res.status(200).json({
        success: true,
        message: 'تم إلغاء الطلب'
      });

    } catch (error) {
      console.error('DELETE order error:', error);
      return res.status(500).json({ error: 'خطأ في إلغاء الطلب' });
    }
  }

  return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
}

export default authMiddleware(handler);
