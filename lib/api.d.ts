import 'isomorphic-unfetch';
import { SwappableAPIConfig, SwappableAsset, SwappableAssetBundle, SwappableAssetBundleQuery, SwappableAssetQuery, SwappableFungibleToken, SwappableFungibleTokenQuery, Order, OrderJSON, OrderQuery } from './types';
export declare class SwappableAPI {
    /**
     * Host url for Swappable
     */
    readonly hostUrl: string;
    /**
     * Base url for the API
     */
    readonly apiBaseUrl: string;
    /**
     * Page size to use for fetching orders
     */
    pageSize: number;
    /**
     * Logger function to use when debugging
     */
    logger: (arg: string) => void;
    private apiKey;
    /**
     * Create an instance of the Swappable API
     * @param config SwappableAPIConfig for setting up the API, including an optional API key, network name, and base URL
     * @param logger Optional function for logging debug strings before and after requests are made
     */
    constructor(config: SwappableAPIConfig, logger?: (arg: string) => void);
    /**
     * Send an order to the orderbook.
     * Throws when the order is invalid.
     * IN NEXT VERSION: change order input to Order type
     * @param order Order JSON to post to the orderbook
     * @param retries Number of times to retry if the service is unavailable for any reason
     */
    postOrder(order: OrderJSON, retries?: number): Promise<Order>;
    /**
     * Create a whitelist entry for an asset to prevent others from buying.
     * Buyers will have to have verified at least one of the emails
     * on an asset in order to buy.
     * This will throw a 403 if the given API key isn't allowed to create whitelist entries for this contract or asset.
     * @param tokenAddress Address of the asset's contract
     * @param tokenId The asset's token ID
     * @param email The email allowed to buy.
     */
    postAssetWhitelist(tokenAddress: string, tokenId: string | number, email: string): Promise<boolean>;
    /**
     * Get an order from the orderbook, throwing if none is found.
     * @param query Query to use for getting orders. A subset of parameters
     *  on the `OrderJSON` type is supported
     */
    getOrder(query: OrderQuery): Promise<Order>;
    /**
     * Get a list of orders from the orderbook, returning the page of orders
     *  and the count of total orders found.
     * @param query Query to use for getting orders. A subset of parameters
     *  on the `OrderJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from OrderQuery
     */
    getOrders(query?: OrderQuery, page?: number): Promise<{
        orders: Order[];
        count: number;
    }>;
    /**
     * Fetch an asset from the API, throwing if none is found
     * @param tokenAddress Address of the asset's contract
     * @param tokenId The asset's token ID, or null if ERC-20
     * @param retries Number of times to retry if the service is unavailable for any reason
     */
    getAsset({ tokenAddress, tokenId }: {
        tokenAddress: string;
        tokenId: string | number | null;
    }, retries?: number): Promise<SwappableAsset>;
    /**
     * Fetch list of assets from the API, returning the page of assets and the count of total assets
     * @param query Query to use for getting orders. A subset of parameters on the `SwappableAssetJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from SwappableAssetQuery
     */
    getAssets(query?: SwappableAssetQuery, page?: number): Promise<{
        assets: SwappableAsset[];
        estimatedCount: number;
    }>;
    /**
     * Fetch list of fungible tokens from the API matching paramters
     * @param query Query to use for getting orders. A subset of parameters on the `SwappableAssetJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from SwappableFungibleTokenQuery
     * @param retries Number of times to retry if the service is unavailable for any reason
     */
    getPaymentTokens(query?: SwappableFungibleTokenQuery, page?: number, retries?: number): Promise<{
        tokens: SwappableFungibleToken[];
    }>;
    /**
     * Fetch an bundle from the API, return null if it isn't found
     * @param slug The bundle's identifier
     */
    getBundle({ slug }: {
        slug: string;
    }): Promise<SwappableAssetBundle | null>;
    /**
     * Fetch list of bundles from the API, returning the page of bundles and the count of total bundles
     * @param query Query to use for getting orders. A subset of parameters on the `SwappableAssetBundleJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from SwappableAssetBundleQuery
     */
    getBundles(query?: SwappableAssetBundleQuery, page?: number): Promise<{
        bundles: SwappableAssetBundle[];
        estimatedCount: number;
    }>;
    /**
     * Get JSON data from API, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param query Data to send. Will be stringified using QueryString
     */
    get(apiPath: string, query?: any): Promise<any>;
    /**
     * POST JSON data to API, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param body Data to send. Will be JSON.stringified
     * @param opts RequestInit opts, similar to Fetch API. If it contains
     *  a body, it won't be stringified.
     */
    post(apiPath: string, body?: object, opts?: RequestInit): Promise<any>;
    /**
     * PUT JSON data to API, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param body Data to send
     * @param opts RequestInit opts, similar to Fetch API. If it contains
     *  a body, it won't be stringified.
     */
    put(apiPath: string, body: object, opts?: RequestInit): Promise<any>;
    /**
     * Get from an API Endpoint, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param opts RequestInit opts, similar to Fetch API
     */
    private _fetch;
    private _handleApiResponse;
}
