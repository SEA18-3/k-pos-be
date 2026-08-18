ALTER TABLE "BackendOutbox"
ADD COLUMN "processing_started_at" TIMESTAMP(3);

CREATE INDEX "BackendOutbox_status_processing_started_at_idx"
ON "BackendOutbox"("status", "processing_started_at");
