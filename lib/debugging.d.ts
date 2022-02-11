import { Order } from './types';
import { WyvernProtocol } from 'wyvern-js';
export declare const MAX_ERROR_LENGTH = 120;
/**
 * Debug the `ordersCanMatch` part of Wyvern
 * @param buy Buy order for debugging
 * @param sell Sell order for debugging
 */
export declare function requireOrdersCanMatch(client: WyvernProtocol, { buy, sell, accountAddress }: {
    buy: Order;
    sell: Order;
    accountAddress: string;
}, isOrderV1: Boolean): Promise<void>;
/**
 * Debug the `orderCalldataCanMatch` part of Wyvern
 * @param buy Buy order for debugging
 * @param sell Sell Order for debugging
 */
export declare function requireOrderCalldataCanMatch(client: WyvernProtocol, { buy, sell }: {
    buy: Order;
    sell: Order;
}): Promise<void>;
