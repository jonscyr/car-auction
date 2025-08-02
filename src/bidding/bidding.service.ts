import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from 'src/common/rabbitmq/rabbitmq.service';

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async onModuleInit() {
    await this.rabbitMQService.registerConsumer(
      'bid-processing-queue',
      this.handleBidProcessing.bind(this),
    );
  }

  private handleBidProcessing(msg: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const content = JSON.parse(msg.content.toString());
    const { auctionId, userId, bidAmount } = content;

    // Broadcast to WebSocket clients
    // this.auctionGateway.broadcastBidUpdate(auctionId, bidAmount, userId);
  }
}
