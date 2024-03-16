import { BigNumber } from 'ethers';
import TokenMarketModel from '../../models/token-market-info';
import TokenMarketInfo, { Pool } from '../../types/token-market-info';
import { buyToken } from '../manual-orders/buy';
import ContractAddress from '../../config/contracts';
import { BuyLimitOrder } from '../../types/buy-limit';
import { SellLimitOrder } from '../../types/sell-limit';
import BuyLimitOrderModel from '../../models/buy-limit-order';
import SellLimitOrderModel from '../../models/sell-limit-order';
import { sellToken } from '../manual-orders/sell';
import { LimitOrderResponse } from '../../amqp/limit-orders-publisher';
import rmqManager from '../../amqp';
import { rejects } from 'assert';
import { error } from 'console';
import e from 'cors';
import { getStateWallet } from '../wallet-state';

async function fetchTriggeredBuyOrders(
  token: string,
  priceUSDC: number,
  marketCap: number,
): Promise<BuyLimitOrder[]> {
  await BuyLimitOrderModel.deleteMany({
    expiryDate: {
      $lt: Date.now(),
    },
  });
  return await BuyLimitOrderModel.find({
    token,
    $or: [
      {
        triggeredByPrice: true,
        triggerValue: {
          $gte: priceUSDC,
        },
      },
      {
        triggeredByPrice: false,
        triggerValue: {
          $gte: marketCap,
        },
      },
    ],
  });
}
async function fetchTriggeredSellOrders(
  token: string,
  priceUSDC: number,
  marketCap: number,
): Promise<SellLimitOrder[]> {
  await SellLimitOrderModel.deleteMany({
    expiryDate: {
      $lt: Date.now(),
    },
  });

  const result = await SellLimitOrderModel.find({
    token,
    $or: [
      {
        isTakeProfit: true,
        triggeredByPrice: true,
        triggerValue: {
          $lte: priceUSDC,
        },
      },
      {
        isTakeProfit: true,
        triggeredByPrice: false,
        triggerValue: {
          $lte: marketCap,
        },
      },
      {
        isTakeProfit: false,
        triggeredByPrice: true,
        triggerValue: {
          $gte: priceUSDC,
        },
      },
      {
        isTakeProfit: false,
        triggeredByPrice: false,
        triggerValue: {
          $gte: marketCap,
        },
      },
    ],
  });

  return result;
}

async function handleBuyLimitOrder(
  order: BuyLimitOrder,
  pool: Pool,
): Promise<LimitOrderResponse> {
  const zeroToOne = ContractAddress.WETH < order.token;
  try {
    const callResult = await buyToken(
      order.telegramId,
      order.smartAccountsOwner,
      order.participatingWallets,
      order.token,
      BigNumber.from(order.ethSpend),
      order.router,
      order.slippage,
      (pool.fee !== undefined
        ? pool.fee
        : zeroToOne
          ? pool.feeZto
          : pool.feeOtz)!,
      pool.sqrtPriceX96,
      order.usePrivRelayer,
    );
    await BuyLimitOrderModel.deleteOne({ _id: order._id });
    return {
      isBuyOrder: true,
      order,
      opErrors: callResult.opErrors,
      noOpErrors: callResult.noOpErrors,
      txHash: callResult.txHash,
      txError: callResult.txError,
      receivedTokenList: callResult.receivedTokenList,
      sentTokenList: callResult.sentTokenList,
    };
  } catch (err) {
    // if ((err as Error).message == 'Account is busy') {
    //   return {
    //     isBuyOrder: true,
    //     order,
    //     error: (err as Error).message,
    //   };
    // }
    await BuyLimitOrderModel.deleteOne({ _id: order._id });
    return {
      isBuyOrder: true,
      order,
      error: (err as Error).message,
    };
  }
}
async function handleSellLimitOrder(
  order: SellLimitOrder,
  pool: Pool,
): Promise<LimitOrderResponse> {
  const zeroToOne = ContractAddress.WETH > order.token;

  try {
    const callResult = await sellToken(
      order.telegramId,
      order.smartAccountsOwner,
      order.participatingWallets,
      order.token,
      order.router,
      order.slippage,
      (pool.fee !== undefined
        ? pool.fee
        : zeroToOne
          ? pool.feeZto
          : pool.feeOtz)!,
      pool.sqrtPriceX96,
      order.tokenSpend,
      order.sellPercent,
      order.usePrivRelayer,
    );
    await SellLimitOrderModel.deleteOne({ _id: order._id });
    return {
      isBuyOrder: false,
      order,
      opErrors: callResult.opErrors,
      noOpErrors: callResult.noOpErrors,
      txHash: callResult.txHash,
      txError: callResult.txError,
      receivedTokenList: callResult.receivedTokenList,
      sentTokenList: callResult.sentTokenList,
    };
  } catch (err) {
    // if ((err as Error).message == 'Account is busy') {
    //   return {
    //     isBuyOrder: true,
    //     order,
    //     error: (err as Error).message,
    //   };
    // }
    await BuyLimitOrderModel.deleteOne({ _id: order._id });
    return {
      isBuyOrder: false,
      order,
      error: (err as Error).message,
    };
  }
}
let isRunning = false;
export function checkAndExecuteOrders() {
  setInterval(async () => {
    if (!isRunning) {
      isRunning = true;
      try {
        const marketInfo = (await TokenMarketModel.find()) as TokenMarketInfo[];
        let buyOrders: { order: BuyLimitOrder; pool: Pool }[] = [];
        let sellOrders: { order: SellLimitOrder; pool: Pool }[] = [];

        for (let i = 0; i < marketInfo.length; i++) {
          const { address, priceUSDC, marketCap, mostLiquidPool } =
            marketInfo[i];
          const triggeredBuyOrders = await fetchTriggeredBuyOrders(
            address,
            Number(priceUSDC),
            Number(marketCap),
          );
          buyOrders = [
            ...buyOrders,
            ...triggeredBuyOrders.map((order) => ({
              order,
              pool: mostLiquidPool,
            })),
          ];
          const triggeredSellOrders = await fetchTriggeredSellOrders(
            address,
            Number(priceUSDC),
            Number(marketCap),
          );
          sellOrders = [
            ...sellOrders,
            ...triggeredSellOrders.map((order) => ({
              order,
              pool: mostLiquidPool,
            })),
          ];
        }

        if (buyOrders.length + sellOrders.length > 0) {
          let runOrder = [...buyOrders, ...sellOrders];
          sortRunOrderByTelegramId(runOrder);
          let telegramIdNow = -1;
          let queue: any[] = [];
          let promises = [];
          for (let i = 0; i < runOrder.length; i++) {
            const order = runOrder[i];
            if (order.order.telegramId != telegramIdNow) {
              if (queue.length > 0) {
                let queue2 = queue;
                promises.push(queueHandlerLimitOrder(queue2));
              }
              queue = [order];
              telegramIdNow = order.order.telegramId;
            } else {
              queue.push(order);
            }
          }
          if (queue.length > 0) {
            promises.push(queueHandlerLimitOrder(queue));
          }
          const AllMessage = await Promise.all(promises);
          AllMessage.map(async (msgs) => {
            await Promise.all(
              msgs.map((msg) => rmqManager.publishLimitOrderResponse(msg)),
            );
          });
        }
      } catch (err) {
        console.log('error ', err);
      } finally {
        isRunning = false;
      }
    }
  }, 3000);
}

async function queueHandlerLimitOrder(actions: any) {
  const messagesToBot = [];
  try {
    let check = false;
    actions[0].order.participatingWallets.map(async (address: string) => {
      check = check || (await getStateWallet(address));
    });
    if (!check) {
      const result = await handleLimitOrder(actions[0]);
      //if (result.error == undefined || result.error != 'Account is busy')
      messagesToBot.push(result);
    }
    return messagesToBot;
  } catch (err) {
    throw err;
  }
}

async function handleLimitOrder(order: any) {
  if ('ethSpend' in order.order) {
    return await handleBuyLimitOrder(order.order, order.pool);
  } else return await handleSellLimitOrder(order.order, order.pool);
}

function sortRunOrderByTelegramId(runOrder: any[]) {
  return runOrder.sort((a, b) => {
    const telegramIdA = a.order.telegramId;
    const telegramIdB = b.order.telegramId;

    if (telegramIdA < telegramIdB) {
      return -1;
    }
    if (telegramIdA > telegramIdB) {
      return 1;
    }
    return 0;
  });
}
