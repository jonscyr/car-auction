import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Channel, ConsumeMessage } from 'amqplib';
import { RabbitMQService } from 'src/common/rabbitmq/rabbitmq.service';
import { EventEnvelope, QUEUING } from 'src/rabbitmq.events';

@Injectable()
export class AuditLogConsumerService implements OnModuleInit {
  private readonly logger = new Logger(AuditLogConsumerService.name);
  private channel: Channel;
  private buffer: any[] = [];

  private readonly BATCH_SIZE = 5000;
  private readonly FLUSH_INTERVAL = 5000; // ms
  private flushTimer: NodeJS.Timeout;

  private consuming = true; // For graceful shutdown coordination
  private prisma = new PrismaClient();

  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async onModuleInit() {
    this.channel = await this.rabbitMQService.connection.createChannel();
    await this.channel.prefetch(this.BATCH_SIZE);

    await this.channel.consume(
      QUEUING.QUEUES.AUDIT_LOG_Q,
      this.handleMessage.bind(this),
      { noAck: false },
    );

    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch((err) => {
        this.logger.error(err);
      });
    }, this.FLUSH_INTERVAL);

    this.logger.log('AuditLogConsumerService initialized and consuming.');
  }

  private async handleMessage(msg: ConsumeMessage) {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString()) as EventEnvelope<any>;

      this.buffer.push({
        eventType: content.eventType,
        payload: content.payload,
        timestamp: new Date(content.timestamp),
        receivedAt: new Date(),
      });

      // Manual Acknowledge after buffering (at-least-once delivery)
      this.channel.ack(msg);

      if (this.buffer.length >= this.BATCH_SIZE) {
        await this.flushBuffer();
      }
    } catch (error) {
      this.logger.error('Failed to process message, sending to DLQ', error);
      this.channel.nack(msg, false, false); // Dead-letter
    }
  }

  private async flushBuffer() {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];

    try {
      await this.prisma.auditLog.createMany({
        data: batch,
      });

      this.logger.log(`Flushed ${batch.length} audit logs to DB`);
    } catch (error) {
      this.logger.error('Batch DB Insert Failed. Re-buffering batch.', error);
      // Re-buffer for retry (simple fallback)
      this.buffer.unshift(...batch);
    }
  }
  async onModuleDestroy() {
    this.logger.log(
      'Graceful shutdown initiated. Flushing remaining audit logs...',
    );
    this.consuming = false;

    clearInterval(this.flushTimer);

    // Final flush before shutdown
    await this.flushBuffer();

    this.logger.log('AuditLogConsumerService shut down cleanly.');
  }
}
