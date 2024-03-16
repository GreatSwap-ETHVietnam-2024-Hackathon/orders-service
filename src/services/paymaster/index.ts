import { ethers } from "ethers";
import { BytesLike, Hexable, hexZeroPad, hexlify } from "ethers/lib/utils";
import ContractAddress from "../../config/contracts";

const paymasterAddress = "0x3E8E188540eF041Cd4A2BD1d8DeB638Ab30c697C";

export function packPaymasterData(
  paymaster: string,
  paymasterVerificationGasLimit: BytesLike | Hexable | number | bigint,
  postOpGasLimit: BytesLike | Hexable | number | bigint,
  paymasterData: string,
): string {
  return ethers.utils.hexConcat([
    paymaster,
    hexZeroPad(hexlify(paymasterVerificationGasLimit, { hexPad: "left" }), 16),
    hexZeroPad(hexlify(postOpGasLimit, { hexPad: "left" }), 16),
    paymasterData,
  ]);
}

export function getPaymasterData(token: string) {
  return packPaymasterData(paymasterAddress, 3e5, 3e5, token);
}
