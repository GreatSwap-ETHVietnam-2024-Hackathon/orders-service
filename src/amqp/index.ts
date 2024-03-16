import { Channel, connect } from 'amqplib';
import {
  ManualBuyResponse,
  ManualOrderPublisher,
  ManualPreApproveResponse,
  ManualSellResponse,
} from './manual-orders-publisher';
import { ManualOrderConsumer } from './manual-orders-consumer';
import { LimitOrderPublisher, LimitOrderResponse } from './limit-orders-publisher';
import { SimulateBuyMessage, SimulateOrderConsumer } from './simulate-orders-consumer';
import { SimulateBuyResponse, SimulateOrderPublisher, SimulateSellResponse } from './simulate-orders-publisher';

export const manualOrdersConfig = {
  REQUEST_EXCHANGE: 'manual-orders-request',
  RESPONSE_EXCHANGE: 'manual-ordets-response',
  BUY_REQUEST_QUEUE: 'manual-orders-request-buy',
  SELL_REQUEST_QUEUE: 'manual-orders-request-sell',
  PRE_APPPROVE_REQUEST_QUEUE: 'manual-order-request-pre-approve',
  BUY_RESPONSE_QUEUE: 'manual-orders-response-buy',
  SELL_RESPONSE_QUEUE: 'manual-orders-response-sell',
  PRE_APPROVE_RESPONSE_QUEUE: 'manual-orders-response-pre-approve',
  BUY_ROUTING_KEY: 'buy',
  SELL_ROUTING_KEY: 'sell',
  PRE_APPROVE_ROUTING_KEY: 'pre-approve',
};

export const simulateOrdersConfig = {
  REQUEST_EXCHANGE: 'simulate-orders-request',
  RESPONSE_EXCHANGE: 'simulate-orders-response',
  BUY_REQUEST_QUEUE: 'simulate-orders-request-buy',
  SELL_REQUEST_QUEUE: 'simulate-orders-request-sell',
  BUY_RESPONSE_QUEUE: 'simulate-orders-response-buy',
  SELL_RESPONSE_QUEUE: 'simulate-orders-response-sell',
  BUY_ROUTING_KEY: 'buy',
  SELL_ROUTING_KEY: 'sell',
}

export const limitOrdersConfig = {
  RESPONSE_EXCHANGE: 'limit-ordets-response',
  RESPONSE_QUEUE: 'limit-orders-response-queue',
  ROUTING_KEY: 'limit-orders-route',
};


class RMQManager {
  channel?: Channel;
  manualOrderPublisher?: ManualOrderPublisher;
  manualOrderConsumer?: ManualOrderConsumer;
  simulateOrderPublisher?: SimulateOrderPublisher;
  simulateOrderConsumer?: SimulateOrderConsumer;
  limitOrderPublisher?: LimitOrderPublisher;
  async init() {
    const channel = await this.getChannel()
    this.manualOrderConsumer = new ManualOrderConsumer(channel);
    this.manualOrderPublisher = new ManualOrderPublisher(channel);
    this.simulateOrderConsumer = new SimulateOrderConsumer(channel);
    this.simulateOrderPublisher = new SimulateOrderPublisher(channel);
    this.limitOrderPublisher = new LimitOrderPublisher(channel);
  }

  async getChannel() {
    if (!this.channel) {
      const connection = await connect({
        protocol: 'amqp',
        hostname: process.env.RABBITMQ_HOSTNAME,
        port: Number(process.env.RABBITMQ_PORT!),
        username: process.env.RABBITMQ_USERNAME,
        password: process.env.RABBITMQ_PASSWORD,
        vhost: '/',
      });

      this.channel = await connection.createChannel();

      // manual-orders
      await this.channel.assertExchange(
        manualOrdersConfig.RESPONSE_EXCHANGE,
        'direct',
      );

      await this.channel.assertQueue(manualOrdersConfig.BUY_REQUEST_QUEUE, {
        durable: true,
      });
      await this.channel.assertQueue(manualOrdersConfig.SELL_REQUEST_QUEUE, {
        durable: true,
      });
      await this.channel.assertQueue(
        manualOrdersConfig.PRE_APPPROVE_REQUEST_QUEUE,
        { durable: true },
      );

      await this.channel.assertQueue(manualOrdersConfig.BUY_RESPONSE_QUEUE, {
        durable: true,
      });
      await this.channel.assertQueue(manualOrdersConfig.SELL_RESPONSE_QUEUE, {
        durable: true,
      });
      await this.channel.assertQueue(
        manualOrdersConfig.PRE_APPPROVE_REQUEST_QUEUE,
        { durable: true },
      );

      await this.channel.bindQueue(
        manualOrdersConfig.BUY_RESPONSE_QUEUE,
        manualOrdersConfig.RESPONSE_EXCHANGE,
        manualOrdersConfig.BUY_ROUTING_KEY,
      );
      await this.channel.bindQueue(
        manualOrdersConfig.SELL_RESPONSE_QUEUE,
        manualOrdersConfig.RESPONSE_EXCHANGE,
        manualOrdersConfig.SELL_ROUTING_KEY,
      );
      await this.channel.bindQueue(
        manualOrdersConfig.PRE_APPROVE_RESPONSE_QUEUE,
        manualOrdersConfig.RESPONSE_EXCHANGE,
        manualOrdersConfig.PRE_APPROVE_ROUTING_KEY,
      );

      // simulate-orders
      await this.channel.assertExchange(
        simulateOrdersConfig.RESPONSE_EXCHANGE,
        'direct',
      );

      await this.channel.assertQueue(simulateOrdersConfig.BUY_REQUEST_QUEUE, {
        durable: true,
      });
      await this.channel.assertQueue(simulateOrdersConfig.SELL_REQUEST_QUEUE, {
        durable: true,
      });

      await this.channel.assertQueue(simulateOrdersConfig.BUY_RESPONSE_QUEUE, {
        durable: true,
      });
      await this.channel.assertQueue(simulateOrdersConfig.SELL_RESPONSE_QUEUE, {
        durable: true,
      });

      await this.channel.bindQueue(
        simulateOrdersConfig.BUY_RESPONSE_QUEUE,
        simulateOrdersConfig.RESPONSE_EXCHANGE,
        simulateOrdersConfig.BUY_ROUTING_KEY,
      );
      await this.channel.bindQueue(
        simulateOrdersConfig.SELL_RESPONSE_QUEUE,
        simulateOrdersConfig.RESPONSE_EXCHANGE,
        simulateOrdersConfig.SELL_ROUTING_KEY,
      );

      //limit-orders
      await this.channel.assertExchange(
        limitOrdersConfig.RESPONSE_EXCHANGE,
        'direct',
      );

      await this.channel.assertQueue(limitOrdersConfig.RESPONSE_QUEUE, {
        durable: true,
      });

      await this.channel.bindQueue(
        limitOrdersConfig.RESPONSE_QUEUE,
        limitOrdersConfig.RESPONSE_EXCHANGE,
        limitOrdersConfig.ROUTING_KEY,
      );
    }
    return this.channel;
  }

  async publishBuyResponse(result: ManualBuyResponse) {
    await this.manualOrderPublisher?.publishBuyResponse(result);
  }

  async publishSellResponse(result: ManualSellResponse) {
    await this.manualOrderPublisher?.publishSellResponse(result);
  }

  async publishPreApproveResponse(result: ManualPreApproveResponse) {
    await this.manualOrderPublisher?.publishPreApproveResponse(result);
  }

  async publishSimulateBuyResponse(result: SimulateBuyResponse) {
    await this.simulateOrderPublisher?.publishBuyResponse(result);
  }

  async publishSimulateSellResponse(result: SimulateSellResponse) {
    await this.simulateOrderPublisher?.publishSellResponse(result);
  }

  async publishLimitOrderResponse(result: LimitOrderResponse) {
    await this.limitOrderPublisher?.publishLimitOrderResponse(result);
  }
}

const rmqManager = new RMQManager();
export default rmqManager;
