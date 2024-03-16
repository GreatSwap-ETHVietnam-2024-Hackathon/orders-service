import { Channel } from 'amqplib';
import { simulateOrdersConfig } from '.';

export interface SimulateBuyResponse {
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
    priceImpactList?: { [key: string]: string };
    gasList?: { [key: string]: string };
}

export interface SimulateSellResponse {
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
    priceImpactList?: { [key: string]: string };
    gasList?: { [key: string]: string };
}

export class SimulateOrderPublisher {
    channel: Channel;
    constructor(channel: Channel) {
        this.channel = channel;
    }

    async publishBuyResponse(msg: SimulateBuyResponse) {
        this.channel.publish(
            simulateOrdersConfig.RESPONSE_EXCHANGE,
            simulateOrdersConfig.BUY_ROUTING_KEY,
            Buffer.from(JSON.stringify(msg), 'utf-8'),
        );
    }

    async publishSellResponse(msg: SimulateSellResponse) {
        this.channel.publish(
            simulateOrdersConfig.RESPONSE_EXCHANGE,
            simulateOrdersConfig.SELL_ROUTING_KEY,
            Buffer.from(JSON.stringify(msg), 'utf-8'),
        );
    }
}
