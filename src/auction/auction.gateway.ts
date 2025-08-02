import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuctionService } from './auction.service';
import { RedisPubSubService } from 'src/common/redis/redis.pubsub.service';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from './guards/jwt.validation.guard';
import { AuctionIsActiveGuard } from './guards/isActive.guard';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { JoinAuctionDto } from './dtos/joinAuction.dto';
import { RedisRateLimiterGuard } from './guards/ratelimit.guard';
import { BidThrottleGuard } from './guards/bid.throttle.guard';
import { PlaceBidDto } from './dtos/placeBid.dto';

@WebSocketGateway(3001, {
  namespace: '/auction',
})
export class AuctionGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuctionGateway.name);
  constructor(
    private readonly auctionService: AuctionService,
    private readonly redisPubSubService: RedisPubSubService,
  ) {}

  async afterInit() {
    await this.redisPubSubService.subscribe('bid-updates', (message) => {
      if (!message) return;
      const { auctionId, bidAmount, userId } = message;
      this.server
        .to(`auction-${auctionId}`)
        .emit('bidUpdate', { auctionId, bidAmount, userId });
    });

    await this.redisPubSubService.subscribe('user-joins', (message) => {
      if (!message) return;
      const { auctionId, userId } = message;
      this.server.to(`auction-${auctionId}`).emit('userJoined', { userId });
    });

    await this.redisPubSubService.subscribe('auction-updates', (message) => {
      if (!message) return;
      const { auctionId, finalBid } = message;
      this.server.to(`auction-${auctionId}`).emit('auctionEnd', { finalBid });
    });
  }

  @SubscribeMessage('joinAuction')
  @UseGuards(WsJwtAuthGuard, AuctionIsActiveGuard, RedisRateLimiterGuard)
  async handleJoinAuction(
    @MessageBody() data: JoinAuctionDto,
    @ConnectedSocket() client: Socket,
  ) {
    // 1. validate auction
    const auction = await this.auctionService.getAuctionById(data.auctionId);
    if (!auction) {
      client.emit('error', { message: 'Auction not found' });
      return;
    }
    if (!this.auctionService.isAuctionActive(auction)) {
      client.emit('error', { message: 'Auction not active' });
      return;
    }
    // 2. add user client to auction room for future notifs
    await client.join(`auction-${data.auctionId}`);
    await this.auctionService.addClientToRoom(
      data.auctionId,
      client.id,
      data.userId,
    );

    // 3. respond ok
    client.emit('joinedAuction', { auctionId: data.auctionId });
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Remove client from Redis client-room map
    await this.auctionService.removeClientFromRoom(client.id);
  }

  @SubscribeMessage('placeBid')
  @UseGuards(
    WsJwtAuthGuard,
    AuctionIsActiveGuard,
    RedisRateLimiterGuard,
    BidThrottleGuard,
  )
  async handlePlaceBid(
    @MessageBody()
    data: PlaceBidDto,
    @ConnectedSocket() client: Socket,
  ) {
    // rabbitmq
    await this.auctionService.placeBid(
      data.auctionId,
      data.userId,
      data.bidAmount,
    );
    client.emit('bidPlaced', { status: 'success', bidAmount: data.bidAmount });
  }

  public broadcastBidUpdate(
    auctionId: string,
    bidAmount: number,
    userId: string,
  ) {
    this.server
      .to(`auction-${auctionId}`)
      .emit('bidUpdate', { auctionId, bidAmount, userId });
  }

  // 🟢 Broadcast Auction End to all clients in the room
  broadcastAuctionEnd(
    auctionId: string,
    finalBidAmount: number,
    winnerId: string,
  ) {
    this.server.to(`auction-${auctionId}`).emit('auctionEnded', {
      auctionId,
      finalBidAmount,
      winnerId,
    });
  }
}
