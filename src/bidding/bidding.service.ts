import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Channel, ConsumeMessage } from 'amqplib';
import { AuctionService } from 'src/auction/auction.service';
import { RabbitMQService } from 'src/common/rabbitmq/rabbitmq.service';
import { RedisPubSubService } from 'src/common/redis/redis.pubsub.service';
import { RedisService } from 'src/common/redis/redis.service';

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);
  private channel: Channel;
  private prisma = new PrismaClient();

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly redisCache: RedisService,
    private readonly redisPubSubService: RedisPubSubService,
    private readonly auctionService: AuctionService,
  ) {}

  async onModuleInit() {
    this.channel = await this.rabbitMQService.connection.createChannel();
    await this.rabbitMQService.registerConsumer(
      'bid-processing-queue',
      this.handleBidProcessing.bind(this),
    );

    await this.channel.assertExchange('auction.exchange', 'direct', {
      durable: true,
    });
    await this.channel.assertQueue('bid-processing-queue', { durable: true });
    await this.channel.assertQueue('notification-queue', { durable: true });
    await this.channel.assertQueue('audit-queue', { durable: true });
    await this.channel.assertQueue('dead-letter-queue', { durable: true });

    await this.channel.bindQueue(
      'bid-processing-queue',
      'auction.exchange',
      'bid',
    );
    await this.channel.bindQueue(
      'notification-queue',
      'auction.exchange',
      'notification',
    );
    await this.channel.bindQueue('audit-queue', 'auction.exchange', 'audit');
    await this.channel.bindQueue(
      'dead-letter-queue',
      'auction.exchange',
      'dlq',
    );
  }

  publishBidEvent(message: any) {
    const payload = Buffer.from(JSON.stringify(message));
    this.channel.publish('auction.exchange', 'bid', payload);
  }

  publishNotificationEvent(message: any) {
    const payload = Buffer.from(JSON.stringify(message));
    this.channel.publish('auction.exchange', 'notification', payload);
  }

  publishAuditEvent(message: any) {
    const payload = Buffer.from(JSON.stringify(message));
    this.channel.publish('auction.exchange', 'audit', payload);
  }

  async getCurrentHighestBid(auctionId: string): Promise<number> {
    const bid = await this.redisCache.client.get(
      `auction:${auctionId}:highestBid`,
    );
    return bid ? parseFloat(bid) : 0;
  }

  async updateHighestBid(auctionId: string, bidAmount: number, userId: string) {
    await this.redisCache.client.set(
      `auction:${auctionId}:highestBid`,
      bidAmount.toString(),
    );
    await this.redisCache.client.set(
      `auction:${auctionId}:highestBidder`,
      userId,
    );
  }

  async placeBid(auctionId: string, userId: string, amount: number) {
    const auction = await this.auctionService.getAuctionById(auctionId);
    if (!auction) throw new Error('Auction not found');

    const currentHighestBid = await this.getCurrentHighestBid(auctionId);
    if (amount <= currentHighestBid) {
      throw new Error('Bid must be higher than current highest bid');
    }

    // await this.auctionService.updateAuctionBid(auctionId, amount, userId);

    // await this.rabbitMQService.publishAuditEvent({
    //   auctionId,
    //   userId,
    //   amount,
    //   timestamp: Date.now(),
    // });

    // Push the bid event to RabbitMQ for persistence and audit trail
    const payload = Buffer.from(
      JSON.stringify({
        auctionId,
        userId,
        amount,
        timestamp: Date.now(),
      }),
    );
    this.channel.publish('auction.exchange', 'bid', payload, {
      persistent: true, // Ensure message survives broker restarts
    });
  }

  private async handleBidProcessing(msg: ConsumeMessage) {
    const { auctionId, userId, amount } = JSON.parse(msg.content.toString());

    // Save the bid in the Bids table
    await this.prisma.bid.create({
      data: {
        auctionId,
        userId,
        amount,
        timestamp: new Date(),
      },
    });

    // Update Redis cache
    await this.updateHighestBid(auctionId, amount, userId);

    // Notify all WebSocket clients
    await this.redisPubSubService.publish('bid-updates', {
      auctionId,
      bidAmount: amount,
      userId,
    });

    this.channel.ack(msg);
  }
}
