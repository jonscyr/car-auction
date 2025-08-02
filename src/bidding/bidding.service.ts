import { Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
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

    // Declare exchanges.
    // separate exchange for auditing so that we can do exchange to exchange binding
    await this.channel.assertExchange('auction.exchange', 'direct', {
      durable: true,
    });
    await this.channel.assertExchange('audit.fanout.exchange', 'fanout', {
      durable: true,
    });

    // Queues
    await this.channel.assertQueue('bid-processing-queue', { durable: true });
    await this.channel.assertQueue('notification-queue', { durable: true });
    await this.channel.assertQueue('audit-queue', { durable: true });

    // Bind Queues to auction.exchange (direct routing)
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

    // Bind audit-queue to audit.fanout.exchange
    await this.channel.bindQueue('audit-queue', 'audit.fanout.exchange', '');

    // Exchange-to-Exchange Binding: auction.exchange → audit.fanout.exchange
    await this.channel.bindExchange(
      'audit.fanout.exchange',
      'auction.exchange',
      '',
    );
  }

  // publishBidEvent(message: any) {
  //   const payload = Buffer.from(JSON.stringify(message));
  //   this.channel.publish('auction.exchange', 'bid', payload);
  // }

  // publishNotificationEvent(message: any) {
  //   const payload = Buffer.from(JSON.stringify(message));
  //   this.channel.publish('auction.exchange', 'notification', payload);
  // }

  // publishAuditEvent(message: any) {
  //   const payload = Buffer.from(JSON.stringify(message));
  //   this.channel.publish('auction.exchange', 'audit', payload);
  // }

  async getCurrentHighestBid(auctionId: string): Promise<number | null> {
    const bid = await this.redisCache.client.get(
      `auction:${auctionId}:highestBid`,
    );
    return bid ? parseFloat(bid) : null;
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
    if (!auction) throw new WsException('Auction not found');

    const currentHighestBid = await this.getCurrentHighestBid(auctionId);
    if (!currentHighestBid) {
      if (amount <= auction.startingBid) {
        throw new WsException(
          `Bid must be higher than auction's starting bid which is ${auction.startingBid}`,
        );
      }
      // else we're good for placing the bid
    } else if (amount <= currentHighestBid) {
      throw new WsException('Bid must be higher than current highest bid');
    }

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
    if (!msg) {
      return;
    }
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
  }
}
