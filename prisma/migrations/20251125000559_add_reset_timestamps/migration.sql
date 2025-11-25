-- CreateTable
CREATE TABLE "user_stats" (
    "ip" VARCHAR(45) NOT NULL,
    "total_bytes" BIGINT NOT NULL DEFAULT 0,
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "daily_bytes" BIGINT NOT NULL DEFAULT 0,
    "daily_requests" INTEGER NOT NULL DEFAULT 0,
    "daily_reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monthly_bytes" BIGINT NOT NULL DEFAULT 0,
    "monthly_requests" INTEGER NOT NULL DEFAULT 0,
    "monthly_reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_request_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("ip")
);

-- CreateTable
CREATE TABLE "RequestLog" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_keys" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "bandwidth" BIGINT NOT NULL,
    "rate_limit" INTEGER NOT NULL,
    "valid_days" INTEGER NOT NULL DEFAULT 30,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "used_by" VARCHAR(45),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "card_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recharges" (
    "id" SERIAL NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "bandwidth_added" BIGINT NOT NULL,
    "rate_added" INTEGER NOT NULL,
    "card_code" VARCHAR(32),
    "recharged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_balances" (
    "ip_address" VARCHAR(45) NOT NULL,
    "total_bandwidth" BIGINT NOT NULL DEFAULT 0,
    "used_bandwidth" BIGINT NOT NULL DEFAULT 0,
    "rate_limit" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_balances_pkey" PRIMARY KEY ("ip_address")
);

-- CreateTable
CREATE TABLE "user_packages" (
    "id" SERIAL NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "bandwidth" BIGINT NOT NULL,
    "bandwidth_used" BIGINT NOT NULL DEFAULT 0,
    "rate_limit" INTEGER NOT NULL,
    "valid_days" INTEGER NOT NULL,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "card_code" VARCHAR(32),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_keys_code_key" ON "card_keys"("code");

-- CreateIndex
CREATE INDEX "card_keys_code_idx" ON "card_keys"("code");

-- CreateIndex
CREATE INDEX "card_keys_used_idx" ON "card_keys"("used");

-- CreateIndex
CREATE INDEX "user_recharges_ip_address_idx" ON "user_recharges"("ip_address");

-- CreateIndex
CREATE INDEX "user_packages_ip_address_active_idx" ON "user_packages"("ip_address", "active");

-- CreateIndex
CREATE INDEX "user_packages_expires_at_idx" ON "user_packages"("expires_at");
