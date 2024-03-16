import { BigNumber } from 'ethers';
import { buyToken } from './buy';
import { sellToken } from './sell';
import { preApprove } from './pre-approve';
import ContractAddress, { SupportedRouters } from '../../config/contracts';
import { Pool } from '../../types/token-market-info';
import {
  BuyMessage,
  PreApproveMessage,
  SellMessage,
} from '../../amqp/manual-orders-consumer';

import manualOrdersRMQ from '../../amqp';
import {
  ManualBuyResponse,
  ManualPreApproveResponse,
  ManualSellResponse,
} from '../../amqp/manual-orders-publisher';

// function poolNameToRouter(poolName: string) {
//   if (poolName === 'Paymaster') return SupportedRouters.PaymasterAddress;
//   return poolName === 'Pancake'
//     ? SupportedRouters.UniswapV3Router
//     : SupportedRouters.CamelotV3Router;
// }
function poolNameToRouter(poolName: string) {
  if (poolName === 'Paymaster') return SupportedRouters.PaymasterAddress;
  return poolName === 'Pancake'
    ? SupportedRouters.UniswapV3Router
    : SupportedRouters.CamelotV3Router;
}
export async function manualOrderRoute(action: String, request: any) {
  if (action == 'buy') {
    await buy(request);
    return;
  }
  if (action == 'sell') {
    await sell(request);
    return;
  }
  if (action == 'pre-approve') {
    await preApproveAction(request);
  }
}

async function buy(req: BuyMessage) {
  try {
    const {
      smartAccountsOwner,
      smartAccounts,
      telegramId: telegramIdParams,
      token,
      ethAmount,
      slippage,
      pool: poolParams,
      usePrivRelayer,
    } = req;

    const telegramId = +telegramIdParams;
    const pool = poolParams as Pool;

    const router = poolNameToRouter(pool.name);

    const result = await buyToken(
      telegramId,
      smartAccountsOwner,
      smartAccounts,
      token,
      BigNumber.from(ethAmount),
      router,
      slippage,
      (pool.fee
        ? pool.fee
        : token < ContractAddress.WETH
          ? pool.feeOtz
          : pool.feeZto)!,
      pool.sqrtPriceX96,
      usePrivRelayer,
    );
    manualOrdersRMQ.publishBuyResponse(result);
  } catch (err) {
    manualOrdersRMQ.publishBuyResponse(err as ManualBuyResponse);
  }
}

async function sell(req: SellMessage) {
  try {
    const {
      smartAccountsOwner,
      smartAccounts,
      telegramId: telegramIdParams,
      token,
      spentToken,
      percent,
      slippage,
      pool: poolParams,
      usePrivRelayer,
    } = req;

    const telegramId = +telegramIdParams;
    const pool = poolParams as Pool;

    const router = poolNameToRouter(pool.name);

    const result = await sellToken(
      telegramId,
      smartAccountsOwner,
      smartAccounts,
      token,
      router,
      slippage,
      (pool.fee
        ? pool.fee
        : token < ContractAddress.WETH
          ? pool.feeZto
          : pool.feeOtz)!,
      pool.sqrtPriceX96,
      spentToken,
      percent,
      usePrivRelayer,
    );

    manualOrdersRMQ.publishSellResponse(result);
  } catch (error) {
    manualOrdersRMQ.publishSellResponse(error as ManualSellResponse);
  }
}

async function preApproveAction(req: PreApproveMessage) {
  try {
    const {
      smartAccountsOwner,
      smartAccounts,
      telegramId: telegramIdParams,
      token,
      poolName,
      allowance,
      usePrivRelayer,
    } = req;

    const telegramId = +telegramIdParams;

    const router = poolNameToRouter(poolName);
    const result = await preApprove(
      telegramId,
      smartAccountsOwner,
      smartAccounts,
      router,
      token,
      allowance,
      usePrivRelayer,
    );
    //@ts-ignore
    manualOrdersRMQ.publishPreApproveResponse(result);
  } catch (err) {
    console.log('error = ', err);
    manualOrdersRMQ.publishPreApproveResponse(err as ManualPreApproveResponse);
  }
}
