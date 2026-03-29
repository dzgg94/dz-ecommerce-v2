import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES = '7d';

/**
 * Signs a JWT token with merchant data
 */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/**
 * Verifies a JWT token and returns the payload
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Extracts token from Authorization header
 */
export function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return authHeader;
}

/**
 * Middleware to protect API routes
 */
export function authMiddleware(handler) {
  return async (req, res) => {
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({ 
        error: 'غير مصرح - يرجى تسجيل الدخول أولاً' 
      });
    }

    try {
      const decoded = verifyToken(token);
      req.merchant = decoded;
      return handler(req, res);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'انتهت صلاحية الجلسة - يرجى تسجيل الدخول مجدداً' 
        });
      }
      return res.status(401).json({ 
        error: 'رمز التحقق غير صالح' 
      });
    }
  };
}

/**
 * CORS headers helper
 */
export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Handle CORS preflight
 */
export function handleCors(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
