import { Module } from '@nestjs/common';
import { BidService } from './bidding.service';
import { CommonModule } from 'src/common/common.module';
import { AuctionService } from 'src/auction/auction.service';
import { BidFeedbackService } from './bid-feedback.service';

@Module({
  providers: [BidService, AuctionService, BidFeedbackService],
  exports: [BidService],
  imports: [CommonModule],
})
export class BidModule {}
