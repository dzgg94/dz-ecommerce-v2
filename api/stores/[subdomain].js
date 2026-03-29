import { getCollection } from '../../lib/mongodb.js';
import { handleCors } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'الطريقة غير مسموح بها' });
  }

  const { subdomain } = req.query;

  try {
    const stores = await getCollection('stores');
    const store = await stores.findOne({ 
      subdomain: subdomain.toLowerCase(),
      isActive: true
    });

    if (!store) {
      return res.status(404).json({ error: 'المتجر غير موجود أو غير نشط' });
    }

    // Get products for this store
    const products = await getCollection('products');
    const storeProducts = await products
      .find({ 
        merchantId: store.merchantId,
        status: 'available'
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Don't expose sensitive settings
    const publicStore = {
      id: store._id.toString(),
      name: store.name,
      subdomain: store.subdomain,
      description: store.description,
      logo: store.logo,
      primaryColor: store.primaryColor || '#6C5CE7',
      secondaryColor: store.secondaryColor || '#00CEC9',
      seoTitle: store.seoTitle,
      seoDescription: store.seoDescription,
      socialLinks: store.socialLinks || {}
    };

    // Strip sensitive product data
    const publicProducts = storeProducts.map(p => ({
      id: p._id.toString(),
      name: p.name,
      price: p.price,
      images: p.images,
      description: p.description,
      variants: p.variants,
      status: p.status
    }));

    return res.status(200).json({
      success: true,
      data: {
        store: publicStore,
        products: publicProducts,
        merchantId: store.merchantId
      }
    });

  } catch (error) {
    console.error('GET public store error:', error);
    return res.status(500).json({ error: 'خطأ في جلب بيانات المتجر' });
  }
}
