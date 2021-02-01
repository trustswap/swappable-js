import { SwappablePort } from './seaport'
import { SwappableAPI } from './api'
import { Network, EventData, EventType } from './types'
export { orderToJSON, orderFromJSON, WyvernProtocol } from './utils/utils'
export {
  encodeCall,
  encodeSell, encodeAtomicizedBuy, encodeAtomicizedSell,
  encodeDefaultCall, encodeReplacementPattern,
  AbiType,
} from './utils/schema'

/**
 * Example setup:
 *
 * import * as Web3 from 'web3'
 * import { SwappablePort, Network } from 'swappable-js'
 * const provider = new Web3.providers.HttpProvider('https://mainnet.infura.io')
 * const client = new SwappablePort(provider, {
 *   networkName: Network.Main
 * })
 */

export {
  // Main SDK export:
  SwappablePort,
  // So the API could be used separately:
  SwappableAPI,
  // Useful for serializing and deserializing orders:
  // Types to help initialize SDK and listen to events.
  // Can also be imported using e.g.
  //   import { EventType } from 'swappable-js/lib/types'
  EventData, EventType, Network
}
