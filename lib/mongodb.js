import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('يرجى تحديد متغير البيئة MONGODB_URI');
}

let client;
let clientPromise;
let isConnected = false;

const options = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true,
  heartbeatFrequencyMS: 10000,
};

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect().then(c => {
      isConnected = true;
      console.log('✅ MongoDB متصل بنجاح (development)');
      return c;
    }).catch(err => {
      console.error('❌ فشل الاتصال بـ MongoDB:', err.message);
      // Retry after 3 seconds
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            const retryClient = new MongoClient(uri, options);
            const connected = await retryClient.connect();
            isConnected = true;
            console.log('✅ MongoDB متصل بنجاح (إعادة المحاولة)');
            resolve(connected);
          } catch (retryErr) {
            console.error('❌ فشل إعادة الاتصال:', retryErr.message);
            throw retryErr;
          }
        }, 3000);
      });
    });
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect().then(c => {
    isConnected = true;
    console.log('✅ MongoDB متصل بنجاح (production)');
    return c;
  }).catch(err => {
    console.error('❌ فشل الاتصال بـ MongoDB:', err.message);
    throw err;
  });
}

export default clientPromise;

/**
 * Get database instance with connection validation
 */
export async function getDb(dbName = 'dz-ecommerce') {
  try {
    const client = await clientPromise;
    const db = client.db(dbName);
    // Ping to verify connection
    await db.command({ ping: 1 });
    return db;
  } catch (error) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
    // Try to reconnect
    isConnected = false;
    throw new Error('فشل الاتصال بقاعدة البيانات - يرجى المحاولة لاحقاً');
  }
}

/**
 * Get collection with connection validation
 */
export async function getCollection(collectionName, dbName = 'dz-ecommerce') {
  const db = await getDb(dbName);
  return db.collection(collectionName);
}

/**
 * Health check for MongoDB connection
 */
export async function healthCheck() {
  try {
    const client = await clientPromise;
    const db = client.db('dz-ecommerce');
    const result = await db.command({ ping: 1 });
    return { 
      status: 'connected', 
      ping: result.ok === 1,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return { 
      status: 'disconnected', 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get connection status
 */
export function getConnectionStatus() {
  return isConnected;
}

/**
 * Create indexes for performance
 */
export async function ensureIndexes() {
  try {
    const db = await getDb();

    // Products indexes
    const products = db.collection('products');
    await products.createIndex({ merchantId: 1 });
    await products.createIndex({ merchantId: 1, status: 1 });
    await products.createIndex({ createdAt: -1 });
    await products.createIndex({ name: 'text', description: 'text' });

    // Orders indexes
    const orders = db.collection('orders');
    await orders.createIndex({ merchantId: 1 });
    await orders.createIndex({ merchantId: 1, status: 1 });
    await orders.createIndex({ merchantId: 1, createdAt: -1 });
    await orders.createIndex({ 'customer.phone': 1 });
    await orders.createIndex({ createdAt: -1 });
    await orders.createIndex({ orderNumber: 1 });

    // Merchants indexes
    const merchants = db.collection('merchants');
    await merchants.createIndex({ email: 1 }, { unique: true });
    await merchants.createIndex({ isActive: 1 });

    // Stores indexes
    const stores = db.collection('stores');
    await stores.createIndex({ subdomain: 1 }, { unique: true });
    await stores.createIndex({ merchantId: 1 });
    await stores.createIndex({ isActive: 1 });

    console.log('✅ تم إنشاء الفهارس بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في إنشاء الفهارس:', error);
    return false;
  }
}
