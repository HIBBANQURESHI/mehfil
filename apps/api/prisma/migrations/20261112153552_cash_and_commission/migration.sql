-- CreateEnum
CREATE TYPE "CashReceiptStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED', 'REJECTED');

-- AlterTable
ALTER TABLE "BookingMilestone" ADD COLUMN     "preferredMethod" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "commissionDueAt" TIMESTAMP(3),
ADD COLUMN     "commissionOverdueAt" TIMESTAMP(3),
ADD COLUMN     "commissionReminderAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CashReceipt" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "note" TEXT,
    "status" "CashReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "recordedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "autoConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "disputeReason" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "requestedById" TEXT NOT NULL,
    "succeededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashReceipt_paymentId_key" ON "CashReceipt"("paymentId");

-- CreateIndex
CREATE INDEX "CashReceipt_status_createdAt_idx" ON "CashReceipt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CashReceipt_bookingId_idx" ON "CashReceipt"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayment_code_key" ON "CommissionPayment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayment_providerRef_key" ON "CommissionPayment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayment_idempotencyKey_key" ON "CommissionPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CommissionPayment_vendorId_idx" ON "CommissionPayment"("vendorId");

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "BookingMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
