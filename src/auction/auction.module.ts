import { Module } from '@nestjs/common';
import { AuctionGateway } from './auction.gateway';
import { AuctionService } from './auction.service';
import { CommonModule } from 'src/common/common.module';
import { UserService } from 'src/user/user/user.service';

@Module({
  imports: [CommonModule],
  providers: [AuctionGateway, AuctionService, UserService],
  exports: [AuctionGateway],
})
export class AuctionModule {}
