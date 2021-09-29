import { WyvernProtocol } from 'wyvern-js'
import { BigNumber } from 'bignumber.js' // Typescript import issue

export const DEFAULT_GAS_INCREASE_FACTOR = 1.01
export const NULL_ADDRESS = WyvernProtocol.NULL_ADDRESS
export const NULL_BLOCK_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'
export const SWAPPABLE_FEE_RECIPIENT = '0x71DFF38eDa9F7b90C45C5c009B131300E9bd7f6F'
export const DEP_INFURA_KEY = '8fa63c06dabd4d2b8ae5d99ed5a100f8'
export const MAINNET_PROVIDER_URL = 'https://mainnet.infura.io/v3/8fa63c06dabd4d2b8ae5d99ed5a100f8'
export const RINKEBY_PROVIDER_URL = 'https://rinkeby.infura.io/v3/8fa63c06dabd4d2b8ae5d99ed5a100f8'

export const MATIC_PROVIDER_URL = 'https://rpc-mainnet.maticvigil.com/' // Matic Mainnet
export const MUMBAI_PROVIDER_URL = 'https://rpc-mumbai.maticvigil.com' // Matic Testnet

export const INVERSE_BASIS_POINT = 10000
export const MAX_UINT_256 = WyvernProtocol.MAX_UINT_256
export const WYVERN_EXCHANGE_ADDRESS_MAINNET = '0x7be8076f4ea4a4ad08075c2508e481d6c946d12b'
export const WYVERN_EXCHANGE_ADDRESS_RINKEBY = '0xc9a5Ba3C629F21e896F0B444B18cCF6a844ea606'

export const WYVERN_EXCHANGE_ADDRESS_MATIC = ''
export const WYVERN_EXCHANGE_ADDRESS_MUMBAI = '0x31b49e94b0f5337d16b1f758991006838767294b'

export const ENJIN_COIN_ADDRESS = '0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c'
export const MANA_ADDRESS = '0x0f5d2fb29fb7d3cfee444a200298f468908cc942'
export const ENJIN_ADDRESS = '0xfaaFDc07907ff5120a76b34b731b278c38d6043C'
export const ENJIN_LEGACY_ADDRESS = '0x8562c38485B1E8cCd82E44F89823dA76C98eb0Ab'
export const CK_ADDRESS = '0x06012c8cf97bead5deae237070f9587f8e7a266d'
export const CK_RINKEBY_ADDRESS = '0x16baf0de678e52367adc69fd067e5edd1d33e3bf'
export const WRAPPED_NFT_FACTORY_ADDRESS_MAINNET = '0xf11b5815b143472b7f7c52af0bfa6c6a2c8f40e1'
export const WRAPPED_NFT_FACTORY_ADDRESS_RINKEBY = '0x94c71c87244b862cfd64d36af468309e4804ec09'
export const WRAPPED_NFT_LIQUIDATION_PROXY_ADDRESS_MAINNET = '0x995835145dd85c012f3e2d7d5561abd626658c04'
export const WRAPPED_NFT_LIQUIDATION_PROXY_ADDRESS_RINKEBY = '0xaa775Eb452353aB17f7cf182915667c2598D43d3'
export const UNISWAP_FACTORY_ADDRESS_MAINNET = '0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95'
export const UNISWAP_FACTORY_ADDRESS_RINKEBY = '0xf5D915570BC477f9B8D6C0E980aA81757A3AaC36'
export const DEFAULT_WRAPPED_NFT_LIQUIDATION_UNISWAP_SLIPPAGE_IN_BASIS_POINTS = 1000
export const CHEEZE_WIZARDS_GUILD_ADDRESS = WyvernProtocol.NULL_ADDRESS  // TODO: Update this address once Dapper has deployed their mainnet contracts
export const CHEEZE_WIZARDS_GUILD_RINKEBY_ADDRESS = '0x095731b672b76b00A0b5cb9D8258CD3F6E976cB2'
export const CHEEZE_WIZARDS_BASIC_TOURNAMENT_ADDRESS = WyvernProtocol.NULL_ADDRESS  // TODO: Update this address once Dapper has deployed their mainnet contracts
export const CHEEZE_WIZARDS_BASIC_TOURNAMENT_RINKEBY_ADDRESS = '0x8852f5F7d1BB867AAf8fdBB0851Aa431d1df5ca1'
export const DECENTRALAND_ESTATE_ADDRESS = '0x959e104e1a4db6317fa58f8295f586e1a978c297'

// TODO RP deploy this contracts
export const STATIC_CALL_TX_ORIGIN_ADDRESS = '0xbff6ade67e3717101dd8d0a7f3de1bf6623a2ba8'.toLowerCase()
export const STATIC_CALL_TX_ORIGIN_RINKEBY_ADDRESS = '0x5fdce57c22497440843ab66fb1275a6988f6f7d9'.toLowerCase()

export const STATIC_CALL_TX_ORIGIN_MATIC_ADDRESS = ''.toLowerCase()
export const STATIC_CALL_TX_ORIGIN_MUMBAI_ADDRESS = '0x569Bd9B3101236607C8C056a489910Ff882711D8'.toLowerCase()

export const STATIC_CALL_CHEEZE_WIZARDS_ADDRESS = WyvernProtocol.NULL_ADDRESS  // TODO: Deploy this address once Dapper has deployed their mainnet contracts
export const STATIC_CALL_CHEEZE_WIZARDS_RINKEBY_ADDRESS = '0x8a640bdf8886dd6ca1fad9f22382b50deeacde08'
export const STATIC_CALL_DECENTRALAND_ESTATES_ADDRESS = '0x93c3cd7ba04556d2e3d7b8106ce0f83e24a87a7e'

export const DEFAULT_BUYER_FEE_BASIS_POINTS = 0
export const DEFAULT_SELLER_FEE_BASIS_POINTS = 200
export const DEFAULT_SELLER_FEE_BASIS_POINTS_FOR_SWAP = 100
export const SWAPPABLE_SELLER_BOUNTY_BASIS_POINTS = 100
export const DEFAULT_MAX_BOUNTY = DEFAULT_SELLER_FEE_BASIS_POINTS
export const MIN_EXPIRATION_SECONDS = 10
export const ORDER_MATCHING_LATENCY_SECONDS = 60 * 60 * 24 * 7
export const SELL_ORDER_BATCH_SIZE = 3
export const ORDERBOOK_VERSION: number = 1
export const API_VERSION: number = 1
export const API_BASE_MAINNET = 'https://api.swappable.io'
export const API_BASE_RINKEBY = 'http://swappable-dev.trustswap.org:8000'
export const SITE_HOST_MAINNET = 'https://swappable.io'
export const SITE_HOST_RINKEBY = 'http://swappable-dev.trustswap.org:8000'
export const ORDERBOOK_PATH = `/wyvern/v${ORDERBOOK_VERSION}`
export const API_PATH = `/api/v${ORDERBOOK_VERSION}`
export const SWAP_TOKEN_ADDRESS = '0xcc4304a31d09258b0029ea7fe63d032f52e44efe'
export const SWAP_TOKEN_RINKEBY_ADDRESS = '0xf77ec971b04cb13ba20fcde023be3e7617a3eb8e'
export const SWAP_TOKEN_ADDRESS_MATIC_MAINNET = '0x3809dcdd5dde24b37abe64a5a339784c3323c44f'
export const SWAP_TOKEN_ADDRESS_MATIC_MUMBAI = '0xdf68ad003175883c97c10f37681613dc6a9b278a'
