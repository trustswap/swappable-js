"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwappableAPI = void 0;
require("isomorphic-unfetch");
const QueryString = require("query-string");
const types_1 = require("./types");
const utils_1 = require("./utils/utils");
const constants_1 = require("./constants");
class SwappableAPI {
    /**
     * Create an instance of the Swappable API
     * @param config SwappableAPIConfig for setting up the API, including an optional API key, network name, and base URL
     * @param logger Optional function for logging debug strings before and after requests are made
     */
    constructor(config, logger) {
        /**
         * Page size to use for fetching orders
         */
        this.pageSize = 20;
        this.apiKey = config.apiKey;
        switch (config.networkName) {
            case types_1.Network.Rinkeby:
            case types_1.Network.Mumbai:
                this.apiBaseUrl = config.apiBaseUrl || constants_1.API_BASE_RINKEBY;
                this.hostUrl = constants_1.SITE_HOST_RINKEBY;
                break;
            case types_1.Network.Main:
            case types_1.Network.Matic:
            default:
                this.apiBaseUrl = config.apiBaseUrl || constants_1.API_BASE_MAINNET;
                this.hostUrl = constants_1.SITE_HOST_MAINNET;
                break;
        }
        // Debugging: default to nothing
        this.logger = logger || ((arg) => arg);
    }
    /**
     * Send an order to the orderbook.
     * Throws when the order is invalid.
     * IN NEXT VERSION: change order input to Order type
     * @param order Order JSON to post to the orderbook
     * @param retries Number of times to retry if the service is unavailable for any reason
     */
    postOrder(order, retries = 2) {
        return __awaiter(this, void 0, void 0, function* () {
            let json;
            try {
                json = (yield this.post(`${constants_1.ORDERBOOK_PATH}/orders/post/`, order));
            }
            catch (error) {
                _throwOrContinue(error, retries);
                yield utils_1.delay(3000);
                return this.postOrder(order, retries - 1);
            }
            return utils_1.orderFromJSON(json);
        });
    }
    /**
     * Create a whitelist entry for an asset to prevent others from buying.
     * Buyers will have to have verified at least one of the emails
     * on an asset in order to buy.
     * This will throw a 403 if the given API key isn't allowed to create whitelist entries for this contract or asset.
     * @param tokenAddress Address of the asset's contract
     * @param tokenId The asset's token ID
     * @param email The email allowed to buy.
     */
    postAssetWhitelist(tokenAddress, tokenId, email) {
        return __awaiter(this, void 0, void 0, function* () {
            const json = yield this.post(`${constants_1.API_PATH}/asset/${tokenAddress}/${tokenId}/whitelist/`, {
                email
            });
            return !!json.success;
        });
    }
    /**
     * Get an order from the orderbook, throwing if none is found.
     * @param query Query to use for getting orders. A subset of parameters
     *  on the `OrderJSON` type is supported
     */
    getOrder(query) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.get(`${constants_1.ORDERBOOK_PATH}/orders/`, Object.assign({ limit: 1 }, query));
            let orderJSON;
            if (constants_1.ORDERBOOK_VERSION == 0) {
                const json = result;
                orderJSON = json[0];
            }
            else {
                const json = result;
                orderJSON = json.orders[0];
            }
            if (!orderJSON) {
                throw new Error(`Not found: no matching order found`);
            }
            return utils_1.orderFromJSON(orderJSON);
        });
    }
    /**
     * Get a list of orders from the orderbook, returning the page of orders
     *  and the count of total orders found.
     * @param query Query to use for getting orders. A subset of parameters
     *  on the `OrderJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from OrderQuery
     */
    getOrders(query = {}, page = 1) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.get(`${constants_1.ORDERBOOK_PATH}/orders/`, Object.assign({ limit: this.pageSize, offset: (page - 1) * this.pageSize }, query));
            if (constants_1.ORDERBOOK_VERSION == 0) {
                const json = result;
                return {
                    orders: json.map(j => utils_1.orderFromJSON(j)),
                    count: json.length
                };
            }
            else {
                const json = result;
                return {
                    orders: json.orders.map(j => utils_1.orderFromJSON(j)),
                    count: json.count
                };
            }
        });
    }
    /**
     * Fetch an asset from the API, throwing if none is found
     * @param tokenAddress Address of the asset's contract
     * @param tokenId The asset's token ID, or null if ERC-20
     * @param retries Number of times to retry if the service is unavailable for any reason
     */
    getAsset({ tokenAddress, tokenId }, retries = 1) {
        return __awaiter(this, void 0, void 0, function* () {
            let json;
            try {
                json = yield this.get(`${constants_1.API_PATH}/asset/${tokenAddress}/${tokenId || 0}/`);
            }
            catch (error) {
                _throwOrContinue(error, retries);
                yield utils_1.delay(1000);
                return this.getAsset({ tokenAddress, tokenId }, retries - 1);
            }
            return utils_1.assetFromJSON(json);
        });
    }
    /**
     * Fetch list of assets from the API, returning the page of assets and the count of total assets
     * @param query Query to use for getting orders. A subset of parameters on the `SwappableAssetJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from SwappableAssetQuery
     */
    getAssets(query = {}, page = 1) {
        return __awaiter(this, void 0, void 0, function* () {
            const json = yield this.get(`${constants_1.API_PATH}/assets/`, Object.assign({ limit: this.pageSize, offset: (page - 1) * this.pageSize }, query));
            return {
                assets: json.assets.map((j) => utils_1.assetFromJSON(j)),
                estimatedCount: json.estimated_count
            };
        });
    }
    /**
     * Fetch list of fungible tokens from the API matching paramters
     * @param query Query to use for getting orders. A subset of parameters on the `SwappableAssetJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from SwappableFungibleTokenQuery
     * @param retries Number of times to retry if the service is unavailable for any reason
     */
    getPaymentTokens(query = {}, page = 1, retries = 1) {
        return __awaiter(this, void 0, void 0, function* () {
            let json;
            try {
                json = yield this.get(`${constants_1.API_PATH}/tokens/`, Object.assign(Object.assign({}, query), { limit: this.pageSize, offset: (page - 1) * this.pageSize }));
            }
            catch (error) {
                _throwOrContinue(error, retries);
                yield utils_1.delay(1000);
                return this.getPaymentTokens(query, page, retries - 1);
            }
            return {
                tokens: json.map((t) => utils_1.tokenFromJSON(t))
            };
        });
    }
    /**
     * Fetch an bundle from the API, return null if it isn't found
     * @param slug The bundle's identifier
     */
    getBundle({ slug }) {
        return __awaiter(this, void 0, void 0, function* () {
            const json = yield this.get(`${constants_1.API_PATH}/bundle/${slug}/`);
            return json ? utils_1.assetBundleFromJSON(json) : null;
        });
    }
    /**
     * Fetch list of bundles from the API, returning the page of bundles and the count of total bundles
     * @param query Query to use for getting orders. A subset of parameters on the `SwappableAssetBundleJSON` type is supported
     * @param page Page number, defaults to 1. Can be overridden by
     * `limit` and `offset` attributes from SwappableAssetBundleQuery
     */
    getBundles(query = {}, page = 1) {
        return __awaiter(this, void 0, void 0, function* () {
            const json = yield this.get(`${constants_1.API_PATH}/bundles/`, Object.assign(Object.assign({}, query), { limit: this.pageSize, offset: (page - 1) * this.pageSize }));
            return {
                bundles: json.bundles.map((j) => utils_1.assetBundleFromJSON(j)),
                estimatedCount: json.estimated_count
            };
        });
    }
    /**
     * Get JSON data from API, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param query Data to send. Will be stringified using QueryString
     */
    get(apiPath, query = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const qs = QueryString.stringify(query);
            const url = `${apiPath}?${qs}`;
            const response = yield this._fetch(url);
            return response.json();
        });
    }
    /**
     * POST JSON data to API, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param body Data to send. Will be JSON.stringified
     * @param opts RequestInit opts, similar to Fetch API. If it contains
     *  a body, it won't be stringified.
     */
    post(apiPath, body, opts = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const fetchOpts = Object.assign({ method: 'POST', body: body ? JSON.stringify(body) : undefined, headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                } }, opts);
            const response = yield this._fetch(apiPath, fetchOpts);
            return response.json();
        });
    }
    /**
     * PUT JSON data to API, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param body Data to send
     * @param opts RequestInit opts, similar to Fetch API. If it contains
     *  a body, it won't be stringified.
     */
    put(apiPath, body, opts = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.post(apiPath, body, Object.assign({ method: 'PUT' }, opts));
        });
    }
    /**
     * Get from an API Endpoint, sending auth token in headers
     * @param apiPath Path to URL endpoint under API
     * @param opts RequestInit opts, similar to Fetch API
     */
    _fetch(apiPath, opts = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const apiBase = this.apiBaseUrl;
            const apiKey = this.apiKey;
            const finalUrl = apiBase + apiPath;
            const finalOpts = Object.assign(Object.assign({}, opts), { headers: Object.assign(Object.assign({}, (apiKey ? { 'X-API-KEY': apiKey } : {})), (opts.headers || {})) });
            this.logger(`Sending request: ${finalUrl} ${JSON.stringify(finalOpts).substr(0, 100)}...`);
            return fetch(finalUrl, finalOpts).then((res) => __awaiter(this, void 0, void 0, function* () { return this._handleApiResponse(res); }));
        });
    }
    _handleApiResponse(response) {
        return __awaiter(this, void 0, void 0, function* () {
            if (response.ok) {
                this.logger(`Got success: ${response.status}`);
                return response;
            }
            let result;
            let errorMessage;
            try {
                result = yield response.text();
                result = JSON.parse(result);
            }
            catch (_a) {
                // Result will be undefined or text
            }
            this.logger(`Got error ${response.status}: ${JSON.stringify(result)}`);
            switch (response.status) {
                case 400:
                    errorMessage = result && result.errors
                        ? result.errors.join(', ')
                        : `Invalid request: ${JSON.stringify(result)}`;
                    break;
                case 401:
                case 403:
                    errorMessage = `Unauthorized. Full message was '${JSON.stringify(result)}'`;
                    break;
                case 404:
                    errorMessage = `Not found. Full message was '${JSON.stringify(result)}'`;
                    break;
                case 500:
                    errorMessage = `Internal server error. Swappable has been alerted, but if the problem persists please contact us via Discord: https://discord.gg/ga8EJbv - full message was ${JSON.stringify(result)}`;
                    break;
                case 503:
                    errorMessage = `Service unavailable. Please try again in a few minutes. If the problem persists please contact us via Discord: https://discord.gg/ga8EJbv - full message was ${JSON.stringify(result)}`;
                    break;
                default:
                    errorMessage = `Message: ${JSON.stringify(result)}`;
                    break;
            }
            throw new Error(`API Error ${response.status}: ${errorMessage}`);
        });
    }
}
exports.SwappableAPI = SwappableAPI;
function _throwOrContinue(error, retries) {
    const isUnavailable = !!error.message && (error.message.includes('503') ||
        error.message.includes('429'));
    if (retries <= 0 || !isUnavailable) {
        throw error;
    }
}
//# sourceMappingURL=api.js.map