import { registerAs } from '@nestjs/config';

/**
 * Queue & Redis configuration namespace ("queue").
 *
 * Configures connection parameters for Redis message broker (BullMQ - ADR-0002 / TD-6.1 / ADR-0004).
 */
export interface QueueConfig {
  host: string;
  port: number;
  password?: string;
}

export default registerAs(
  'queue',
  (): QueueConfig => ({
    host: process.env.REDIS_HOST || 'queue',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  }),
);
