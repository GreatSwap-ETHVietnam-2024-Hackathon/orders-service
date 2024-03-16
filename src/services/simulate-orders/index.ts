import { BigNumber } from 'ethers';
import { simulateBuyToken } from './buy';
import ContractAddress, { SupportedRouters } from '../../config/contracts';
import { Pool } from '../../types/token-market-info';
import { simulateSellToken } from './sell';
import { SimulateBuyMessage, SimulateSellMessage } from '../../amqp/simulate-orders-consumer';
import simulateOrdersRMQ from '../../amqp';
import { SimulateBuyResponse, SimulateSellResponse } from '../../amqp/simulate-orders-publisher';

function poolNameToRouter(poolName: string) {
    return poolName === 'Pancake'
        ? SupportedRouters.UniswapV3Router
        : SupportedRouters.CamelotV3Router;
}

export async function simulateOrderRoute(action: String, request: any) {
    if (action == 'simulate-buy') {
        await simulateBuy(request);
        return;
    }
    if (action == 'simulate-sell') {
        await simulateSell(request);
        return;
    }
}

async function simulateBuy(req: SimulateBuyMessage) {
    try {
        const {
            smartAccountsOwner,
            smartAccounts,
            telegramId: telegramIdParams,
            token,
            ethAmount,
            slippage,
            pool: poolParams,
        } = req;

        const telegramId = +telegramIdParams;
        const pool = poolParams as Pool;

        const router = poolNameToRouter(pool.name);

        const result = await simulateBuyToken(
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
            pool.sqrtPriceX96
        );
        simulateOrdersRMQ.publishSimulateBuyResponse(result);
    } catch (err) {
        simulateOrdersRMQ.publishSimulateBuyResponse(err as SimulateBuyResponse);
    }
}

async function simulateSell(req: SimulateSellMessage) {
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
        } = req;

        const telegramId = +telegramIdParams;
        const pool = poolParams as Pool;

        const router = poolNameToRouter(pool.name);

        const result = await simulateSellToken(
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
            percent
        );

        simulateOrdersRMQ.publishSimulateSellResponse(result);
    } catch (error) {
        simulateOrdersRMQ.publishSimulateSellResponse(error as SimulateSellResponse);
    }
}

