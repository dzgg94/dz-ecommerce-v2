/**
 * تكامل شركات التوصيل
 * Shipping Integration: Yalidine + EcoTrack
 */

/**
 * ===== YALIDINE INTEGRATION =====
 * https://api.yalidine.app/v1/
 */
export async function createYalidineShipment(order, storeSettings = {}) {
  const apiId = storeSettings.yalidineApiId || process.env.YALIDINE_API_ID;
  const apiToken = storeSettings.yalidineApiToken || process.env.YALIDINE_API_TOKEN;

  if (!apiId || !apiToken) {
    throw new Error('مفاتيح API الخاصة بـ Yalidine غير مضبوطة');
  }

  const payload = {
    order_id: order._id.toString(),
    firstname: order.customer.name.split(' ')[0] || order.customer.name,
    familyname: order.customer.name.split(' ').slice(1).join(' ') || '',
    contact_phone: order.customer.phone,
    address: order.customer.address || order.customer.commune,
    to_wilaya_id: getWilayaId(order.customer.wilaya),
    to_commune_id: null, // Will be set by Yalidine
    product_list: order.product.name,
    price: order.product.price,
    do_insurance: false,
    declared_value: order.product.price,
    height: 10,
    width: 15,
    length: 20,
    weight: 1,
    freeshipping: storeSettings.freeShipping ? 1 : 0,
    is_stopdesk: storeSettings.stopDesk ? 1 : 0,
    has_exchange: 0,
    product_to_collect: 0
  };

  try {
    const response = await fetch('https://api.yalidine.app/v1/parcels/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-ID': apiId,
        'X-API-TOKEN': apiToken
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'خطأ في إنشاء الشحنة على Yalidine');
    }

    return {
      success: true,
      provider: 'yalidine',
      trackingNumber: data.tracking || data.barcode,
      shipmentId: data.id,
      data
    };
  } catch (error) {
    console.error('Yalidine error:', error);
    throw error;
  }
}

/**
 * Track Yalidine shipment
 */
export async function trackYalidineShipment(trackingNumber, storeSettings = {}) {
  const apiId = storeSettings.yalidineApiId || process.env.YALIDINE_API_ID;
  const apiToken = storeSettings.yalidineApiToken || process.env.YALIDINE_API_TOKEN;

  const response = await fetch(`https://api.yalidine.app/v1/parcels/${trackingNumber}`, {
    headers: {
      'X-API-ID': apiId,
      'X-API-TOKEN': apiToken
    }
  });

  if (!response.ok) {
    throw new Error('فشل في تتبع الشحنة');
  }

  return await response.json();
}

/**
 * ===== ECOTRACK INTEGRATION =====
 */
export async function createEcoTrackShipment(order, storeSettings = {}) {
  const apiKey = storeSettings.ecotrackApiKey || process.env.ECOTRACK_API_KEY;
  const apiUrl = process.env.ECOTRACK_API_URL || 'https://api.ecotrack.dz';

  if (!apiKey) {
    throw new Error('مفتاح API الخاص بـ EcoTrack غير مضبوط');
  }

  const payload = {
    reference: order._id.toString(),
    client_name: order.customer.name,
    client_phone: order.customer.phone,
    client_address: `${order.customer.address || ''}, ${order.customer.commune}, ${order.customer.wilaya}`,
    wilaya: order.customer.wilaya,
    commune: order.customer.commune,
    product_name: order.product.name,
    cod_amount: order.product.price,
    weight: 1,
    notes: order.notes || ''
  };

  try {
    const response = await fetch(`${apiUrl}/api/v1/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'خطأ في إنشاء الشحنة على EcoTrack');
    }

    return {
      success: true,
      provider: 'ecotrack',
      trackingNumber: data.tracking_number || data.id,
      shipmentId: data.id,
      data
    };
  } catch (error) {
    console.error('EcoTrack error:', error);
    throw error;
  }
}

/**
 * Create shipment with specified provider
 */
export async function createShipment(order, provider, storeSettings = {}) {
  switch (provider) {
    case 'yalidine':
      return createYalidineShipment(order, storeSettings);
    case 'ecotrack':
      return createEcoTrackShipment(order, storeSettings);
    default:
      throw new Error(`شركة التوصيل غير معروفة: ${provider}`);
  }
}

/**
 * Map wilaya name to Yalidine wilaya ID
 */
export function getWilayaId(wilayaName) {
  const wilayaMap = {
    'أدرار': 1, 'الشلف': 2, 'الأغواط': 3, 'أم البواقي': 4,
    'باتنة': 5, 'بجاية': 6, 'بسكرة': 7, 'بشار': 8,
    'البليدة': 9, 'البويرة': 10, 'تمنراست': 11, 'تبسة': 12,
    'تلمسان': 13, 'تيارت': 14, 'تيزي وزو': 15, 'الجزائر': 16,
    'الجلفة': 17, 'جيجل': 18, 'سطيف': 19, 'سعيدة': 20,
    'سكيكدة': 21, 'سيدي بلعباس': 22, 'عنابة': 23, 'قالمة': 24,
    'قسنطينة': 25, 'المدية': 26, 'مستغانم': 27, 'المسيلة': 28,
    'معسكر': 29, 'ورقلة': 30, 'وهران': 31, 'البيض': 32,
    'إليزي': 33, 'برج بوعريريج': 34, 'بومرداس': 35, 'الطارف': 36,
    'تندوف': 37, 'تيسمسيلت': 38, 'الوادي': 39, 'خنشلة': 40,
    'سوق أهراس': 41, 'تيبازة': 42, 'ميلة': 43, 'عين الدفلى': 44,
    'النعامة': 45, 'عين تموشنت': 46, 'غرداية': 47, 'غليزان': 48,
    'المغير': 49, 'المنيعة': 50, 'أولاد جلال': 51, 'برج باجي مختار': 52,
    'بني عباس': 53, 'تيميمون': 54, 'تقرت': 55, 'جانت': 56,
    'عين صالح': 57, 'عين قزام': 58
  };
  return wilayaMap[wilayaName] || 16;
}

// Algeria 58 Wilayas list for frontend
export const ALGERIA_WILAYAS = [
  'أدرار', 'الشلف', 'الأغواط', 'أم البواقي', 'باتنة', 'بجاية', 'بسكرة', 'بشار',
  'البليدة', 'البويرة', 'تمنراست', 'تبسة', 'تلمسان', 'تيارت', 'تيزي وزو', 'الجزائر',
  'الجلفة', 'جيجل', 'سطيف', 'سعيدة', 'سكيكدة', 'سيدي بلعباس', 'عنابة', 'قالمة',
  'قسنطينة', 'المدية', 'مستغانم', 'المسيلة', 'معسكر', 'ورقلة', 'وهران', 'البيض',
  'إليزي', 'برج بوعريريج', 'بومرداس', 'الطارف', 'تندوف', 'تيسمسيلت', 'الوادي', 'خنشلة',
  'سوق أهراس', 'تيبازة', 'ميلة', 'عين الدفلى', 'النعامة', 'عين تموشنت', 'غرداية', 'غليزان',
  'المغير', 'المنيعة', 'أولاد جلال', 'برج باجي مختار', 'بني عباس', 'تيميمون', 'تقرت',
  'جانت', 'عين صالح', 'عين قزام'
];
