import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration creating the `videos` table.
 * Supports video upload drafts, 10GB file size storage, public IDs, and processing status.
 */
export class CreateVideos1790280000000 implements MigrationInterface {
  name = 'CreateVideos1790280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "videos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "public_id" character varying(12) NOT NULL,
        "title" character varying(150),
        "description" text,
        "channel_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "visibility" character varying(20) NOT NULL DEFAULT 'PUBLIC',
        "file_size" bigint NOT NULL,
        "original_filename" character varying(255) NOT NULL,
        "video_key" character varying(255) NOT NULL,
        "thumbnail_key" character varying(255),
        "duration_in_seconds" integer,
        "metadata" jsonb,
        "idempotency_key" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_videos_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_videos_public_id" ON "videos" ("public_id")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_videos_idempotency_key" ON "videos" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_videos_channel_id" ON "videos" ("channel_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_videos_status" ON "videos" ("status")`,
    );

    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_channel_id" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_channel_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_videos_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_videos_channel_id"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_videos_idempotency_key"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_videos_public_id"`);
    await queryRunner.query(`DROP TABLE "videos"`);
  }
}
