import { Token } from "@uniswap/sdk-core";
import { FeeAmount, Pool as UniV3Pool } from "@uniswap/v3-sdk";
import ContractAddress from "../../config/contracts";
import { defaultAbiCoder, getCreate2Address, keccak256 } from "ethers/lib/utils";
import { ChainId } from "../../config/constants";

const WETH = new Token(
    ChainId,
    ContractAddress.WETH,
    18
)

export function calculateUniV3PoolAddress(
    tokenAddress: string,
    fee: string
) {
    const token = new Token(ChainId, tokenAddress, 18);
    return getCreate2Address(
        "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
        keccak256(
            defaultAbiCoder.encode(
                ["address", "address", "uint24"],
                [token.address, WETH.address, parseInt(fee)]
            )
        ),
        "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2"
    );
}

export function calculateCamelotV3PoolAddress(
    tokenAddress: string
) {
    const token = new Token(ChainId, tokenAddress, 18);
    const [token0, token1] = token.sortsBefore(WETH) ? [token, WETH] : [WETH, token];
    return getCreate2Address(
        "0x9A89490F1056A7BC607EC53F93b921fE666A2C48",
        keccak256(
            defaultAbiCoder.encode(
                ["address", "address"],
                [token0.address, token1.address]
            )
        ),
        "0xc65e01e65f37c1ec2735556a24a9c10e4c33b2613ad486dd8209d465524bc3f4"
    );
}