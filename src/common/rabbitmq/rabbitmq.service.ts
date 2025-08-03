import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { connect, ConsumeMessage, Channel, ChannelModel } from 'amqplib';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  public connection: ChannelModel;
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
}
