import { Channel } from 'amqplib';
import { Pool } from '../types/token-market-info';
import { manualOrderRoute } from '../services/manual-orders';
import { manualOrdersConfig } from '.';

export interface BuyMessage {
  smartAccountsOwner: string;
  smartAccounts: string[];
  telegramId: number;
  token: string;
  ethAmount: string;
  slippage: number;
  pool: Pool;
  dateTime: number;
  usePrivRelayer?: boolean
}

export interface SellMessage {
  smartAccounts: string[];
  smartAccountsOwner: string;
  telegramId: number;
  token: string;
  spentToken: string | undefined;
  percent: number | undefined;
  slippage: number;
  pool: Pool;
  dateTime: number;
  usePrivRelayer?: boolean
}

export interface PreApproveMessage {
  smartAccountsOwner: string;
  smartAccounts: string[];
  telegramId: string;
  poolName: 'Pancake' | 'Lynex';
  token: string;
  allowance: string;
  usePrivRelayer?: boolean
}

export class ManualOrderConsumer {
  channel: Channel;

  constructor(channel: Channel) {
    this.channel = channel;
    //buy
    this.channel.consume(
      manualOrdersConfig.BUY_REQUEST_QUEUE,
      (message: any) => {
        if (message) {
          const data: BuyMessage = JSON.parse(message.content);
          if (data == null) return;
          manualOrderRoute('buy', data);
          this.channel.ack(message);
        }
      },
    );
    //sell
    this.channel.consume(
      manualOrdersConfig.SELL_REQUEST_QUEUE,
      (message: any) => {
        if (message) {
          const data: SellMessage = JSON.parse(message.content);
          if (data == null) return;
          manualOrderRoute('sell', data);
          this.channel.ack(message);
        }
      },
    );
    //pre-approve
    this.channel.consume(
      manualOrdersConfig.PRE_APPPROVE_REQUEST_QUEUE,
      (message: any) => {
        if (message) {
          const data: PreApproveMessage = JSON.parse(message.content);
          if (data == null) return;
          manualOrderRoute('pre-approve', data);
          this.channel.ack(message);
        }
      },
    );
  }
}
