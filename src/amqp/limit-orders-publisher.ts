import { Channel } from 'amqplib';
import { BuyLimitOrder } from '../types/buy-limit';
import { SellLimitOrder } from '../types/sell-limit';
import { limitOrdersConfig } from '.';

export interface LimitOrderResponse {
  isBuyOrder: boolean;
  order: BuyLimitOrder | SellLimitOrder;
  error?: string;
  opErrors?: {
    [key: string]: string;
  };
  noOpErrors?: string[];
  txHash?: string;
  txError?: string;
  receivedTokenList?: { [key: string]: string };
  sentTokenList?: { [key: string]: string };
}

export class LimitOrderPublisher {
  channel: Channel;
  constructor(channel: Channel) {
    this.channel = channel;
  }

  async publishLimitOrderResponse(msg: LimitOrderResponse) {
    this.channel.publish(
      limitOrdersConfig.RESPONSE_EXCHANGE,
      limitOrdersConfig.ROUTING_KEY,
      Buffer.from(JSON.stringify(msg), 'utf-8'),
    );
  }
}
