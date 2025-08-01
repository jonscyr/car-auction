import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQProducer } from '../common/rabbitmq/rabbitmq.producer';

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor(private readonly rabbitMQProducer: RabbitMQProducer) {}

  async placeBid(auctionId: string, userId: string, bidAmount: number) {
    this.logger.log(
      `Placing bid for auction ${auctionId} by user ${userId}: $${bidAmount}`,
    );

    await this.rabbitMQProducer.publishToQueue('bid-processing-queue', {
      auctionId,
      userId,
      bidAmount,
      timestamp: new Date(),
    });
  }
}
