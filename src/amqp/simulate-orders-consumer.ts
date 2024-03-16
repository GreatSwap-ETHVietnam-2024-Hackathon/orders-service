import { Channel } from 'amqplib';
import { Pool } from '../types/token-market-info';
import { simulateOrdersConfig } from '.';
import { simulateOrderRoute } from '../services/simulate-orders';

export interface SimulateBuyMessage {
    smartAccountsOwner: string;
    smartAccounts: string[];
    telegramId: number;
    token: string;
    ethAmount: string;
    slippage: number;
    pool: Pool;
    dateTime: number;
}

export interface SimulateSellMessage {
    smartAccounts: string[];
    smartAccountsOwner: string;
    telegramId: number;
    token: string;
    spentToken: string | undefined;
    percent: number | undefined;
    slippage: number;
    pool: Pool;
    dateTime: number;
}


export class SimulateOrderConsumer {
    channel: Channel;

    constructor(channel: Channel) {
        this.channel = channel;
        //simulate buy
        this.channel.consume(
            simulateOrdersConfig.BUY_REQUEST_QUEUE,
            (message: any) => {
                if (message) {
                    const data: SimulateBuyMessage = JSON.parse(message.content);
                    if (data == null) return;
                    simulateOrderRoute('simulate-buy', data);
                    this.channel.ack(message);
                }
            },
        );
        //simulate sell
        this.channel.consume(
            simulateOrdersConfig.SELL_REQUEST_QUEUE,
            (message: any) => {
                if (message) {
                    const data: SimulateSellMessage = JSON.parse(message.content);
                    if (data == null) return;
                    simulateOrderRoute('simulate-sell', data);
                    this.channel.ack(message);
                }
            },
        );
    }
}
