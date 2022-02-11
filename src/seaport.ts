import * as Web3 from 'web3'
import { WyvernProtocol } from 'wyvern-js'
import * as WyvernSchemas from 'wyvern-schemas'
import { Schema } from 'wyvern-schemas/dist/types'
import { Part } from 'wyvern-js/lib/types'
import * as _ from 'lodash'
import { SwappableAPI } from './api'
import { CanonicalWETH, ERC20, ERC721, WrappedNFT, WrappedNFTFactory, WrappedNFTLiquidationProxy, UniswapFactory, UniswapExchange, StaticCheckTxOrigin, StaticCheckCheezeWizards, StaticCheckDecentralandEstates, CheezeWizardsBasicTournament, DecentralandEstates, getMethod } from './contracts'
import { ECSignature, FeeMethod, HowToCall, Network, SwappableAPIConfig, OrderSide, SaleKind, UnhashedOrder, Order, UnsignedOrder, PartialReadonlyContractAbi, EventType, EventData, SwappableAsset, WyvernSchemaName, WyvernAtomicMatchParameters, SwappableFungibleToken, WyvernAsset, ComputedFees, Asset, WyvernNFTAsset, WyvernFTAsset, TokenStandardVersion } from './types'
import {
  confirmTransaction,
  makeBigNumber, orderToJSON,
  personalSignAsync,
  sendRawTransaction, estimateCurrentPrice, getOrderHash,
  getCurrentGasPrice, delay, assignOrdersToSides, estimateGas,
  validateAndFormatWalletAddress,
  getWyvernBundle,
  getWyvernAsset,
  getTransferFeeSettings,
  rawCall,
  promisifyCall,
  annotateERC721TransferABI,
  annotateERC20TransferABI,
  onDeprecated,
  getNonCompliantApprovalAddress,
  isContractAddress,
} from './utils/utils'
import {
  encodeAtomicizedTransfer,
  encodeProxyCall,
  encodeTransferCall,
  encodeCall,
  encodeBuy,
  encodeSell,
  encodeAtomicizedBuy,
  encodeAtomicizedSell
} from './utils/schema'
import {
  requireOrdersCanMatch,
  MAX_ERROR_LENGTH,
  requireOrderCalldataCanMatch,
} from './debugging'
import { BigNumber } from 'bignumber.js'
import { EventEmitter, EventSubscription } from 'fbemitter'
import { isValidAddress } from 'ethereumjs-util'
import {
  CHEEZE_WIZARDS_BASIC_TOURNAMENT_ADDRESS,
  CHEEZE_WIZARDS_BASIC_TOURNAMENT_RINKEBY_ADDRESS,
  CHEEZE_WIZARDS_GUILD_ADDRESS,
  CHEEZE_WIZARDS_GUILD_RINKEBY_ADDRESS,
  CK_ADDRESS,
  CK_RINKEBY_ADDRESS,
  DECENTRALAND_ESTATE_ADDRESS,
  DEFAULT_BUYER_FEE_BASIS_POINTS,
  DEFAULT_GAS_INCREASE_FACTOR,
  DEFAULT_MAX_BOUNTY,
  DEFAULT_SELLER_FEE_BASIS_POINTS,
  DEFAULT_SELLER_FEE_BASIS_POINTS_FOR_SWAP,
  DEFAULT_WRAPPED_NFT_LIQUIDATION_UNISWAP_SLIPPAGE_IN_BASIS_POINTS,
  INVERSE_BASIS_POINT, MAINNET_PROVIDER_URL,
  MIN_EXPIRATION_SECONDS, NULL_ADDRESS, NULL_BLOCK_HASH, SWAPPABLE_FEE_RECIPIENT,
  SWAPPABLE_SELLER_BOUNTY_BASIS_POINTS,
  ORDER_MATCHING_LATENCY_SECONDS, RINKEBY_PROVIDER_URL,
  SELL_ORDER_BATCH_SIZE,
  STATIC_CALL_CHEEZE_WIZARDS_ADDRESS,
  STATIC_CALL_CHEEZE_WIZARDS_RINKEBY_ADDRESS,
  STATIC_CALL_DECENTRALAND_ESTATES_ADDRESS,
  STATIC_CALL_TX_ORIGIN_ADDRESS,
  STATIC_CALL_TX_ORIGIN_RINKEBY_ADDRESS,
  UNISWAP_FACTORY_ADDRESS_MAINNET,
  UNISWAP_FACTORY_ADDRESS_RINKEBY,
  WRAPPED_NFT_FACTORY_ADDRESS_MAINNET,
  WRAPPED_NFT_FACTORY_ADDRESS_RINKEBY,
  WRAPPED_NFT_LIQUIDATION_PROXY_ADDRESS_MAINNET,
  WRAPPED_NFT_LIQUIDATION_PROXY_ADDRESS_RINKEBY,
  ENJIN_COIN_ADDRESS,
  MANA_ADDRESS,
  SWAP_TOKEN_ADDRESS,
  SWAP_TOKEN_RINKEBY_ADDRESS,
  MATIC_PROVIDER_URL,
  MUMBAI_PROVIDER_URL,
  STATIC_CALL_TX_ORIGIN_MATIC_ADDRESS,
  STATIC_CALL_TX_ORIGIN_MUMBAI_ADDRESS,
  SWAP_TOKEN_ADDRESS_MATIC_MAINNET,
  SWAP_TOKEN_ADDRESS_MATIC_MUMBAI,
  WYVERN_EXCHANGE_ADDRESS_MAINNET,
  WYVERN_EXCHANGE_ADDRESS_MAINNET_V1,
  WYVERN_EXCHANGE_ADDRESS_RINKEBY,
  WYVERN_EXCHANGE_ADDRESS_RINKEBY_V1,
  WYVERN_EXCHANGE_ADDRESS_MATIC,
  WYVERN_EXCHANGE_ADDRESS_MATIC_V1,
  WYVERN_EXCHANGE_ADDRESS_MUMBAI,
  WYVERN_EXCHANGE_ADDRESS_MUMBAI_V1
} from './constants'

export class SwappablePort {

  // Web3 instance to use
  public web3: Web3
  public web3ReadOnly: Web3
  // Logger function to use when debugging
  public logger: (arg: string) => void
  // API instance on this seaport
  public readonly api: SwappableAPI
  // Extra gwei to add to the mean gas price when making transactions
  public gasPriceAddition = new BigNumber(3)
  // Multiply gas estimate by this factor when making transactions
  public gasIncreaseFactor = DEFAULT_GAS_INCREASE_FACTOR

  private _networkName: Network
  private _wyvernProtocol: WyvernProtocol
  private _wyvernProtocolReadOnly: WyvernProtocol
  private _emitter: EventEmitter
  private _wrappedNFTFactoryAddress: string
  private _wrappedNFTLiquidationProxyAddress: string
  private _uniswapFactoryAddress: string

  /**
   * Your very own seaport.
   * Create a new instance of SwappableJS.
   * @param provider Web3 Provider to use for transactions. For example:
   *  `const provider = new Web3.providers.HttpProvider('https://mainnet.infura.io')`
   * @param apiConfig configuration options, including `networkName`
   * @param logger logger, optional, a function that will be called with debugging
   *  information
   */
  constructor(provider: Web3.Provider, apiConfig: SwappableAPIConfig = {}, logger?: (arg: string) => void) {

    // API config
    apiConfig.networkName = apiConfig.networkName || Network.Main
    apiConfig.gasPrice = apiConfig.gasPrice || makeBigNumber(300000)
    this.api = new SwappableAPI(apiConfig)

    this._networkName = apiConfig.networkName
    let providerURL = RINKEBY_PROVIDER_URL;
    switch (this._networkName) {
      case Network.Mumbai:
        providerURL = MUMBAI_PROVIDER_URL
        break
      case Network.Main:
        providerURL = MAINNET_PROVIDER_URL
        break
      case Network.Matic:
        providerURL = MATIC_PROVIDER_URL
      default:
        break
    }
    const readonlyProvider = new Web3.providers.HttpProvider(providerURL)

    // Web3 Config
    this.web3 = new Web3(provider)
    this.web3ReadOnly = new Web3(readonlyProvider)

    // WyvernJS config
    this._wyvernProtocol = new WyvernProtocol(provider, {
      network: this._networkName,
      gasPrice: apiConfig.gasPrice,
    })

    // WyvernJS config for readonly (optimization for infura calls)
    this._wyvernProtocolReadOnly = new WyvernProtocol(readonlyProvider, {
      network: this._networkName,
      gasPrice: apiConfig.gasPrice,
    })

    // WrappedNFTLiquidationProxy Config
    this._wrappedNFTFactoryAddress = this._networkName == Network.Main ? WRAPPED_NFT_FACTORY_ADDRESS_MAINNET : WRAPPED_NFT_FACTORY_ADDRESS_RINKEBY
    this._wrappedNFTLiquidationProxyAddress = this._networkName == Network.Main ? WRAPPED_NFT_LIQUIDATION_PROXY_ADDRESS_MAINNET : WRAPPED_NFT_LIQUIDATION_PROXY_ADDRESS_RINKEBY
    this._uniswapFactoryAddress = this._networkName == Network.Main ? UNISWAP_FACTORY_ADDRESS_MAINNET : UNISWAP_FACTORY_ADDRESS_RINKEBY

    // Emit events
    this._emitter = new EventEmitter()

    // Debugging: default to nothing
    this.logger = logger || ((arg: string) => arg)
  }

  /**
   * Add a listener to a marketplace event
   * @param event An event to listen for
   * @param listener A callback that will accept an object with event data
   * @param once Whether the listener should only be called once
   */
  public addListener(event: EventType, listener: (data: EventData) => void, once = false): EventSubscription {
    const subscription = once
      ? this._emitter.once(event, listener)
      : this._emitter.addListener(event, listener)
    return subscription
  }

  /**
   * Remove an event listener, included here for completeness.
   * Simply calls `.remove()` on a subscription
   * @param subscription The event subscription returned from `addListener`
   */
  public removeListener(subscription: EventSubscription) {
    subscription.remove()
  }

  /**
   * Remove all event listeners. Good idea to call this when you're unmounting
   * a component that listens to events to make UI updates
   * @param event Optional EventType to remove listeners for
   */
  public removeAllListeners(event?: EventType) {
    this._emitter.removeAllListeners(event)
  }

  /**
   * Wraps an arbirary group of NFTs into their corresponding WrappedNFT ERC20 tokens.
   * Emits the `WrapAssets` event when the transaction is prompted.
   * @param param0 __namedParameters Object
   * @param assets An array of objects with the tokenId and tokenAddress of each of the assets to bundle together.
   * @param accountAddress Address of the user's wallet
   */
  public async wrapAssets(
      { assets, accountAddress }:
      { assets: Asset[];
        accountAddress: string; }
    ) {

    const schema = this._getSchema(WyvernSchemaName.ERC721)
    const wyAssets = assets.map(a => getWyvernAsset(schema, a))

    // Separate assets out into two arrays of tokenIds and tokenAddresses
    const tokenIds = wyAssets.map(a => a.id)
    const tokenAddresses = wyAssets.map(a => a.address)

    // Check if all tokenAddresses match. If not, then we have a mixedBatch of
    // NFTs from different NFT core contracts
    const isMixedBatchOfAssets: boolean = !tokenAddresses.every( (val, i, arr) => val === arr[0] )

    this._dispatch(EventType.WrapAssets, { assets: wyAssets, accountAddress })

    const gasPrice:any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: this._wrappedNFTLiquidationProxyAddress,
      value: 0,
      data: encodeCall(getMethod(WrappedNFTLiquidationProxy, 'wrapNFTs'),
        [tokenIds, tokenAddresses, isMixedBatchOfAssets]),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.WrapAssets, "Wrapping Assets")
  }

  /**
   * Unwraps an arbirary group of NFTs from their corresponding WrappedNFT ERC20 tokens back into ERC721 tokens.
   * Emits the `UnwrapAssets` event when the transaction is prompted.
   * @param param0 __namedParameters Object
   * @param assets An array of objects with the tokenId and tokenAddress of each of the assets to bundle together.
   * @param destinationAddresses Addresses that each resulting ERC721 token will be sent to. Must be the same length as `tokenIds`. Each address corresponds with its respective token ID in the `tokenIds` array.
   * @param accountAddress Address of the user's wallet
   */
  public async unwrapAssets(
      { assets, destinationAddresses, accountAddress }:
      { assets: Asset[];
        destinationAddresses: string[];
        accountAddress: string; }
    ) {

    if (!assets || !destinationAddresses || assets.length != destinationAddresses.length) {
      throw new Error("The 'assets' and 'destinationAddresses' arrays must exist and have the same length.")
    }

    const schema = this._getSchema(WyvernSchemaName.ERC721)
    const wyAssets = assets.map(a => getWyvernAsset(schema, a))

    // Separate assets out into two arrays of tokenIds and tokenAddresses
    const tokenIds = wyAssets.map(a => a.id)
    const tokenAddresses = wyAssets.map(a => a.address)

    // Check if all tokenAddresses match. If not, then we have a mixedBatch of
    // NFTs from different NFT core contracts
    const isMixedBatchOfAssets: boolean = !tokenAddresses.every( (val, i, arr) => val === arr[0] )

    this._dispatch(EventType.UnwrapAssets, { assets: wyAssets, accountAddress })

    const gasPrice:any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: this._wrappedNFTLiquidationProxyAddress,
      value: 0,
      data: encodeCall(getMethod(WrappedNFTLiquidationProxy, 'unwrapNFTs'),
        [tokenIds, tokenAddresses, destinationAddresses, isMixedBatchOfAssets]),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.UnwrapAssets, "Unwrapping Assets")
  }

  /**
   * Liquidates an arbirary group of NFTs by atomically wrapping them into their
   * corresponding WrappedNFT ERC20 tokens, and then immediately selling those
   * ERC20 tokens on their corresponding Uniswap exchange.
   * Emits the `LiquidateAssets` event when the transaction is prompted.
   * @param param0 __namedParameters Object
   * @param assets An array of objects with the tokenId and tokenAddress of each of the assets to bundle together.
   * @param accountAddress Address of the user's wallet
   * @param uniswapSlippageAllowedInBasisPoints The amount of slippage that a user will tolerate in their Uniswap trade; if Uniswap cannot fulfill the order without more slippage, the whole function will revert.
   */
  public async liquidateAssets(
      { assets, accountAddress, uniswapSlippageAllowedInBasisPoints }:
      { assets: Asset[];
        accountAddress: string;
        uniswapSlippageAllowedInBasisPoints: number; }
    ) {

    // If no slippage parameter is provided, use a sane default value
    const uniswapSlippage = uniswapSlippageAllowedInBasisPoints === 0 ? DEFAULT_WRAPPED_NFT_LIQUIDATION_UNISWAP_SLIPPAGE_IN_BASIS_POINTS : uniswapSlippageAllowedInBasisPoints

    const schema = this._getSchema(WyvernSchemaName.ERC721)
    const wyAssets = assets.map(a => getWyvernAsset(schema, a))

    // Separate assets out into two arrays of tokenIds and tokenAddresses
    const tokenIds = wyAssets.map(a => a.id)
    const tokenAddresses = wyAssets.map(a => a.address)

    // Check if all tokenAddresses match. If not, then we have a mixedBatch of
    // NFTs from different NFT core contracts
    const isMixedBatchOfAssets: boolean = !tokenAddresses.every( (val, i, arr) => val === arr[0] )

    this._dispatch(EventType.LiquidateAssets, { assets: wyAssets, accountAddress })

    const gasPrice: any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: this._wrappedNFTLiquidationProxyAddress,
      value: 0,
      data: encodeCall(getMethod(WrappedNFTLiquidationProxy, 'liquidateNFTs'),
        [tokenIds, tokenAddresses, isMixedBatchOfAssets, uniswapSlippage]),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.LiquidateAssets, "Liquidating Assets")
  }

  /**
   * Purchases a bundle of WrappedNFT tokens from Uniswap and then unwraps them into ERC721 tokens.
   * Emits the `PurchaseAssets` event when the transaction is prompted.
   * @param param0 __namedParameters Object
   * @param numTokensToBuy The number of WrappedNFT tokens to purchase and unwrap
   * @param amount The estimated cost in wei for tokens (probably some ratio above the minimum amount to avoid the transaction failing due to frontrunning, minimum amount is found by calling UniswapExchange(uniswapAddress).getEthToTokenOutputPrice(numTokensToBuy.mul(10**18));
   * @param contractAddress Address of the corresponding NFT core contract for these NFTs.
   * @param accountAddress Address of the user's wallet
   */
  public async purchaseAssets(
      { numTokensToBuy, amount, contractAddress, accountAddress }:
      { numTokensToBuy: number;
        amount: BigNumber;
        contractAddress: string;
        accountAddress: string; }
    ) {

    const token = WyvernSchemas.tokens[this._networkName].canonicalWrappedEther

    this._dispatch(EventType.PurchaseAssets, { amount, contractAddress, accountAddress })

    const gasPrice:any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: this._wrappedNFTLiquidationProxyAddress,
      value: amount.toString(),
      data: encodeCall(getMethod(WrappedNFTLiquidationProxy, 'purchaseNFTs'),
        [numTokensToBuy, contractAddress]),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.PurchaseAssets, "Purchasing Assets")
  }

  /**
   * Gets the estimated cost or payout of either buying or selling NFTs to Uniswap using either purchaseAssts() or liquidateAssets()
   * @param param0 __namedParameters Object
   * @param numTokens The number of WrappedNFT tokens to either purchase or sell
   * @param isBuying A bool for whether the user is buying or selling
   * @param contractAddress Address of the corresponding NFT core contract for these NFTs.
   */
  public async getQuoteFromUniswap(
      { numTokens, isBuying, contractAddress }:
      { numTokens: number;
        isBuying: boolean;
        contractAddress: string; }
    ) {

    // Get UniswapExchange for WrappedNFTContract for contractAddress
    const wrappedNFTFactoryContract = this.web3.eth.contract(WrappedNFTFactory as any[])
    const wrappedNFTFactory = await wrappedNFTFactoryContract.at(this._wrappedNFTFactoryAddress)
    const wrappedNFTAddress = await wrappedNFTFactory.nftContractToWrapperContract(contractAddress)
    const wrappedNFTContract = this.web3.eth.contract(WrappedNFT as any[])
    const wrappedNFT = await wrappedNFTContract.at(wrappedNFTAddress)
    const uniswapFactoryContract = this.web3.eth.contract(UniswapFactory as any[])
    const uniswapFactory = await uniswapFactoryContract.at(this._uniswapFactoryAddress)
    const uniswapExchangeAddress = await uniswapFactory.getExchange(wrappedNFTAddress)
    const uniswapExchangeContract = this.web3.eth.contract(UniswapExchange as any[])
    const uniswapExchange = await uniswapExchangeContract.at(uniswapExchangeAddress)

    // Convert desired WNFT to wei
    const amount = WyvernProtocol.toBaseUnitAmount(makeBigNumber(numTokens), wrappedNFT.decimals())

    // Return quote from Uniswap
    if (isBuying) {
      return parseInt(await uniswapExchange.getEthToTokenOutputPrice(amount))
    } else {
      return parseInt(await uniswapExchange.getTokenToEthInputPrice(amount))
    }

  }

  /**
   * Wrap ETH into W-ETH.
   * W-ETH is needed for placing buy orders (making offers).
   * Emits the `WrapEth` event when the transaction is prompted.
   * @param param0 __namedParameters Object
   * @param amountInEth How much ether to wrap
   * @param accountAddress Address of the user's wallet containing the ether
   */
  public async wrapEth(
      { amountInEth, accountAddress }:
      { amountInEth: number; accountAddress: string }
    ) {

    const token = WyvernSchemas.tokens[this._networkName].canonicalWrappedEther

    const amount = WyvernProtocol.toBaseUnitAmount(makeBigNumber(amountInEth), token.decimals)

    this._dispatch(EventType.WrapEth, { accountAddress, amount })

    const gasPrice:any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: token.address,
      value: amount.toString(),
      data: encodeCall(getMethod(CanonicalWETH, 'deposit'), []),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.WrapEth, "Wrapping ETH")
  }

  /**
   * Unwrap W-ETH into ETH.
   * Emits the `UnwrapWeth` event when the transaction is prompted.
   * @param param0 __namedParameters Object
   * @param amountInEth How much W-ETH to unwrap
   * @param accountAddress Address of the user's wallet containing the W-ETH
   */
  public async unwrapWeth(
      { amountInEth, accountAddress }:
      { amountInEth: number; accountAddress: string }
    ) {

    const token = WyvernSchemas.tokens[this._networkName].canonicalWrappedEther

    const amount = WyvernProtocol.toBaseUnitAmount(makeBigNumber(amountInEth), token.decimals)

    this._dispatch(EventType.UnwrapWeth, { accountAddress, amount })

    const gasPrice:any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: token.address,
      value: 0,
      data: encodeCall(getMethod(CanonicalWETH, 'withdraw'), [amount.toString()]),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.UnwrapWeth, "Unwrapping W-ETH")
  }

  /**
   * Create a buy order to make an offer on a bundle or group of assets.
   * Will throw an 'Insufficient balance' error if the maker doesn't have enough W-ETH to make the offer.
   * If the user hasn't approved W-ETH access yet, this will emit `ApproveCurrency` before asking for approval.
   * @param param0 __namedParameters Object
   * @param assets Array of Asset objects to bid on
   * @param collection Optional collection for computing fees, required only if all assets belong to the same collection
   * @param quantities The quantity of each asset to sell. Defaults to 1 for each.
   * @param accountAddress Address of the maker's wallet
   * @param startAmount Value of the offer, in units of the payment token (or wrapped ETH if no payment token address specified)
   * @param expirationTime Expiration time for the order, in seconds. An expiration time of 0 means "never expire"
   * @param paymentTokenAddress Optional address for using an ERC-20 token in the order. If unspecified, defaults to W-ETH
   * @param sellOrder Optional sell order (like an English auction) to ensure fee and schema compatibility
   * @param referrerAddress The optional address that referred the order
   */
  public async createBundleBuyOrder(
      {  assets, collection, quantities, accountAddress, startAmount, expirationTime = 0, paymentTokenAddress, sellOrder, referrerAddress }:
      { assets: Asset[];
        collection?: { slug: string };
        quantities?: number[];
        accountAddress: string;
        startAmount: number;
        expirationTime?: number;
        paymentTokenAddress?: string;
        sellOrder?: Order;
        referrerAddress?: string; }
    ): Promise<Order> {

    // Default to 1 of each asset
    quantities = quantities || assets.map(a => 1)
    paymentTokenAddress = paymentTokenAddress || WyvernSchemas.tokens[this._networkName].canonicalWrappedEther.address

    const order = await this._makeBundleBuyOrder({
      assets,
      collection,
      quantities,
      accountAddress,
      startAmount,
      expirationTime,
      paymentTokenAddress,
      extraBountyBasisPoints: 0,
      sellOrder,
      referrerAddress
    })

    // NOTE not in Wyvern exchange code:
    // frontend checks to make sure
    // token is approved and sufficiently available
    await this._buyOrderValidationAndApprovals({ order, accountAddress })

    const hashedOrder = {
      ...order,
      hash: getOrderHash(order)
    }
    let signature
    try {
      signature = await this._authorizeOrder(hashedOrder)
    } catch (error) {
      console.error(error)
      throw new Error("You declined to authorize your offer")
    }

    const orderWithSignature = {
      ...hashedOrder,
      ...signature
    }
    return this.validateAndPostOrder(orderWithSignature)
  }

  /**
   * Create a buy order to make an offer on an asset.
   * Will throw an 'Insufficient balance' error if the maker doesn't have enough W-ETH to make the offer.
   * If the user hasn't approved W-ETH access yet, this will emit `ApproveCurrency` before asking for approval.
   * @param param0 __namedParameters Object
   * @param asset The asset to trade
   * @param accountAddress Address of the maker's wallet
   * @param startAmount Value of the offer, in units of the payment token (or wrapped ETH if no payment token address specified)
   * @param quantity The number of assets to bid for (if fungible or semi-fungible). Defaults to 1. In units, not base units, e.g. not wei.
   * @param expirationTime Expiration time for the order, in seconds. An expiration time of 0 means "never expire"
   * @param paymentTokenAddress Optional address for using an ERC-20 token in the order. If unspecified, defaults to W-ETH
   * @param sellOrder Optional sell order (like an English auction) to ensure fee and schema compatibility
   * @param referrerAddress The optional address that referred the order
   */
  public async createBuyOrder(
      { asset, accountAddress, startAmount, quantity = 1, expirationTime = 0, paymentTokenAddress, sellOrder, referrerAddress }:
      { asset: Asset;
        accountAddress: string;
        startAmount: number;
        quantity?: number;
        expirationTime?: number;
        paymentTokenAddress?: string;
        sellOrder?: Order;
        referrerAddress?: string; }
    ): Promise<Order> {

    paymentTokenAddress = paymentTokenAddress || WyvernSchemas.tokens[this._networkName].canonicalWrappedEther.address

    const order = await this._makeBuyOrder({
      asset,
      quantity,
      accountAddress,
      startAmount,
      expirationTime,
      paymentTokenAddress,
      extraBountyBasisPoints: 0,
      sellOrder,
      referrerAddress
    })

    // NOTE not in Wyvern exchange code:
    // frontend checks to make sure
    // token is approved and sufficiently available
    await this._buyOrderValidationAndApprovals({ order, accountAddress })

    const hashedOrder = {
      ...order,
      hash: getOrderHash(order)
    }
    let signature
    try {
      signature = await this._authorizeOrder(hashedOrder)
    } catch (error) {
      console.error(error)
      throw new Error("You declined to authorize your offer")
    }

    const orderWithSignature = {
      ...hashedOrder,
      ...signature
    }
    return this.validateAndPostOrder(orderWithSignature)
  }

  /**
   * Create a sell order to auction an asset.
   * Will throw a 'You do not own enough of this asset' error if the maker doesn't have the asset or not enough of it to sell the specific `quantity`.
   * If the user hasn't approved access to the token yet, this will emit `ApproveAllAssets` (or `ApproveAsset` if the contract doesn't support approve-all) before asking for approval.
   * @param param0 __namedParameters Object
   * @param tokenId DEPRECATED: Token ID. Use `asset` instead.
   * @param tokenAddress DEPRECATED: Address of the token's contract. Use `asset` instead.
   * @param asset The asset to trade
   * @param accountAddress Address of the maker's wallet
   * @param startAmount Price of the asset at the start of the auction. Units are in the amount of a token above the token's decimal places (integer part). For example, for ether, expected units are in ETH, not wei.
   * @param endAmount Optional price of the asset at the end of its expiration time. Units are in the amount of a token above the token's decimal places (integer part). For example, for ether, expected units are in ETH, not wei.
   * @param quantity The number of assets to sell (if fungible or semi-fungible). Defaults to 1. In units, not base units, e.g. not wei.
   * @param expirationTime Expiration time for the order, in seconds. An expiration time of 0 means "never expire."
   * @param waitForHighestBid If set to true, this becomes an English auction that increases in price for every bid. The highest bid wins when the auction expires, as long as it's at least `startAmount`. `expirationTime` must be > 0.
   * @param englishAuctionReservePrice Optional price level, below which orders may be placed but will not be matched.  Orders below the reserve can be manually accepted but will not be automatically matched.
   * @param paymentTokenAddress Address of the ERC-20 token to accept in return. If undefined or null, uses Ether.
   * @param extraBountyBasisPoints Optional basis points (1/100th of a percent) to reward someone for referring the fulfillment of this order
   * @param buyerAddress Optional address that's allowed to purchase this item. If specified, no other address will be able to take the order, unless its value is the null address.
   * @param buyerEmail Optional email of the user that's allowed to purchase this item. If specified, a user will have to verify this email before being able to take the order.
   */
  public async createSellOrder(
      { asset, accountAddress, startAmount, endAmount, quantity = 1, expirationTime = 0, waitForHighestBid = false, englishAuctionReservePrice, paymentTokenAddress, extraBountyBasisPoints = 0, buyerAddress, buyerEmail, payouts }:
      { asset: Asset;
        accountAddress: string;
        startAmount: number;
        endAmount?: number;
        quantity?: number;
        expirationTime?: number;
        waitForHighestBid?: boolean;
        englishAuctionReservePrice?: number;
        paymentTokenAddress?: string;
        extraBountyBasisPoints?: number;
        buyerAddress?: string;
        buyerEmail?: string;
        payouts?: Array<Part> }
    ): Promise<Order> {

    const order = await this._makeSellOrder({
      asset,
      quantity,
      accountAddress,
      startAmount,
      endAmount,
      expirationTime,
      waitForHighestBid,
      englishAuctionReservePrice,
      paymentTokenAddress: paymentTokenAddress || NULL_ADDRESS,
      extraBountyBasisPoints,
      buyerAddress: buyerAddress || NULL_ADDRESS,
      payouts: payouts || []
    })

    await this._sellOrderValidationAndApprovals({ order, accountAddress })

    if (buyerEmail) {
      await this._createEmailWhitelistEntry({ order, buyerEmail })
    }

    const hashedOrder = {
      ...order,
      hash: getOrderHash(order)
    }
    let signature
    try {
      signature = await this._authorizeOrder(hashedOrder)
    } catch (error) {
      console.error(error)
      throw new Error("You declined to authorize your auction")
    }

    const orderWithSignature = {
      ...hashedOrder,
      ...signature
    }

    return this.validateAndPostOrder(orderWithSignature)
  }

  /**
   * Create multiple sell orders in bulk to auction assets out of an asset factory.
   * Will throw a 'You do not own this asset' error if the maker doesn't own the factory.
   * Items will mint to users' wallets only when they buy them. See https://docs.swappable.io/docs/swappable-initial-item-sale-tutorial for more info.
   * If the user hasn't approved access to the token yet, this will emit `ApproveAllAssets` (or `ApproveAsset` if the contract doesn't support approve-all) before asking for approval.
   * @param param0 __namedParameters Object
   * @param assets Which assets you want to post orders for. Use the tokenAddress of your factory contract
   * @param accountAddress Address of the factory owner's wallet
   * @param startAmount Price of the asset at the start of the auction, or minimum acceptable bid if it's an English auction. Units are in the amount of a token above the token's decimal places (integer part). For example, for ether, expected units are in ETH, not wei.
   * @param endAmount Optional price of the asset at the end of its expiration time. If not specified, will be set to `startAmount`. Units are in the amount of a token above the token's decimal places (integer part). For example, for ether, expected units are in ETH, not wei.
   * @param quantity The number of assets to sell at one time (if fungible or semi-fungible). Defaults to 1. In units, not base units, e.g. not wei.
   * @param expirationTime Expiration time for the order, in seconds. An expiration time of 0 means "never expire."
   * @param waitForHighestBid If set to true, this becomes an English auction that increases in price for every bid. The highest bid wins when the auction expires, as long as it's at least `startAmount`. `expirationTime` must be > 0.
   * @param paymentTokenAddress Address of the ERC-20 token to accept in return. If undefined or null, uses Ether.
   * @param extraBountyBasisPoints Optional basis points (1/100th of a percent) to reward someone for referring the fulfillment of each order
   * @param buyerAddress Optional address that's allowed to purchase each item. If specified, no other address will be able to take each order.
   * @param buyerEmail Optional email of the user that's allowed to purchase each item. If specified, a user will have to verify this email before being able to take each order.
   * @param numberOfOrders Number of times to repeat creating the same order for each asset. If greater than 5, creates them in batches of 5. Requires an `apiKey` to be set during seaport initialization in order to not be throttled by the API.
   * @returns The number of orders created in total
   */
  public async createFactorySellOrders(
      { assets, accountAddress, startAmount, endAmount, quantity = 1, expirationTime = 0, waitForHighestBid = false, paymentTokenAddress, extraBountyBasisPoints = 0, buyerAddress, buyerEmail, numberOfOrders = 1, payouts }:
      { assets: Asset[];
        accountAddress: string;
        startAmount: number;
        endAmount?: number;
        quantity?: number;
        expirationTime?: number;
        waitForHighestBid?: boolean;
        paymentTokenAddress?: string;
        extraBountyBasisPoints?: number;
        buyerAddress?: string;
        buyerEmail?: string;
        numberOfOrders?: number;
        payouts: Array<Part> }
    ): Promise<number> {

    if (numberOfOrders < 1) {
      throw new Error('Need to make at least one sell order')
    }

    if (!assets || !assets.length) {
      throw new Error('Need at least one asset to create orders for')
    }

    if (_.uniqBy(assets, a => a.tokenAddress).length !== 1) {
      throw new Error('All assets must be on the same factory contract address')
    }

    // Validate just a single dummy order but don't post it
    const dummyOrder = await this._makeSellOrder({
      asset: assets[0],
      quantity,
      accountAddress,
      startAmount,
      endAmount,
      expirationTime,
      waitForHighestBid,
      paymentTokenAddress: paymentTokenAddress || NULL_ADDRESS,
      extraBountyBasisPoints,
      buyerAddress: buyerAddress || NULL_ADDRESS,
      payouts
    })
    await this._sellOrderValidationAndApprovals({ order: dummyOrder, accountAddress })

    const _makeAndPostOneSellOrder = async (asset: Asset) => {
      const order = await this._makeSellOrder({
        asset,
        quantity,
        accountAddress,
        startAmount,
        endAmount,
        expirationTime,
        waitForHighestBid,
        paymentTokenAddress: paymentTokenAddress || NULL_ADDRESS,
        extraBountyBasisPoints,
        buyerAddress: buyerAddress || NULL_ADDRESS,
        payouts
      })

      if (buyerEmail) {
        await this._createEmailWhitelistEntry({ order, buyerEmail })
      }

      const hashedOrder = {
        ...order,
        hash: getOrderHash(order)
      }
      let signature
      try {
        signature = await this._authorizeOrder(hashedOrder)
      } catch (error) {
        console.error(error)
        throw new Error("You declined to authorize your auction, or your web3 provider can't sign using personal_sign. Try 'web3-provider-engine' and make sure a mnemonic is set. Just a reminder: there's no gas needed anymore to mint tokens!")
      }

      const orderWithSignature = {
        ...hashedOrder,
        ...signature
      }

      return this.validateAndPostOrder(orderWithSignature)
    }

    const range = _.range(numberOfOrders * assets.length)
    const batches  = _.chunk(range, SELL_ORDER_BATCH_SIZE)
    let numOrdersCreated = 0

    for (const subRange of batches) {
      // subRange = e.g. [5, 6, 7, 8, 9]
      // batches of assets = e.g. [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, ... 10]

      // Will block until all SELL_ORDER_BATCH_SIZE orders
      // have come back in parallel
      const batchOrdersCreated = await Promise.all(subRange.map(async assetOrderIndex => {
        const assetIndex = Math.floor(assetOrderIndex / numberOfOrders)
        return _makeAndPostOneSellOrder(assets[assetIndex])
      }))

      this.logger(`Created and posted a batch of ${batchOrdersCreated.length} orders in parallel.`)

      numOrdersCreated += batchOrdersCreated.length

      // Don't overwhelm router
      await delay(500)
    }

    return numOrdersCreated
  }

  /**
   * Create a sell order to auction a bundle of assets.
   * Will throw a 'You do not own this asset' error if the maker doesn't have one of the assets.
   * If the user hasn't approved access to any of the assets yet, this will emit `ApproveAllAssets` (or `ApproveAsset` if the contract doesn't support approve-all) before asking for approval for each asset.
   * @param param0 __namedParameters Object
   * @param bundleName Name of the bundle
   * @param bundleDescription Optional description of the bundle. Markdown is allowed.
   * @param bundleExternalLink Optional link to a page that adds context to the bundle.
   * @param assets An array of objects with the tokenId and tokenAddress of each of the assets to bundle together.
   * @param collection Optional collection for computing fees, required only if all assets belong to the same collection
   * @param quantities The quantity of each asset to sell. Defaults to 1 for each.
   * @param accountAddress The address of the maker of the bundle and the owner of all the assets.
   * @param startAmount Price of the asset at the start of the auction, or minimum acceptable bid if it's an English auction.
   * @param endAmount Optional price of the asset at the end of its expiration time. If not specified, will be set to `startAmount`.
   * @param expirationTime Expiration time for the order, in seconds. An expiration time of 0 means "never expire."
   * @param waitForHighestBid If set to true, this becomes an English auction that increases in price for every bid. The highest bid wins when the auction expires, as long as it's at least `startAmount`. `expirationTime` must be > 0.
   * @param englishAuctionReservePrice Optional price level, below which orders may be placed but will not be matched.  Orders below the reserve can be manually accepted but will not be automatically matched.
   * @param paymentTokenAddress Address of the ERC-20 token to accept in return. If undefined or null, uses Ether.
   * @param extraBountyBasisPoints Optional basis points (1/100th of a percent) to reward someone for referring the fulfillment of this order
   * @param buyerAddress Optional address that's allowed to purchase this bundle. If specified, no other address will be able to take the order, unless it's the null address.
   */
  public async createBundleSellOrder(
      { bundleName, bundleDescription, bundleExternalLink, assets, collection, quantities, accountAddress, startAmount, endAmount, expirationTime = 0, waitForHighestBid = false, englishAuctionReservePrice, paymentTokenAddress, extraBountyBasisPoints = 0, buyerAddress }:
      { bundleName: string;
        bundleDescription?: string;
        bundleExternalLink?: string;
        assets: Asset[];
        collection?: { slug: string };
        quantities?: number[];
        accountAddress: string;
        startAmount: number;
        endAmount?: number;
        expirationTime?: number;
        waitForHighestBid?: boolean;
        englishAuctionReservePrice?: number;
        paymentTokenAddress?: string;
        extraBountyBasisPoints?: number;
        buyerAddress?: string; }
    ): Promise<Order> {

    // Default to one of each asset
    quantities = quantities || assets.map(a => 1)

    const order = await this._makeBundleSellOrder({
      bundleName,
      bundleDescription,
      bundleExternalLink,
      assets,
      collection,
      quantities,
      accountAddress,
      startAmount,
      endAmount,
      expirationTime,
      waitForHighestBid,
      englishAuctionReservePrice,
      paymentTokenAddress: paymentTokenAddress || NULL_ADDRESS,
      extraBountyBasisPoints,
      buyerAddress: buyerAddress || NULL_ADDRESS,
    })

    await this._sellOrderValidationAndApprovals({ order, accountAddress })

    const hashedOrder = {
      ...order,
      hash: getOrderHash(order)
    }
    let signature
    try {
      signature = await this._authorizeOrder(hashedOrder)
    } catch (error) {
      console.error(error)
      throw new Error("You declined to authorize your auction")
    }

    const orderWithSignature = {
      ...hashedOrder,
      ...signature
    }

    return this.validateAndPostOrder(orderWithSignature)
  }

  /**
   * Fullfill or "take" an order for an asset, either a buy or sell order
   * @param param0 __namedParamaters Object
   * @param order The order to fulfill, a.k.a. "take"
   * @param accountAddress The taker's wallet address
   * @param recipientAddress The optional address to receive the order's item(s) or curriencies. If not specified, defaults to accountAddress.
   * @param referrerAddress The optional address that referred the order
   * @returns Transaction hash for fulfilling the order
   */
  public async fulfillOrder(
      { order, accountAddress, recipientAddress, referrerAddress, payouts }:
      { order: Order;
        accountAddress: string;
        recipientAddress?: string;
        referrerAddress?: string; 
        payouts?: Array<Part>; }
    ): Promise<string> {
    const matchingOrder = this._makeMatchingOrder({
      order,
      accountAddress,
      recipientAddress: recipientAddress || accountAddress,
      devPayoutAddress: order.asset?.collection.payoutAddress,
      payouts: payouts || []
    })

    const { buy, sell } = assignOrdersToSides(order, matchingOrder)

    const metadata = this._getMetadata(order, referrerAddress)
    const transactionHash = await this._atomicMatch({ buy, sell, accountAddress, metadata })

    await this._confirmTransaction(transactionHash, EventType.MatchOrders, "Fulfilling order", async () => {
      const isOpen = await this._validateOrder(order)
      return !isOpen
    })
    return transactionHash
  }

  public async atomicMatch(
    { buy, sell, accountAddress, metadata = NULL_BLOCK_HASH }:
    { buy: Order; sell: Order; accountAddress: string; metadata?: string }
  ): Promise<string> {
    const transactionHash = await this._atomicMatch({ buy, sell, accountAddress, metadata })

    await this._confirmTransaction(transactionHash, EventType.MatchOrders, "Fulfilling order", async () => {
      const isOpen = await this._validateOrder(sell)
      return !isOpen
    })

    return transactionHash
  }

  /**
   * Cancel an order on-chain, preventing it from ever being fulfilled.
   * @param param0 __namedParameters Object
   * @param order The order to cancel
   * @param accountAddress The order maker's wallet address
   */
  public async cancelOrder(
      { order, accountAddress }:
      { order: Order;
        accountAddress: string}
    ) {

    this._dispatch(EventType.CancelOrder, { order, accountAddress })

    const gasPrice:any = await this._computeGasPrice()
    
    let transactionHash = ""

    if ( this._isOrderV1(order.exchange) ) {
      transactionHash = await this._wyvernProtocol.wyvernExchangeV1.cancelOrder(
      {
        exchange: order.exchange,
        maker: order.maker,
        taker: order.taker,
        makerRelayerFee: order.makerRelayerFee,
        takerRelayerFee: order.takerRelayerFee,
        makerProtocolFee: order.makerProtocolFee,
        takerProtocolFee: order.takerProtocolFee,
        feeRecipient: order.feeRecipient,
        feeMethod: order.feeMethod,
        side: order.side,
        saleKind: order.saleKind,
        target: order.target,
        howToCall: order.howToCall,
        calldatas: order.calldata,
        replacementPattern: order.replacementPattern,
        staticTarget: order.staticTarget,
        staticExtradata: order.staticExtradata,
        paymentToken: order.paymentToken,
        basePrice: order.basePrice,
        extra: order.extra,
        listingTime: order.listingTime,
        expirationTime: order.expirationTime,
        salt: order.salt,
        dataType: order.dataType,
        data: order.data
      },
      {
        v: order.v || 0,
        r: order.r || NULL_BLOCK_HASH,
        s: order.s || NULL_BLOCK_HASH
      }).sendTransactionAsync({ from: accountAddress, gasPrice })
    } else {
      transactionHash = await this._wyvernProtocol.wyvernExchange.cancelOrder_(
        [order.exchange, order.maker, order.taker, order.feeRecipient, order.target, order.staticTarget, order.paymentToken],
        [order.makerRelayerFee, order.takerRelayerFee, order.makerProtocolFee, order.takerProtocolFee, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt],
        order.feeMethod,
        order.side,
        order.saleKind,
        order.howToCall,
        order.calldata,
        order.replacementPattern,
        order.staticExtradata,
        order.v || 0,
        order.r || NULL_BLOCK_HASH,
        order.s || NULL_BLOCK_HASH
      )
      .sendTransactionAsync({ from: accountAddress, gasPrice })
    }

    await this._confirmTransaction(transactionHash.toString(), EventType.CancelOrder, "Cancelling order", async () => {
      const isOpen = await this._validateOrder(order)
      return !isOpen
    })
  }

  /**
   * Approve a non-fungible token for use in trades.
   * Requires an account to be initialized first.
   * Called internally, but exposed for dev flexibility.
   * Checks to see if already approved, first. Then tries different approval methods from best to worst.
   * @param param0 __namedParamters Object
   * @param tokenId Token id to approve, but only used if approve-all isn't
   *  supported by the token contract
   * @param tokenAddress The contract address of the token being approved
   * @param accountAddress The user's wallet address
   * @param proxyAddress Address of the user's proxy contract. If not provided,
   *  will attempt to fetch it from Wyvern.
   * @param tokenAbi ABI of the token's contract. Defaults to a flexible ERC-721
   *  contract.
   * @param skipApproveAllIfTokenAddressIn an optional list of token addresses that, if a token is approve-all type, will skip approval
   * @param schemaName The Wyvern schema name corresponding to the asset type
   * @returns Transaction hash if a new transaction was created, otherwise null
   */
  public async approveSemiOrNonFungibleToken(
      { tokenId,
        tokenAddress,
        accountAddress,
        proxyAddress,
        tokenAbi = ERC721,
        skipApproveAllIfTokenAddressIn = new Set(),
        schemaName = WyvernSchemaName.ERC721 }:
      { tokenId: string;
        tokenAddress: string;
        accountAddress: string;
        proxyAddress?: string;
        tokenAbi?: PartialReadonlyContractAbi;
        skipApproveAllIfTokenAddressIn?: Set<string>;
        schemaName?: WyvernSchemaName; }
    ): Promise<string | null> {

    const schema = this._getSchema(schemaName)
    const tokenContract = this.web3.eth.contract(tokenAbi as any[])
    const contract = await tokenContract.at(tokenAddress)

    if (!proxyAddress) {
      proxyAddress = await this._getProxy(accountAddress) || undefined
      if (!proxyAddress) {
        throw new Error('Uninitialized account')
      }
    }

    const approvalAllCheck = async () => {
      // NOTE:
      // Use this long way of calling so we can check for method existence on a bool-returning method.
      const isApprovedForAllRaw = await rawCall(this.web3ReadOnly, {
        from: accountAddress,
        to: contract.address,
        data: contract.isApprovedForAll.getData(accountAddress, proxyAddress)
      })
      return parseInt(isApprovedForAllRaw)
    }
    const isApprovedForAll = await approvalAllCheck()

    if (isApprovedForAll == 1) {
      // Supports ApproveAll
      this.logger('Already approved proxy for all tokens')
      return null
    }

    if (isApprovedForAll == 0) {
      // Supports ApproveAll
      //  not approved for all yet

      if (skipApproveAllIfTokenAddressIn.has(tokenAddress)) {
        this.logger('Already approving proxy for all tokens in another transaction')
        return null
      }
      skipApproveAllIfTokenAddressIn.add(tokenAddress)

      try {
        this._dispatch(EventType.ApproveAllAssets, {
          accountAddress,
          proxyAddress,
          contractAddress: tokenAddress
        })

        const gasPrice:any = await this._computeGasPrice()
        const txHash = await sendRawTransaction(this.web3, {
          from: accountAddress,
          to: contract.address,
          data: contract.setApprovalForAll.getData(proxyAddress, true),
          gasPrice
        }, error => {
          this._dispatch(EventType.TransactionDenied, { error, accountAddress })
        })
        await this._confirmTransaction(txHash, EventType.ApproveAllAssets, 'Approving all tokens of this type for trading', async () => {
          const result = await approvalAllCheck()
          return result == 1
        })
        return txHash
      } catch (error) {
        console.error(error)
        throw new Error("Couldn't get permission to approve these tokens for trading. Their contract might not be implemented correctly. Please contact the developer!")
      }
    }

    // Does not support ApproveAll (ERC721 v1 or v2)
    this.logger('Contract does not support Approve All')

    const approvalOneCheck = async () => {
      // Note: approvedAddr will be '0x' if not supported
      let approvedAddr = await promisifyCall<string>(c => contract.getApproved.call(tokenId, c))
      if (approvedAddr == proxyAddress) {
        this.logger('Already approved proxy for this token')
        return true
      }
      this.logger(`Approve response: ${approvedAddr}`)

      // SPECIAL CASING non-compliant contracts
      if (!approvedAddr) {
        approvedAddr = await getNonCompliantApprovalAddress(contract, tokenId, accountAddress)
        if (approvedAddr == proxyAddress) {
          this.logger('Already approved proxy for this item')
          return true
        }
        this.logger(`Special-case approve response: ${approvedAddr}`)
      }
      return false
    }

    const isApprovedForOne = await approvalOneCheck()
    if (isApprovedForOne) {
      return null
    }

    // Call `approve`

    try {
      this._dispatch(EventType.ApproveAsset, {
        accountAddress,
        proxyAddress,
        asset: getWyvernAsset(schema, { tokenId, tokenAddress })
      })

      const gasPrice:any = await this._computeGasPrice()
      const txHash = await sendRawTransaction(this.web3, {
        from: accountAddress,
        to: contract.address,
        data: contract.approve.getData(proxyAddress, tokenId),
        gasPrice
      }, error => {
        this._dispatch(EventType.TransactionDenied, { error, accountAddress })
      })

      await this._confirmTransaction(txHash, EventType.ApproveAsset, "Approving single token for trading", approvalOneCheck)
      return txHash
    } catch (error) {
      console.error(error)
      throw new Error("Couldn't get permission to approve this token for trading. Its contract might not be implemented correctly. Please contact the developer!")
    }
  }

  /**
   * Approve a fungible token (e.g. W-ETH) for use in trades.
   * Called internally, but exposed for dev flexibility.
   * Checks to see if the minimum amount is already approved, first.
   * @param param0 __namedParamters Object
   * @param accountAddress The user's wallet address
   * @param tokenAddress The contract address of the token being approved
   * @param proxyAddress The user's proxy address. If unspecified, uses the Wyvern token transfer proxy address.
   * @param minimumAmount The minimum amount needed to skip a transaction. Defaults to the max-integer.
   * @returns Transaction hash if a new transaction occurred, otherwise null
   */
  public async approveFungibleToken(
      { accountAddress,
        tokenAddress,
        proxyAddress,
        minimumAmount = WyvernProtocol.MAX_UINT_256 }:
      { accountAddress: string;
        tokenAddress: string;
        proxyAddress?: string;
        minimumAmount?: BigNumber }
    ): Promise<string | null> {
    proxyAddress = proxyAddress || WyvernProtocol.getTokenTransferProxyAddress(this._networkName)

    const approvedAmount = await this._getApprovedTokenCount({
      accountAddress,
      tokenAddress,
      proxyAddress
    })

    if (approvedAmount.isGreaterThanOrEqualTo(minimumAmount)) {
      this.logger('Already approved enough currency for trading')
      return null
    }

    this.logger(`Not enough token approved for trade: ${approvedAmount} approved to transfer ${tokenAddress}`)

    this._dispatch(EventType.ApproveCurrency, {
      accountAddress,
      contractAddress: tokenAddress,
      proxyAddress
    })

    const hasOldApproveMethod = [ENJIN_COIN_ADDRESS, MANA_ADDRESS].includes(tokenAddress.toLowerCase())

    if (minimumAmount.isGreaterThan(0) && hasOldApproveMethod) {
      // Older erc20s require initial approval to be 0
      await this.unapproveFungibleToken({ accountAddress, tokenAddress, proxyAddress })
    }

    const gasPrice:any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: tokenAddress,
      data: encodeCall(getMethod(ERC20, 'approve'),
        // Always approve maximum amount, to prevent the need for followup
        // transactions (and because old ERC20s like MANA/ENJ are non-compliant)
        [proxyAddress, WyvernProtocol.MAX_UINT_256.toString()]),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.ApproveCurrency, "Approving currency for trading", async () => {
      const newlyApprovedAmount = await this._getApprovedTokenCount({
        accountAddress,
        tokenAddress,
        proxyAddress
      })
      return newlyApprovedAmount.isGreaterThanOrEqualTo(minimumAmount)
    })
    return txHash
  }

  /**
   * Un-approve a fungible token (e.g. W-ETH) for use in trades.
   * Called internally, but exposed for dev flexibility.
   * Useful for old ERC20s that require a 0 approval count before
   * changing the count
   * @param param0 __namedParamters Object
   * @param accountAddress The user's wallet address
   * @param tokenAddress The contract address of the token being approved
   * @param proxyAddress The user's proxy address. If unspecified, uses the Wyvern token transfer proxy address.
   * @returns Transaction hash
   */
  public async unapproveFungibleToken(
    { accountAddress,
      tokenAddress,
      proxyAddress }:
    { accountAddress: string;
      tokenAddress: string;
      proxyAddress?: string; }
  ): Promise<string> {
    proxyAddress = proxyAddress || WyvernProtocol.getTokenTransferProxyAddress(this._networkName)

    const gasPrice:any = await this._computeGasPrice()

    const txHash = await sendRawTransaction(this.web3, {
      from: accountAddress,
      to: tokenAddress,
      data: encodeCall(getMethod(ERC20, 'approve'), [proxyAddress, 0]),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress })
    })

    await this._confirmTransaction(txHash, EventType.UnapproveCurrency, "Resetting Currency Approval", async () => {
      const newlyApprovedAmount = await this._getApprovedTokenCount({
        accountAddress,
        tokenAddress,
        proxyAddress
      })
      return newlyApprovedAmount.isZero()
    })
    return txHash
  }

  /**
   * Gets the price for the order using the contract
   * @param order The order to calculate the price for
   */
  public async getCurrentPrice(order: Order) {

    if ( this._isOrderV1(order.exchange) ) {
      return await this._wyvernProtocolReadOnly.wyvernExchangeV1.calculateCurrentPrice(
        {
          exchange: order.exchange,
          maker: order.maker,
          taker: order.taker,
          makerRelayerFee: order.makerRelayerFee,
          takerRelayerFee: order.takerRelayerFee,
          makerProtocolFee: order.makerProtocolFee,
          takerProtocolFee: order.takerProtocolFee,
          feeRecipient: order.feeRecipient,
          feeMethod: order.feeMethod,
          side: order.side,
          saleKind: order.saleKind,
          target: order.target,
          howToCall: order.howToCall,
          calldatas: order.calldata,
          replacementPattern: order.replacementPattern,
          staticTarget: order.staticTarget,
          staticExtradata: order.staticExtradata,
          paymentToken: order.paymentToken,
          basePrice: order.basePrice,
          extra: order.extra,
          listingTime: order.listingTime,
          expirationTime: order.expirationTime,
          salt: order.salt,
          dataType: order.dataType,
          data: order.data
        }
      ).callAsync()
    } else {
        return await this._wyvernProtocolReadOnly.wyvernExchange.calculateCurrentPrice_(
          [order.exchange, order.maker, order.taker, order.feeRecipient, order.target, order.staticTarget, order.paymentToken],
          [order.makerRelayerFee, order.takerRelayerFee, order.makerProtocolFee, order.takerProtocolFee, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt],
          order.feeMethod,
          order.side,
          order.saleKind,
          order.howToCall,
          order.calldata,
          order.replacementPattern,
          order.staticExtradata,
        ).callAsync()
    }
  }

  /**
   * Returns whether an order is fulfillable.
   * An order may not be fulfillable if a target item's transfer function
   * is locked for some reason, e.g. an item is being rented within a game
   * or trading has been locked for an item type.
   * @param param0 __namedParamters Object
   * @param order Order to check
   * @param accountAddress The account address that will be fulfilling the order
   * @param recipientAddress The optional address to receive the order's item(s) or curriencies. If not specified, defaults to accountAddress.
   * @param referrerAddress The optional address that referred the order
   */
  public async isOrderFulfillable(
      { order, accountAddress, recipientAddress, referrerAddress, payouts }:
      { order: Order;
        accountAddress: string;
        recipientAddress?: string;
        referrerAddress?: string;
        payouts?: Array<Part> }
    ): Promise<boolean> {

    const matchingOrder = this._makeMatchingOrder({
      order,
      accountAddress,
      recipientAddress: recipientAddress || accountAddress,
      devPayoutAddress: order.asset?.collection.payoutAddress,
      payouts: payouts || []
    })

    const { buy, sell } = assignOrdersToSides(order, matchingOrder)

    const metadata = this._getMetadata(order, referrerAddress)
    const gas = await this._estimateGasForMatch({ buy, sell, accountAddress, metadata })

    this.logger(`Gas estimate for ${order.side == OrderSide.Sell ? "sell" : "buy"} order: ${gas}`)

    return gas != null && gas > 0
  }

  /**
   * Returns whether an asset is transferrable.
   * An asset may not be transferrable if its transfer function
   * is locked for some reason, e.g. an item is being rented within a game
   * or trading has been locked for an item type.
   * @param param0 __namedParamters Object
   * @param tokenId DEPRECATED: Token ID. Use `asset` instead.
   * @param tokenAddress DEPRECATED: Address of the token's contract. Use `asset` instead.
   * @param asset The asset to trade
   * @param fromAddress The account address that currently owns the asset
   * @param toAddress The account address that will be acquiring the asset
   * @param quantity The amount of the asset to transfer, if it's fungible (optional). In units (not base units), e.g. not wei.
   * @param useProxy Use the `fromAddress`'s proxy contract only if the `fromAddress` has already approved the asset for sale. Required if checking an ERC-721 v1 asset (like CryptoKitties) that doesn't check if the transferFrom caller is the owner of the asset (only allowing it if it's an approved address).
   * @param retries How many times to retry if false
   */
  public async isAssetTransferrable(
    { asset, fromAddress, toAddress,
      quantity, useProxy = false }:
    { asset: Asset;
      fromAddress: string;
      toAddress: string;
      quantity?: number | BigNumber;
      useProxy?: boolean; },
    retries = 1
  ): Promise<boolean> {

    const schema = this._getSchema(asset.schemaName)
    const quantityBN = quantity
      ? WyvernProtocol.toBaseUnitAmount(makeBigNumber(quantity), asset.decimals || 0)
      : makeBigNumber(1)
    const wyAsset = getWyvernAsset(schema, asset, quantityBN)
    const abi = schema.functions.transfer(wyAsset)

    let from = fromAddress
    if (useProxy) {
      const proxyAddress = await this._getProxy(fromAddress)
      if (!proxyAddress) {
        console.error(`This asset's owner (${fromAddress}) does not have a proxy!`)
        return false
      }
      from = proxyAddress
    }

    const data = encodeTransferCall(abi, fromAddress, toAddress)

    try {
      const gas = await estimateGas(this._getClientsForRead(retries).web3, {
        from,
        to: abi.target,
        data
      })
      return gas > 0

    } catch (error) {

      if (retries <= 0) {
        console.error(error)
        console.error(from, abi.target, data)
        return false
      }
      await delay(500)
      return await this.isAssetTransferrable({ asset, fromAddress, toAddress, quantity, useProxy }, retries - 1)
    }
  }

  /**
   * Transfer a fungible or non-fungible asset to another address
   * @param param0 __namedParamaters Object
   * @param fromAddress The owner's wallet address
   * @param toAddress The recipient's wallet address
   * @param asset The fungible or non-fungible asset to transfer
   * @param quantity The amount of the asset to transfer, if it's fungible (optional). In units (not base units), e.g. not wei.
   * @returns Transaction hash
   */
  public async transfer(
      { fromAddress, toAddress, asset,
        quantity = 1 }:
      { fromAddress: string;
        toAddress: string;
        asset: Asset;
        quantity?: number | BigNumber; }
    ): Promise<string> {

    const schema = this._getSchema(asset.schemaName)
    const quantityBN = WyvernProtocol.toBaseUnitAmount(makeBigNumber(quantity), asset.decimals || 0)
    const wyAsset = getWyvernAsset(schema, asset, quantityBN)
    const isCryptoKitties = [CK_ADDRESS, CK_RINKEBY_ADDRESS].includes(wyAsset.address)
    // Since CK is common, infer isOldNFT from it in case user
    // didn't pass in `version`
    const isOldNFT = isCryptoKitties || !!asset.version && [
      TokenStandardVersion.ERC721v1, TokenStandardVersion.ERC721v2
    ].includes(asset.version)

    const abi = asset.schemaName === WyvernSchemaName.ERC20
      ? annotateERC20TransferABI(wyAsset as WyvernFTAsset)
      : isOldNFT
        ? annotateERC721TransferABI(wyAsset as WyvernNFTAsset)
        : schema.functions.transfer(wyAsset)

    this._dispatch(EventType.TransferOne, { accountAddress: fromAddress, toAddress, asset: wyAsset })

    const gasPrice:any = await this._computeGasPrice()
    const data = encodeTransferCall(abi, fromAddress, toAddress)
    const txHash = await sendRawTransaction(this.web3, {
      from: fromAddress,
      to: abi.target,
      data,
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress: fromAddress })
    })

    await this._confirmTransaction(txHash, EventType.TransferOne, `Transferring asset`)
    return txHash
  }

  /**
   * Transfer one or more assets to another address.
   * ERC-721 and ERC-1155 assets are supported
   * @param param0 __namedParamaters Object
   * @param assets An array of objects with the tokenId and tokenAddress of each of the assets to transfer.
   * @param fromAddress The owner's wallet address
   * @param toAddress The recipient's wallet address
   * @param schemaName The Wyvern schema name corresponding to the asset type, if not in each Asset definition
   * @returns Transaction hash
   */
  public async transferAll(
      { assets, fromAddress, toAddress, schemaName = WyvernSchemaName.ERC721 }:
      { assets: Asset[];
        fromAddress: string;
        toAddress: string;
        schemaName?: WyvernSchemaName; }
    ): Promise<string> {

    toAddress = validateAndFormatWalletAddress(this.web3, toAddress)

    const schemaNames = assets.map(asset => asset.schemaName || schemaName)
    const wyAssets = assets.map(asset => getWyvernAsset(this._getSchema(asset.schemaName), asset))

    const { calldata, target } = encodeAtomicizedTransfer(schemaNames.map(name => this._getSchema(name)), wyAssets, fromAddress, toAddress, this._wyvernProtocol, this._networkName)

    let proxyAddress = await this._getProxy(fromAddress)
    if (!proxyAddress) {
      proxyAddress = await this._initializeProxy(fromAddress)
    }

    await this._approveAll({ schemaNames, wyAssets, accountAddress: fromAddress, proxyAddress })

    this._dispatch(EventType.TransferAll, { accountAddress: fromAddress, toAddress, assets: wyAssets })

    const gasPrice:any = await this._computeGasPrice()
    const txHash = await sendRawTransaction(this.web3, {
      from: fromAddress,
      to: proxyAddress,
      data: encodeProxyCall(target, HowToCall.DelegateCall, calldata),
      gasPrice
    }, error => {
      this._dispatch(EventType.TransactionDenied, { error, accountAddress: fromAddress })
    })

    await this._confirmTransaction(txHash, EventType.TransferAll, `Transferring ${assets.length} asset${assets.length == 1 ? '' : 's'}`)
    return txHash
  }

  /**
   * Get known payment tokens (ERC-20) that match your filters.
   * @param param0 __namedParamters Object
   * @param symbol Filter by the ERC-20 symbol for the token,
   *    e.g. "DAI" for Dai stablecoin
   * @param address Filter by the ERC-20 contract address for the token,
   *    e.g. "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359" for Dai
   * @param name Filter by the name of the ERC-20 contract.
   *    Not guaranteed to exist or be unique for each token type.
   *    e.g. '' for Dai and 'Decentraland' for MANA
   * FUTURE: officiallySupported: Filter for tokens that are
   *    officially supported and shown on swappable.io
   */
  public async getFungibleTokens(
      { symbol, address, name }:
      { symbol?: string;
        address?: string;
        name?: string } = {}
    ): Promise<SwappableFungibleToken[]> {

    onDeprecated("Use `api.getPaymentTokens` instead")

    const tokenSettings = WyvernSchemas.tokens[this._networkName]

    const { tokens } = await this.api.getPaymentTokens({ symbol, address, name })

    const offlineTokens: SwappableFungibleToken[] = [
      tokenSettings.canonicalWrappedEther,
      ...tokenSettings.otherTokens,
    ].filter(t => {
      if (symbol != null && t.symbol.toLowerCase() != symbol.toLowerCase()) {
        return false
      }
      if (address != null && t.address.toLowerCase() != address.toLowerCase()) {
        return false
      }
      if (name != null && t.name != name) {
        return false
      }
      return true
    })

    return [
      ...offlineTokens,
      ...tokens
    ]
  }

  /**
   * Get an account's balance of any Asset.
   * @param param0 __namedParameters Object
   * @param accountAddress Account address to check
   * @param asset The Asset to check balance for
   * @param retries How many times to retry if balance is 0
   */
  public async getAssetBalance(
      { accountAddress, asset }:
      { accountAddress: string;
        asset: Asset; },
      retries = 1
    ): Promise<BigNumber> {
    const schema = this._getSchema(asset.schemaName)
    const wyAsset = getWyvernAsset(schema, asset)

    if (schema.functions.countOf) {
      // ERC20 or ERC1155 (non-Enjin)

      const abi = schema.functions.countOf(wyAsset)
      const contract = this._getClientsForRead(retries).web3.eth.contract([abi as Web3.FunctionAbi]).at(abi.target)
      const inputValues = abi.inputs.filter(x => x.value !== undefined).map(x => x.value)
      const count = await promisifyCall<BigNumber>(c => contract[abi.name].call(accountAddress, ...inputValues, c))

      if (count !== undefined) {
        return count
      }

    } else if (schema.functions.ownerOf) {
      // ERC721 asset

      const abi = schema.functions.ownerOf(wyAsset)
      const contract = this._getClientsForRead(retries).web3.eth.contract([abi as Web3.FunctionAbi]).at(abi.target)
      if (abi.inputs.filter(x => x.value === undefined)[0]) {
        throw new Error("Missing an argument for finding the owner of this asset")
      }
      const inputValues = abi.inputs.map(i => i.value.toString())
      const owner = await promisifyCall<string>(c => contract[abi.name].call(...inputValues, c))
      if (owner) {
        return owner.toLowerCase() == accountAddress.toLowerCase()
          ? new BigNumber(1)
          : new BigNumber(0)
      }

    } else {
      // Missing ownership call - skip check to allow listings
      // by default
      throw new Error('Missing ownership schema for this asset type')
    }

    if (retries <= 0) {
      throw new Error('Unable to get current owner from smart contract')
    } else {
      await delay(500)
      // Recursively check owner again
      return await this.getAssetBalance({accountAddress, asset}, retries - 1)
    }
  }

  /**
   * Get the balance of a fungible token.
   * Convenience method for getAssetBalance for fungibles
   * @param param0 __namedParameters Object
   * @param accountAddress Account address to check
   * @param tokenAddress The address of the token to check balance for
   * @param schemaName Optional schema name for the fungible token
   * @param retries Number of times to retry if balance is undefined
   */
  public async getTokenBalance(
      { accountAddress, tokenAddress, schemaName = WyvernSchemaName.ERC20 }:
      { accountAddress: string;
        tokenAddress: string;
        schemaName?: WyvernSchemaName },
      retries = 1
    ) {

    const asset: Asset = {
      tokenId: null,
      tokenAddress,
      schemaName
    }
    return this.getAssetBalance({ accountAddress, asset }, retries)
  }

  /**
   * Compute the fees for an order
   * @param param0 __namedParameters
   * @param asset Asset to use for fees. May be blank ONLY for multi-collection bundles.
   * @param side The side of the order (buy or sell)
   * @param accountAddress The account to check fees for (useful if fees differ by account, like transfer fees)
   * @param isPrivate Whether the order is private or not (known taker)
   * @param extraBountyBasisPoints The basis points to add for the bounty. Will throw if it exceeds the assets' contract's Swappable fee.
   */
  public async computeFees(
      { asset, side, accountAddress, isPrivate = false, extraBountyBasisPoints = 0, paymentTokenAddress}:
      { asset?: SwappableAsset;
        side: OrderSide;
        accountAddress?: string;
        isPrivate?: boolean;
        extraBountyBasisPoints?: number;
        paymentTokenAddress: string }
    ): Promise<ComputedFees> {

      let isPaymentInSwap = false;
      switch (this._networkName) {
        case Network.Main:
          isPaymentInSwap = paymentTokenAddress === SWAP_TOKEN_ADDRESS
          break
        case Network.Rinkeby:
          isPaymentInSwap = paymentTokenAddress === SWAP_TOKEN_RINKEBY_ADDRESS
          break
        case Network.Matic:
          isPaymentInSwap = paymentTokenAddress === SWAP_TOKEN_ADDRESS_MATIC_MAINNET
          break
        case Network.Mumbai:
          isPaymentInSwap = paymentTokenAddress === SWAP_TOKEN_ADDRESS_MATIC_MUMBAI
          break
        default:
          break
      }

    let swappableBuyerFeeBasisPoints = DEFAULT_BUYER_FEE_BASIS_POINTS
    let swappableSellerFeeBasisPoints = (isPaymentInSwap ? DEFAULT_SELLER_FEE_BASIS_POINTS_FOR_SWAP : DEFAULT_SELLER_FEE_BASIS_POINTS )
    let devBuyerFeeBasisPoints = 0
    let devSellerFeeBasisPoints = 0
    let transferFee = makeBigNumber(0)
    let transferFeeTokenAddress = null
    let maxTotalBountyBPS = DEFAULT_MAX_BOUNTY

    if (asset) {
      swappableBuyerFeeBasisPoints = isPaymentInSwap ? (+asset.collection.swappableBuyerFeeBasisPoints / 2) : (+asset.collection.swappableBuyerFeeBasisPoints)
      swappableSellerFeeBasisPoints = isPaymentInSwap ? (+asset.collection.swappableSellerFeeBasisPoints / 2) : (+asset.collection.swappableSellerFeeBasisPoints)
      devBuyerFeeBasisPoints = +asset.collection.devBuyerFeeBasisPoints
      devSellerFeeBasisPoints = +asset.collection.devSellerFeeBasisPoints

      maxTotalBountyBPS = +asset.collection.swappableSellerFeeBasisPoints
    }

    // Compute transferFrom fees
    if (side == OrderSide.Sell && asset) {
      // Server-side knowledge
      transferFee = asset.transferFee
        ? makeBigNumber(asset.transferFee)
        : transferFee
      transferFeeTokenAddress = asset.transferFeePaymentToken
        ? asset.transferFeePaymentToken.address
        : transferFeeTokenAddress

      try {
        // web3 call to update it
        const result = await getTransferFeeSettings(this.web3, { asset, accountAddress })
        transferFee = result.transferFee != null ? result.transferFee : transferFee
        transferFeeTokenAddress = result.transferFeeTokenAddress || transferFeeTokenAddress
      } catch (error) {
        // Use server defaults
        console.error(error)
      }
    }

    // Compute bounty
    let sellerBountyBasisPoints = side == OrderSide.Sell
      ? extraBountyBasisPoints
      : 0

    // Check that bounty is in range of the swappable fee
    const bountyTooLarge = sellerBountyBasisPoints + SWAPPABLE_SELLER_BOUNTY_BASIS_POINTS > maxTotalBountyBPS
    if (sellerBountyBasisPoints > 0 && bountyTooLarge) {
      let errorMessage = `Total bounty exceeds the maximum for this asset type (${maxTotalBountyBPS / 100}%).`
      if (maxTotalBountyBPS >= SWAPPABLE_SELLER_BOUNTY_BASIS_POINTS) {
        errorMessage += ` Remember that Swappable will add ${SWAPPABLE_SELLER_BOUNTY_BASIS_POINTS / 100}% for referrers with Swappable accounts!`
      }
      throw new Error(errorMessage)
    }

    // Remove fees for private orders
    if (isPrivate) {
      swappableBuyerFeeBasisPoints = 0
      swappableSellerFeeBasisPoints = 0
      devBuyerFeeBasisPoints = 0
      devSellerFeeBasisPoints = 0
      sellerBountyBasisPoints = 0
    }

    return {
      totalBuyerFeeBasisPoints: swappableBuyerFeeBasisPoints + devBuyerFeeBasisPoints,
      totalSellerFeeBasisPoints: swappableSellerFeeBasisPoints + devSellerFeeBasisPoints,
      swappableBuyerFeeBasisPoints,
      swappableSellerFeeBasisPoints,
      devBuyerFeeBasisPoints,
      devSellerFeeBasisPoints,
      sellerBountyBasisPoints,
      transferFee,
      transferFeeTokenAddress,
    }
  }

  /**
   * Validate and post an order to the Swappable orderbook.
   * @param order The order to post. Can either be signed by the maker or pre-approved on the Wyvern contract using approveOrder. See https://github.com/ProjectWyvern/wyvern-ethereum/blob/master/contracts/exchange/Exchange.sol#L178
   * @returns The order as stored by the orderbook
   */
  public async validateAndPostOrder(order: Order): Promise<Order> {
    let hash
    if( this._isOrderV1(order.exchange) ) {
      hash = await this._wyvernProtocolReadOnly.wyvernExchangeV1.hashOrder(
        {
          exchange: order.exchange,
          maker: order.maker,
          taker: order.taker,
          makerRelayerFee: order.makerRelayerFee,
          takerRelayerFee: order.takerRelayerFee,
          makerProtocolFee: order.makerProtocolFee,
          takerProtocolFee: order.takerProtocolFee,
          feeRecipient: order.feeRecipient,
          feeMethod: order.feeMethod,
          side: order.side,
          saleKind: order.saleKind,
          target: order.target,
          howToCall: order.howToCall,
          calldatas: order.calldata,
          replacementPattern: order.replacementPattern,
          staticTarget: order.staticTarget,
          staticExtradata: order.staticExtradata,
          paymentToken: order.paymentToken,
          basePrice: order.basePrice,
          extra: order.extra,
          listingTime: order.listingTime,
          expirationTime: order.expirationTime,
          salt: order.salt,
          dataType: order.dataType,
          data: order.data
        }
      ).callAsync()
    } else {
        hash = await this._wyvernProtocolReadOnly.wyvernExchange.hashOrder_(
          [order.exchange, order.maker, order.taker, order.feeRecipient, order.target, order.staticTarget, order.paymentToken],
          [order.makerRelayerFee, order.takerRelayerFee, order.makerProtocolFee, order.takerProtocolFee, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt],
          order.feeMethod,
          order.side,
          order.saleKind,
          order.howToCall,
          order.calldata,
          order.replacementPattern,
          order.staticExtradata).callAsync()
    }

    if (hash !== order.hash) {
      console.error(order)
      throw new Error(`Order couldn't be validated by the exchange due to a hash mismatch. Make sure your wallet is on the right network!`)
    }
    this.logger('Order hashes match')

    // Validation is called server-side
    const confirmedOrder = await this.api.postOrder(orderToJSON(order))
    return confirmedOrder
  }

  /**
   * Compute the gas price for sending a txn, in wei
   * Will be slightly above the mean to make it faster
   */
  public async _computeGasPrice(): Promise<BigNumber> {
    const meanGas = await getCurrentGasPrice(this.web3)
    const weiToAdd = this.web3.toWei(this.gasPriceAddition.toString(), 'gwei')
    return meanGas.plus(weiToAdd)
  }

  /**
   * Compute the gas amount for sending a txn
   * Will be slightly above the result of estimateGas to make it more reliable
   * @param estimation The result of estimateGas for a transaction
   */
  public _correctGasAmount(estimation: number): number {
    return Math.ceil(estimation * this.gasIncreaseFactor)
  }

  /**
   * Estimate the gas needed to match two orders. Returns undefined if tx errors
   * @param param0 __namedParamaters Object
   * @param buy The buy order to match
   * @param sell The sell order to match
   * @param accountAddress The taker's wallet address
   * @param metadata Metadata bytes32 to send with the match
   * @param retries Number of times to retry if false
   */
  public async _estimateGasForMatch(
      { buy, sell, accountAddress, metadata = NULL_BLOCK_HASH }:
      { buy: Order;
        sell: Order;
        accountAddress: string;
        metadata?: string },
      retries = 1
    ): Promise<number | undefined> {

    let value
    if (buy.maker.toLowerCase() == accountAddress.toLowerCase() && buy.paymentToken == NULL_ADDRESS) {
      value = await this._getRequiredAmountForTakingSellOrder(sell)
    }

    const doesExchangeAddressMatch = (buy.exchange.toLowerCase() === sell.exchange.toLowerCase())
    if (!doesExchangeAddressMatch) {
      throw new Error('Buy and Sell orders exchange mismatch')
    }

    try {
      if( this._isOrderV1(buy.exchange) ) {
        return await this._getClientsForRead(retries).wyvernProtocol.wyvernExchangeV1.atomicMatch(
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
            dataType: buy.dataType,
            data: buy.data
          },
          {
            v: buy.v || 0,
            r: buy.r || NULL_BLOCK_HASH,
            s: buy.s || NULL_BLOCK_HASH,
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
            dataType: sell.dataType,
            data: sell.data
          },
          {
            v: sell.v || 0,
            r: sell.r || NULL_BLOCK_HASH,
            s: sell.s || NULL_BLOCK_HASH,
          },
          metadata)
          // Typescript error in estimate gas method, so use any
          .estimateGasAsync({ from: accountAddress, value } as any)
      } else {
          return await this._getClientsForRead(retries).wyvernProtocol.wyvernExchange.atomicMatch_(
            [buy.exchange, buy.maker, buy.taker, buy.feeRecipient, buy.target, buy.staticTarget, buy.paymentToken, sell.exchange, sell.maker, sell.taker, sell.feeRecipient, sell.target, sell.staticTarget, sell.paymentToken],
            [buy.makerRelayerFee, buy.takerRelayerFee, buy.makerProtocolFee, buy.takerProtocolFee, buy.basePrice, buy.extra, buy.listingTime, buy.expirationTime, buy.salt, sell.makerRelayerFee, sell.takerRelayerFee, sell.makerProtocolFee, sell.takerProtocolFee, sell.basePrice, sell.extra, sell.listingTime, sell.expirationTime, sell.salt],
            [buy.feeMethod, buy.side, buy.saleKind, buy.howToCall, sell.feeMethod, sell.side, sell.saleKind, sell.howToCall],
            buy.calldata,
            sell.calldata,
            buy.replacementPattern,
            sell.replacementPattern,
            buy.staticExtradata,
            sell.staticExtradata,
            [
              buy.v || 0,
              sell.v || 0
            ],
            [
              buy.r || NULL_BLOCK_HASH,
              buy.s || NULL_BLOCK_HASH,
              sell.r || NULL_BLOCK_HASH,
              sell.s || NULL_BLOCK_HASH,
              metadata
            ])
            .estimateGasAsync({ from: accountAddress, value } as any)
      }
    } catch (error) {

      if (retries <= 0) {
        console.error(error)
        return undefined
      }
      await delay(200)
      return await this._estimateGasForMatch({ buy, sell, accountAddress, metadata }, retries - 1)
    }
  }

  /**
   * Estimate the gas needed to transfer assets in bulk
   * Used for tests
   * @param param0 __namedParamaters Object
   * @param assets An array of objects with the tokenId and tokenAddress of each of the assets to transfer.
   * @param fromAddress The owner's wallet address
   * @param toAddress The recipient's wallet address
   * @param schemaName The Wyvern schema name corresponding to the asset type, if not in each asset
   */
  public async _estimateGasForTransfer(
      { assets, fromAddress, toAddress, schemaName = WyvernSchemaName.ERC721 }:
      { assets: Asset[];
        fromAddress: string;
        toAddress: string;
        schemaName?: WyvernSchemaName; }
    ): Promise<number> {

    const schemaNames = assets.map(asset => asset.schemaName || schemaName)
    const wyAssets = assets.map(asset => getWyvernAsset(this._getSchema(asset.schemaName), asset))

    const proxyAddress = await this._getProxy(fromAddress)
    if (!proxyAddress) {
      throw new Error('Uninitialized proxy address')
    }

    await this._approveAll({schemaNames, wyAssets, accountAddress: fromAddress, proxyAddress})

    const { calldata, target } = encodeAtomicizedTransfer(schemaNames.map(name => this._getSchema(name)), wyAssets, fromAddress, toAddress, this._wyvernProtocol, this._networkName)

    return estimateGas(this.web3, {
      from: fromAddress,
      to: proxyAddress,
      data: encodeProxyCall(target, HowToCall.DelegateCall, calldata)
    })
  }

  /**
   * Get the proxy address for a user's wallet.
   * Internal method exposed for dev flexibility.
   * @param accountAddress The user's wallet address
   * @param retries Optional number of retries to do
   */
  public async _getProxy(accountAddress: string, retries = 0): Promise<string | null> {
    let proxyAddress: string | null = await this._wyvernProtocolReadOnly.wyvernProxyRegistry.proxies(accountAddress).callAsync()

    if (proxyAddress == '0x') {
      throw new Error("Couldn't retrieve your account from the blockchain - make sure you're on the correct Ethereum network!")
    }

    if (!proxyAddress || proxyAddress == NULL_ADDRESS) {
      if (retries > 0) {
        await delay(1000)
        return await this._getProxy(accountAddress, retries - 1)
      }
      proxyAddress = null
    }
    return proxyAddress
  }

  /**
   * Initialize the proxy for a user's wallet.
   * Proxies are used to make trades on behalf of the order's maker so that
   *  trades can happen when the maker isn't online.
   * Internal method exposed for dev flexibility.
   * @param accountAddress The user's wallet address
   */
  public async _initializeProxy(accountAddress: string): Promise<string> {

    this._dispatch(EventType.InitializeAccount, { accountAddress })
    this.logger(`Initializing proxy for account: ${accountAddress}`)

    const gasPrice:any = await this._computeGasPrice()
    const txnData: any = { from: accountAddress }
    const gasEstimate = await this._wyvernProtocolReadOnly.wyvernProxyRegistry.registerProxy().estimateGasAsync(txnData)
    const transactionHash = await this._wyvernProtocol.wyvernProxyRegistry.registerProxy().sendTransactionAsync({
      ...txnData,
      gasPrice,
      gas: this._correctGasAmount(gasEstimate)
    })

    await this._confirmTransaction(transactionHash, EventType.InitializeAccount, "Initializing proxy for account", async () => {
      const polledProxy = await this._getProxy(accountAddress)
      return !!polledProxy
    })

    const proxyAddress = await this._getProxy(accountAddress, 2)
    if (!proxyAddress) {
      throw new Error('Failed to initialize your account :( Please restart your wallet/browser and try again!')
    }

    return proxyAddress
  }

  /**
   * For a fungible token to use in trades (like W-ETH), get the amount
   *  approved for use by the Wyvern transfer proxy.
   * Internal method exposed for dev flexibility.
   * @param param0 __namedParamters Object
   * @param accountAddress Address for the user's wallet
   * @param tokenAddress Address for the token's contract
   * @param proxyAddress User's proxy address. If undefined, uses the token transfer proxy address
   */
  public async _getApprovedTokenCount(
      { accountAddress, tokenAddress, proxyAddress }:
      { accountAddress: string;
        tokenAddress?: string;
        proxyAddress?: string;
      }
    ) {
    if (!tokenAddress) {
      tokenAddress = WyvernSchemas.tokens[this._networkName].canonicalWrappedEther.address
    }
    const addressToApprove = proxyAddress || WyvernProtocol.getTokenTransferProxyAddress(this._networkName)
    const approved = await rawCall(this.web3, {
      from: accountAddress,
      to: tokenAddress,
      data: encodeCall(getMethod(ERC20, 'allowance'),
        [accountAddress, addressToApprove]),
    })
    return makeBigNumber(approved)
  }

  public async _makeBuyOrder(
      { asset, quantity, accountAddress, startAmount, expirationTime = 0, paymentTokenAddress, extraBountyBasisPoints = 0, sellOrder, referrerAddress }:
      { asset: Asset;
        quantity: number;
        accountAddress: string;
        startAmount: number;
        expirationTime: number;
        paymentTokenAddress: string;
        extraBountyBasisPoints: number;
        sellOrder?: UnhashedOrder;
        referrerAddress?: string; }
    ): Promise<UnhashedOrder> {

    accountAddress = validateAndFormatWalletAddress(this.web3, accountAddress)
    const schema = this._getSchema(asset.schemaName)
    const quantityBN = WyvernProtocol.toBaseUnitAmount(makeBigNumber(quantity), asset.decimals || 0)
    const wyAsset = getWyvernAsset(schema, asset, quantityBN)

    const swappableAsset: SwappableAsset = await this.api.getAsset(asset)

    const taker = sellOrder
      ? sellOrder.maker
      : NULL_ADDRESS

    const {
      totalBuyerFeeBasisPoints,
      totalSellerFeeBasisPoints,
      swappableBuyerFeeBasisPoints,
      swappableSellerFeeBasisPoints,
      devBuyerFeeBasisPoints,
      devSellerFeeBasisPoints
    } = await this.computeFees({ asset: swappableAsset, extraBountyBasisPoints, side: OrderSide.Buy, paymentTokenAddress })

    const {
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee,
      feeRecipient,
      feeMethod
    } = this._getBuyFeeParameters(totalBuyerFeeBasisPoints, totalSellerFeeBasisPoints, swappableBuyerFeeBasisPoints, swappableSellerFeeBasisPoints, devBuyerFeeBasisPoints, devSellerFeeBasisPoints, swappableAsset?.collection.payoutAddress , sellOrder)

    const { target, calldata, replacementPattern } = encodeBuy(schema, wyAsset, accountAddress)

    const { basePrice, extra, paymentToken } = await this._getPriceParameters(OrderSide.Buy, paymentTokenAddress, expirationTime, startAmount)
    const times = this._getTimeParameters(expirationTime)

    const { staticTarget, staticExtradata } = await this._getStaticCallTargetAndExtraData({ asset: swappableAsset, useTxnOriginStaticCall: false })

    const [ dataType, data ] = WyvernProtocol.encodeOrderData({
      dataType: "ORDER_DATA_TYPE_V1",
      payouts: [],
      originFees: []
    });

    return {
      exchange: WyvernProtocol.getExchangeContractAddress(this._networkName),
      maker: accountAddress,
      taker,
      quantity: quantityBN,
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee,
      waitingForBestCounterOrder: false,
      feeMethod,
      feeRecipient,
      side: OrderSide.Buy,
      saleKind: SaleKind.FixedPrice,
      target,
      howToCall: HowToCall.Call,
      calldata,
      replacementPattern,
      staticTarget,
      staticExtradata,
      paymentToken,
      basePrice,
      extra,
      listingTime: times.listingTime,
      expirationTime: times.expirationTime,
      salt: WyvernProtocol.generatePseudoRandomSalt(),
      metadata: {
        asset: wyAsset,
        schema: schema.name as WyvernSchemaName,
        referrerAddress
      },
      dataType,
      data
    }
  }

  public async _makeSellOrder(
      { asset, quantity, accountAddress, startAmount, endAmount, expirationTime, waitForHighestBid, englishAuctionReservePrice = 0, paymentTokenAddress, extraBountyBasisPoints, buyerAddress, payouts }:
      { asset: Asset;
        quantity: number;
        accountAddress: string;
        startAmount: number;
        endAmount?: number;
        waitForHighestBid: boolean;
        englishAuctionReservePrice?: number;
        expirationTime: number;
        paymentTokenAddress: string;
        extraBountyBasisPoints: number;
        buyerAddress: string; 
        payouts: Array<Part> }
    ): Promise<UnhashedOrder> {

    accountAddress = validateAndFormatWalletAddress(this.web3, accountAddress)
    const schema = this._getSchema(asset.schemaName)
    const quantityBN = WyvernProtocol.toBaseUnitAmount(makeBigNumber(quantity), asset.decimals || 0)
    const wyAsset = getWyvernAsset(schema, asset, quantityBN)
    const isPrivate = buyerAddress != NULL_ADDRESS

    const swappableAsset = await this.api.getAsset(asset)

    const { totalSellerFeeBasisPoints,
            totalBuyerFeeBasisPoints,
            swappableBuyerFeeBasisPoints,
            swappableSellerFeeBasisPoints,
            devBuyerFeeBasisPoints,
            devSellerFeeBasisPoints,
            sellerBountyBasisPoints
          } = await this.computeFees({ asset: swappableAsset, side: OrderSide.Sell, isPrivate, extraBountyBasisPoints, paymentTokenAddress })

    const { target, calldata, replacementPattern } = encodeSell(schema, wyAsset, accountAddress)

    const orderSaleKind = endAmount != null && endAmount !== startAmount
      ? SaleKind.DutchAuction
      : SaleKind.FixedPrice

    const { basePrice, extra, paymentToken, reservePrice } = await this._getPriceParameters(OrderSide.Sell, paymentTokenAddress, expirationTime, startAmount, endAmount, waitForHighestBid, englishAuctionReservePrice)
    const times = this._getTimeParameters(expirationTime, waitForHighestBid)

    const {
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee,
      feeRecipient,
      feeMethod
    } = this._getSellFeeParameters(totalBuyerFeeBasisPoints, totalSellerFeeBasisPoints, swappableBuyerFeeBasisPoints, swappableSellerFeeBasisPoints, devBuyerFeeBasisPoints, devSellerFeeBasisPoints, waitForHighestBid, swappableAsset?.collection.payoutAddress , sellerBountyBasisPoints)

    const { staticTarget, staticExtradata } = await this._getStaticCallTargetAndExtraData({ asset: swappableAsset, useTxnOriginStaticCall: waitForHighestBid })

    const [ dataType, data ] = WyvernProtocol.encodeOrderData({
      dataType: "ORDER_DATA_TYPE_V1",
      payouts: payouts,
      originFees: []
    });

    return {
      exchange: WyvernProtocol.getExchangeContractAddress(this._networkName),
      maker: accountAddress,
      taker: buyerAddress,
      quantity: quantityBN,
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee,
      waitingForBestCounterOrder: waitForHighestBid,
      englishAuctionReservePrice: reservePrice ? makeBigNumber(reservePrice) : undefined,
      feeMethod,
      feeRecipient,
      side: OrderSide.Sell,
      saleKind: orderSaleKind,
      target,
      howToCall: HowToCall.Call,
      calldata,
      replacementPattern,
      staticTarget,
      staticExtradata,
      paymentToken,
      basePrice,
      extra,
      listingTime: times.listingTime,
      expirationTime: times.expirationTime,
      salt: WyvernProtocol.generatePseudoRandomSalt(),
      metadata: {
        asset: wyAsset,
        schema: schema.name as WyvernSchemaName,
      },
      dataType,
      data
    }
  }

  public async _getStaticCallTargetAndExtraData(
      { asset, useTxnOriginStaticCall }:
      { asset: SwappableAsset;
        useTxnOriginStaticCall: boolean; }
    ): Promise<{
      staticTarget: string;
      staticExtradata: string;
    }> {
    const isCheezeWizards = [
        CHEEZE_WIZARDS_GUILD_ADDRESS.toLowerCase(),
        CHEEZE_WIZARDS_GUILD_RINKEBY_ADDRESS.toLowerCase()
      ].includes(asset.tokenAddress.toLowerCase())
    const isDecentralandEstate = asset.tokenAddress.toLowerCase() == DECENTRALAND_ESTATE_ADDRESS.toLowerCase()
    const isMainnet = ( this._networkName == Network.Main || this._networkName == Network.Matic )

    if (isMainnet && !useTxnOriginStaticCall) {
      // While testing, we will use dummy values for mainnet. We will remove this if-statement once we have pushed the PR once and tested on Rinkeby
      return {
        staticTarget: NULL_ADDRESS,
        staticExtradata: '0x',
      }
    }

    if (isCheezeWizards) {
      const cheezeWizardsBasicTournamentAddress = isMainnet ? CHEEZE_WIZARDS_BASIC_TOURNAMENT_ADDRESS : CHEEZE_WIZARDS_BASIC_TOURNAMENT_RINKEBY_ADDRESS
      const cheezeWizardsBasicTournamentABI = this.web3.eth.contract(CheezeWizardsBasicTournament as any[])
      const cheezeWizardsBasicTournmentInstance = await cheezeWizardsBasicTournamentABI.at(cheezeWizardsBasicTournamentAddress)
      const wizardFingerprint = await rawCall(this.web3, {
        to: cheezeWizardsBasicTournmentInstance.address,
        data: cheezeWizardsBasicTournmentInstance.wizardFingerprint.getData(asset.tokenId)
      })
      return {
        staticTarget: isMainnet
          ? STATIC_CALL_CHEEZE_WIZARDS_ADDRESS
          : STATIC_CALL_CHEEZE_WIZARDS_RINKEBY_ADDRESS,
        staticExtradata: encodeCall(
          getMethod(
            StaticCheckCheezeWizards,
            'succeedIfCurrentWizardFingerprintMatchesProvidedWizardFingerprint'),
          [asset.tokenId, wizardFingerprint, useTxnOriginStaticCall]),
      }
    } else if (isDecentralandEstate && isMainnet) {
      // We stated that we will only use Decentraland estates static
      // calls on mainnet, since Decentraland uses Ropsten
      const decentralandEstateAddress = DECENTRALAND_ESTATE_ADDRESS
      const decentralandEstateABI = this.web3.eth.contract(DecentralandEstates as any[])
      const decentralandEstateInstance = await decentralandEstateABI.at(decentralandEstateAddress)
      const estateFingerprint = await rawCall(this.web3, {
        to: decentralandEstateInstance.address,
        data: decentralandEstateInstance.getFingerprint.getData(asset.tokenId)
      })
      return {
        staticTarget: STATIC_CALL_DECENTRALAND_ESTATES_ADDRESS,
        staticExtradata: encodeCall(
          getMethod(StaticCheckDecentralandEstates,
            'succeedIfCurrentEstateFingerprintMatchesProvidedEstateFingerprint'),
          [asset.tokenId, estateFingerprint, useTxnOriginStaticCall]),
      }
    } else if (useTxnOriginStaticCall) {
      let STATIC_CALL_TX_ADDRESS = STATIC_CALL_TX_ORIGIN_RINKEBY_ADDRESS;
      switch (this._networkName) {
        case Network.Mumbai:
          STATIC_CALL_TX_ADDRESS = STATIC_CALL_TX_ORIGIN_MUMBAI_ADDRESS
          break
        case Network.Main:
          STATIC_CALL_TX_ADDRESS = STATIC_CALL_TX_ORIGIN_ADDRESS
          break
        case Network.Matic:
          STATIC_CALL_TX_ADDRESS = STATIC_CALL_TX_ORIGIN_MATIC_ADDRESS
        default:
          break
      }
      return {
        staticTarget: STATIC_CALL_TX_ADDRESS,
        staticExtradata: encodeCall(
          getMethod(StaticCheckTxOrigin, 'succeedIfTxOriginMatchesHardcodedAddress'),
          []),
      }
    } else {
      // Noop - no checks
      return {
        staticTarget: NULL_ADDRESS,
        staticExtradata: '0x',
      }
    }
  }

  public async _makeBundleBuyOrder(
      { assets, collection, quantities, accountAddress, startAmount, expirationTime = 0, paymentTokenAddress, extraBountyBasisPoints = 0, sellOrder, referrerAddress }:
      { assets: Asset[];
        collection?: { slug: string };
        quantities: number[];
        accountAddress: string;
        startAmount: number;
        expirationTime: number;
        paymentTokenAddress: string;
        extraBountyBasisPoints: number;
        sellOrder?: UnhashedOrder;
        referrerAddress?: string; }
    ): Promise<UnhashedOrder> {

    accountAddress = validateAndFormatWalletAddress(this.web3, accountAddress)
    const quantityBNs = quantities.map((quantity, i) => WyvernProtocol.toBaseUnitAmount(makeBigNumber(quantity), assets[i].decimals || 0))
    const bundle = getWyvernBundle(assets, assets.map(a => this._getSchema(a.schemaName)), quantityBNs)
    const orderedSchemas = bundle.schemas.map(name => this._getSchema(name))

    const taker = sellOrder
      ? sellOrder.maker
      : NULL_ADDRESS

    // If all assets are for the same collection, use its fees
    const asset = collection
      ? await this.api.getAsset(assets[0])
      : undefined
    const { totalBuyerFeeBasisPoints,
            totalSellerFeeBasisPoints,
            swappableBuyerFeeBasisPoints,
            swappableSellerFeeBasisPoints,
            devBuyerFeeBasisPoints,
            devSellerFeeBasisPoints
          } = await this.computeFees({ asset, extraBountyBasisPoints, side: OrderSide.Buy, paymentTokenAddress })

    const {
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee,
      feeRecipient,
      feeMethod
    } = this._getBuyFeeParameters(totalBuyerFeeBasisPoints, totalSellerFeeBasisPoints, swappableBuyerFeeBasisPoints, swappableSellerFeeBasisPoints, devBuyerFeeBasisPoints, devSellerFeeBasisPoints, asset?.collection.payoutAddress , sellOrder)

    const { calldata, replacementPattern } = encodeAtomicizedBuy(orderedSchemas, bundle.assets, accountAddress, this._wyvernProtocol, this._networkName)

    const { basePrice, extra, paymentToken } = await this._getPriceParameters(OrderSide.Buy, paymentTokenAddress, expirationTime, startAmount)
    const times = this._getTimeParameters(expirationTime)

    const [ dataType, data ] = WyvernProtocol.encodeOrderData({
      dataType: "ORDER_DATA_TYPE_V1",
      payouts: [],
      originFees: []
    });

    return {
      exchange: WyvernProtocol.getExchangeContractAddress(this._networkName),
      maker: accountAddress,
      taker,
      quantity: makeBigNumber(1),
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee, // TODO use buyerBountyBPS
      waitingForBestCounterOrder: false,
      feeMethod,
      feeRecipient,
      side: OrderSide.Buy,
      saleKind: SaleKind.FixedPrice,
      target: WyvernProtocol.getAtomicizerContractAddress(this._networkName),
      howToCall: HowToCall.DelegateCall, // required DELEGATECALL to library for atomicizer
      calldata,
      replacementPattern,
      staticTarget: NULL_ADDRESS,
      staticExtradata: '0x',
      paymentToken,
      basePrice,
      extra,
      listingTime: times.listingTime,
      expirationTime: times.expirationTime,
      salt: WyvernProtocol.generatePseudoRandomSalt(),
      metadata: {
        bundle,
        referrerAddress
      },
      dataType,
      data
    }
  }

  public async _makeBundleSellOrder(
      { bundleName, bundleDescription, bundleExternalLink, assets, collection, quantities, accountAddress, startAmount, endAmount, expirationTime, waitForHighestBid, englishAuctionReservePrice = 0, paymentTokenAddress, extraBountyBasisPoints, buyerAddress }:
      { bundleName: string;
        bundleDescription?: string;
        bundleExternalLink?: string;
        assets: Asset[];
        collection?: { slug: string };
        quantities: number[];
        accountAddress: string;
        startAmount: number;
        endAmount?: number;
        expirationTime: number;
        waitForHighestBid: boolean;
        englishAuctionReservePrice?: number;
        paymentTokenAddress: string;
        extraBountyBasisPoints: number;
        buyerAddress: string; }
    ): Promise<UnhashedOrder> {

    accountAddress = validateAndFormatWalletAddress(this.web3, accountAddress)
    const quantityBNs = quantities.map((quantity, i) => WyvernProtocol.toBaseUnitAmount(makeBigNumber(quantity), assets[i].decimals || 0))
    const bundle = getWyvernBundle(assets, assets.map(a => this._getSchema(a.schemaName)), quantityBNs)
    const orderedSchemas = bundle.schemas.map(name => this._getSchema(name))
    bundle.name = bundleName
    bundle.description = bundleDescription
    bundle.external_link = bundleExternalLink

    const isPrivate = buyerAddress != NULL_ADDRESS

    // If all assets are for the same collection, use its fees
    const asset = collection
      ? await this.api.getAsset(assets[0])
      : undefined
    const {
      totalSellerFeeBasisPoints,
      totalBuyerFeeBasisPoints,
      swappableBuyerFeeBasisPoints,
      swappableSellerFeeBasisPoints,
      devBuyerFeeBasisPoints,
      devSellerFeeBasisPoints,
      sellerBountyBasisPoints
    } = await this.computeFees({ asset, side: OrderSide.Sell, isPrivate, extraBountyBasisPoints, paymentTokenAddress })

    const { calldata, replacementPattern } = encodeAtomicizedSell(orderedSchemas, bundle.assets, accountAddress, this._wyvernProtocol, this._networkName)

    const { basePrice, extra, paymentToken, reservePrice } = await this._getPriceParameters(OrderSide.Sell, paymentTokenAddress, expirationTime, startAmount, endAmount, waitForHighestBid, englishAuctionReservePrice)
    const times = this._getTimeParameters(expirationTime, waitForHighestBid)

    const orderSaleKind = endAmount != null && endAmount !== startAmount
      ? SaleKind.DutchAuction
      : SaleKind.FixedPrice

    const {
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee,
      feeRecipient
    } = this._getSellFeeParameters(totalBuyerFeeBasisPoints, totalSellerFeeBasisPoints, swappableBuyerFeeBasisPoints, swappableSellerFeeBasisPoints, devBuyerFeeBasisPoints, devSellerFeeBasisPoints, waitForHighestBid, asset?.collection.payoutAddress , sellerBountyBasisPoints)

    const [ dataType, data ] = WyvernProtocol.encodeOrderData({
      dataType: "ORDER_DATA_TYPE_V1",
      payouts: [],
      originFees: []
    });

    return {
      exchange: WyvernProtocol.getExchangeContractAddress(this._networkName),
      maker: accountAddress,
      taker: buyerAddress,
      quantity: makeBigNumber(1),
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee,
      waitingForBestCounterOrder: waitForHighestBid,
      englishAuctionReservePrice: reservePrice ? makeBigNumber(reservePrice) : undefined,
      feeMethod: FeeMethod.SplitFee,
      feeRecipient,
      side: OrderSide.Sell,
      saleKind: orderSaleKind,
      target: WyvernProtocol.getAtomicizerContractAddress(this._networkName),
      howToCall: HowToCall.DelegateCall, // required DELEGATECALL to library for atomicizer
      calldata,
      replacementPattern,
      staticTarget: NULL_ADDRESS,
      staticExtradata: '0x',
      paymentToken,
      basePrice,
      extra,
      listingTime: times.listingTime,
      expirationTime: times.expirationTime,
      salt: WyvernProtocol.generatePseudoRandomSalt(),
      metadata: {
        bundle
      },
      dataType,
      data
    }
  }

  public _makeMatchingOrder(
      { order, accountAddress, recipientAddress, devPayoutAddress, payouts }:
      { order: UnsignedOrder;
        accountAddress: string;
        recipientAddress: string;
        devPayoutAddress?: string;
        payouts: Array<Part>;  }
    ): UnsignedOrder {

    accountAddress = validateAndFormatWalletAddress(this.web3, accountAddress)
    recipientAddress = validateAndFormatWalletAddress(this.web3, recipientAddress)

    const computeOrderParams = () => {
      if ('asset' in order.metadata) {
        const schema = this._getSchema(order.metadata.schema)
        return order.side == OrderSide.Buy
          ? encodeSell(schema, order.metadata.asset, recipientAddress)
          : encodeBuy(schema, order.metadata.asset, recipientAddress)
      } else if ('bundle' in order.metadata) {
        // We're matching a bundle order
        const bundle = order.metadata.bundle
        const orderedSchemas = bundle.schemas
          ? bundle.schemas.map(schemaName => this._getSchema(schemaName))
          // Backwards compat:
          : bundle.assets.map(() => this._getSchema(
              'schema' in order.metadata
              ? order.metadata.schema
              : undefined))
        const atomicized = order.side == OrderSide.Buy
          ? encodeAtomicizedSell(orderedSchemas, order.metadata.bundle.assets, recipientAddress, this._wyvernProtocol, this._networkName)
          : encodeAtomicizedBuy(orderedSchemas, order.metadata.bundle.assets, recipientAddress, this._wyvernProtocol, this._networkName)
        return {
          target: WyvernProtocol.getAtomicizerContractAddress(this._networkName),
          calldata: atomicized.calldata,
          replacementPattern: atomicized.replacementPattern
        }
      } else {
        throw new Error('Invalid order metadata')
      }
    }

    const { target, calldata, replacementPattern } = computeOrderParams()
    const times = this._getTimeParameters(0)
    // Compat for matching buy orders that have fee recipient still on them
    console.log("🚀 ~ file: seaport.ts ~ line 2381 ~ SwappablePort ~ order.feeRecipient", order.feeRecipient)
    const feeRecipient = order.feeRecipient == NULL_ADDRESS
    ? devPayoutAddress || SWAPPABLE_FEE_RECIPIENT
    : NULL_ADDRESS
    console.log("🚀 ~ file: seaport.ts ~ line 2382 ~ SwappablePort ~ feeRecipient", feeRecipient)
    console.log("🚀 ~ file: seaport.ts ~ line 2421 ~ SwappablePort ~ devPayoutAddress", devPayoutAddress)

    let matchingOrder: UnhashedOrder = {
      exchange: order.exchange,
      maker: accountAddress,
      taker: order.maker,
      quantity: order.quantity,
      makerRelayerFee: order.makerRelayerFee,
      takerRelayerFee: order.takerRelayerFee,
      makerProtocolFee: order.makerProtocolFee,
      takerProtocolFee: order.takerProtocolFee,
      makerReferrerFee: order.makerReferrerFee,
      waitingForBestCounterOrder: false,
      feeMethod: order.feeMethod,
      feeRecipient,
      side: (order.side + 1) % 2,
      saleKind: SaleKind.FixedPrice,
      target,
      howToCall: order.howToCall,
      calldata,
      replacementPattern,
      staticTarget: NULL_ADDRESS,
      staticExtradata: '0x',
      paymentToken: order.paymentToken,
      basePrice: order.basePrice,
      extra: makeBigNumber(0),
      listingTime: times.listingTime,
      expirationTime: times.expirationTime,
      salt: WyvernProtocol.generatePseudoRandomSalt(),
      metadata: order.metadata,
      dataType: '0x',
      data: '0x'
    }

    if( this._isOrderV1(order.exchange) ) {
      const [ dataType, data ] = WyvernProtocol.encodeOrderData({
        dataType: "ORDER_DATA_TYPE_V1",
        payouts: order.side == OrderSide.Sell ? [] : payouts,
        originFees: []
      });

      matchingOrder = {
        ...matchingOrder,
        dataType: order.side == OrderSide.Sell ? order.dataType : dataType,
        data: order.side == OrderSide.Sell ? order.data : data
      }
    }

    return {
      ...matchingOrder,
      hash: getOrderHash(matchingOrder)
    }
  }

  /**
   * Validate against Wyvern that a buy and sell order can match
   * @param param0 __namedParamters Object
   * @param buy The buy order to validate
   * @param sell The sell order to validate
   * @param accountAddress Address for the user's wallet
   * @param shouldValidateBuy Whether to validate the buy order individually.
   * @param shouldValidateSell Whether to validate the sell order individually.
   * @param retries How many times to retry if validation fails
   */
  public async _validateMatch(
      { buy, sell, accountAddress, shouldValidateBuy = false, shouldValidateSell = false }:
      { buy: Order;
        sell: Order;
        accountAddress: string;
        shouldValidateBuy?: boolean;
        shouldValidateSell?: boolean; },
      retries = 1
    ): Promise<boolean> {

    try {
      if (shouldValidateBuy) {
        const buyValid = await this._validateOrder(buy)
        this.logger(`Buy order is valid: ${buyValid}`)

        if (!buyValid) {
          throw new Error('Invalid buy order. It may have recently been removed. Please refresh the page and try again!')
        }
      }

      if (shouldValidateSell) {
        const sellValid = await this._validateOrder(sell)
        this.logger(`Sell order is valid: ${sellValid}`)

        if (!sellValid) {
          throw new Error('Invalid sell order. It may have recently been removed. Please refresh the page and try again!')
        }
      }

      const doesExchangeAddressMatch = (buy.exchange.toLowerCase() === sell.exchange.toLowerCase())
      if (!doesExchangeAddressMatch) {
        throw new Error('Buy and Sell orders exchange mismatch')
      }

      const canMatch = await requireOrdersCanMatch(this._getClientsForRead(retries).wyvernProtocol, { buy, sell, accountAddress }, this._isOrderV1(buy.exchange))
      this.logger(`Orders matching: ${canMatch}`)

      const calldataCanMatch = await requireOrderCalldataCanMatch(this._getClientsForRead(retries).wyvernProtocol, { buy, sell })
      this.logger(`Order calldata matching: ${calldataCanMatch}`)

      return true

    } catch (error) {

      if (retries <= 0) {
        throw new Error(`Error matching this listing: ${error.message}. Please contact the maker or try again later!`)
      }
      await delay(500)
      return await this._validateMatch({ buy, sell, accountAddress, shouldValidateBuy, shouldValidateSell }, retries - 1)
    }
  }

  // For creating email whitelists on order takers
  public async _createEmailWhitelistEntry(
      { order, buyerEmail }:
      { order: UnhashedOrder;
        buyerEmail: string }
    ) {
    const asset = 'asset' in order.metadata
      ? order.metadata.asset
      : undefined
    if (!asset || !asset.id) {
      throw new Error("Whitelisting only available for non-fungible assets.")
    }
    await this.api.postAssetWhitelist(asset.address, asset.id, buyerEmail)
  }

  // Throws
  public async _sellOrderValidationAndApprovals(
      { order, accountAddress }:
      { order: UnhashedOrder;
        accountAddress: string }
    ) {

    const wyAssets = 'bundle' in order.metadata
      ? order.metadata.bundle.assets
      : order.metadata.asset
        ? [order.metadata.asset]
        : []
    const schemaNames = 'bundle' in order.metadata && 'schemas' in order.metadata.bundle
      ? order.metadata.bundle.schemas
      : 'schema' in order.metadata
        ? [order.metadata.schema]
        : []
    const tokenAddress = order.paymentToken

    await this._approveAll({schemaNames, wyAssets, accountAddress})

    // For fulfilling bids,
    // need to approve access to fungible token because of the way fees are paid
    // This can be done at a higher level to show UI
    if (tokenAddress != NULL_ADDRESS) {
      const minimumAmount = makeBigNumber(order.basePrice)
      await this.approveFungibleToken({ accountAddress, tokenAddress, minimumAmount })
    }

    let sellValid = false

    // Check sell parameters
    if( this._isOrderV1(order.exchange) ) {
      sellValid = await this._wyvernProtocolReadOnly.wyvernExchangeV1.validateOrderParameters(
        {
          exchange: order.exchange,
          maker: order.maker,
          taker: order.taker,
          makerRelayerFee: order.makerRelayerFee,
          takerRelayerFee: order.takerRelayerFee,
          makerProtocolFee: order.makerProtocolFee,
          takerProtocolFee: order.takerProtocolFee,
          feeRecipient: order.feeRecipient,
          feeMethod: order.feeMethod,
          side: order.side,
          saleKind: order.saleKind,
          target: order.target,
          howToCall: order.howToCall,
          calldatas: order.calldata,
          replacementPattern: order.replacementPattern,
          staticTarget: order.staticTarget,
          staticExtradata: order.staticExtradata,
          paymentToken: order.paymentToken,
          basePrice: order.basePrice,
          extra: order.extra,
          listingTime: order.listingTime,
          expirationTime: order.expirationTime,
          salt: order.salt,
          dataType: order.dataType,
          data: order.data
        })
        .callAsync({ from: accountAddress })
    } else {
        sellValid = await this._wyvernProtocolReadOnly.wyvernExchange.validateOrderParameters_([order.exchange, order.maker, order.taker, order.feeRecipient, order.target, order.staticTarget, order.paymentToken],
          [order.makerRelayerFee, order.takerRelayerFee, order.makerProtocolFee, order.takerProtocolFee, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt],
          order.feeMethod,
          order.side,
          order.saleKind,
          order.howToCall,
          order.calldata,
          order.replacementPattern,
          order.staticExtradata
        )
        .callAsync({ from: accountAddress })
    }
    if (!sellValid) {
      console.error(order)
      throw new Error(`Failed to validate sell order parameters. Make sure you're on the right network!`)
    }
  }

  /**
   * Instead of signing an off-chain order, you can approve an order
   * with on on-chain transaction using this method
   * @param order Order to approve
   * @returns Transaction hash of the approval transaction
   */
  public async _approveOrder(order: UnsignedOrder) {
    const accountAddress = order.maker
    const gasPrice:any = await this._computeGasPrice()
    const includeInOrderBook = true

    this._dispatch(EventType.ApproveOrder, { order, accountAddress })

    let transactionHash = ""
    if( this._isOrderV1(order.exchange) ) {
      transactionHash = await this._wyvernProtocol.wyvernExchangeV1.approveOrder(
        {
          exchange: order.exchange,
          maker: order.maker,
          taker: order.taker,
          makerRelayerFee: order.makerRelayerFee,
          takerRelayerFee: order.takerRelayerFee,
          makerProtocolFee: order.makerProtocolFee,
          takerProtocolFee: order.takerProtocolFee,
          feeRecipient: order.feeRecipient,
          feeMethod: order.feeMethod,
          side: order.side,
          saleKind: order.saleKind,
          target: order.target,
          howToCall: order.howToCall,
          calldatas: order.calldata,
          replacementPattern: order.replacementPattern,
          staticTarget: order.staticTarget,
          staticExtradata: order.staticExtradata,
          paymentToken: order.paymentToken,
          basePrice: order.basePrice,
          extra: order.extra,
          listingTime: order.listingTime,
          expirationTime: order.expirationTime,
          salt: order.salt,
          dataType: order.dataType,
          data: order.data
        },
        includeInOrderBook
      ).sendTransactionAsync({ from: accountAddress, gasPrice })
    } else {
        transactionHash = await this._wyvernProtocol.wyvernExchange.approveOrder_(
          [order.exchange, order.maker, order.taker, order.feeRecipient, order.target, order.staticTarget, order.paymentToken],
          [order.makerRelayerFee, order.takerRelayerFee, order.makerProtocolFee, order.takerProtocolFee, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt],
          order.feeMethod,
          order.side,
          order.saleKind,
          order.howToCall,
          order.calldata,
          order.replacementPattern,
          order.staticExtradata,
          includeInOrderBook
        ).sendTransactionAsync({ from: accountAddress, gasPrice })
    }

    await this._confirmTransaction(transactionHash.toString(), EventType.ApproveOrder, "Approving order", async () => {
      const isApproved = await this._validateOrder(order)
      return isApproved
    })

    return transactionHash
  }

  public async _validateOrder(order: Order): Promise<boolean> {

    let isValid = false
    
    if( this._isOrderV1(order.exchange) ) {
      const orderToValidate = {
        exchange: order.exchange,
        maker: order.maker,
        taker: order.taker,
        makerRelayerFee: order.makerRelayerFee,
        takerRelayerFee: order.takerRelayerFee,
        makerProtocolFee: order.makerProtocolFee,
        takerProtocolFee: order.takerProtocolFee,
        feeRecipient: order.feeRecipient,
        feeMethod: order.feeMethod,
        side: order.side,
        saleKind: order.saleKind,
        target: order.target,
        howToCall: order.howToCall,
        calldatas: order.calldata,
        replacementPattern: order.replacementPattern,
        staticTarget: order.staticTarget,
        staticExtradata: order.staticExtradata,
        paymentToken: order.paymentToken,
        basePrice: order.basePrice,
        extra: order.extra,
        listingTime: order.listingTime,
        expirationTime: order.expirationTime,
        salt: order.salt,
        dataType: order.dataType,
        data: order.data
      }

      const orderSig = {
        v: order.v || 0,
        r: order.r || NULL_BLOCK_HASH,
        s: order.s || NULL_BLOCK_HASH
      }

      const orderHash = await this._wyvernProtocolReadOnly.wyvernExchangeV1.hashToSign(orderToValidate).callAsync()
      isValid = await this._wyvernProtocolReadOnly.wyvernExchangeV1.validateOrder(
        orderHash,
        orderToValidate,
        orderSig
      ).callAsync()
    } else {
        isValid = await this._wyvernProtocolReadOnly.wyvernExchange.validateOrder_(
          [order.exchange, order.maker, order.taker, order.feeRecipient, order.target, order.staticTarget, order.paymentToken],
          [order.makerRelayerFee, order.takerRelayerFee, order.makerProtocolFee, order.takerProtocolFee, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt],
          order.feeMethod,
          order.side,
          order.saleKind,
          order.howToCall,
          order.calldata,
          order.replacementPattern,
          order.staticExtradata,
          order.v || 0,
          order.r || NULL_BLOCK_HASH,
          order.s || NULL_BLOCK_HASH
        ).callAsync()
    }
    return isValid
  }

  public async _approveAll(
      { schemaNames, wyAssets, accountAddress, proxyAddress }:
      { schemaNames: WyvernSchemaName[];
        wyAssets: WyvernAsset[];
        accountAddress: string;
        proxyAddress?: string }
    ) {

    proxyAddress = proxyAddress || await this._getProxy(accountAddress) || undefined
    if (!proxyAddress) {
      proxyAddress = await this._initializeProxy(accountAddress)
    }
    const contractsWithApproveAll: Set<string> = new Set()

    return Promise.all(wyAssets.map(async (wyAsset, i) => {
      const schemaName = schemaNames[i]
      // Verify that the taker owns the asset
      let isOwner
      try {
        isOwner = await this._ownsAssetOnChain({
          accountAddress,
          proxyAddress,
          wyAsset,
          schemaName
        })
      } catch (error) {
        // let it through for assets we don't support yet
        isOwner = true
      }
      if (!isOwner) {
        const minAmount = 'quantity' in wyAsset
          ? wyAsset.quantity
          : 1
        console.error(`Failed on-chain ownership check: ${accountAddress} on ${schemaName}:`, wyAsset)
        throw new Error(`You don't own enough to do that (${minAmount} base units of ${wyAsset.address}${
            wyAsset.id ? (" token " + wyAsset.id) : ''
          })`)
      }
      switch (schemaName) {
        case WyvernSchemaName.ERC721:
        case WyvernSchemaName.ERC1155:
        case WyvernSchemaName.LegacyEnjin:
        case WyvernSchemaName.ENSShortNameAuction:
          // Handle NFTs and SFTs
          const wyNFTAsset = wyAsset as WyvernNFTAsset
          return await this.approveSemiOrNonFungibleToken({
            tokenId: wyNFTAsset.id.toString(),
            tokenAddress: wyNFTAsset.address,
            accountAddress,
            proxyAddress,
            schemaName,
            skipApproveAllIfTokenAddressIn: contractsWithApproveAll
          })
        case WyvernSchemaName.ERC20:
          // Handle FTs
          const wyFTAsset = wyAsset as WyvernFTAsset
          if (contractsWithApproveAll.has(wyFTAsset.address)) {
            // Return null to indicate no tx occurred
            return null
          }
          contractsWithApproveAll.add(wyFTAsset.address)
          return await this.approveFungibleToken({
            tokenAddress: wyFTAsset.address,
            accountAddress,
            proxyAddress
          })
        // For other assets, including contracts:
        // Send them to the user's proxy
        // if (where != WyvernAssetLocation.Proxy) {
        //   return this.transferOne({
        //     schemaName: schema.name,
        //     asset: wyAsset,
        //     isWyvernAsset: true,
        //     fromAddress: accountAddress,
        //     toAddress: proxy
        //   })
        // }
        // return true
      }
    }))
  }

  // Throws
  public async _buyOrderValidationAndApprovals(
      { order, counterOrder, accountAddress }:
      { order: UnhashedOrder; counterOrder?: Order; accountAddress: string }
    ) {
    const tokenAddress = order.paymentToken

    if (tokenAddress != NULL_ADDRESS) {
      const balance = await this.getTokenBalance({ accountAddress, tokenAddress })

      /* NOTE: no buy-side auctions for now, so sell.saleKind === 0 */
      let minimumAmount = makeBigNumber(order.basePrice)
      if (counterOrder) {
        minimumAmount = await this._getRequiredAmountForTakingSellOrder(counterOrder)
      }

      // Check WETH balance
      if (balance.toNumber() < minimumAmount.toNumber()) {
        if (tokenAddress == WyvernSchemas.tokens[this._networkName].canonicalWrappedEther.address) {
          throw new Error('Insufficient balance. You may need to wrap Ether.')
        } else {
          throw new Error('Insufficient balance.')
        }
      }

      // Check token approval
      // This can be done at a higher level to show UI
      await this.approveFungibleToken({ accountAddress, tokenAddress, minimumAmount })
    }

    let buyValid = false

    if( this._isOrderV1(order.exchange) ) {
      // Check order formation
      buyValid = await this._wyvernProtocolReadOnly.wyvernExchangeV1.validateOrderParameters(
        {
          exchange: order.exchange,
          maker: order.maker,
          taker: order.taker,
          makerRelayerFee: order.makerRelayerFee,
          takerRelayerFee: order.takerRelayerFee,
          makerProtocolFee: order.makerProtocolFee,
          takerProtocolFee: order.takerProtocolFee,
          feeRecipient: order.feeRecipient,
          feeMethod: order.feeMethod,
          side: order.side,
          saleKind: order.saleKind,
          target: order.target,
          howToCall: order.howToCall,
          calldatas: order.calldata,
          replacementPattern: order.replacementPattern,
          staticTarget: order.staticTarget,
          staticExtradata: order.staticExtradata,
          paymentToken: order.paymentToken,
          basePrice: order.basePrice,
          extra: order.extra,
          listingTime: order.listingTime,
          expirationTime: order.expirationTime,
          salt: order.salt,
          dataType: order.dataType,
          data: order.data
        }
      ).callAsync({ from: accountAddress })
    } else {
        buyValid = await this._wyvernProtocolReadOnly.wyvernExchange.validateOrderParameters_([order.exchange, order.maker, order.taker, order.feeRecipient, order.target, order.staticTarget, order.paymentToken],
          [order.makerRelayerFee, order.takerRelayerFee, order.makerProtocolFee, order.takerProtocolFee, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt],
          order.feeMethod,
          order.side,
          order.saleKind,
          order.howToCall,
          order.calldata,
          order.replacementPattern,
          order.staticExtradata
        ).callAsync({ from: accountAddress })
    }
    
    if (!buyValid) {
      console.error(order)
      throw new Error(`Failed to validate buy order parameters. Make sure you're on the right network!`)
    }
  }

  /**
   * Check if an account, or its proxy, owns an asset on-chain
   * @param accountAddress Account address for the wallet
   * @param proxyAddress Proxy address for the account
   * @param wyAsset asset to check. If fungible, the `quantity` attribute will be the minimum amount to own
   * @param schemaName WyvernSchemaName for the asset
   */
  public async _ownsAssetOnChain(
      { accountAddress, proxyAddress, wyAsset, schemaName }:
      { accountAddress: string; proxyAddress?: string | null; wyAsset: WyvernAsset; schemaName: WyvernSchemaName }
    ): Promise<boolean> {

    const asset: Asset = {
      tokenId: wyAsset.id || null,
      tokenAddress: wyAsset.address,
      schemaName
    }

    const minAmount = new BigNumber('quantity' in wyAsset
      ? wyAsset.quantity
      : 1)

    const accountBalance = await this.getAssetBalance({ accountAddress, asset })
    if (accountBalance.isGreaterThanOrEqualTo(minAmount)) {
      return true
    }

    proxyAddress = proxyAddress || await this._getProxy(accountAddress)
    if (proxyAddress) {
      const proxyBalance = await this.getAssetBalance({ accountAddress: proxyAddress, asset })
      if (proxyBalance.isGreaterThanOrEqualTo(minAmount)) {
        return true
      }
    }

    return false
  }

  public _getBuyFeeParameters(totalBuyerFeeBasisPoints: number, totalSellerFeeBasisPoints: number, swappableBuyerFeeBasisPoints: number, swappableSellerFeeBasisPoints: number, devBuyerFeeBasisPoints: number, devSellerFeeBasisPoints: number, devPayoutAddress?: string, sellOrder?: UnhashedOrder) {

    this._validateFees(totalBuyerFeeBasisPoints, totalSellerFeeBasisPoints)

    // dev fees will be set on Relayer Fee and dev payout address will be set on feeRecipient
    // the platform fee will be set on Protocol Fee
    // The Fixed Payout address of platform fee will be directly configured in wyvren contract

    const feeRecipient = devPayoutAddress || SWAPPABLE_FEE_RECIPIENT
    let makerRelayerFee
    let takerRelayerFee
    let makerProtocolFee
    let takerProtocolFee

    if (sellOrder) {
      // Use the sell order's fees to ensure compatiblity and force the order
      // to only be acceptable by the sell order maker.
      // Swap maker/taker depending on whether it's an English auction (taker)
      // TODO add extraBountyBasisPoints when making bidder bounties
      makerRelayerFee = sellOrder.waitingForBestCounterOrder
        ? makeBigNumber(sellOrder.makerRelayerFee)
        : makeBigNumber(sellOrder.takerRelayerFee)
      takerRelayerFee = sellOrder.waitingForBestCounterOrder
        ? makeBigNumber(sellOrder.takerRelayerFee)
        : makeBigNumber(sellOrder.makerRelayerFee)

      makerProtocolFee = sellOrder.waitingForBestCounterOrder
        ? makeBigNumber(sellOrder.makerProtocolFee)
        : makeBigNumber(sellOrder.takerProtocolFee)
      takerProtocolFee = sellOrder.waitingForBestCounterOrder
        ? makeBigNumber(sellOrder.takerProtocolFee)
        : makeBigNumber(sellOrder.makerProtocolFee)
    } else {
      makerRelayerFee = makeBigNumber(devBuyerFeeBasisPoints)
      takerRelayerFee = makeBigNumber(devSellerFeeBasisPoints)

      makerProtocolFee = makeBigNumber(swappableBuyerFeeBasisPoints)
      takerProtocolFee = makeBigNumber(swappableSellerFeeBasisPoints)
    }

    return {
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee: makeBigNumber(0), // TODO use buyerBountyBPS
      feeRecipient,
      feeMethod: FeeMethod.SplitFee
    }
  }

  public _getSellFeeParameters(totalBuyerFeeBasisPoints: number, totalSellerFeeBasisPoints: number, swappableBuyerFeeBasisPoints: number, swappableSellerFeeBasisPoints: number, devBuyerFeeBasisPoints: number, devSellerFeeBasisPoints: number, waitForHighestBid: boolean, devPayoutAddress?: string, sellerBountyBasisPoints = 0) {

    this._validateFees(totalBuyerFeeBasisPoints, totalSellerFeeBasisPoints)

    // dev fees will be set on Relayer Fee and dev payout address will be set on feeRecipient
    // the platform fee will be set on Protocol Fee
    // The Fixed Payout address of platform fee will be directly configured in wyvren contract

    // Use buyer as the maker when it's an English auction, so Wyvern sets prices correctly
    const feeRecipient = waitForHighestBid
      ? NULL_ADDRESS
      : devPayoutAddress || SWAPPABLE_FEE_RECIPIENT

    // Swap maker/taker fees when it's an English auction,
    // since these sell orders are takers not makers
    const makerRelayerFee = waitForHighestBid
      ? makeBigNumber(devBuyerFeeBasisPoints)
      : makeBigNumber(devSellerFeeBasisPoints)
    const takerRelayerFee = waitForHighestBid
      ? makeBigNumber(devSellerFeeBasisPoints)
      : makeBigNumber(devBuyerFeeBasisPoints)

    const makerProtocolFee = waitForHighestBid
      ? makeBigNumber(swappableBuyerFeeBasisPoints)
      : makeBigNumber(swappableSellerFeeBasisPoints)

    const takerProtocolFee = waitForHighestBid
      ? makeBigNumber(swappableSellerFeeBasisPoints)
      : makeBigNumber(swappableBuyerFeeBasisPoints)

    return {
      makerRelayerFee,
      takerRelayerFee,
      makerProtocolFee,
      takerProtocolFee,
      makerReferrerFee: makeBigNumber(sellerBountyBasisPoints),
      feeRecipient,
      feeMethod: FeeMethod.SplitFee
    }
  }

  /**
   * Validate fee parameters
   * @param totalBuyerFeeBasisPoints Total buyer fees
   * @param totalSellerFeeBasisPoints Total seller fees
   */
  private _validateFees(totalBuyerFeeBasisPoints: number, totalSellerFeeBasisPoints: number) {
    const maxFeePercent = INVERSE_BASIS_POINT / 100

    if (totalBuyerFeeBasisPoints > INVERSE_BASIS_POINT
        || totalSellerFeeBasisPoints > INVERSE_BASIS_POINT) {
      throw new Error(`Invalid buyer/seller fees: must be less than ${maxFeePercent}%`)
    }

    if (totalBuyerFeeBasisPoints < 0
        || totalSellerFeeBasisPoints < 0) {
      throw new Error(`Invalid buyer/seller fees: must be at least 0%`)
    }
  }

  /**
   * Get the listing and expiration time paramters for a new order
   * @param expirationTimestamp Timestamp to expire the order (in seconds), or 0 for non-expiring
   * @param waitingForBestCounterOrder Whether this order should be hidden until the best match is found
   */
  private _getTimeParameters(
      expirationTimestamp: number,
      waitingForBestCounterOrder = false
    ) {

    // Validation
    const minExpirationTimestamp = Math.round(Date.now() / 1000 + MIN_EXPIRATION_SECONDS)
    if (expirationTimestamp != 0 && expirationTimestamp < minExpirationTimestamp) {
      throw new Error(`Expiration time must be at least ${MIN_EXPIRATION_SECONDS} seconds from now, or zero (non-expiring).`)
    }
    if (waitingForBestCounterOrder && expirationTimestamp == 0) {
      throw new Error('English auctions must have an expiration time.')
    }
    if (parseInt(expirationTimestamp.toString()) != expirationTimestamp) {
      throw new Error(`Expiration timestamp must be a whole number of seconds`)
    }

    let listingTimestamp
    if (waitingForBestCounterOrder) {
      listingTimestamp = expirationTimestamp
      // Expire one week from now, to ensure server can match it
      // Later, this will expire closer to the listingTime
      expirationTimestamp = expirationTimestamp + ORDER_MATCHING_LATENCY_SECONDS
    } else {
      // Small offset to account for latency
      listingTimestamp = Math.round(Date.now() / 1000 - 100)
    }

    return {
      listingTime: makeBigNumber(listingTimestamp),
      expirationTime: makeBigNumber(expirationTimestamp),
    }
  }

  /**
   * Compute the `basePrice` and `extra` parameters to be used to price an order.
   * Also validates the expiration time and auction type.
   * @param tokenAddress Address of the ERC-20 token to use for trading.
   * Use the null address for ETH
   * @param expirationTime When the auction expires, or 0 if never.
   * @param startAmount The base value for the order, in the token's main units (e.g. ETH instead of wei)
   * @param endAmount The end value for the order, in the token's main units (e.g. ETH instead of wei). If unspecified, the order's `extra` attribute will be 0
   */
  private async _getPriceParameters(
      orderSide: OrderSide,
      tokenAddress: string,
      expirationTime: number,
      startAmount: number,
      endAmount ?: number,
      waitingForBestCounterOrder = false,
      englishAuctionReservePrice?: number,
    ) {

    const priceDiff = endAmount != null
      ? startAmount - endAmount
      : 0
    const paymentToken = tokenAddress.toLowerCase()
    const isEther = tokenAddress == NULL_ADDRESS
    const { tokens } = await this.api.getPaymentTokens({ address: paymentToken })
    const token = tokens[0]

    // Validation
    if (isNaN(startAmount) || startAmount == null || startAmount < 0) {
      throw new Error(`Starting price must be a number >= 0`)
    }
    if (!isEther && !token) {
      throw new Error(`No ERC-20 token found for '${paymentToken}'`)
    }
    if (isEther && waitingForBestCounterOrder) {
      throw new Error(`English auctions must use wrapped ETH or an ERC-20 token.`)
    }
    if (isEther && orderSide === OrderSide.Buy) {
      throw new Error(`Offers must use wrapped ETH or an ERC-20 token.`)
    }
    if (priceDiff < 0) {
      throw new Error('End price must be less than or equal to the start price.')
    }
    if (priceDiff > 0 && expirationTime == 0) {
      throw new Error('Expiration time must be set if order will change in price.')
    }
    if (englishAuctionReservePrice && !waitingForBestCounterOrder) {
      throw new Error('Reserve prices may only be set on English auctions.')
    }
    if (englishAuctionReservePrice && (englishAuctionReservePrice < startAmount)) {
      throw new Error('Reserve price must be greater than or equal to the start amount.')
    }

    // Note: WyvernProtocol.toBaseUnitAmount(makeBigNumber(startAmount), token.decimals)
    // will fail if too many decimal places, so special-case ether
    const basePrice = isEther
      ? makeBigNumber(this.web3.toWei(startAmount, 'ether')).dp(0,7)
      : WyvernProtocol.toBaseUnitAmount(makeBigNumber(startAmount), token.decimals)

    const extra = isEther
      ? makeBigNumber(this.web3.toWei(priceDiff, 'ether')).dp(0,7)
      : WyvernProtocol.toBaseUnitAmount(makeBigNumber(priceDiff), token.decimals)

    const reservePrice = englishAuctionReservePrice
      ? isEther
        ? makeBigNumber(this.web3.toWei(englishAuctionReservePrice, 'ether')).dp(0,7)
        : WyvernProtocol.toBaseUnitAmount(makeBigNumber(englishAuctionReservePrice), token.decimals)
      : undefined

    return { basePrice, extra, paymentToken, reservePrice }
  }

  private _getMetadata(order: Order, referrerAddress?: string) {
    const referrer = referrerAddress || order.metadata.referrerAddress
    if (referrer && isValidAddress(referrer)) {
      return referrer
    }
    return undefined
  }

  private async _atomicMatch(
      { buy, sell, accountAddress, metadata = NULL_BLOCK_HASH }:
      { buy: Order; sell: Order; accountAddress: string; metadata?: string }
    ) {
    let value
    let shouldValidateBuy = true
    let shouldValidateSell = true

    if (sell.maker.toLowerCase() == accountAddress.toLowerCase()) {
      // USER IS THE SELLER, only validate the buy order
      await this._sellOrderValidationAndApprovals({ order: sell, accountAddress })
      shouldValidateSell = false

    } else if (buy.maker.toLowerCase() == accountAddress.toLowerCase()) {
      // USER IS THE BUYER, only validate the sell order
      await this._buyOrderValidationAndApprovals({ order: buy, counterOrder: sell, accountAddress })
      shouldValidateBuy = false

      // If using ETH to pay, set the value of the transaction to the current price
      if (buy.paymentToken == NULL_ADDRESS) {
        value = await this._getRequiredAmountForTakingSellOrder(sell)
      }
    } else {
      // User is neither - matching service
    }

    await this._validateMatch({ buy, sell, accountAddress, shouldValidateBuy, shouldValidateSell })

    const doesExchangeAddressMatch = (buy.exchange.toLowerCase() === sell.exchange.toLowerCase())
    if (!doesExchangeAddressMatch) {
      throw new Error('Buy and Sell orders exchange mismatch')
    }

    this._dispatch(EventType.MatchOrders, { buy, sell, accountAddress, matchMetadata: metadata })

    let txHash
    const txnData: any = { from: accountAddress, value }

    const buyOrder = {
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
      dataType: buy.dataType,
      data: buy.data
    }

    const buySig = {
      v: buy.v || 0,
      r: buy.r || NULL_BLOCK_HASH,
      s: buy.s || NULL_BLOCK_HASH,
    }

    const sellOrder = {
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
      dataType: sell.dataType,
      data: sell.data
    }

    const sellSig = {
      v: sell.v || 0,
      r: sell.r || NULL_BLOCK_HASH,
      s: sell.s || NULL_BLOCK_HASH,
    }
    
    const args: WyvernAtomicMatchParameters = [
      [buy.exchange, buy.maker, buy.taker, buy.feeRecipient, buy.target,
      buy.staticTarget, buy.paymentToken, sell.exchange, sell.maker, sell.taker, sell.feeRecipient, sell.target, sell.staticTarget, sell.paymentToken],
      [buy.makerRelayerFee, buy.takerRelayerFee, buy.makerProtocolFee, buy.takerProtocolFee, buy.basePrice, buy.extra, buy.listingTime, buy.expirationTime, buy.salt, sell.makerRelayerFee, sell.takerRelayerFee, sell.makerProtocolFee, sell.takerProtocolFee, sell.basePrice, sell.extra, sell.listingTime, sell.expirationTime, sell.salt],
      [buy.feeMethod, buy.side, buy.saleKind, buy.howToCall, sell.feeMethod, sell.side, sell.saleKind, sell.howToCall],
      buy.calldata,
      sell.calldata,
      buy.replacementPattern,
      sell.replacementPattern,
      buy.staticExtradata,
      sell.staticExtradata,
      [
        buy.v || 0,
        sell.v || 0
      ],
      [
        buy.r || NULL_BLOCK_HASH,
        buy.s || NULL_BLOCK_HASH,
        sell.r || NULL_BLOCK_HASH,
        sell.s || NULL_BLOCK_HASH,
        metadata
      ]
    ]
    
    // Estimate gas first
    try {
      let gasEstimate
      if( this._isOrderV1(buyOrder.exchange) ) {
        gasEstimate = await this._wyvernProtocolReadOnly.wyvernExchangeV1.atomicMatch(
          buyOrder,
          buySig,
          sellOrder,
          sellSig,
          metadata
        ).estimateGasAsync(txnData)
      } else {
          gasEstimate = await this._wyvernProtocolReadOnly.wyvernExchange.atomicMatch_(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10]).estimateGasAsync(txnData)
      }

      txnData.gasPrice = await this._computeGasPrice()
      txnData.gas = this._correctGasAmount(gasEstimate)

    } catch (error) {
      console.error(`Failed atomic match for buy: ${buyOrder} and sell: ${sellOrder} with error: ${error}`)
      throw new Error(`Oops, the Ethereum network rejected this transaction :( The Swappable devs have been alerted, but this problem is typically due an item being locked or untransferrable. The exact error was "${error.message.substr(0, MAX_ERROR_LENGTH)}..."`)
    }

    // Then do the transaction
    try {
      this.logger(`Fulfilling order with gas set to ${txnData.gas}`)
      if( this._isOrderV1(buyOrder.exchange) ) {
        txHash = await this._wyvernProtocol.wyvernExchangeV1.atomicMatch(
          buyOrder,
          buySig,
          sellOrder,
          sellSig,
          metadata)
          .sendTransactionAsync(txnData)
      } else {
          txHash = await this._wyvernProtocol.wyvernExchange.atomicMatch_(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10]).sendTransactionAsync(txnData)
      }
    } catch (error) {
      console.error(error)

      this._dispatch(EventType.TransactionDenied, { error, buy, sell, accountAddress, matchMetadata: metadata })

      throw new Error(`Failed to authorize transaction: "${
        error.message
          ? error.message
          : 'user denied'
        }..."`)
    }
    return txHash
  }

  private async _getRequiredAmountForTakingSellOrder(sell: Order) {
    const currentPrice = await this.getCurrentPrice(sell)
    const estimatedPrice = estimateCurrentPrice(sell)

    const maxPrice = BigNumber.max(currentPrice, estimatedPrice)

    // TODO Why is this not always a big number?
    sell.takerRelayerFee = makeBigNumber(sell.takerRelayerFee)
    const feePercentage = sell.takerRelayerFee.div(INVERSE_BASIS_POINT)
    const fee = feePercentage.times(maxPrice)
    return fee.plus(maxPrice).dp(0,2)
  }

  private async _authorizeOrder(
      order: UnsignedOrder
    ): Promise<ECSignature | null> {
    const message = order.hash
    const signerAddress = order.maker

    this._dispatch(EventType.CreateOrder, { order, accountAddress: order.maker })

    const makerIsSmartContract = await isContractAddress(this.web3, signerAddress)

    try {
      if (makerIsSmartContract) {
        // The web3 provider is probably a smart contract wallet.
        // Fallback to on-chain approval.
        await this._approveOrder(order)
        return null
      } else {
        return await personalSignAsync(this.web3, message, signerAddress)
      }
    } catch (error) {
      this._dispatch(EventType.OrderDenied, { order, accountAddress: signerAddress })
      throw error
    }
  }

  private _getSchema(schemaName?: WyvernSchemaName): Schema<any> {
    const schemaName_ = schemaName || WyvernSchemaName.ERC721
    const schema = WyvernSchemas.schemas[this._networkName].filter(s => s.name == schemaName_)[0]

    if (!schema) {
      throw new Error(`Trading for this asset (${schemaName_}) is not yet supported. Please contact us or check back later!`)
    }
    return schema
  }

  private _dispatch(event: EventType, data: EventData) {
    this._emitter.emit(event, data)
  }

  /**
   * Get the clients to use for a read call
   * @param retries current retry value
   */
  private _getClientsForRead(
      retries = 1
    ): { web3: Web3, wyvernProtocol: WyvernProtocol } {
    if (retries > 0) {
      // Use injected provider by default
      return {
        'web3': this.web3,
        'wyvernProtocol': this._wyvernProtocol
      }
    } else {
      // Use provided provider as fallback
      return {
        'web3': this.web3ReadOnly,
        'wyvernProtocol': this._wyvernProtocolReadOnly
      }
    }
  }

  private async _confirmTransaction(transactionHash: string, event: EventType, description: string, testForSuccess?: () => Promise<boolean>): Promise<void> {

    const transactionEventData = { transactionHash, event }
    this.logger(`Transaction started: ${description}`)

    if (transactionHash == NULL_BLOCK_HASH) {
      // This was a smart contract wallet that doesn't know the transaction
      this._dispatch(EventType.TransactionCreated, { event })

      if (!testForSuccess) {
        // Wait if test not implemented
        this.logger(`Unknown action, waiting 1 minute: ${description}`)
        await delay(60 * 1000)
        return
      }

      return await this._pollCallbackForConfirmation(event, description, testForSuccess)
    }

    // Normal wallet
    try {
      this._dispatch(EventType.TransactionCreated, transactionEventData)
      await confirmTransaction(this.web3, transactionHash)
      this.logger(`Transaction succeeded: ${description}`)
      this._dispatch(EventType.TransactionConfirmed, transactionEventData)
    } catch (error) {
      this.logger(`Transaction failed: ${description}`)
      this._dispatch(EventType.TransactionFailed, {
        ...transactionEventData, error
      })
      throw error
    }
  }

  private async _pollCallbackForConfirmation(event: EventType, description: string, testForSuccess: () => Promise<boolean>): Promise<void> {

    return new Promise<void>(async (resolve, reject) => {

      const initialRetries = 60

      const testResolve: (r: number) => Promise<void> = async retries => {

        const wasSuccessful = await testForSuccess()
        if (wasSuccessful) {
          this.logger(`Transaction succeeded: ${description}`)
          this._dispatch(EventType.TransactionConfirmed, { event })
          return resolve()
        } else if (retries <= 0) {
          return reject()
        }

        if (retries % 10 == 0) {
          this.logger(`Tested transaction ${initialRetries - retries + 1} times: ${description}`)
        }
        await delay(5000)
        return testResolve(retries - 1)
      }

      return testResolve(initialRetries)
    })
  }

  public decodeOrderData(dataType: string, data: string): Array<Part> {
    const decodedData = WyvernProtocol.decodeOrderData(
      dataType,
      data
    )
    return decodedData.payouts
  }

  private _getWyvernExchangeAddress(version: string) {
    switch (this._networkName) {
      case Network.Main:
        return version == "V1" ? WYVERN_EXCHANGE_ADDRESS_MAINNET_V1 : WYVERN_EXCHANGE_ADDRESS_MAINNET
      case Network.Rinkeby:
        return version == "V1" ? WYVERN_EXCHANGE_ADDRESS_RINKEBY_V1 : WYVERN_EXCHANGE_ADDRESS_RINKEBY
      case Network.Matic:
        return version == "V1" ? WYVERN_EXCHANGE_ADDRESS_MATIC_V1 : WYVERN_EXCHANGE_ADDRESS_MATIC
      case Network.Mumbai:
        return version == "V1" ? WYVERN_EXCHANGE_ADDRESS_MUMBAI_V1 : WYVERN_EXCHANGE_ADDRESS_MUMBAI
    }
  }

  private _isOrderV1(orderExchangeAddress: string): Boolean {
    return orderExchangeAddress.toLowerCase() === this._getWyvernExchangeAddress("V1").toLowerCase()
  }

}
