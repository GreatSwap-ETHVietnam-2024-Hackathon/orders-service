import {
  ecsign,
  toRpcSig,
  keccak256 as keccak256Buffer,
} from 'ethereumjs-util';
import { Wallet } from 'ethers';
import { arrayify, defaultAbiCoder, keccak256 } from 'ethers/lib/utils';
import { DefaultsForUserOp, UserOperation } from '../../types/user-operation';
import { callDataCost } from './utils';
import { SmartAccount__factory } from '../../typechain-types';
import { ChainId, Provider } from '../../config/constants';
import ContractAddress from '../../config/contracts';

export function packUserOp(op: UserOperation, forSignature = true): string {
  if (forSignature) {
    return defaultAbiCoder.encode(
      [
        'address',
        'uint256',
        'bytes32',
        'bytes32',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'bytes32',
      ],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.callGasLimit,
        op.verificationGasLimit,
        op.preVerificationGas,
        op.maxFeePerGas,
        op.maxPriorityFeePerGas,
        keccak256(op.paymasterAndData),
      ],
    );
  } else {
    // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
    return defaultAbiCoder.encode(
      [
        'address',
        'uint256',
        'bytes',
        'bytes',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'bytes',
        'bytes',
      ],
      [
        op.sender,
        op.nonce,
        op.initCode,
        op.callData,
        op.callGasLimit,
        op.verificationGasLimit,
        op.preVerificationGas,
        op.maxFeePerGas,
        op.maxPriorityFeePerGas,
        op.paymasterAndData,
        op.signature,
      ],
    );
  }
}

export function packUserOp1(op: UserOperation): string {
  return defaultAbiCoder.encode(
    [
      'address', // sender
      'uint256', // nonce
      'bytes32', // initCode
      'bytes32', // callData
      'uint256', // callGasLimit
      'uint256', // verificationGasLimit
      'uint256', // preVerificationGas
      'uint256', // maxFeePerGas
      'uint256', // maxPriorityFeePerGas
      'bytes32', // paymasterAndData
    ],
    [
      op.sender,
      op.nonce,
      keccak256(op.initCode),
      keccak256(op.callData),
      op.callGasLimit,
      op.verificationGasLimit,
      op.preVerificationGas,
      op.maxFeePerGas,
      op.maxPriorityFeePerGas,
      keccak256(op.paymasterAndData),
    ],
  );
}

export function getUserOpHash(
  op: UserOperation,
  entryPoint: string,
  chainId: number,
): string {
  const userOpHash = keccak256(packUserOp(op, true));
  const enc = defaultAbiCoder.encode(
    ['bytes32', 'address', 'uint256'],
    [userOpHash, entryPoint, chainId],
  );
  return keccak256(enc);
}

export function signUserOp(
  op: UserOperation,
  signer: Wallet,
  entryPoint: string,
  chainId: number,
): UserOperation {
  const message = getUserOpHash(op, entryPoint, chainId);
  const msg1 = Buffer.concat([
    Buffer.from('\x19Ethereum Signed Message:\n32', 'ascii'),
    Buffer.from(arrayify(message)),
  ]);

  const sig = ecsign(
    keccak256Buffer(msg1),
    Buffer.from(arrayify(signer.privateKey)),
  );
  // that's equivalent of:  await signer.signMessage(message);
  // (but without "async"
  const signedMessage1 = toRpcSig(sig.v, sig.r, sig.s);
  return {
    ...op,
    signature: signedMessage1,
  };
}

export function fillUserOpDefaults(
  op: Partial<UserOperation>,
  defaults = DefaultsForUserOp,
): UserOperation {
  const partial: any = { ...op };
  // we want "item:undefined" to be used from defaults, and not override defaults, so we must explicitly
  // remove those so "merge" will succeed.
  for (const key in partial) {
    if (partial[key] == null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete partial[key];
    }
  }
  const filled = { ...defaults, ...partial };
  return filled;
}

// helper to fill structure:
// - default callGasLimit to estimate call from entryPoint to account (TODO: add overhead)
// if there is initCode:
//  - calculate sender by eth_call the deployment code
//  - default verificationGasLimit estimateGas of deployment code plus default 100000
// no initCode:
//  - update nonce from account.getNonce()
// entryPoint param is only required to fill in "sender address when specifying "initCode"
// nonce: assume contract as "getNonce()" function, and fill in.
// sender - only in case of construction: fill sender from initCode.
// callGasLimit: VERY crude estimation (by estimating call to account, and add rough entryPoint overhead
// verificationGasLimit: hard-code default at 100k. should add "create2" cost
export async function fillUserOp(
  op: Partial<UserOperation>,
  manualGasLimit: number,
): Promise<UserOperation> {
  const op1 = { ...op };

  if (op1.nonce == null) {
    try {
      op1.nonce = await SmartAccount__factory.connect(
        op.sender!,
        Provider,
      ).nonce(0);
    } catch (err) {
      throw new Error('Abstract wallet is not yet deployed');
    }
  }

  try {
    const gasEstimated = await Provider.estimateGas({
      from: ContractAddress.EntryPoint,
      to: op1.sender,
      data: op1.callData,
    });
    console.log('Gas est: ', gasEstimated.toBigInt());
    const block = await Provider.getBlock('latest');
    op1.preVerificationGas = gasEstimated;
  } catch (error) {
    op1.preVerificationGas = 0;
  }
  const block = await Provider.getBlock('latest');
  op1.callGasLimit = manualGasLimit;
  op1.maxFeePerGas = block.baseFeePerGas!.add(100000);
  //op1.maxPriorityFeePerGas = DefaultsForUserOp.maxPriorityFeePerGas;
  op1.maxPriorityFeePerGas = '0x00';
  console.log(' maxFeePerGas ', op1.maxFeePerGas!.toString());
  console.log(' maxPriorityFeePerGas ', op1.maxPriorityFeePerGas!.toString());

  const op2 = fillUserOpDefaults(op1);
  //op2.preVerificationGas = callDataCost(packUserOp(op2, false))

  return op2;
}

export async function fillAndSign(
  op: Partial<UserOperation>,
  signer: Wallet,
  manualGasLimit: number,
  entryPointAddress: string = ContractAddress.EntryPoint,
  extraPreVerificationGas = 3e3,
  chainId = ChainId,
): Promise<UserOperation> {
  const op2 = await fillUserOp(op, manualGasLimit);
  op2.preVerificationGas =
    Number(op2.preVerificationGas) + extraPreVerificationGas;
  console.log(op2);
  const message = arrayify(getUserOpHash(op2, entryPointAddress, chainId));

  return {
    ...op2,
    signature: await signer.signMessage(message),
  };
}
