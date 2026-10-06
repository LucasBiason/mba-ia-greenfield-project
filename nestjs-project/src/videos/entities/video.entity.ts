import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { VideoStatus } from '../enums/video-status.enum';
import { VideoVisibility } from '../enums/video-visibility.enum';

/**
 * Video entity.
 *
 * Invariants & Architectural Rules:
 *  - `id`: internal UUID primary key.
 *  - `public_id`: public identifier generated using high-entropy crypto-random nanoid (12 chars).
 *  - `status`: tracks upload and worker lifecycle (draft -> uploading -> processing -> ready | error).
 *  - `file_size`: stores video size up to 10GB (bigint column in Postgres).
 *  - `idempotency_key`: client token ensuring duplicate upload start requests do not create duplicate drafts.
 */
@Entity({ name: 'videos' })
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_videos_public_id', { unique: true })
  @Column({ name: 'public_id', type: 'varchar', length: 12 })
  public_id!: string;

  @Index('IDX_videos_channel_id')
  @Column({ name: 'channel_id', type: 'uuid' })
  channel_id!: string;

  @ManyToOne(() => Channel, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'channel_id' })
  channel!: Channel;

  @Column({ type: 'varchar', length: 150, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index('IDX_videos_status')
  @Column({
    type: 'varchar',
    length: 20,
    default: VideoStatus.DRAFT,
  })
  status!: VideoStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: VideoVisibility.PUBLIC,
  })
  visibility!: VideoVisibility;

  @Column({ name: 'file_size', type: 'bigint' })
  file_size!: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  original_filename!: string;

  @Column({ name: 'video_key', type: 'varchar', length: 255 })
  video_key!: string;

  @Column({
    name: 'thumbnail_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  thumbnail_key!: string | null;

  @Column({ name: 'duration_in_seconds', type: 'int', nullable: true })
  duration_in_seconds!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Index('UQ_videos_idempotency_key', {
    unique: true,
    where: '"idempotency_key" IS NOT NULL',
  })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  idempotency_key!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;
}
