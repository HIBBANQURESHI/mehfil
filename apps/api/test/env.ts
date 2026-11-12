process.env.NODE_ENV = 'test';
// TEST_PG_PORT lets a run move off 54329 if a crashed earlier run left the port held.
process.env.TEST_PG_PORT = process.env.TEST_PG_PORT || '54329';
process.env.DATABASE_URL = `postgresql://mehfil:mehfil@localhost:${process.env.TEST_PG_PORT}/mehfil_test`;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.SANDBOX_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.STORAGE_LOCAL_DIR = require('path').join(require('os').tmpdir(), 'mehfil-test-uploads');
process.env.JOBS_ENABLED = 'false';
// Real keys in .env must never reach outside services from the tests.
process.env.GEMINI_API_KEY = '';
process.env.SMS_PROVIDER = 'console';
process.env.RESEND_API_KEY = '';
process.env.SAFEPAY_API_KEY = 'sec_test-key';
process.env.SAFEPAY_SECRET_KEY = 'test-secret-key';
process.env.SAFEPAY_WEBHOOK_SECRET = 'test-webhook-shared-secret';
