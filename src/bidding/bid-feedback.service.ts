// src/notification/notification-consumer.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from 'src/common/rabbitmq/rabbitmq.service';
import { RedisPubSubService } from 'src/common/redis/redis.pubsub.service';
import { Channel, ConsumeMessage } from 'amqplib';

@Injectable()
export class BidFeedbackService implements OnModuleInit {
  private readonly logger = new Logger(BidFeedbackService.name);
  private channel: Channel;

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly redisPubSubService: RedisPubSubService,
  ) {}

  async onModuleInit() {
    this.channel = await this.rabbitMQService.connection.createChannel();

    await this.channel.assertQueue('notification-queue', { durable: true });

    await this.channel.consume(
      'notification-queue',
      this.handleNotification.bind(this),
      { noAck: false },
    );

    this.logger.log('Listening on notification-queue');
  }

  private async handleNotification(msg: ConsumeMessage) {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      this.logger.log(`Received Notification: ${JSON.stringify(content)}`);

      // Publish to Redis Pub/Sub channel
      await this.redisPubSubService.publish('bid-error', content);

      this.channel.ack(msg);
    } catch (error) {
      this.logger.error('Failed to process notification', error);
      this.channel.nack(msg, false, false); // Send to DLQ if configured
    }
  }
}
