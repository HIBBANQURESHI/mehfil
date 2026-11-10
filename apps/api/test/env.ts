process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://mehfil:mehfil@localhost:54329/mehfil_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.SANDBOX_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.STORAGE_LOCAL_DIR = require('path').join(require('os').tmpdir(), 'mehfil-test-uploads');
process.env.JOBS_ENABLED = 'false';
