import { healthCheck } from '../../lib/mongodb.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dbHealth = await healthCheck();
    const status = dbHealth.status === 'connected' ? 200 : 503;
    
    return res.status(status).json({
      status: dbHealth.status === 'connected' ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      database: dbHealth,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      platform: 'DZ Store'
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
