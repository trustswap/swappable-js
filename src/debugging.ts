import { Order } from './types'
import { WyvernProtocol } from 'wyvern-js'
import { NULL_ADDRESS } from './constants'

export const MAX_ERROR_LENGTH = 120

/**
 * This file reproduces Solidity methods to make debugging easier
 */

enum Side { Buy, Sell }

enum SaleKind { FixedPrice, DutchAuction }

const SaleKindInterface = {
    Side,
    SaleKind,

    validateParameters(saleKind: SaleKind, expirationTime: number): boolean {
        return (saleKind === SaleKind.FixedPrice || expirationTime > 0)
    },

    canSettleOrder(listingTime: number, expirationTime: number): boolean {
        const now = Math.round(Date.now() / 1000)
        return (listingTime < now) && (expirationTime === 0 || now < expirationTime)
    }
}

/**
 * Debug the `ordersCanMatch` part of Wyvern
 * @param buy Buy order for debugging
 * @param sell Sell order for debugging
 */
export async function requireOrdersCanMatch(
    client: WyvernProtocol,
    {buy, sell, accountAddress}:
        { buy: Order, sell: Order, accountAddress: string }
) {
    const result = await client.wyvernExchange.ordersCanMatch.callAsync(
        {
            exchange: buy.exchange,
            maker: buy.maker,
            taker: buy.taker,
            makerRelayerFee: buy.makerRelayerFee,
            takerRelayerFee: buy.takerRelayerFee,
            makerProtocolFee: buy.makerProtocolFee,
            takerProtocolFee: buy.takerProtocolFee,
            feeRecipient: buy.feeRecipient,
            feeMethod: buy.feeMethod,
            side: buy.side,
            saleKind: buy.saleKind,
            target: buy.target,
            howToCall: buy.howToCall,
            calldatas: buy.calldata,
            replacementPattern: buy.replacementPattern,
            staticTarget: buy.staticTarget,
            staticExtradata: buy.staticExtradata,
            paymentToken: buy.paymentToken,
            basePrice: buy.basePrice,
            extra: buy.extra,
            listingTime: buy.listingTime,
            expirationTime: buy.expirationTime,
            salt: buy.salt,
            dataType: "V1",
            data: "0x"
          },
          {
            exchange: sell.exchange,
            maker: sell.maker,
            taker: sell.taker,
            makerRelayerFee: sell.makerRelayerFee,
            takerRelayerFee: sell.takerRelayerFee,
            makerProtocolFee: sell.makerProtocolFee,
            takerProtocolFee: sell.takerProtocolFee,
            feeRecipient: sell.feeRecipient,
            feeMethod: sell.feeMethod,
            side: sell.side,
            saleKind: sell.saleKind,
            target: sell.target,
            howToCall: sell.howToCall,
            calldatas: sell.calldata,
            replacementPattern: sell.replacementPattern,
            staticTarget: sell.staticTarget,
            staticExtradata: sell.staticExtradata,
            paymentToken: sell.paymentToken,
            basePrice: sell.basePrice,
            extra: sell.extra,
            listingTime: sell.listingTime,
            expirationTime: sell.expirationTime,
            salt: sell.salt,
            dataType: "V1",
            data: "0x"
          },
        {from: accountAddress},
    )

    if (result) {
        return
    }

    if (!(+buy.side == +SaleKindInterface.Side.Buy && +sell.side == +SaleKindInterface.Side.Sell)) {
        throw new Error('Must be opposite-side')
    }

    if (!(buy.feeMethod == sell.feeMethod)) {
        throw new Error('Must use same fee method')
    }

    if (!(buy.paymentToken == sell.paymentToken)) {
        throw new Error('Must use same payment token')
    }

    if (!(sell.taker == NULL_ADDRESS || sell.taker == buy.maker)) {
        throw new Error('Sell taker must be null or matching buy maker')
    }

    if (!(buy.taker == NULL_ADDRESS || buy.taker == sell.maker)) {
        throw new Error('Buy taker must be null or matching sell maker')
    }

    if (!((sell.feeRecipient == NULL_ADDRESS && buy.feeRecipient != NULL_ADDRESS) || (sell.feeRecipient != NULL_ADDRESS && buy.feeRecipient == NULL_ADDRESS))) {
        throw new Error('One order must be maker and the other must be taker')
    }

    if (!(buy.target == sell.target)) {
        throw new Error('Must match target')
    }

    if (!(buy.howToCall == sell.howToCall)) {
        throw new Error('Must match howToCall')
    }

    if (!SaleKindInterface.canSettleOrder(+buy.listingTime, +buy.expirationTime)) {
        throw new Error(`Buy-side order is set in the future or expired`)
    }

    if (!SaleKindInterface.canSettleOrder(+sell.listingTime, +sell.expirationTime)) {
        throw new Error(`Sell-side order is set in the future or expired`)
    }

    // Handle default, which is likely now() being diff than local time
    throw new Error('Error creating your order. Check that your system clock is set to the current date and time before you try again.')
}

/**
 * Debug the `orderCalldataCanMatch` part of Wyvern
 * @param buy Buy order for debugging
 * @param sell Sell Order for debugging
 */
export async function requireOrderCalldataCanMatch(
    client: WyvernProtocol,
    {buy, sell}:
        { buy: Order, sell: Order }
) {
    const result = await client.wyvernExchange.orderCalldataCanMatch.callAsync(buy.calldata, buy.replacementPattern, sell.calldata, sell.replacementPattern)
    if (result) {
        return
    }
    throw new Error('Unable to match offer data with auction data.')
}
