-- CreateTable
CREATE TABLE "FailedNotification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailedNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FailedNotification_attempt_count_idx" ON "FailedNotification"("attempt_count");
