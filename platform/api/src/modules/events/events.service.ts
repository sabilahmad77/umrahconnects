import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, Partitioners } from 'kafkajs';

// Kafka topic registry — all platform topics declared here
export const TOPICS = {
  PLUGIN_EVENTS: 'platform.plugin.events',
  AUDIT_LOG: 'platform.audit.log',
  NOTIFICATIONS: 'platform.notifications',
  VISA_SUBMISSIONS: 'platform.visa.submissions',
  PAYMENT_EVENTS: 'platform.payment.events',
  SOCIAL_FEED: 'platform.social.feed',
  GROUP_OPS: 'platform.group.ops',
} as const;

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Consumer[] = [];

  private readonly kafkaEnabled: boolean;

  constructor(private config: ConfigService) {
    this.kafkaEnabled = config.get<string>('KAFKA_ENABLED', 'true') === 'true';

    if (this.kafkaEnabled) {
      this.kafka = new Kafka({
        clientId: config.get<string>('KAFKA_CLIENT_ID', 'umrah-connects-api'),
        brokers: config.get<string>('KAFKA_BROKERS', 'localhost:9092').split(','),
        retry: { initialRetryTime: 300, retries: 2 },
      });
      this.producer = this.kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
      });
    }
  }

  async onModuleInit() {
    if (!this.kafkaEnabled) {
      this.logger.log('Kafka disabled (KAFKA_ENABLED=false) — skipping connection');
      return;
    }
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    } catch (err) {
      this.logger.warn(`Kafka producer connection failed (non-fatal in dev): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (!this.kafkaEnabled) return;
    await this.producer?.disconnect().catch(() => {});
    for (const consumer of this.consumers) {
      await consumer.disconnect().catch(() => {});
    }
  }

  async publish(topic: string, message: unknown, key?: string): Promise<void> {
    if (!this.kafkaEnabled || !this.producer) return;
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: key ?? null,
            value: JSON.stringify(message),
            timestamp: Date.now().toString(),
          },
        ],
      });
    } catch (err) {
      // In dev without Kafka, log but don't throw — prevents startup failure
      this.logger.warn(`Kafka publish failed (${topic}): ${(err as Error).message}`);
    }
  }

  async publishBatch(topic: string, messages: { key?: string; value: unknown }[]): Promise<void> {
    if (!this.kafkaEnabled || !this.producer) return;
    try {
      await this.producer.send({
        topic,
        messages: messages.map((m) => ({
          key: m.key ?? null,
          value: JSON.stringify(m.value),
          timestamp: Date.now().toString(),
        })),
      });
    } catch (err) {
      this.logger.warn(`Kafka batch publish failed (${topic}): ${(err as Error).message}`);
    }
  }

  createConsumer(groupId: string): Consumer | null {
    if (!this.kafkaEnabled || !this.kafka) return null;
    const consumer = this.kafka.consumer({ groupId });
    this.consumers.push(consumer);
    return consumer;
  }
}
