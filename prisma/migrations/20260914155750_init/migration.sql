-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ModelTier" AS ENUM ('FAST', 'QUALITY', 'ULTRA');

-- CreateEnum
CREATE TYPE "GenerationMode" AS ENUM ('TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE', 'INPAINT', 'OUTPAINT', 'REMOVE_BACKGROUND', 'UPSCALE', 'STYLE_TRANSFER', 'REMOVE_OBJECT');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('SIGNUP_BONUS', 'DAILY_GRANT', 'ADMIN_GRANT', 'GENERATION_HOLD', 'GENERATION_SETTLE', 'GENERATION_REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('REFERENCE', 'STYLE_REF', 'SUBJECT_REF', 'CONTROL', 'MASK', 'UPLOAD');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StyleCategory" AS ENUM ('ANIME', 'REALISTIC', 'THREE_D', 'ILLUSTRATION', 'OIL_PAINTING', 'CYBERPUNK', 'CHINESE_WASH', 'WATERCOLOR', 'PIXEL_ART', 'PHOTOGRAPHY', 'CONCEPT_ART', 'LINE_ART', 'CLAYMATION', 'LOWPOLY', 'POSTER', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "locale" TEXT NOT NULL DEFAULT 'zh',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRegistry" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerModelId" TEXT NOT NULL,
    "displayNameI18n" JSONB NOT NULL,
    "descriptionI18n" JSONB,
    "badgeI18n" JSONB,
    "tier" "ModelTier" NOT NULL,
    "creditCost" INTEGER NOT NULL,
    "creditCostOverride" INTEGER,
    "capabilities" JSONB NOT NULL,
    "maxBatch" INTEGER NOT NULL DEFAULT 4,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylePreset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameI18n" JSONB NOT NULL,
    "descriptionI18n" JSONB,
    "category" "StyleCategory" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnailKey" TEXT NOT NULL,
    "previewKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promptSuffix" TEXT NOT NULL,
    "negativeSuffix" TEXT,
    "defaultParams" JSONB,
    "recommendedModelId" TEXT,
    "isCurated" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylePreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptPreset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleI18n" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coverKey" TEXT,
    "recommendedModelId" TEXT,
    "isCurated" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "mode" "GenerationMode" NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "enhancedPrompt" TEXT,
    "aspectRatio" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "batchCount" INTEGER NOT NULL,
    "seed" BIGINT,
    "guidance" DOUBLE PRECISION,
    "strength" DOUBLE PRECISION,
    "stylePresetId" TEXT,
    "referenceAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maskAssetId" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "parentImageId" TEXT,
    "parentGenerationId" TEXT,
    "providerKey" TEXT NOT NULL,
    "providerJobId" TEXT,
    "providerRaw" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "nextPollAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "costPerImage" INTEGER NOT NULL,
    "creditsHeld" INTEGER NOT NULL,
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "creditsRefunded" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationImage" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "status" "ImageStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "placeholder" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "seed" BIGINT,
    "revisedPrompt" TEXT,
    "nsfwFlagged" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sourceImageId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "grossCost" INTEGER NOT NULL DEFAULT 0,
    "generationId" TEXT,
    "modelId" TEXT,
    "adminId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "ledgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImageId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplorePost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleI18n" JSONB NOT NULL,
    "descriptionI18n" JSONB,
    "authorId" TEXT,
    "imageId" TEXT,
    "coverKey" TEXT NOT NULL,
    "galleryKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "modelId" TEXT,
    "stylePresetId" TEXT,
    "params" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "remixCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExplorePost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "ModelRegistry_enabled_isVisible_sortOrder_idx" ON "ModelRegistry"("enabled", "isVisible", "sortOrder");

-- CreateIndex
CREATE INDEX "ModelRegistry_tier_idx" ON "ModelRegistry"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "StylePreset_slug_key" ON "StylePreset"("slug");

-- CreateIndex
CREATE INDEX "StylePreset_enabled_isCurated_category_sortOrder_idx" ON "StylePreset"("enabled", "isCurated", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "StylePreset_ownerUserId_updatedAt_idx" ON "StylePreset"("ownerUserId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptPreset_slug_key" ON "PromptPreset"("slug");

-- CreateIndex
CREATE INDEX "PromptPreset_enabled_category_sortOrder_idx" ON "PromptPreset"("enabled", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "PromptPreset_ownerUserId_idx" ON "PromptPreset"("ownerUserId");

-- CreateIndex
CREATE INDEX "Generation_userId_createdAt_idx" ON "Generation"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Generation_status_createdAt_idx" ON "Generation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Generation_status_nextPollAt_idx" ON "Generation"("status", "nextPollAt");

-- CreateIndex
CREATE INDEX "Generation_status_lockedAt_idx" ON "Generation"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "Generation_modelId_createdAt_idx" ON "Generation"("modelId", "createdAt");

-- CreateIndex
CREATE INDEX "Generation_createdAt_idx" ON "Generation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Generation_userId_idempotencyKey_key" ON "Generation"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GenerationImage_userId_createdAt_idx" ON "GenerationImage"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GenerationImage_generationId_status_idx" ON "GenerationImage"("generationId", "status");

-- CreateIndex
CREATE INDEX "GenerationImage_userId_deletedAt_idx" ON "GenerationImage"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationImage_generationId_index_key" ON "GenerationImage"("generationId", "index");

-- CreateIndex
CREATE INDEX "Asset_userId_createdAt_idx" ON "Asset"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Asset_expiresAt_idx" ON "Asset"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_idempotencyKey_key" ON "CreditLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CreditLedger_kind_createdAt_idx" ON "CreditLedger"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_generationId_idx" ON "CreditLedger"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGrant_ledgerId_key" ON "DailyGrant"("ledgerId");

-- CreateIndex
CREATE INDEX "DailyGrant_day_idx" ON "DailyGrant"("day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGrant_userId_day_key" ON "DailyGrant"("userId", "day");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_imageId_key" ON "Favorite"("userId", "imageId");

-- CreateIndex
CREATE INDEX "Collection_userId_updatedAt_idx" ON "Collection"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CollectionItem_collectionId_sortOrder_idx" ON "CollectionItem"("collectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_imageId_key" ON "CollectionItem"("collectionId", "imageId");

-- CreateIndex
CREATE UNIQUE INDEX "ExplorePost_slug_key" ON "ExplorePost"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ExplorePost_imageId_key" ON "ExplorePost"("imageId");

-- CreateIndex
CREATE INDEX "ExplorePost_status_publishedAt_idx" ON "ExplorePost"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "ExplorePost_status_featured_sortOrder_idx" ON "ExplorePost"("status", "featured", "sortOrder");

-- CreateIndex
CREATE INDEX "ExplorePost_status_category_publishedAt_idx" ON "ExplorePost"("status", "category", "publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylePreset" ADD CONSTRAINT "StylePreset_recommendedModelId_fkey" FOREIGN KEY ("recommendedModelId") REFERENCES "ModelRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylePreset" ADD CONSTRAINT "StylePreset_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptPreset" ADD CONSTRAINT "PromptPreset_recommendedModelId_fkey" FOREIGN KEY ("recommendedModelId") REFERENCES "ModelRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptPreset" ADD CONSTRAINT "PromptPreset_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_stylePresetId_fkey" FOREIGN KEY ("stylePresetId") REFERENCES "StylePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationImage" ADD CONSTRAINT "GenerationImage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationImage" ADD CONSTRAINT "GenerationImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyGrant" ADD CONSTRAINT "DailyGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GenerationImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GenerationImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplorePost" ADD CONSTRAINT "ExplorePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplorePost" ADD CONSTRAINT "ExplorePost_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GenerationImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplorePost" ADD CONSTRAINT "ExplorePost_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplorePost" ADD CONSTRAINT "ExplorePost_stylePresetId_fkey" FOREIGN KEY ("stylePresetId") REFERENCES "StylePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
