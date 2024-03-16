import { BytesLike, Transaction, Wallet } from 'ethers';
import HDKey from 'hdkey';
import { Provider } from '../../config/constants';
import { UserOperation } from '../../types/user-operation';
import { EntryPoint__factory } from '../../typechain-types';
import ContractAddress from '../../config/contracts';
import { getRelayerKey } from '../keys-generator/relayer-keys';

const mutexes: { [key: number]: boolean } = {};

const seed = process.env.RELAYER_SEED!;
const entryInterface = EntryPoint__factory.createInterface();
const hdKey = HDKey.fromMasterSeed(Buffer.from(seed, 'hex'));

const relayerNum = parseInt(process.env.RELAYER_NUM!);
let currentRelayerIndex = 0;
function increateCurrentRelayerIndex() {
  const index = currentRelayerIndex;
  currentRelayerIndex++;
  if (currentRelayerIndex === relayerNum) currentRelayerIndex = 0;
  return index;
}

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function getRelayer(index: number) {
  const derivationPath = `m/1'/1'/1'/${index}`;
  const childKey = hdKey.derive(derivationPath);
  return new Wallet(childKey.privateKey, Provider);
}

export async function executeOpsWithPubRelayer(ops: UserOperation[]) {
  const relayerIndex = increateCurrentRelayerIndex();
  const relayer = getRelayer(relayerIndex);

  const gasEstimated = await Provider.estimateGas({
    from: relayer.address,
    to: ContractAddress.EntryPoint,
    data: entryInterface.encodeFunctionData('handleOps', [
      ops,
      relayer.address,
    ]),
  });
  console.log(' Total Gas = ', gasEstimated.toString());
  while (mutexes[relayerIndex] == true) {
    await delay(300);
  }

  mutexes[relayerIndex] = true;

  const block = await Provider.getBlock('latest');
  console.log(' maxFeePerGas = ', block.baseFeePerGas!.toString());

  try {
    const tx = await EntryPoint__factory.connect(
      ContractAddress.EntryPoint,
      relayer,
    ).handleOps(ops, relayer.address, {
      type: 2,
      gasLimit: gasEstimated.add(5000),
      maxFeePerGas:
        block.baseFeePerGas!.add(100).toHexString() ??
        '0x' + (1e8).toString(16),
      maxPriorityFeePerGas: '0x00',
    });

    // const recepit = await tx.wait();
    // console.log('recepit = ', recepit);
    mutexes[relayerIndex] = false;
    return tx.hash;
  } catch (error) {
    console.log(error);
    mutexes[relayerIndex] = false;
    throw error;
  }
}

export async function executeOpsWithPrivRelayer(
  telegramId: number,
  ops: UserOperation[],
) {
  const relayer = await getRelayerKey(telegramId);

  const gasEstimated = await Provider.estimateGas({
    from: relayer.address,
    to: ContractAddress.EntryPoint,
    data: entryInterface.encodeFunctionData('handleOps', [
      ops,
      relayer.address,
    ]),
  });

  const feeData = await Provider.getFeeData();
  const block = await Provider.getBlock('latest');
  const tx = await EntryPoint__factory.connect(
    ContractAddress.EntryPoint,
    relayer,
  ).handleOps(ops, relayer.address, {
    type: 2,
    gasLimit: gasEstimated.add(5000),
    maxFeePerGas:
      block.baseFeePerGas!.add(100).toHexString() ?? '0x' + (1e8).toString(16),
    maxPriorityFeePerGas: '0x00',
  });

  await tx.wait();
  return tx.hash;
}

export async function simulateOps(ops: UserOperation[], multicalls: any[]) {
  const relayerIndex = increateCurrentRelayerIndex();
  const relayer = getRelayer(relayerIndex);
  try {
    return await Promise.all(
      ops.map(async (op, index) => {
        try {
          let multicall = multicalls[index];
          await EntryPoint__factory.connect(
            ContractAddress.EntryPoint,
            relayer,
          ).callStatic.simulateHandleOp(
            op,
            multicall.target || '',
            multicall.callData,
          );
        } catch (error: any) {
          const errorResult = error.errorArgs;
          return {
            reason: errorResult['reason'],
            targetResult: errorResult['targetResult'],
          };
        }
      }),
    );
  } catch (error) {
    throw error;
  }
}
