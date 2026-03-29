/**
 * نظام الحماية من الطلبات الوهمية
 * Anti-Fake Order Detection System
 */

// Regex للتحقق من أرقام الهاتف الجزائرية
const ALGERIA_PHONE_REGEX = /^(05|06|07)[0-9]{8}$/;

// أنماط الأرقام الوهمية المعروفة
const FAKE_PHONE_PATTERNS = [
  /^0(5|6|7)(0000000|1111111|2222222|3333333|4444444|5555555|6666666|7777777|8888888|9999999)$/,
  /^(0500000000|0600000000|0700000000)$/,
  /^05\d*0{6}$/,
  /^06\d*1{6}$/,
];

// قائمة الأرقام المحظورة المعروفة (يمكن توسيعها)
const BLACKLISTED_PHONES = new Set([
  '0500000000',
  '0600000000',
  '0700000000',
]);

/**
 * التحقق من صحة رقم الهاتف
 */
export function validateAlgerianPhone(phone) {
  if (!phone) return { valid: false, reason: 'رقم الهاتف مطلوب' };
  
  // Remove spaces and dashes
  const cleaned = phone.replace(/[\s\-\.]/g, '');
  
  if (!ALGERIA_PHONE_REGEX.test(cleaned)) {
    return { 
      valid: false, 
      reason: 'رقم الهاتف غير صحيح - يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكون من 10 أرقام' 
    };
  }
  
  return { valid: true, cleaned };
}

/**
 * تحليل الطلب للكشف عن الاحتيال
 * Returns: { isFraud, fraudScore, reasons, action }
 */
export async function analyzeOrder(orderData, existingOrders = [], options = {}) {
  const reasons = [];
  let fraudScore = 0;

  const { phone, name, ip } = orderData;
  const cleanedPhone = phone?.replace(/[\s\-\.]/g, '') || '';

  // ===== Rule 1: Phone format validation =====
  const phoneValidation = validateAlgerianPhone(cleanedPhone);
  if (!phoneValidation.valid) {
    reasons.push(`رقم الهاتف غير صحيح: ${phoneValidation.reason}`);
    fraudScore += 60;
  }

  // ===== Rule 2: Blacklisted phone =====
  if (BLACKLISTED_PHONES.has(cleanedPhone)) {
    reasons.push('رقم الهاتف في قائمة الحظر');
    fraudScore += 80;
  }

  // ===== Rule 3: Known fake phone patterns =====
  const isFakePattern = FAKE_PHONE_PATTERNS.some(pattern => pattern.test(cleanedPhone));
  if (isFakePattern) {
    reasons.push('نمط رقم الهاتف يشبه الأرقام الوهمية');
    fraudScore += 50;
  }

  // ===== Rule 4: Repeated orders from same phone =====
  const now = Date.now();
  const last24h = now - (24 * 60 * 60 * 1000);
  
  const ordersFromSamePhone = existingOrders.filter(order => {
    const orderPhone = order.customer?.phone?.replace(/[\s\-\.]/g, '');
    return orderPhone === cleanedPhone;
  });

  const recentOrdersFromPhone = ordersFromSamePhone.filter(order => {
    return new Date(order.createdAt).getTime() > last24h;
  });

  if (recentOrdersFromPhone.length >= 5) {
    reasons.push(`تم تقديم ${recentOrdersFromPhone.length} طلبات من نفس الرقم في 24 ساعة`);
    fraudScore += 60;
  } else if (recentOrdersFromPhone.length >= 3) {
    reasons.push(`تم تقديم ${recentOrdersFromPhone.length} طلبات من نفس الرقم في 24 ساعة`);
    fraudScore += 40;
  }

  // ===== Rule 5: Same phone, different names =====
  const namesFromPhone = new Set(
    ordersFromSamePhone.map(o => o.customer?.name?.toLowerCase().trim()).filter(Boolean)
  );
  if (name) namesFromPhone.add(name.toLowerCase().trim());
  
  if (namesFromPhone.size >= 3) {
    reasons.push('نفس رقم الهاتف مع أسماء مختلفة متعددة');
    fraudScore += 30;
  }

  // ===== Rule 6: IP-based velocity (if IP provided) =====
  if (ip && existingOrders.length > 0) {
    const lastHour = now - (60 * 60 * 1000);
    const ordersFromSameIp = existingOrders.filter(order => {
      return order.ip === ip && new Date(order.createdAt).getTime() > lastHour;
    });
    
    if (ordersFromSameIp.length >= 5) {
      reasons.push(`${ordersFromSameIp.length} طلبات من نفس الجهاز في ساعة واحدة`);
      fraudScore += 30;
    }
  }

  // ===== Rule 7: Suspicious name patterns =====
  if (name) {
    const suspiciousNames = ['test', 'تجربة', 'اختبار', 'مزيف', 'وهمي', 'asdf', 'aaaaa'];
    const nameLower = name.toLowerCase();
    if (suspiciousNames.some(s => nameLower.includes(s))) {
      reasons.push('اسم العميل يبدو مشبوهاً');
      fraudScore += 25;
    }
  }

  // Cap score at 100
  fraudScore = Math.min(fraudScore, 100);

  // Determine action
  let action = 'approve';
  let isFraud = false;
  
  if (fraudScore >= 70) {
    action = 'block';
    isFraud = true;
  } else if (fraudScore >= 40) {
    action = 'review';
  }

  return {
    isFraud,
    fraudScore,
    action,
    reasons,
    riskLevel: fraudScore >= 70 ? 'high' : fraudScore >= 40 ? 'medium' : 'low'
  };
}

/**
 * Add phone to blacklist
 */
export function addToBlacklist(phone) {
  const cleaned = phone.replace(/[\s\-\.]/g, '');
  BLACKLISTED_PHONES.add(cleaned);
}

/**
 * Check if phone is in blacklist
 */
export function isBlacklisted(phone) {
  const cleaned = phone.replace(/[\s\-\.]/g, '');
  return BLACKLISTED_PHONES.has(cleaned);
}
