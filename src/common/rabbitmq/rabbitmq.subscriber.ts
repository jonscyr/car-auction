import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { connect, ConsumeMessage, Channel, ChannelModel } from 'amqplib';
import { AuctionGateway } from '../../auction/auction.gateway';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RabbitMQSubscriber implements OnModuleInit {
  private connection: ChannelModel;
  private channel: Channel;
  private readonly logger = new Logger(RabbitMQSubscriber.name);

  constructor(
    private readonly auctionGateway: AuctionGateway,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const rabbitMQUrl = this.configService.get<string>('RABBITMQ_URL');
    if (!rabbitMQUrl) {
      throw new Error('RABBITMQ_URL is not defined in environment variables');
    }
    const rawConnection = await connect(rabbitMQUrl);
    this.connection = rawConnection;
    this.channel = await this.connection.createChannel();

    await this.channel.assertQueue('bid-processing-queue', { durable: true });

    await this.consumeQueue(
      'bid-processing-queue',
      this.handleBidProcessing.bind(this),
    );
  }

  private async consumeQueue(
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

  private handleBidProcessing(msg: ConsumeMessage) {
    const content = JSON.parse(msg.content.toString());
    const { auctionId, userId, bidAmount } = content;

    // Broadcast to WebSocket clients
    this.auctionGateway.broadcastBidUpdate(auctionId, bidAmount, userId);
  }
}
