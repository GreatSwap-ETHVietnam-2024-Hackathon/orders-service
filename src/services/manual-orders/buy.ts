import { BigNumber, BigNumberish } from 'ethers';
import { getSessionKey } from '../keys-generator/session-keys';
import SessionKeyUserOpBuilder from '../user-operations/builder';
import { AddressZero, Provider } from '../../config/constants';
import ContractAddress, { SupportedRouters } from '../../config/contracts';
import {
  buildAlgebraExactInputSingleTx,
  buildApprovalTx,
  buildBuyPaymentTx,
  buildUniV3ExactInputSingleTx,
  buildWrapETHTx,
  calculatePaymentAndAmountIn,
} from '../dexes/tx-builder';
import { ERC20__factory, Multicall__factory } from '../../typechain-types';
import { Transaction } from '../../types/transaction';
import { formatUnits, parseEther } from 'ethers/lib/utils';
import { UserOperation } from '../../types/user-operation';
import {
  executeOpsWithPrivRelayer,
  executeOpsWithPubRelayer,
} from '../relayers';
import { getMerkleProofs } from '../../controllers/approval';
import {
  calculateSqrtPriceLimitX96,
  calculateUniV3Threshold,
} from '../dexes/slippage';
import { getStateWallet, setStateWallet } from '../wallet-state';
import { updateTotalBuyVolume } from '../total-volume';
import { getPaymasterData } from '../paymaster';
import { getTokenPaymaster } from '../token-paymaster-user';

const MulticallInterface = Multicall__factory.createInterface();
const ERC20Interface = ERC20__factory.createInterface();
const multicall = Multicall__factory.connect(
  ContractAddress.Multicall,
  Provider,
);

export async function buyToken(
  telegramId: number,
  smartAccountOwner: string,
  smartAccounts: string[],
  token: string,
  ethAmount: BigNumber,
  router: string,
  slippage: number,
  fee: BigNumberish,
  sqrtPriceX96: BigNumberish,
  usePrivRelayer: boolean = false,
) {
  const sessionKey = await getSessionKey(telegramId);

  const { amountIn, payment } = calculatePaymentAndAmountIn(ethAmount);

  const sqrtPriceLimitX96 = calculateSqrtPriceLimitX96(
    token,
    slippage,
    sqrtPriceX96 as string,
    false,
  );

  const amountOutMinimum = calculateUniV3Threshold(
    token,
    true,
    amountIn.toString(),
    sqrtPriceLimitX96,
  );

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

  let calls: {
    target: string;
    allowFailure: boolean;
    callData: string;
  }[] = [];
  for (let i = 0; i < smartAccounts.length; i++) {
    const smartAccount = smartAccounts[i];

    const preTokenBalanceCall = {
      target: token,
      allowFailure: false,
      callData: ERC20Interface.encodeFunctionData('balanceOf', [smartAccount]),
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

    const wethAllowanceCall = {
      target: ContractAddress.WETH,
      allowFailure: false,
      callData: ERC20Interface.encodeFunctionData('allowance', [
        smartAccount,
        router,
      ]),
    };

    calls = [
      ...calls,
      preTokenBalanceCall,
      ethBalanceCall,
      wethBalanceCall,
      wethAllowanceCall,
    ];
  }

  const results = await multicall.callStatic.aggregate3(calls);

  const preETHBalanceList: { [key: string]: BigNumber } = {};
  const preTokenBalanceList: { [key: string]: BigNumber } = {};

  const receivedTokenList: { [key: string]: string } = {};
  const sentTokenList: { [key: string]: string } = {};

  const ops: UserOperation[] = [];
  const opErrors: {
    [key: string]: string;
  } = {};
  const noOpErrors: string[] = [];
  const smartAccountsActive = [];
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

      const ethBalance = BigNumber.from(
        MulticallInterface.decodeFunctionResult(
          'getEthBalance',
          res[1].returnData,
        )[0],
      );
      const wethBalance = BigNumber.from(
        ERC20Interface.decodeFunctionResult('balanceOf', res[2].returnData)[0],
      );
      const wethAllowance = BigNumber.from(
        ERC20Interface.decodeFunctionResult('allowance', res[3].returnData)[0],
      );

      if (ethAmount.gt(ethBalance.add(wethBalance))) {
        await setStateWallet(smartAccounts[i], false);
        throw new Error('Insufficient ETH');
      }
      let callValue: BigNumber;
      if (wethBalance.gt(0)) {
        if (wethBalance.lt(amountIn)) {
          txs.push(buildWrapETHTx(amountIn.sub(wethBalance)));
        }
        if (wethAllowance.lt(amountIn)) {
          txs.push(buildApprovalTx(ContractAddress.WETH, ethAmount, router));
        }
        callValue = parseEther('0');
      } else {
        callValue = amountIn;
      }

      const deadline = Math.round((Date.now() + 1000000) / 1000);

      const swapTx =
        router === SupportedRouters.UniswapV3Router
          ? buildUniV3ExactInputSingleTx(callValue, {
              tokenIn: ContractAddress.WETH,
              tokenOut: token,
              fee,
              recipient: smartAccounts[i],
              deadline,
              amountIn,
              amountOutMinimum,
              sqrtPriceLimitX96: sqrtPriceLimitX96,
            })
          : buildAlgebraExactInputSingleTx(callValue, {
              tokenIn: ContractAddress.WETH,
              tokenOut: token,
              recipient: smartAccounts[i],
              deadline,
              amountIn,
              amountOutMinimum,
              limitSqrtPrice: sqrtPriceLimitX96,
            });
      txs.push(swapTx);

      const paymentTx = buildBuyPaymentTx(payment);
      txs.push(paymentTx);

      const opBuilder = new SessionKeyUserOpBuilder(
        smartAccounts[i],
        sessionKey,
      );

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
          .withBuyTxs(txs);
      } else {
        swapBuilder = opBuilder
          .withToken(token)
          .withMerkleProof(merkleProofs[i])
          .withRouter(router)
          .withBuyTxs(txs)
          .withPaymaster(getPaymasterData(tokenPaymaster));
      }

      const swapOp = await swapBuilder.build();
      ops.push(swapOp);
      //set Paymaster weth

      //swapOp.paymasterAndData = getPaymasterData(ContractAddress.WETH);
      noOpErrors.push(smartAccounts[i]);

      preETHBalanceList[smartAccounts[i]] = ethBalance.add(wethBalance);
      preTokenBalanceList[smartAccounts[i]] = BigNumber.from(
        ERC20Interface.decodeFunctionResult('balanceOf', res[0].returnData)[0],
      );
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
        sentTokenList[smartAccount] = preETHBalanceList[smartAccount]
          .sub(
            BigNumber.from(
              ERC20Interface.decodeFunctionResult(
                'balanceOf',
                callResults[index + noOpErrors.length].returnData,
              )[0],
            ),
          )
          .sub(
            BigNumber.from(
              MulticallInterface.decodeFunctionResult(
                'getEthBalance',
                callResults[index].returnData,
              )[0],
            ),
          )
          .toString();

        receivedTokenList[smartAccount] = BigNumber.from(
          ERC20Interface.decodeFunctionResult(
            'balanceOf',
            callResults[index + 2 * noOpErrors.length].returnData,
          )[0],
        )
          .sub(preTokenBalanceList[smartAccount])
          .toString();
      });

      //calculate total buy volume
      let totalBuy = 0;
      smartAccounts.map((address) => {
        const receiveToken = receivedTokenList![address];
        if (receiveToken != undefined && parseFloat(receiveToken) != 0)
          totalBuy += parseFloat(formatUnits(ethAmount, 18));
      });
      await updateTotalBuyVolume(telegramId, totalBuy);

      //
      smartAccountsActive.map(async (address) => {
        await setStateWallet(address, false);
      });

      return {
        telegramId: telegramId,
        token: token,
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
        token: token,
        opErrors,
      };
    }
  } catch (err) {
    console.log(err);
    smartAccountsActive.map(async (address) => {
      await setStateWallet(address, false);
    });
    return {
      telegramId: telegramId,
      token: token,
      opErrors,
      noOpErrors,
      txError: (err as any).error?.message ?? (err as Error).message,
    };
  }
}
