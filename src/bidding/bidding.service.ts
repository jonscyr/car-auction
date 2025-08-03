import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { PrismaClient } from '@prisma/client';
import { Channel, ConsumeMessage } from 'amqplib';
import { AuctionService } from 'src/auction/auction.service';
import { RabbitMQService } from 'src/common/rabbitmq/rabbitmq.service';
import { RedisPubSubService } from 'src/common/redis/redis.pubsub.service';
import { RedisService } from 'src/common/redis/redis.service';
import { setupQueuesAndExchanges } from './queueing.setup';
import { ConfigService } from '@nestjs/config';
import { PUBSUB_EVENTS } from 'src/pubsub.events';
import { PlaceBidErrorEvent, PlaceBidEvent } from 'src/rabbitmq.events';
import { QUEUING } from 'src/rabbitmq.events';

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
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.channel = await this.rabbitMQService.connection.createChannel();
    const numberOfBidQueues = this.configService.get<number>('N_CONSUMERS');
    await setupQueuesAndExchanges(this.channel, numberOfBidQueues || 3);
    const consumerQueueId = this.configService.get<number | null>(
      'CONSUMER_QUEUE_ID',
    );
    if (typeof consumerQueueId === 'number' && !isNaN(consumerQueueId)) {
      await this.rabbitMQService.registerConsumer(
        QUEUING.QUEUES.BID_PROCESSING_PREFIX + consumerQueueId,
        this.handleBidProcessing.bind(this),
      );
    }
  }

  async getCurrentHighestBid(auctionId: string): Promise<number | null> {
    const cacheKey = `auction:${auctionId}:highestBid`;

    const cachedBid = await this.redisCache.client.get(cacheKey);
    if (cachedBid) {
      return parseFloat(cachedBid);
    }

    // Cache miss -> from db
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { currentHighestBid: true },
    });

    if (auction && auction.currentHighestBid !== null) {
      // Populate Cache
      await this.redisCache.client.set(
        cacheKey,
        auction.currentHighestBid.toString(),
        {
          EX: 60, // Optional TTL
        },
      );
      return auction.currentHighestBid;
    }

    // No bid found
    return null;
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
        eventType: 'PLACE_BID',
        payload: {
          auctionId,
          userId,
          bidAmount: amount,
        },
        timestamp: Date.now(),
      } as PlaceBidEvent),
    );
    this.channel.publish(QUEUING.EXCHANGES.BID_X, auctionId, payload, {
      persistent: true, // Ensure message survives broker restarts
    });
  }

  private async handleBidProcessing(msg: ConsumeMessage) {
    if (!msg) return;
    const parsedMsg = JSON.parse(msg.content.toString()) as PlaceBidEvent; // TODO: use typeguards;
    const { auctionId, userId, bidAmount } = parsedMsg.payload;
    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Fetch the current auction row
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          select: {
            id: true,
            currentHighestBid: true,
            status: true,
          },
        });

        if (!auction) {
          throw new Error('Auction not found');
        }

        if (auction.status !== 'ONGOING') {
          throw new ConflictException('Auction is not active');
        }

        /**
         * We can use cache also here since cache is in sync.
         * But since we want to do optimistic concurrency control, we might want to check
         * with db again, we can also use versioning on auditLog
         */
        if (
          auction.currentHighestBid &&
          bidAmount <= auction.currentHighestBid
        ) {
          throw new ConflictException(
            'Bid amount must be higher than current highest bid',
          );
        }

        // 2. Update auction's highest bid and winner
        await tx.auction.update({
          where: {
            id: auctionId,
          },
          data: {
            currentHighestBid: bidAmount,
            winnerId: userId, // TODO: winnerId to be set at auction END.
          },
        });

        // 3. Insert the bid into Bids table
        const bid = await tx.bid.create({
          data: {
            auctionId,
            userId,
            amount: bidAmount,
            timestamp: new Date(),
          },
        });

        return bid;
      });

      // Update Redis cache
      await this.updateHighestBid(auctionId, bidAmount, userId);

      // Notify all WebSocket clients
      await this.redisPubSubService.publish(PUBSUB_EVENTS.BID_UPDATES, {
        auctionId,
        bidAmount,
        userId,
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`Bid processing failed: ${error.message}`, error.stack);

      // Conflict/Error Notification
      // we could also directly publish to redis pubsub for immediate feedback
      this.channel.publish(
        QUEUING.EXCHANGES.NOTIF_X,
        '',
        Buffer.from(
          JSON.stringify({
            timestamp: Date.now(),
            eventType: 'PLACE_BID_ERROR',
            payload: {
              auctionId,
              amount: bidAmount,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              reason: error.message,
              userId,
              type:
                error instanceof ConflictException
                  ? 'BID_CONFLICT'
                  : 'BID_ERROR',
            },
          } as PlaceBidErrorEvent),
        ),
      );
    }
  }
}
