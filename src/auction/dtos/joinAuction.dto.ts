import { IsString, IsNotEmpty } from 'class-validator';

export class JoinAuctionDto {
  @IsString()
  @IsNotEmpty()
  auctionId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}
