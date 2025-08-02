import { Module } from '@nestjs/common';
import { BidService } from './bidding.service';
import { CommonModule } from 'src/common/common.module';
// import { AuctionModule } from 'src/auction/auction.module';

@Module({
  providers: [BidService],
  exports: [BidService],
  imports: [CommonModule],
})
export class BidModule {}
