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
 * Conforms to F07 (Upload & Draft), F08 (Processing), F09 (Short URL), F10 (Streaming).
 *
 * Invariants & Architectural Rules:
 *  - `id`: internal UUID primary key. Never exposed directly on public endpoints (anti-IDOR).
 *  - `publicId`: public identifier generated using high-entropy crypto-random nanoid (10-12 chars)
 *    per ADR-0003 / REQ-SEC-06.
 *  - `status`: tracks upload and worker lifecycle (draft -> uploading -> processing -> ready | error).
 *  - `fileSize`: stores video size up to 10GB (bigint column in Postgres).
 *  - `idempotencyKey`: client token ensuring duplicate upload start requests do not create duplicate drafts.
 */
@Entity({ name: 'videos' })
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_videos_public_id', { unique: true })
  @Column({ name: 'public_id', type: 'varchar', length: 12, unique: true })
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

  @Index('UQ_videos_idempotency_key', { unique: true })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
  })
  idempotency_key!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;

  // CamelCase accessors
  get publicId(): string {
    return this.public_id;
  }
  set publicId(value: string) {
    this.public_id = value;
  }

  get channelId(): string {
    return this.channel_id;
  }
  set channelId(value: string) {
    this.channel_id = value;
  }

  get fileSize(): string {
    return this.file_size;
  }
  set fileSize(value: string) {
    this.file_size = value;
  }

  get originalFilename(): string {
    return this.original_filename;
  }
  set originalFilename(value: string) {
    this.original_filename = value;
  }

  get originalFileName(): string {
    return this.original_filename;
  }
  set originalFileName(value: string) {
    this.original_filename = value;
  }

  get videoKey(): string {
    return this.video_key;
  }
  set videoKey(value: string) {
    this.video_key = value;
  }

  get storageKey(): string {
    return this.video_key;
  }
  set storageKey(value: string) {
    this.video_key = value;
  }

  get thumbnailKey(): string | null {
    return this.thumbnail_key;
  }
  set thumbnailKey(value: string | null) {
    this.thumbnail_key = value;
  }

  get durationInSeconds(): number | null {
    return this.duration_in_seconds;
  }
  set durationInSeconds(value: number | null) {
    this.duration_in_seconds = value;
  }

  get duration(): number | null {
    return this.duration_in_seconds;
  }
  set duration(value: number | null) {
    this.duration_in_seconds = value;
  }

  get idempotencyKey(): string | null {
    return this.idempotency_key;
  }
  set idempotencyKey(value: string | null) {
    this.idempotency_key = value;
  }

  get createdAt(): Date {
    return this.created_at;
  }
  set createdAt(value: Date) {
    this.created_at = value;
  }

  get updatedAt(): Date {
    return this.updated_at;
  }
  set updatedAt(value: Date) {
    this.updated_at = value;
  }
}
