import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { connect, ConsumeMessage, Channel, ChannelModel } from 'amqplib';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  private connection: ChannelModel;
  private channel: Channel;
  private readonly logger = new Logger(RabbitMQService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const rabbitMQUrl = this.configService.get<string>('RABBITMQ_URL');
    if (!rabbitMQUrl) {
      throw new Error('RABBITMQ_URL is not defined in environment variables');
    }
    const rawConnection = await connect(rabbitMQUrl);
    this.connection = rawConnection;
    this.channel = await this.connection.createChannel();

    await this.channel.assertQueue('bid-processing-queue', { durable: true });
  }

  async registerConsumer(
    queue: string,
    handler: (msg: ConsumeMessage) => Promise<void>,
  ) {
    await this.channel.consume(
      queue,
      (msg) => {
        void (async () => {
          if (msg) {
            try {
              await handler(msg);
              this.channel.ack(msg);
            } catch (error) {
              this.logger.error(
                `Error processing message from ${queue}`,
                error,
              );
              this.channel.nack(msg, false, false); // Send to DLQ
            }
          }
        })();
      },
      { noAck: false },
    );
  }

  async publishToQueue(queue: string, message: any) {
    await this.channel.assertQueue(queue, { durable: true });
    this.channel.publish(
      'auction.exchange',
      queue,
      Buffer.from(JSON.stringify(message)),
    );
  }
}
