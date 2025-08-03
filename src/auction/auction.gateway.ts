import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuctionService } from './auction.service';
import { RedisPubSubService } from 'src/common/redis/redis.pubsub.service';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from './guards/jwt.validation.guard';
import type { AuthenticatedSocket } from './guards/jwt.validation.guard';
import { AuctionIsActiveGuard } from './guards/isActive.guard';
import { JoinAuctionDto } from './dtos/joinAuction.dto';
import { RedisRateLimiterGuard } from './guards/ratelimit.guard';
import { BidThrottleGuard } from './guards/bid.throttle.guard';
import { PlaceBidDto } from './dtos/placeBid.dto';
import { BidService } from 'src/bidding/bidding.service';

@WebSocketGateway(3001, {
  namespace: '/auction',
})
export class AuctionGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuctionGateway.name);
  constructor(
    private readonly auctionService: AuctionService,
    private readonly bidService: BidService,
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
    await this.redisPubSubService.subscribe('user-leaves', (message) => {
      if (!message) return;
      const { auctionId, userId } = message;
      this.server.to(`auction-${auctionId}`).emit('userLeft', { userId });
    });

    await this.redisPubSubService.subscribe('auction-updates', (message) => {
      if (!message) return;
      const { auctionId, finalBid } = message;
      this.server.to(`auction-${auctionId}`).emit('auctionEnd', { finalBid });
    });
    await this.redisPubSubService.subscribe('bid-error', (message) => {
      void (async () => {
        try {
          if (!message) return;
          const { auctionId, userId, type, reason, amount } = message;

          const clientId =
            await this.auctionService.getClientIdForUserIdAndAuctionId(
              userId,
              auctionId,
            );
          if (!clientId) return;

          this.server.to(clientId).emit('bidError', {
            auctionId,
            type,
            reason,
            amount,
          });
        } catch (err) {
          this.logger.error(`Failed to handle bid-error message`, err);
        }
      })();
    });
  }

  @SubscribeMessage('joinAuction')
  @UseGuards(WsJwtAuthGuard, AuctionIsActiveGuard, RedisRateLimiterGuard)
  async handleJoinAuction(
    @MessageBody() data: JoinAuctionDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const user = client.data.user;
    // Validate if user is already in room using another client
    const isInRoom = await this.auctionService.isUserInRoom(
      data.auctionId,
      user.id,
    );
    if (isInRoom) {
      this.logger.warn('User is already in the auction room.');
      throw new WsException({
        status: 'error',
        message: 'User is already in the auction room',
      });
    }

    // 1. add user client to auction room for future notifs
    await client.join(`auction-${data.auctionId}`);
    await this.auctionService.addClientToRoom(
      data.auctionId,
      client.id,
      user.id,
    );
    this.logger.log(`Client join auction: ${client.id}, ${data.auctionId}`);
    // 2. respond ok
    client.emit('joinedAuction', JSON.stringify({ auctionId: data.auctionId }));
  }

  async handleDisconnect(client: Socket) {
    // Remove client from Redis client-room map
    await this.auctionService.removeClient(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
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
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const user = client.data.user;
    const isInRoom = await this.auctionService.isUserInRoom(
      data.auctionId,
      user.id,
    );
    if (!isInRoom) {
      // this.logger.warn('User is not in the auction room.');
      throw new WsException('User is not in the auction room');
    }
    // rabbitmq
    await this.bidService.placeBid(data.auctionId, user.id, data.bidAmount);
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
