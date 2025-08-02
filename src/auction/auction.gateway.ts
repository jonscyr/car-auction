import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuctionService } from './auction.service';

@WebSocketGateway(3001, {
  namespace: '/auction',
})
export class AuctionGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly auctionService: AuctionService) {}

  @SubscribeMessage('joinAuction')
  async handleJoinAuction(
    @MessageBody() data: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(`auction-${data.auctionId}`);
    client.emit('joinedAuction', { auctionId: data.auctionId });
  }

  @SubscribeMessage('placeBid')
  async handlePlaceBid(
    @MessageBody()
    data: { auctionId: string; userId: string; bidAmount: number },
    @ConnectedSocket() client: Socket,
  ) {
    await this.auctionService.placeBid(
      data.auctionId,
      data.userId,
      data.bidAmount,
    );
    client.emit('bidPlaced', { status: 'success', bidAmount: data.bidAmount });
  }

  broadcastBidUpdate(auctionId: string, bidAmount: number, userId: string) {
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
