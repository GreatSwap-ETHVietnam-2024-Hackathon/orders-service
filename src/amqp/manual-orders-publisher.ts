import { Channel } from 'amqplib';
import { manualOrdersConfig } from '.';

export interface ManualBuyResponse {
  telegramId: number;
  token: string;
  error?: string;
  opErrors?: {
    [key: string]: string;
  };
  noOpErrors?: string[];
  txHash?: string;
  txError?: string;
  sentTokenList?: { [key: string]: string };
  receivedTokenList?: { [key: string]: string };
}

export interface ManualSellResponse {
  telegramId: number;
  token: string;
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

export interface ManualPreApproveResponse {
  telegramId: number;
  error?: string;
  opErrors?: {
    [key: string]: string;
  };
  noOpErrors?: string[];
  txHash?: string;
  txError?: string;
  receivedTokenList?: { [key: string]: string };
  approvePaymaster?: {
    smartAccountsOwner: string;
    smartAccounts: string[];
    router: string;
    token: string;
    allowance: string;
  };
}

export class ManualOrderPublisher {
  channel: Channel;
  constructor(channel: Channel) {
    this.channel = channel;
  }

  async publishBuyResponse(msg: ManualBuyResponse) {
    this.channel.publish(
      manualOrdersConfig.RESPONSE_EXCHANGE,
      manualOrdersConfig.BUY_ROUTING_KEY,
      Buffer.from(JSON.stringify(msg), 'utf-8'),
    );
  }

  async publishSellResponse(msg: ManualSellResponse) {
    this.channel.publish(
      manualOrdersConfig.RESPONSE_EXCHANGE,
      manualOrdersConfig.SELL_ROUTING_KEY,
      Buffer.from(JSON.stringify(msg), 'utf-8'),
    );
  }

  async publishPreApproveResponse(msg: ManualPreApproveResponse) {
    this.channel.publish(
      manualOrdersConfig.RESPONSE_EXCHANGE,
      manualOrdersConfig.PRE_APPROVE_ROUTING_KEY,
      Buffer.from(JSON.stringify(msg), 'utf-8'),
    );
  }
}
