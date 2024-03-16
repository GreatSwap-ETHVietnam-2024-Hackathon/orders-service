import { BigNumber, BigNumberish } from 'ethers';
import { getSessionKey } from '../keys-generator/session-keys';
import SessionKeyUserOpBuilder from '../user-operations/builder';
import { AddressZero, Provider } from '../../config/constants';
import ContractAddress, { SupportedRouters } from '../../config/contracts';
import {
    buildAlgebraExactInputSingleTx,
    buildApprovalTx,
    buildSellPaymentTx,
    buildUniV3ExactInputSingleTx,
    calculatePaymentAndAmountIn,
} from '../dexes/tx-builder';
import { AlgebraV19Pool__factory, ERC20__factory, Multicall__factory, UniV3Router__factory, UniswapV3Pool__factory } from '../../typechain-types';
import { Transaction } from '../../types/transaction';
import { UserOperation } from '../../types/user-operation';
import {
    executeOpsWithPubRelayer,
    executeOpsWithPrivRelayer,
    simulateOps,
} from '../relayers';
import { getMerkleProofs } from '../../controllers/approval';
import { formatEther, parseEther } from 'ethers/lib/utils';
import {
    calculatePriceImpact,
    calculateSqrtPriceLimitX96,
    calculateUniV3Threshold,
} from '../dexes/slippage';
import { getStateWallet, setStateWallet } from '../wallet-state';
import { updateTotalSellVolume } from '../total-volume';
import { calculateCamelotV3PoolAddress, calculateUniV3PoolAddress } from './calculate-pool-address';

const MulticallInterface = Multicall__factory.createInterface();
const ERC20Interface = ERC20__factory.createInterface();
const multicall = Multicall__factory.connect(
    ContractAddress.Multicall,
    Provider,
);
const UniswapV3PoolInterface = UniswapV3Pool__factory.createInterface();
const CamelotV3PoolInterface = AlgebraV19Pool__factory.createInterface();

export async function simulateSellToken(
    telegramId: number,
    smartAccountOwner: string,
    smartAccounts: string[],
    token: string,
    router: string,
    slippage: number,
    fee: BigNumberish,
    sqrtPriceX96: BigNumberish,
    spentAmount?: BigNumberish,
    percent?: BigNumberish,
) {
    const sessionKey = await getSessionKey(telegramId);
    const merkleProofs = await getMerkleProofs(
        telegramId,
        smartAccountOwner,
        smartAccounts,
        sessionKey.address,
        token,
        router,
    );

    if (token === AddressZero || token === ContractAddress.WETH) {
        throw new Error('Only accept non-native token');
    }

    const sqrtPriceLimitX96 = calculateSqrtPriceLimitX96(
        token,
        slippage,
        sqrtPriceX96 as string,
        true,
    );

    let calls: {
        target: string;
        allowFailure: boolean;
        callData: string;
    }[] = [];
    for (let i = 0; i < smartAccounts.length; i++) {
        const smartAccount = smartAccounts[i];

        const tokenBalanceCall = {
            target: token,
            allowFailure: false,
            callData: ERC20Interface.encodeFunctionData('balanceOf', [smartAccount]),
        };

        const tokenAllowanceCall = {
            target: token,
            allowFailure: false,
            callData: ERC20Interface.encodeFunctionData('allowance', [
                smartAccount,
                router,
            ]),
        };

        const ethBalanceCall = {
            target: ContractAddress.Multicall,
            allowFailure: false,
            callData: MulticallInterface.encodeFunctionData('getEthBalance', [
                smartAccount,
            ]),
        };

        const wethBalanceCall = {
            target: ContractAddress.WETH,
            allowFailure: false,
            callData: ERC20Interface.encodeFunctionData('balanceOf', [smartAccount]),
        };

        calls = [
            ...calls,
            tokenBalanceCall,
            tokenAllowanceCall,
            ethBalanceCall,
            wethBalanceCall,
        ];
    }

    const results = await multicall.callStatic.aggregate3(calls);

    const preETHBalanceList: { [key: string]: BigNumber } = {};

    const preWETHBalanceList: { [key: string]: BigNumber } = {};
    const receivedWethList: { [ket: string]: string } = {};
    const gasList: { [key: string]: string } = {};
    const priceImpactList: { [key: string]: string } = {};

    const preTokenBalanceList: { [key: string]: BigNumber } = {};

    const receivedTokenList: { [key: string]: string } = {};
    const sentTokenList: { [key: string]: string } = {};

    const ops: UserOperation[] = [];
    const opErrors: {
        [key: string]: string;
    } = {};
    const noOpErrors: string[] = [];

    for (let i = 0; i < smartAccounts.length; i++) {
        try {
            const txs: Transaction[] = [];
            const res = results.slice(4 * i, 4 * i + 4);
            const tokenBalance = BigNumber.from(
                ERC20Interface.decodeFunctionResult('balanceOf', res[0].returnData)[0],
            );
            if (tokenBalance.isZero()) {
                await setStateWallet(smartAccounts[i], false);
                throw new Error('Token balance is zero');
            }

            const tokenAllowance = BigNumber.from(
                ERC20Interface.decodeFunctionResult('allowance', res[1].returnData)[0],
            );

            const tokenSpend = spentAmount
                ? BigNumber.from(spentAmount)
                : tokenBalance.mul(Math.floor(Number(percent!) * 1e6)).div(1e8);
            const { amountIn, payment } = calculatePaymentAndAmountIn(tokenSpend);
            const amountOutMinimum = calculateUniV3Threshold(
                token,
                false,
                amountIn.toString(),
                sqrtPriceLimitX96,
            );

            if (amountIn.gt(tokenAllowance)) {
                // approve token
                const approveTx = buildApprovalTx(token, amountIn, router);
                txs.push(approveTx);
            }
            const deadline = Math.round((Date.now() + 1000000) / 1000);

            const swapTx =
                router === SupportedRouters.UniswapV3Router
                    ? buildUniV3ExactInputSingleTx(parseEther('0'), {
                        tokenIn: token,
                        tokenOut: ContractAddress.WETH,
                        fee,
                        recipient: smartAccounts[i],
                        deadline,
                        amountIn,
                        amountOutMinimum,
                        sqrtPriceLimitX96: sqrtPriceLimitX96,
                    })
                    : buildAlgebraExactInputSingleTx(parseEther('0'), {
                        tokenIn: token,
                        tokenOut: ContractAddress.WETH,
                        recipient: smartAccounts[i],
                        deadline,
                        amountIn,
                        amountOutMinimum,
                        limitSqrtPrice: sqrtPriceLimitX96,
                    });
            txs.push(swapTx);

            const paymentTx = buildSellPaymentTx(token, payment);
            txs.push(paymentTx);

            const opBuilder = new SessionKeyUserOpBuilder(
                smartAccounts[i],
                sessionKey,
            );
            const swapBuilder = opBuilder
                .withToken(token)
                .withMerkleProof(merkleProofs[i])
                .withRouter(router)
                .withSellTxs(txs);

            const swapOp = await swapBuilder.build();

            ops.push(swapOp);
            noOpErrors.push(smartAccounts[i]);
            preTokenBalanceList[smartAccounts[i]] = tokenBalance;

            const ethBalance = BigNumber.from(
                MulticallInterface.decodeFunctionResult(
                    'getEthBalance',
                    res[2].returnData,
                )[0],
            );
            const wethBalance = BigNumber.from(
                ERC20Interface.decodeFunctionResult('balanceOf', res[3].returnData)[0],
            );
            preETHBalanceList[smartAccounts[i]] = ethBalance.add(wethBalance);
            preWETHBalanceList[smartAccounts[i]] = wethBalance;
            preTokenBalanceList[smartAccounts[i]] = tokenBalance;
        } catch (err) {
            const err0 = (err as any).error?.error?.message;
            const err1 = (err as any).error?.message;
            const err2 = (err as Error).message;

            opErrors[smartAccounts[i]] = err0 ?? err1 ?? err2;
        }
    }

    try {
        if (ops.length > 0) {
            let txHash;

            let multicalls: {
                target: string;
                allowFailure: boolean;
                callData: string;
            }[] = [];
            noOpErrors.map((smartAccount) => {
                const postETHBalanceCall = {
                    target: ContractAddress.Multicall,
                    allowFailure: false,
                    callData: MulticallInterface.encodeFunctionData('getEthBalance', [
                        smartAccount,
                    ]),
                }

                const postWETHBalanceCall = {
                    target: ContractAddress.WETH,
                    allowFailure: false,
                    callData: ERC20Interface.encodeFunctionData('balanceOf', [
                        smartAccount,
                    ]),
                }

                const postTokenBalanceCall = {
                    target: token,
                    allowFailure: false,
                    callData: ERC20Interface.encodeFunctionData('balanceOf', [
                        smartAccount,
                    ]),
                }

                let getStatePoolCall;

                if (router === SupportedRouters.UniswapV3Router) {
                    getStatePoolCall = {
                        target: calculateUniV3PoolAddress(token, fee.toString()),
                        allowFailure: false,
                        callData: UniswapV3PoolInterface.encodeFunctionData('slot0'),
                    }
                }
                else {
                    getStatePoolCall = {
                        target: calculateCamelotV3PoolAddress(token),
                        allowFailure: true,
                        callData: CamelotV3PoolInterface.encodeFunctionData("globalState")
                    }
                }
                console.log(getStatePoolCall)
                const calls = [postETHBalanceCall, postWETHBalanceCall, postTokenBalanceCall, getStatePoolCall];

                const multicall = {
                    target: ContractAddress.Multicall,
                    allowFailure: false,
                    callData: MulticallInterface.encodeFunctionData('aggregate3', [calls])
                }

                multicalls.push(multicall);
            })


            const multicallResults = await simulateOps(ops, multicalls);

            noOpErrors.forEach((smartAccount, index) => {
                if (multicallResults[index]?.reason) {
                    throw new Error(multicallResults[index]?.reason);
                }
                const callResults = MulticallInterface.decodeFunctionResult('aggregate3', multicallResults[index]?.targetResult)[0];
                receivedWethList[smartAccount] = BigNumber.from(
                    ERC20Interface.decodeFunctionResult(
                        'balanceOf',
                        callResults[1]?.returnData,
                    )[0],
                )
                    .sub(preWETHBalanceList[smartAccount])
                    .toString();
                receivedTokenList[smartAccount] = BigNumber.from(
                    ERC20Interface.decodeFunctionResult(
                        'balanceOf',
                        callResults[1]?.returnData,
                    )[0],
                )
                    .add(
                        BigNumber.from(
                            MulticallInterface.decodeFunctionResult(
                                'getEthBalance',
                                callResults[0].returnData,
                            )[0],
                        ),
                    )
                    .sub(preETHBalanceList[smartAccount])
                    .toString();

                sentTokenList[smartAccount] = preTokenBalanceList[smartAccount]
                    .sub(BigNumber.from(
                        ERC20Interface.decodeFunctionResult(
                            'balanceOf',
                            callResults[2].returnData,
                        )[0],
                    ))
                    .toString();

                gasList[smartAccount] = BigNumber.from(receivedWethList[smartAccount])
                    .sub(receivedTokenList[smartAccount])
                    .toString()
                if (router === SupportedRouters.UniswapV3Router) {
                    const postSqrtPriceX96Value =
                        UniswapV3PoolInterface.decodeFunctionResult(
                            "slot0",
                            callResults[3].returnData
                        )[0].toString();
                    priceImpactList[smartAccount] = calculatePriceImpact(token, sqrtPriceX96 as string, postSqrtPriceX96Value)
                }
                else {
                    const postSqrtPriceX96Value =
                        CamelotV3PoolInterface.decodeFunctionResult(
                            "globalState",
                            callResults[3].returnData
                        )[0].toString()
                    priceImpactList[smartAccount] = calculatePriceImpact(token, sqrtPriceX96 as string, postSqrtPriceX96Value)
                }
            });

            return {
                telegramId: telegramId,
                token,
                opErrors,
                noOpErrors,
                sentTokenList,
                receivedTokenList,
                priceImpactList,
                gasList,
                txHash,
            };
        } else {
            return {
                telegramId: telegramId,
                token,
                opErrors,
            };
        }
    } catch (err) {
        return {
            telegramId: telegramId,
            token,
            opErrors,
            noOpErrors,
            txError: (err as any).error?.error?.message ?? (err as any).error?.message ?? (err as Error).message,
        };
    }
}
