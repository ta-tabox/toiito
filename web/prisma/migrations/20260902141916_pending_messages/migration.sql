-- CreateTable
CREATE TABLE "pending_messages" (
    "session_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_messages_pkey" PRIMARY KEY ("session_id")
);

-- AddForeignKey
ALTER TABLE "pending_messages" ADD CONSTRAINT "pending_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
