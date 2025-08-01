import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { BidService } from '../bidding/bidding.service';

@WebSocketGateway({ namespace: '/auction', cors: true })
export class AuctionGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly bidService: BidService) {}

  @SubscribeMessage('joinAuction')
  handleJoinAuction(
    @MessageBody() data: { auctionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`auction-${data.auctionId}`);
    client.emit('joinedAuction', { auctionId: data.auctionId });
  }

  @SubscribeMessage('placeBid')
  async handlePlaceBid(
    @MessageBody()
    data: { auctionId: string; userId: string; bidAmount: number },
    @ConnectedSocket() client: Socket,
  ) {
    await this.bidService.placeBid(data.auctionId, data.userId, data.bidAmount);
    client.emit('bidPlaced', { status: 'success', bidAmount: data.bidAmount });
  }

  broadcastBidUpdate(auctionId: string, bidAmount: number, userId: string) {
    this.server
      .to(`auction-${auctionId}`)
      .emit('bidUpdate', { auctionId, bidAmount, userId });
  }
}
