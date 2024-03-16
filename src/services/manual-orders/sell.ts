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
import { ERC20__factory, Multicall__factory } from '../../typechain-types';
import { Transaction } from '../../types/transaction';
import { UserOperation } from '../../types/user-operation';
import {
  executeOpsWithPubRelayer,
  executeOpsWithPrivRelayer,
} from '../relayers';
import { getMerkleProofs } from '../../controllers/approval';
import { formatEther, parseEther } from 'ethers/lib/utils';
import {
  calculateSqrtPriceLimitX96,
  calculateUniV3Threshold,
} from '../dexes/slippage';
import { getStateWallet, setStateWallet } from '../wallet-state';
import { updateTotalSellVolume } from '../total-volume';
import { getPaymasterData } from '../paymaster';
import { getTokenPaymaster } from '../token-paymaster-user';

const MulticallInterface = Multicall__factory.createInterface();
const ERC20Interface = ERC20__factory.createInterface();
const multicall = Multicall__factory.connect(
  ContractAddress.Multicall,
  Provider,
);

export async function sellToken(
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
  usePrivRelayer: boolean = false,
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

  const preTokenBalanceList: { [key: string]: BigNumber } = {};

  const receivedTokenList: { [key: string]: string } = {};
  const sentTokenList: { [key: string]: string } = {};

  const ops: UserOperation[] = [];
  const opErrors: {
    [key: string]: string;
  } = {};
  const noOpErrors: string[] = [];
  const smartAccountsActive: string[] = [];
  for (let i = 0; i < smartAccounts.length; i++) {
    try {
      if (await getStateWallet(smartAccounts[i])) {
        throw new Error('Account is busy');
      } else {
        await setStateWallet(smartAccounts[i], true);
        smartAccountsActive.push(smartAccounts[i]);
      }
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
      // const swapBuilder = opBuilder
      //   .withToken(token)
      //   .withMerkleProof(merkleProofs[i])
      //   .withRouter(router)
      //   .withSellTxs(txs);
      const tokenPaymaster = await getTokenPaymaster(
        smartAccountOwner,
        smartAccounts[i],
      );
      let swapBuilder;
      if (tokenPaymaster == '0x') {
        swapBuilder = opBuilder
          .withToken(token)
          .withMerkleProof(merkleProofs[i])
          .withRouter(router)
          .withSellTxs(txs);
      } else {
        swapBuilder = opBuilder
          .withToken(token)
          .withMerkleProof(merkleProofs[i])
          .withRouter(router)
          .withSellTxs(txs)
          .withPaymaster(getPaymasterData(tokenPaymaster));
      }

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

      if (!usePrivRelayer) txHash = await executeOpsWithPubRelayer(ops);
      else txHash = await executeOpsWithPrivRelayer(telegramId, ops);

      const postETHBalanceCalls = noOpErrors.map((smartAccount) => ({
        target: ContractAddress.Multicall,
        allowFailure: false,
        callData: MulticallInterface.encodeFunctionData('getEthBalance', [
          smartAccount,
        ]),
      }));

      const postWETHBalanceCalls = noOpErrors.map((smartAccount) => ({
        target: ContractAddress.WETH,
        allowFailure: false,
        callData: ERC20Interface.encodeFunctionData('balanceOf', [
          smartAccount,
        ]),
      }));

      const postTokenBalanceCalls = noOpErrors.map((smartAccount) => ({
        target: token,
        allowFailure: false,
        callData: ERC20Interface.encodeFunctionData('balanceOf', [
          smartAccount,
        ]),
      }));

      const callResults = await multicall.callStatic.aggregate3([
        ...postETHBalanceCalls,
        ...postWETHBalanceCalls,
        ...postTokenBalanceCalls,
      ]);

      noOpErrors.forEach((smartAccount, index) => {
        receivedWethList[smartAccount] = BigNumber.from(
          ERC20Interface.decodeFunctionResult(
            'balanceOf',
            callResults[index + noOpErrors.length].returnData,
          )[0],
        )
          .sub(preWETHBalanceList[smartAccount])
          .toString();
        receivedTokenList[smartAccount] = BigNumber.from(
          ERC20Interface.decodeFunctionResult(
            'balanceOf',
            callResults[index + noOpErrors.length].returnData,
          )[0],
        )
          .add(
            BigNumber.from(
              MulticallInterface.decodeFunctionResult(
                'getEthBalance',
                callResults[index].returnData,
              )[0],
            ),
          )
          .sub(preETHBalanceList[smartAccount])
          .toString();

        sentTokenList[smartAccount] = preTokenBalanceList[smartAccount]
          .sub(
            BigNumber.from(
              ERC20Interface.decodeFunctionResult(
                'balanceOf',
                callResults[index + 2 * noOpErrors.length].returnData,
              )[0],
            ),
          )
          .toString();
      });
      //
      let totalSell = 0;
      smartAccounts.map((address) => {
        const receiveEth = receivedWethList![address];
        if (receiveEth != undefined && Number(formatEther(receiveEth)) != 0)
          totalSell += Number(formatEther(receiveEth));
      });
      await updateTotalSellVolume(telegramId, totalSell);
      //

      smartAccountsActive.map(async (address) => {
        await setStateWallet(address, false);
      });
      return {
        telegramId: telegramId,
        token,
        opErrors,
        noOpErrors,
        sentTokenList,
        receivedTokenList,
        txHash,
      };
    } else {
      smartAccountsActive.map(async (address) => {
        await setStateWallet(address, false);
      });
      return {
        telegramId: telegramId,
        token,
        opErrors,
      };
    }
  } catch (err) {
    smartAccountsActive.map(async (address) => {
      await setStateWallet(address, false);
    });
    return {
      telegramId: telegramId,
      token,
      opErrors,
      noOpErrors,
      txError:
        (err as any).error?.error?.message ??
        (err as any).error?.message ??
        (err as Error).message,
    };
  }
}
